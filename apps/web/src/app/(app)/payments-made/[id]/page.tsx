'use client';

import { toDecimal } from '@spms/shared';
import { Loader2Icon, MoreHorizontalIcon, PencilIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DocumentListPane } from '@/components/documents/document-list-pane';
import { EmptyState } from '@/components/empty-state';
import { HistoryPanel } from '@/components/history-panel';
import { Money } from '@/components/money';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useDeletePaymentMade, usePaymentMade, usePaymentMadeHistory, usePaymentsMade } from '@/features/bills/api';
import { formatDate } from '@/lib/format';
import { showApiError } from '@/lib/forms';
import { useCan, useOrganization } from '@/lib/session';

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children || '—'}</dd>
    </div>
  );
}

export default function PaymentMadeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const can = useCan();
  const organization = useOrganization();
  const { data: payment, isPending, isError } = usePaymentMade(id);
  const list = usePaymentsMade({ pageSize: 50, sort: '-date' });
  const history = usePaymentMadeHistory(id);
  const remove = useDeletePaymentMade();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const onDelete = async () => {
    try {
      await remove.mutateAsync(id);
      toast.success('Payment deleted');
      router.replace('/payments-made');
    } catch (error) {
      showApiError(error);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="-m-4 flex h-[calc(100svh-3.5rem)] sm:-m-6">
      <DocumentListPane
        title="All payments made"
        listHref="/payments-made"
        newHref={can('payments_made:create') ? '/payments-made/new' : undefined}
        isLoading={list.isPending}
        activeId={id}
        hrefFor={(rowId) => `/payments-made/${rowId}`}
        rows={list.data?.data.map((row) => ({
          id: row.id,
          title: row.vendor.displayName,
          amount: row.amount,
          subtitle: `${row.number} · ${formatDate(row.paymentDate, organization)}${row.paymentMode ? ` · ${row.paymentMode.name}` : ''}`,
        }))}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        {isError ? (
          <EmptyState title="Payment not found" description="It may have been deleted." className="flex-1" />
        ) : isPending || !payment ? (
          <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-5 py-2.5">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">{payment.number}</h1>
                {toDecimal(payment.unusedAmount).gt(0) ? (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 ring-1 ring-amber-600/20">
                    <Money value={payment.unusedAmount} /> unused
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {can('payments_made:edit') ? (
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/payments-made/${id}/edit`} />}>
                    <PencilIcon />
                    Edit
                  </Button>
                ) : null}
                {can('payments_made:delete') ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label="More actions" />}>
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto bg-muted/30 p-5 sm:p-8">
              <div className="mx-auto max-w-[210mm] rounded-xl border bg-card p-5">
                <p className="text-xs text-muted-foreground">Amount paid</p>
                <p className="text-3xl font-semibold">
                  <Money value={payment.amount} />
                </p>
                <dl className="mt-5 grid gap-4 border-t pt-4 sm:grid-cols-3">
                  <Detail label="Paid to">
                    <Link href={`/vendors/${payment.vendor.id}`} className="font-medium text-primary hover:underline">
                      {payment.vendor.displayName}
                    </Link>
                  </Detail>
                  <Detail label="Payment date">{formatDate(payment.paymentDate, organization)}</Detail>
                  <Detail label="Paid through">{payment.paymentMode?.name}</Detail>
                  <Detail label="Reference#">{payment.referenceNumber}</Detail>
                  <Detail label="Used for bills">
                    <Money value={payment.amountApplied} />
                  </Detail>
                  <Detail label="Unused">
                    <Money value={payment.unusedAmount} />
                  </Detail>
                  {payment.notes ? (
                    <div className="sm:col-span-3">
                      <Detail label="Notes">
                        <span className="whitespace-pre-line">{payment.notes}</span>
                      </Detail>
                    </div>
                  ) : null}
                </dl>
              </div>

              <div className="mx-auto max-w-[210mm] rounded-xl border bg-card p-5">
                <h2 className="mb-3 text-sm font-semibold">Bills paid</h2>
                {payment.allocations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">This payment has not been applied to any bills.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr>
                        <th className="py-1.5 text-left font-medium">Bill#</th>
                        <th className="py-1.5 text-left font-medium">Bill date</th>
                        <th className="py-1.5 text-right font-medium">Bill amount</th>
                        <th className="py-1.5 text-right font-medium">Payment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payment.allocations.map((allocation) => (
                        <tr key={allocation.id} className="border-t">
                          <td className="py-2">
                            <Link href={`/bills/${allocation.bill.id}`} className="font-medium text-primary hover:underline">
                              {allocation.bill.billNumber}
                            </Link>
                          </td>
                          <td className="py-2">{formatDate(allocation.bill.billDate, organization)}</td>
                          <td className="py-2 text-right">
                            <Money value={allocation.bill.total} />
                          </td>
                          <td className="py-2 text-right">
                            <Money value={allocation.amount} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="mx-auto max-w-[210mm] rounded-xl border bg-card p-5">
                <h2 className="mb-4 text-sm font-semibold">History</h2>
                <HistoryPanel entries={history.data} isLoading={history.isPending} />
              </div>
            </div>
          </>
        )}
      </section>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete payment ${payment?.number ?? ''}?`}
        description="The bills it paid will show their balances as owed again."
        confirmLabel="Delete payment"
        destructive
        busy={remove.isPending}
        onConfirm={onDelete}
      />
    </div>
  );
}
