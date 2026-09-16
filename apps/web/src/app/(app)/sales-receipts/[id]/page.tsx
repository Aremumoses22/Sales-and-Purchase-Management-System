'use client';

import { canPerformSalesReceiptAction } from '@spms/shared';
import { CheckCircle2Icon, CopyIcon, Loader2Icon, MoreHorizontalIcon, PencilIcon, PrinterIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DocumentListPane } from '@/components/documents/document-list-pane';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { HistoryPanel } from '@/components/history-panel';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import {
  useCloneSalesReceipt,
  useCompleteSalesReceipt,
  useDeleteSalesReceipt,
  useSalesReceipt,
  useSalesReceiptHistory,
  useSalesReceipts,
  useVoidSalesReceipt,
} from '@/features/sales-receipts/api';
import { SalesReceiptPreview } from '@/features/sales-receipts/sales-receipt-preview';
import { formatDate, formatDateTime } from '@/lib/format';
import { showApiError } from '@/lib/forms';
import { useCan, useOrganization } from '@/lib/session';

function VoidDialog({ number, busy, onClose, onConfirm }: { number: string; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void sales receipt {number}?</DialogTitle>
          <DialogDescription>The receipt stays on record but no longer counts as a sale, and its stock is returned.</DialogDescription>
        </DialogHeader>
        <Field label="Reason" htmlFor="void-reason" hint="Optional, recorded in the history.">
          <Textarea id="void-reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => onConfirm(reason)} disabled={busy}>
            {busy ? <Loader2Icon className="animate-spin" /> : null}
            Void receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SalesReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const can = useCan();
  const organization = useOrganization();
  const { data: receipt, isPending, isError } = useSalesReceipt(id);
  const list = useSalesReceipts({ status: 'all', pageSize: 50, sort: '-date' });
  const history = useSalesReceiptHistory(id);
  const complete = useCompleteSalesReceipt();
  const voidReceipt = useVoidSalesReceipt();
  const clone = useCloneSalesReceipt();
  const remove = useDeleteSalesReceipt();
  const [voiding, setVoiding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const onComplete = async () => {
    try {
      await complete.mutateAsync(id);
      toast.success('Sales receipt completed');
    } catch (error) {
      showApiError(error);
    }
  };

  const onVoid = async (reason: string) => {
    try {
      await voidReceipt.mutateAsync({ id, reason });
      toast.success('Sales receipt voided');
      setVoiding(false);
    } catch (error) {
      showApiError(error);
    }
  };

  const onClone = async () => {
    try {
      const copy = await clone.mutateAsync(id);
      toast.success(`Draft ${copy.number} created from ${receipt?.number}`);
      router.push(`/sales-receipts/${copy.id}/edit`);
    } catch (error) {
      showApiError(error);
    }
  };

  const onDelete = async () => {
    try {
      await remove.mutateAsync(id);
      toast.success('Sales receipt deleted');
      router.replace('/sales-receipts');
    } catch (error) {
      showApiError(error);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="-m-4 flex h-[calc(100svh-3.5rem)] sm:-m-6">
      <DocumentListPane
        title="All sales receipts"
        listHref="/sales-receipts"
        newHref={can('sales_receipts:create') ? '/sales-receipts/new' : undefined}
        isLoading={list.isPending}
        activeId={id}
        hrefFor={(rowId) => `/sales-receipts/${rowId}`}
        rows={list.data?.data.map((row) => ({
          id: row.id,
          title: row.customer.displayName,
          amount: row.total,
          subtitle: `${row.number} · ${formatDate(row.receiptDate, organization)}${row.paymentMode ? ` · ${row.paymentMode.name}` : ''}`,
          status: row.status,
        }))}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        {isError ? (
          <EmptyState title="Sales receipt not found" description="It may have been deleted." className="flex-1" />
        ) : isPending || !receipt ? (
          <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-5 py-2.5">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">{receipt.number}</h1>
                <StatusBadge status={receipt.status} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {can('sales_receipts:edit') && canPerformSalesReceiptAction('edit', receipt.status) ? (
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/sales-receipts/${id}/edit`} />}>
                    <PencilIcon />
                    Edit
                  </Button>
                ) : null}
                {can('sales_receipts:edit') && canPerformSalesReceiptAction('complete', receipt.status) ? (
                  <Button size="sm" onClick={onComplete} disabled={complete.isPending}>
                    <CheckCircle2Icon />
                    Mark as completed
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/print/sales-receipts/${id}?autoprint=1`, '_blank', 'noopener')}
                >
                  <PrinterIcon />
                  Print
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label="More actions" />}>
                    <MoreHorizontalIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {can('sales_receipts:create') ? (
                      <DropdownMenuItem onClick={onClone}>
                        <CopyIcon />
                        Clone
                      </DropdownMenuItem>
                    ) : null}
                    {can('sales_receipts:void') && canPerformSalesReceiptAction('void', receipt.status) ? (
                      <DropdownMenuItem onClick={() => setVoiding(true)}>Void</DropdownMenuItem>
                    ) : null}
                    {can('sales_receipts:delete') && canPerformSalesReceiptAction('delete', receipt.status) ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                          Delete
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto bg-muted/30 p-5 sm:p-8">
              {receipt.status === 'void' ? (
                <p className="mx-auto max-w-[210mm] rounded-lg bg-muted px-4 py-2 text-sm text-muted-foreground">
                  Voided {receipt.voidedAt ? formatDateTime(receipt.voidedAt, organization) : ''}
                  {receipt.voidReason ? `: ${receipt.voidReason}` : '.'}
                </p>
              ) : null}
              {receipt.status === 'draft' ? (
                <p className="mx-auto max-w-[210mm] rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-900 ring-1 ring-blue-600/20">
                  This receipt is a draft. Mark it as completed to record the sale and take the goods out of stock.
                </p>
              ) : null}

              <SalesReceiptPreview receipt={receipt} />

              <div className="mx-auto max-w-[210mm] rounded-xl border bg-card p-5">
                <h2 className="mb-4 text-sm font-semibold">History</h2>
                <HistoryPanel entries={history.data} isLoading={history.isPending} />
              </div>
            </div>
          </>
        )}
      </section>

      {voiding && receipt ? (
        <VoidDialog number={receipt.number} busy={voidReceipt.isPending} onClose={() => setVoiding(false)} onConfirm={onVoid} />
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete draft ${receipt?.number ?? ''}?`}
        description="This cannot be undone."
        confirmLabel="Delete receipt"
        destructive
        busy={remove.isPending}
        onConfirm={onDelete}
      />
    </div>
  );
}
