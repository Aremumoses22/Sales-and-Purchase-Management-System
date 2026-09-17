'use client';

import {
  canPerformInvoiceAction,
  daysBetween,
  moneyString,
  todayInTimeZone,
  toDecimal,
  type InvoiceDto,
} from '@spms/shared';
import {
  BanknoteArrowDownIcon,
  CopyIcon,
  FileTextIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PrinterIcon,
  RefreshCwIcon,
  SendIcon,
  WalletIcon,
} from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  useCloneInvoice,
  useDeleteInvoice,
  useInvoice,
  useInvoiceHistory,
  useInvoices,
  useMarkInvoiceSent,
  useVoidInvoice,
} from '@/features/invoices/api';
import { InvoicePreview } from '@/features/invoices/invoice-preview';
import { useApplyCredits, useAvailableCredits } from '@/features/payments/api';
import { ApiError } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { showApiError } from '@/lib/forms';
import { useCan, useOrganization } from '@/lib/session';

function VoidDialog({
  invoiceNumber,
  busy,
  onClose,
  onConfirm,
}: {
  invoiceNumber: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void invoice {invoiceNumber}?</DialogTitle>
          <DialogDescription>
            The invoice stays on record but no longer counts as owed, and any stock it took is
            returned.
          </DialogDescription>
        </DialogHeader>
        <Field label="Reason" htmlFor="void-reason" hint="Optional, recorded in the history.">
          <Textarea
            id="void-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => onConfirm(reason)} disabled={busy}>
            {busy ? <Loader2Icon className="animate-spin" /> : null}
            Void invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type CreditSource = {
  kind: 'payment' | 'creditNote';
  id: string;
  number: string;
  date: string;
  available: string;
};

function ApplyCreditsDialog({
  invoice,
  sources,
  onClose,
}: {
  invoice: InvoiceDto;
  sources: CreditSource[];
  onClose: () => void;
}) {
  const organization = useOrganization();
  const apply = useApplyCredits();
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    // Suggest using the oldest credit first, up to what is due.
    let remaining = toDecimal(invoice.balanceDue);
    const initial: Record<string, string> = {};
    for (const source of sources) {
      const share = remaining.lt(source.available) ? remaining : toDecimal(source.available);
      initial[source.id] = share.gt(0) ? moneyString(share) : '';
      remaining = remaining.minus(share);
    }
    return initial;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();

  const chosen = sources
    .map((source) => ({ source, amount: (amounts[source.id] ?? '').trim() }))
    .filter((entry) => Number(entry.amount) > 0);
  const payments = chosen.filter((entry) => entry.source.kind === 'payment');
  const creditNotes = chosen.filter((entry) => entry.source.kind === 'creditNote');
  const total = chosen.reduce((sum, entry) => sum.plus(toDecimal(entry.amount)), toDecimal(0));

  const submit = async () => {
    setErrors({});
    setFormError(undefined);
    try {
      await apply.mutateAsync({
        invoiceId: invoice.id,
        input: {
          payments: payments.map((entry) => ({ paymentId: entry.source.id, amount: entry.amount })),
          creditNotes: creditNotes.map((entry) => ({
            creditNoteId: entry.source.id,
            amount: entry.amount,
          })),
        },
      });
      toast.success('Credits applied');
      onClose();
    } catch (error) {
      if (!(error instanceof ApiError)) return showApiError(error);
      const next: Record<string, string> = {};
      for (const issue of error.fieldErrors) {
        const match = /^(payments|creditNotes)\.(\d+)\./.exec(issue.path);
        const entry = match
          ? (match[1] === 'payments' ? payments : creditNotes)[Number(match[2])]
          : undefined;
        if (entry) next[entry.source.id] = issue.message;
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
          <DialogTitle>Apply credits to {invoice.number}</DialogTitle>
          <DialogDescription>
            Balance due: <Money value={invoice.balanceDue} />
          </DialogDescription>
        </DialogHeader>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1.5 text-left font-medium">Credit</th>
              <th className="py-1.5 text-right font-medium">Available</th>
              <th className="w-36 py-1.5 text-right font-medium">Apply</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.id} className="border-t align-top">
                <td className="py-2">
                  {source.number}
                  <span className="block text-xs text-muted-foreground">
                    {source.kind === 'payment' ? 'Unused payment' : 'Credit note'} ·{' '}
                    {formatDate(source.date, organization)}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <Money value={source.available} />
                </td>
                <td className="py-1.5">
                  <Input
                    inputMode="decimal"
                    aria-label={`Amount to apply from ${source.number}`}
                    className="text-right"
                    value={amounts[source.id] ?? ''}
                    onChange={(event) =>
                      setAmounts({ ...amounts, [source.id]: event.target.value })
                    }
                  />
                  {errors[source.id] ? (
                    <p className="mt-1 text-right text-xs text-destructive">{errors[source.id]}</p>
                  ) : null}
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
          <Button onClick={submit} disabled={apply.isPending || chosen.length === 0}>
            {apply.isPending ? <Loader2Icon className="animate-spin" /> : null}
            Apply credits
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Zoho's "Credits available" bar: unused payments and open credit notes of this customer. */
function AvailableCredits({ invoice }: { invoice: InvoiceDto }) {
  const can = useCan();
  const canUsePayments = can('payments_received:edit');
  const canUseCreditNotes = can('credit_notes:edit');
  const eligible =
    (canUsePayments || canUseCreditNotes) &&
    invoice.status !== 'void' &&
    toDecimal(invoice.balanceDue).gt(0);
  const { data } = useAvailableCredits(invoice.id, eligible);
  const [open, setOpen] = useState(false);

  if (!eligible || !data) return null;
  // Oldest first, across both kinds, limited to what this user may apply.
  const sources: CreditSource[] = [
    ...(canUsePayments
      ? data.payments.map((payment) => ({
          kind: 'payment' as const,
          id: payment.id,
          number: payment.number,
          date: payment.paymentDate,
          available: payment.unusedAmount,
        }))
      : []),
    ...(canUseCreditNotes
      ? data.creditNotes.map((creditNote) => ({
          kind: 'creditNote' as const,
          id: creditNote.id,
          number: creditNote.number,
          date: creditNote.creditNoteDate,
          available: creditNote.balance,
        }))
      : []),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
  const total = sources.reduce(
    (sum, source) => sum.plus(toDecimal(source.available)),
    toDecimal(0),
  );
  if (!total.gt(0)) return null;

  return (
    <>
      <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-900 ring-1 ring-emerald-600/20">
        <span>
          Credits available: <Money value={total.toFixed(2)} className="font-semibold" />
        </span>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Apply credits
        </Button>
      </div>
      {open ? (
        <ApplyCreditsDialog invoice={invoice} sources={sources} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const can = useCan();
  const organization = useOrganization();
  const { data: invoice, isPending, isError } = useInvoice(id);
  const list = useInvoices({ status: 'all', pageSize: 50, sort: '-date' });
  const history = useInvoiceHistory(id);
  const markSent = useMarkInvoiceSent();
  const voidInvoice = useVoidInvoice();
  const clone = useCloneInvoice();
  const remove = useDeleteInvoice();
  const [voiding, setVoiding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const onMarkSent = async () => {
    try {
      await markSent.mutateAsync(id);
      toast.success('Invoice marked as sent');
    } catch (error) {
      showApiError(error);
    }
  };

  const onVoid = async (reason: string) => {
    try {
      await voidInvoice.mutateAsync({ id, reason });
      toast.success('Invoice voided');
      setVoiding(false);
    } catch (error) {
      showApiError(error);
    }
  };

  const onClone = async () => {
    try {
      const copy = await clone.mutateAsync(id);
      toast.success(`Draft ${copy.number} created from ${invoice?.number}`);
      router.push(`/invoices/${copy.id}/edit`);
    } catch (error) {
      showApiError(error);
    }
  };

  const onDelete = async () => {
    try {
      await remove.mutateAsync(id);
      toast.success('Invoice deleted');
      router.replace('/invoices');
    } catch (error) {
      showApiError(error);
      setConfirmDelete(false);
    }
  };

  const today = todayInTimeZone(organization.timezone);

  return (
    <div className="-m-4 flex h-[calc(100svh-3.5rem)] sm:-m-6">
      <DocumentListPane
        title="All invoices"
        listHref="/invoices"
        newHref={can('invoices:create') ? '/invoices/new' : undefined}
        isLoading={list.isPending}
        activeId={id}
        hrefFor={(rowId) => `/invoices/${rowId}`}
        rows={list.data?.data.map((row) => ({
          id: row.id,
          title: row.customer.displayName,
          amount: row.total,
          subtitle: `${row.number} · ${formatDate(row.invoiceDate, organization)}`,
          status: row.displayStatus,
        }))}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        {isError ? (
          <EmptyState
            title="Invoice not found"
            description="It may have been deleted."
            className="flex-1"
          />
        ) : isPending || !invoice ? (
          <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-5 py-2.5">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">{invoice.number}</h1>
                <StatusBadge status={invoice.displayStatus} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {can('invoices:edit') && canPerformInvoiceAction('edit', invoice) ? (
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/invoices/${id}/edit`} />}
                  >
                    <PencilIcon />
                    Edit
                  </Button>
                ) : null}
                {can('invoices:edit') && canPerformInvoiceAction('markSent', invoice) ? (
                  <Button size="sm" onClick={onMarkSent} disabled={markSent.isPending}>
                    <SendIcon />
                    Mark as sent
                  </Button>
                ) : null}
                {can('payments_received:create') &&
                canPerformInvoiceAction('recordPayment', invoice) ? (
                  <Button
                    size="sm"
                    variant={invoice.status === 'draft' ? 'outline' : 'default'}
                    nativeButton={false}
                    render={
                      <Link
                        href={`/payments-received/new?customerId=${invoice.customer.id}&invoiceId=${id}`}
                      />
                    }
                  >
                    <BanknoteArrowDownIcon />
                    Record payment
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    window.open(`/print/invoices/${id}?autoprint=1`, '_blank', 'noopener')
                  }
                >
                  <PrinterIcon />
                  Print
                </Button>

                {can('invoices:create') ||
                (can('credit_notes:create') && invoice.status === 'sent') ||
                (can('invoices:void') && canPerformInvoiceAction('void', invoice)) ||
                (can('invoices:delete') && canPerformInvoiceAction('delete', invoice)) ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="outline" size="icon-sm" aria-label="More actions" />}
                    >
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {can('invoices:create') ? (
                        <DropdownMenuItem onClick={onClone}>
                          <CopyIcon />
                          Clone
                        </DropdownMenuItem>
                      ) : null}
                      {can('credit_notes:create') && invoice.status === 'sent' ? (
                        <DropdownMenuItem
                          render={<Link href={`/credit-notes/new?invoiceId=${id}`} />}
                        >
                          <WalletIcon />
                          Create credit note
                        </DropdownMenuItem>
                      ) : null}
                      {can('invoices:void') && canPerformInvoiceAction('void', invoice) ? (
                        <DropdownMenuItem onClick={() => setVoiding(true)}>Void</DropdownMenuItem>
                      ) : null}
                      {can('invoices:delete') && canPerformInvoiceAction('delete', invoice) ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setConfirmDelete(true)}
                          >
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
              {invoice.displayStatus === 'overdue' ? (
                <p className="mx-auto max-w-[210mm] rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-800 ring-1 ring-rose-600/20">
                  Overdue by {daysBetween(invoice.dueDate, today)} days. Due on{' '}
                  {formatDate(invoice.dueDate, organization)}.
                </p>
              ) : null}
              {invoice.status === 'void' ? (
                <p className="mx-auto max-w-[210mm] rounded-lg bg-muted px-4 py-2 text-sm text-muted-foreground">
                  Voided {invoice.voidedAt ? formatDateTime(invoice.voidedAt, organization) : ''}
                  {invoice.voidReason ? `: ${invoice.voidReason}` : '.'}
                </p>
              ) : null}
              {invoice.recurringProfile ? (
                <p className="mx-auto flex max-w-[210mm] items-center gap-1.5 text-sm text-muted-foreground">
                  <RefreshCwIcon className="size-4" />
                  Created by recurring invoice{' '}
                  <Link
                    href={`/recurring-invoices/${invoice.recurringProfile.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {invoice.recurringProfile.name}
                  </Link>
                </p>
              ) : null}
              {invoice.quote ? (
                <p className="mx-auto flex max-w-[210mm] items-center gap-1.5 text-sm text-muted-foreground">
                  <FileTextIcon className="size-4" />
                  Created from quote{' '}
                  <Link
                    href={`/quotes/${invoice.quote.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {invoice.quote.number}
                  </Link>
                </p>
              ) : null}

              <AvailableCredits invoice={invoice} />

              <InvoicePreview invoice={invoice} />

              {invoice.payments.length > 0 ? (
                <div className="mx-auto max-w-[210mm] rounded-xl border bg-card p-5">
                  <h2 className="mb-3 text-sm font-semibold">Payments received</h2>
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
                      {invoice.payments.map((payment) => (
                        <tr key={payment.paymentId} className="border-t">
                          <td className="py-2">{formatDate(payment.paymentDate, organization)}</td>
                          <td className="py-2">
                            <Link
                              href={`/payments-received/${payment.paymentId}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {payment.number}
                            </Link>
                          </td>
                          <td className="py-2 text-muted-foreground">
                            {payment.paymentMode ?? '—'}
                          </td>
                          <td className="py-2 text-right">
                            <Money value={payment.amount} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {invoice.credits.length > 0 ? (
                <div className="mx-auto max-w-[210mm] rounded-xl border bg-card p-5">
                  <h2 className="mb-3 text-sm font-semibold">Credits applied</h2>
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr>
                        <th className="py-1.5 text-left font-medium">Date</th>
                        <th className="py-1.5 text-left font-medium">Credit note#</th>
                        <th className="py-1.5 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.credits.map((credit) => (
                        <tr key={credit.applicationId} className="border-t">
                          <td className="py-2">{formatDate(credit.appliedDate, organization)}</td>
                          <td className="py-2">
                            <Link
                              href={`/credit-notes/${credit.creditNoteId}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {credit.number}
                            </Link>
                          </td>
                          <td className="py-2 text-right">
                            <Money value={credit.amount} />
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

      {voiding && invoice ? (
        <VoidDialog
          invoiceNumber={invoice.number}
          busy={voidInvoice.isPending}
          onClose={() => setVoiding(false)}
          onConfirm={onVoid}
        />
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete draft ${invoice?.number ?? ''}?`}
        description={
          invoice?.quote
            ? `Quote ${invoice.quote.number} will return to accepted so it can be converted again.`
            : 'This cannot be undone.'
        }
        confirmLabel="Delete invoice"
        destructive
        busy={remove.isPending}
        onConfirm={onDelete}
      />
    </div>
  );
}
