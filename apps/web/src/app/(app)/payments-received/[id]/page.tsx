'use client';

import { toDecimal } from '@spms/shared';
import { Loader2Icon, MoreHorizontalIcon, PencilIcon, PrinterIcon, Trash2Icon, Undo2Icon } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DocumentListPane } from '@/components/documents/document-list-pane';
import { RefundDialog } from '@/components/documents/refund-dialog';
import { EmptyState } from '@/components/empty-state';
import { HistoryPanel } from '@/components/history-panel';
import { Money } from '@/components/money';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useAddRefund,
  useDeletePayment,
  usePayment,
  usePaymentHistory,
  usePayments,
  useRemoveRefund,
} from '@/features/payments/api';
import { PaymentReceipt } from '@/features/payments/payment-receipt';
import { formatDate } from '@/lib/format';
import { showApiError } from '@/lib/forms';
import { useCan, useOrganization } from '@/lib/session';

export default function PaymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const can = useCan();
  const organization = useOrganization();
  const { data: payment, isPending, isError } = usePayment(id);
  const list = usePayments({ pageSize: 50, sort: '-date' });
  const history = usePaymentHistory(id);
  const remove = useDeletePayment();
  const addRefund = useAddRefund();
  const removeRefund = useRemoveRefund();
  const [refunding, setRefunding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const onDelete = async () => {
    try {
      await remove.mutateAsync(id);
      toast.success('Payment deleted');
      router.replace('/payments-received');
    } catch (error) {
      showApiError(error);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="-m-4 flex h-[calc(100svh-3.5rem)] sm:-m-6">
      <DocumentListPane
        title="All payments"
        listHref="/payments-received"
        newHref={can('payments_received:create') ? '/payments-received/new' : undefined}
        isLoading={list.isPending}
        activeId={id}
        hrefFor={(rowId) => `/payments-received/${rowId}`}
        rows={list.data?.data.map((row) => ({
          id: row.id,
          title: row.customer.displayName,
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
              <div className="flex flex-wrap items-center gap-2">
                {can('payments_received:edit') ? (
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/payments-received/${id}/edit`} />}>
                    <PencilIcon />
                    Edit
                  </Button>
                ) : null}
                {can('payments_received:edit') && toDecimal(payment.unusedAmount).gt(0) ? (
                  <Button variant="outline" size="sm" onClick={() => setRefunding(true)}>
                    <Undo2Icon />
                    Refund
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/print/payments-received/${id}?autoprint=1`, '_blank', 'noopener')}
                >
                  <PrinterIcon />
                  Print
                </Button>
                {can('payments_received:delete') ? (
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
              <PaymentReceipt payment={payment} />

              {payment.allocations.length > 0 ? (
                <div className="mx-auto flex max-w-[210mm] flex-wrap gap-2 text-sm">
                  <span className="text-muted-foreground">Invoices paid:</span>
                  {payment.allocations.map((allocation) => (
                    <Link key={allocation.id} href={`/invoices/${allocation.invoice.id}`} className="font-medium text-primary hover:underline">
                      {allocation.invoice.number}
                    </Link>
                  ))}
                </div>
              ) : null}

              {payment.refunds.length > 0 ? (
                <div className="mx-auto max-w-[210mm] rounded-xl border bg-card p-5">
                  <h2 className="mb-3 text-sm font-semibold">Refunds</h2>
                  <ul className="divide-y text-sm">
                    {payment.refunds.map((refund) => (
                      <li key={refund.id} className="flex items-center justify-between gap-3 py-2">
                        <span>
                          {formatDate(refund.refundDate, organization)}
                          <span className="text-muted-foreground">
                            {refund.paymentMode ? ` · ${refund.paymentMode.name}` : ''}
                            {refund.referenceNumber ? ` · ${refund.referenceNumber}` : ''}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <Money value={refund.amount} />
                          {can('payments_received:edit') ? (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Delete refund"
                              disabled={removeRefund.isPending}
                              onClick={async () => {
                                try {
                                  await removeRefund.mutateAsync({ id, refundId: refund.id });
                                  toast.success('Refund deleted');
                                } catch (error) {
                                  showApiError(error);
                                }
                              }}
                            >
                              <Trash2Icon />
                            </Button>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mx-auto max-w-[210mm] rounded-xl border bg-card p-5">
                <h2 className="mb-4 text-sm font-semibold">History</h2>
                <HistoryPanel entries={history.data} isLoading={history.isPending} />
              </div>
            </div>
          </>
        )}
      </section>

      {refunding && payment ? (
        <RefundDialog
          title="Refund unused amount"
          description="Record money returned to the customer from this payment."
          defaultAmount={payment.unusedAmount}
          busy={addRefund.isPending}
          onSubmit={(input) => addRefund.mutateAsync({ id, input })}
          onClose={() => setRefunding(false)}
        />
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete payment ${payment?.number ?? ''}?`}
        description="The invoices it paid will show their balances as owed again."
        confirmLabel="Delete payment"
        destructive
        busy={remove.isPending}
        onConfirm={onDelete}
      />
    </div>
  );
}
