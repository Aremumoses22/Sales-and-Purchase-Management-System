'use client';

import type { StockMovementDto } from '@spms/shared';
import { ArrowLeftIcon, Loader2Icon, MoreHorizontalIcon, PencilIcon, SlidersHorizontalIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { HistoryPanel } from '@/components/history-panel';
import { Money } from '@/components/money';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdjustStockDialog } from '@/features/items/adjust-stock-dialog';
import {
  useDeleteItem,
  useItem,
  useItemHistory,
  useItemStockMovements,
  useSetItemActive,
} from '@/features/items/api';
import { isLowStock, StockLevel } from '@/features/items/stock-level';
import { formatDate, formatNumber } from '@/lib/format';
import { showApiError } from '@/lib/forms';
import { useCan, useOrganization } from '@/lib/session';

const MOVEMENT_LABELS: Record<StockMovementDto['type'], string> = {
  opening: 'Opening stock',
  adjustment: 'Adjustment',
  invoice: 'Invoice',
  sales_receipt: 'Sales receipt',
  credit_note: 'Credit note',
  bill: 'Bill',
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words whitespace-pre-line">{children ?? '—'}</dd>
    </div>
  );
}

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const can = useCan();
  const organization = useOrganization();
  const { data: item, isPending, isError } = useItem(id);
  const [tab, setTab] = useState('overview');
  const movements = useItemStockMovements(id, tab === 'stock');
  const history = useItemHistory(id, tab === 'history');
  const setActive = useSetItemActive();
  const remove = useDeleteItem();
  const [adjusting, setAdjusting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isError) {
    return (
      <EmptyState
        title="Item not found"
        action={
          <Button variant="outline" nativeButton={false} render={<Link href="/items" />}>
            Back to items
          </Button>
        }
      />
    );
  }
  if (isPending) return <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;

  const toggleActive = async () => {
    try {
      await setActive.mutateAsync({ id, active: !item.isActive });
      toast.success(item.isActive ? 'Item marked as inactive' : 'Item marked as active');
    } catch (error) {
      showApiError(error);
    }
  };

  const onDelete = async () => {
    try {
      await remove.mutateAsync(id);
      toast.success('Item deleted');
      router.replace('/items');
    } catch (error) {
      showApiError(error);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link href="/items" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-3" />
            Items
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{item.name}</h1>
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {item.type === 'goods' ? 'Goods' : 'Service'}
            </span>
            {!item.isActive ? <StatusBadge status="inactive" /> : null}
          </div>
          {item.sku ? <p className="text-sm text-muted-foreground">SKU {item.sku}</p> : null}
        </div>

        <div className="flex items-center gap-2">
          {item.trackInventory && can('items:adjust_stock') ? (
            <Button variant="outline" onClick={() => setAdjusting(true)}>
              <SlidersHorizontalIcon />
              Adjust stock
            </Button>
          ) : null}
          {can('items:edit') ? (
            <Button variant="outline" nativeButton={false} render={<Link href={`/items/${id}/edit`} />}>
              <PencilIcon />
              Edit
            </Button>
          ) : null}
          {can('items:edit') || can('items:delete') ? (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More actions" />}>
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {can('items:edit') ? (
                  <DropdownMenuItem onClick={toggleActive}>{item.isActive ? 'Mark as inactive' : 'Mark as active'}</DropdownMenuItem>
                ) : null}
                {can('items:delete') ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                      Delete
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {item.trackInventory ? <TabsTrigger value="stock">Stock movements</TabsTrigger> : null}
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Sales information</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2">
                    <Row label="Selling price">{item.sellingPrice === null ? null : <Money value={item.sellingPrice} />}</Row>
                    <Row label="Unit">{item.unit}</Row>
                    <Row label="Tax">{item.tax ? `${item.tax.name} (${item.tax.rate}%)` : null}</Row>
                    <Row label="Description">{item.salesDescription}</Row>
                  </dl>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Purchase information</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2">
                    <Row label="Cost price">{item.costPrice === null ? null : <Money value={item.costPrice} />}</Row>
                    <Row label="Description">{item.purchaseDescription}</Row>
                    <Row label="Preferred vendor">
                      {item.preferredVendor ? (
                        <Link href={`/vendors/${item.preferredVendor.id}`} className="text-primary hover:underline">
                          {item.preferredVendor.displayName}
                        </Link>
                      ) : null}
                    </Row>
                  </dl>
                </CardContent>
              </Card>
            </div>

            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="text-sm">Inventory</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {item.trackInventory ? (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground">Stock on hand</p>
                      <p className="text-2xl font-semibold">
                        <StockLevel stockOnHand={item.stockOnHand} reorderLevel={item.reorderLevel} unit={item.unit} />
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Reorder level: {item.reorderLevel === null ? 'not set' : formatNumber(item.reorderLevel)}
                    </p>
                    {isLowStock(item.stockOnHand, item.reorderLevel) ? (
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Stock is at or below the reorder level.</p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {item.type === 'goods' ? 'Stock is not tracked for this item.' : 'Services do not hold stock.'}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="stock" className="mt-4">
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.isPending ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
                      <Loader2Icon className="mx-auto size-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : movements.data?.length ? (
                  movements.data.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell>{formatDate(movement.date, organization)}</TableCell>
                      <TableCell>{MOVEMENT_LABELS[movement.type]}</TableCell>
                      <TableCell className="text-muted-foreground">{movement.reason ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{movement.createdBy?.name ?? '—'}</TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${Number(movement.quantity) < 0 ? 'text-destructive' : 'text-emerald-700'}`}
                      >
                        {Number(movement.quantity) > 0 ? '+' : ''}
                        {formatNumber(movement.quantity)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                      No stock movements yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <HistoryPanel entries={history.data} isLoading={history.isPending} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {adjusting ? <AdjustStockDialog item={item} onClose={() => setAdjusting(false)} /> : null}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${item.name}?`}
        description="This cannot be undone. Items used on documents or with stock adjustments cannot be deleted; mark them inactive instead."
        confirmLabel="Delete item"
        destructive
        busy={remove.isPending}
        onConfirm={onDelete}
      />
    </div>
  );
}
