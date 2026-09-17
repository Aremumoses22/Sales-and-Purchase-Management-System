'use client';

import { canPerformBillAction, daysBetween, moneyString, todayInTimeZone, toDecimal, type BillAvailableCreditsDto, type BillDto } from '@spms/shared';
import { BanknoteArrowUpIcon, CheckCircle2Icon, Loader2Icon, MoreHorizontalIcon, PencilIcon, PrinterIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DocumentListPane } from '@/components/documents/document-list-pane';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { HistoryPanel } from '@/components/history-panel';
import { Money } from '@/components/money';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  useApplyBillCredits,
  useBill,
  useBillAvailableCredits,
  useBillHistory,
  useBills,
  useDeleteBill,
  useMarkBillOpen,
  useVoidBill,
} from '@/features/bills/api';
import { ApiError } from '@/lib/api';
import { BillPreview } from '@/features/bills/bill-preview';
import { formatDate, formatDateTime } from '@/lib/format';
import { showApiError } from '@/lib/forms';
import { useCan, useOrganization } from '@/lib/session';

function VoidDialog({ number, busy, onClose, onConfirm }: { number: string; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void bill {number}?</DialogTitle>
          <DialogDescription>The bill stays on record but is no longer owed, and any stock it added is removed.</DialogDescription>
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
            Void bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApplyCreditsDialog({ bill, credits, onClose }: { bill: BillDto; credits: BillAvailableCreditsDto; onClose: () => void }) {
  const organization = useOrganization();
  const apply = useApplyBillCredits();
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    // Suggest using the oldest payment first, up to what is due.
    let remaining = toDecimal(bill.balanceDue);
    const initial: Record<string, string> = {};
    for (const payment of credits.payments) {
      const share = remaining.lt(payment.unusedAmount) ? remaining : toDecimal(payment.unusedAmount);
      initial[payment.id] = share.gt(0) ? moneyString(share) : '';
      remaining = remaining.minus(share);
    }
    return initial;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const entries = credits.payments
    .map((payment) => ({ paymentId: payment.id, amount: (amounts[payment.id] ?? '').trim() }))
    .filter((entry) => Number(entry.amount) > 0);
  const total = entries.reduce((sum, entry) => sum.plus(toDecimal(entry.amount)), toDecimal(0));

  const submit = async () => {
    setErrors({});
    setFormError(undefined);
    try {
      await apply.mutateAsync({ billId: bill.id, input: { payments: entries } });
      toast.success('Credits applied');
      onClose();
    } catch (error) {
      if (!(error instanceof ApiError)) return showApiError(error);
      const next: Record<string, string> = {};
      for (const issue of error.fieldErrors) {
        const match = /^payments\.(\d+)\./.exec(issue.path);
        const entry = match ? entries[Number(match[1])] : undefined;
        if (entry) next[entry.paymentId] = issue.message;
        else setFormError(issue.message);
      }
      setErrors(next);
      if (!error.fieldErrors.length) setFormError(error.message);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply credits to {bill.billNumber}</DialogTitle>
          <DialogDescription>
            Balance due: <Money value={bill.balanceDue} />
          </DialogDescription>
        </DialogHeader>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1.5 text-left font-medium">Payment</th>
              <th className="py-1.5 text-right font-medium">Unused</th>
              <th className="w-36 py-1.5 text-right font-medium">Apply</th>
            </tr>
          </thead>
          <tbody>
            {credits.payments.map((payment) => (
              <tr key={payment.id} className="border-t align-top">
                <td className="py-2">
                  {payment.number}
                  <span className="block text-xs text-muted-foreground">{formatDate(payment.paymentDate, organization)}</span>
                </td>
                <td className="py-2 text-right">
                  <Money value={payment.unusedAmount} />
                </td>
                <td className="py-1.5">
                  <Input
                    inputMode="decimal"
                    aria-label={`Amount to apply from ${payment.number}`}
                    className="text-right"
                    value={amounts[payment.id] ?? ''}
                    onChange={(event) => setAmounts({ ...amounts, [payment.id]: event.target.value })}
                  />
                  {errors[payment.id] ? <p className="mt-1 text-right text-xs text-destructive">{errors[payment.id]}</p> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-right text-sm">
          Amount to apply: <Money value={total.toFixed(2)} className="font-semibold" />
        </p>
        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={apply.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={apply.isPending || entries.length === 0}>
            {apply.isPending ? <Loader2Icon className="animate-spin" /> : null}
            Apply credits
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Unused money already paid to this vendor, ready to use on the bill. */
function AvailableCredits({ bill }: { bill: BillDto }) {
  const can = useCan();
  const eligible = can('payments_made:edit') && bill.status !== 'void' && toDecimal(bill.balanceDue).gt(0);
  const { data } = useBillAvailableCredits(bill.id, eligible);
  const [open, setOpen] = useState(false);
  if (!eligible || !data || !toDecimal(data.total).gt(0)) return null;
  return (
    <>
      <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-900 ring-1 ring-emerald-600/20">
        <span>
          Credits available: <Money value={data.total} className="font-semibold" />
        </span>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Apply credits
        </Button>
      </div>
      {open ? <ApplyCreditsDialog bill={bill} credits={data} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export default function BillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const can = useCan();
  const organization = useOrganization();
  const { data: bill, isPending, isError } = useBill(id);
  const list = useBills({ status: 'all', pageSize: 50, sort: '-date' });
  const history = useBillHistory(id);
  const markOpen = useMarkBillOpen();
  const voidBill = useVoidBill();
  const remove = useDeleteBill();
  const [voiding, setVoiding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const today = todayInTimeZone(organization.timezone);

  const onMarkOpen = async () => {
    try {
      await markOpen.mutateAsync(id);
      toast.success('Bill opened');
    } catch (error) {
      showApiError(error);
    }
  };

  const onVoid = async (reason: string) => {
    try {
      await voidBill.mutateAsync({ id, reason });
      toast.success('Bill voided');
      setVoiding(false);
    } catch (error) {
      showApiError(error);
    }
  };

  const onDelete = async () => {
    try {
      await remove.mutateAsync(id);
      toast.success('Bill deleted');
      router.replace('/bills');
    } catch (error) {
      showApiError(error);
      setConfirmDelete(false);
    }
  };

  const canVoid = bill && can('bills:void') && canPerformBillAction('void', bill);
  const canDelete = bill && can('bills:delete') && canPerformBillAction('delete', bill);

  return (
    <div className="-m-4 flex h-[calc(100svh-3.5rem)] sm:-m-6">
      <DocumentListPane
        title="All bills"
        listHref="/bills"
        newHref={can('bills:create') ? '/bills/new' : undefined}
        isLoading={list.isPending}
        activeId={id}
        hrefFor={(rowId) => `/bills/${rowId}`}
        rows={list.data?.data.map((row) => ({
          id: row.id,
          title: row.vendor.displayName,
          amount: row.total,
          subtitle: `${row.billNumber} · ${formatDate(row.billDate, organization)}`,
          status: row.displayStatus,
        }))}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        {isError ? (
          <EmptyState title="Bill not found" description="It may have been deleted." className="flex-1" />
        ) : isPending || !bill ? (
          <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-5 py-2.5">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">{bill.billNumber}</h1>
                <StatusBadge status={bill.displayStatus} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {can('bills:edit') && canPerformBillAction('edit', bill) ? (
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/bills/${id}/edit`} />}>
                    <PencilIcon />
                    Edit
                  </Button>
                ) : null}
                {can('bills:edit') && canPerformBillAction('markOpen', bill) ? (
                  <Button size="sm" onClick={onMarkOpen} disabled={markOpen.isPending}>
                    <CheckCircle2Icon />
                    Mark as open
                  </Button>
                ) : null}
                {can('payments_made:create') && canPerformBillAction('recordPayment', bill) ? (
                  <Button
                    size="sm"
                    variant={bill.status === 'draft' ? 'outline' : 'default'}
                    nativeButton={false}
                    render={<Link href={`/payments-made/new?vendorId=${bill.vendor.id}&billId=${id}`} />}
                  >
                    <BanknoteArrowUpIcon />
                    Record payment
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" onClick={() => window.open(`/print/bills/${id}?autoprint=1`, '_blank', 'noopener')}>
                  <PrinterIcon />
                  Print
                </Button>
                {canVoid || canDelete ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label="More actions" />}>
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canVoid ? <DropdownMenuItem onClick={() => setVoiding(true)}>Void</DropdownMenuItem> : null}
                      {canDelete ? (
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

            <div className="flex-1 space-y-4 overflow-y-auto bg-muted/30 p-5 sm:p-8">
              {bill.displayStatus === 'overdue' ? (
                <p className="mx-auto max-w-[210mm] rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-800 ring-1 ring-rose-600/20">
                  Overdue by {daysBetween(bill.dueDate, today)} days. Due on {formatDate(bill.dueDate, organization)}.
                </p>
              ) : null}
              {bill.status === 'void' ? (
                <p className="mx-auto max-w-[210mm] rounded-lg bg-muted px-4 py-2 text-sm text-muted-foreground">
                  Voided {bill.voidedAt ? formatDateTime(bill.voidedAt, organization) : ''}
                  {bill.voidReason ? `: ${bill.voidReason}` : '.'}
                </p>
              ) : null}
              {bill.status === 'draft' ? (
                <p className="mx-auto max-w-[210mm] rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-900 ring-1 ring-blue-600/20">
                  This bill is a draft. Open it to add it to what you owe and to receive its goods into stock.
                </p>
              ) : null}

              <AvailableCredits bill={bill} />

              <BillPreview bill={bill} />

              {bill.payments.length > 0 ? (
                <div className="mx-auto max-w-[210mm] rounded-xl border bg-card p-5">
                  <h2 className="mb-3 text-sm font-semibold">Payments made</h2>
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr>
                        <th className="py-1.5 text-left font-medium">Date</th>
                        <th className="py-1.5 text-left font-medium">Payment#</th>
                        <th className="py-1.5 text-left font-medium">Mode</th>
                        <th className="py-1.5 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bill.payments.map((payment) => (
                        <tr key={payment.paymentId} className="border-t">
                          <td className="py-2">{formatDate(payment.paymentDate, organization)}</td>
                          <td className="py-2">
                            <Link href={`/payments-made/${payment.paymentId}`} className="font-medium text-primary hover:underline">
                              {payment.number}
                            </Link>
                          </td>
                          <td className="py-2 text-muted-foreground">{payment.paymentMode ?? '—'}</td>
                          <td className="py-2 text-right">
                            <Money value={payment.amount} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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

      {voiding && bill ? <VoidDialog number={bill.billNumber} busy={voidBill.isPending} onClose={() => setVoiding(false)} onConfirm={onVoid} /> : null}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete draft ${bill?.billNumber ?? ''}?`}
        description="This cannot be undone."
        confirmLabel="Delete bill"
        destructive
        busy={remove.isPending}
        onConfirm={onDelete}
      />
    </div>
  );
}
