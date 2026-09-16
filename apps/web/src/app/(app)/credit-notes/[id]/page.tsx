'use client';

import { canPerformCreditNoteAction, moneyString, toDecimal, type CreditNoteDto } from '@spms/shared';
import {
  CheckCircle2Icon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PrinterIcon,
  ReceiptIcon,
  Trash2Icon,
  Undo2Icon,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DocumentListPane } from '@/components/documents/document-list-pane';
import { RefundDialog } from '@/components/documents/refund-dialog';
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
  useAddCreditNoteRefund,
  useApplyCreditNote,
  useCreditNote,
  useCreditNoteHistory,
  useCreditNoteOpenInvoices,
  useCreditNotes,
  useDeleteCreditNote,
  useMarkCreditNoteOpen,
  useRemoveCreditApplication,
  useRemoveCreditNoteRefund,
  useVoidCreditNote,
} from '@/features/credit-notes/api';
import { CreditNotePreview } from '@/features/credit-notes/credit-note-preview';
import { ApiError } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { showApiError } from '@/lib/forms';
import { useCan, useOrganization } from '@/lib/session';

/** Zoho's "Apply to invoices": spread the credit over the customer's unpaid invoices. */
function ApplyToInvoicesDialog({ creditNote, onClose }: { creditNote: CreditNoteDto; onClose: () => void }) {
  const organization = useOrganization();
  const apply = useApplyCreditNote();
  const { data: invoices, isPending } = useCreditNoteOpenInvoices(creditNote.id, true);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();

  const entries = (invoices ?? [])
    .map((invoice) => ({ invoiceId: invoice.id, amount: (amounts[invoice.id] ?? '').trim() }))
    .filter((entry) => Number(entry.amount) > 0);
  const total = entries.reduce((sum, entry) => sum.plus(toDecimal(entry.amount)), toDecimal(0));
  const remaining = toDecimal(creditNote.balance).minus(total);

  /** Uses the credit on the oldest invoices first. */
  const fillOldestFirst = () => {
    let left = toDecimal(creditNote.balance);
    const next: Record<string, string> = {};
    for (const invoice of invoices ?? []) {
      const share = left.lt(invoice.balanceDue) ? left : toDecimal(invoice.balanceDue);
      next[invoice.id] = share.gt(0) ? moneyString(share) : '';
      left = left.minus(share);
    }
    setAmounts(next);
  };

  const submit = async () => {
    setErrors({});
    setFormError(undefined);
    try {
      await apply.mutateAsync({ id: creditNote.id, input: { applications: entries } });
      toast.success('Credit applied');
      onClose();
    } catch (error) {
      if (!(error instanceof ApiError)) return showApiError(error);
      const next: Record<string, string> = {};
      for (const issue of error.fieldErrors) {
        const match = /^applications\.(\d+)\./.exec(issue.path);
        const entry = match ? entries[Number(match[1])] : undefined;
        if (entry) next[entry.invoiceId] = issue.message;
        else setFormError(issue.message);
      }
      setErrors(next);
      if (!error.fieldErrors.length) setFormError(error.message);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Apply {creditNote.number} to invoices</DialogTitle>
          <DialogDescription>
            Credits remaining: <Money value={creditNote.balance} />
          </DialogDescription>
        </DialogHeader>

        {isPending ? (
          <Loader2Icon className="mx-auto my-6 size-5 animate-spin text-muted-foreground" />
        ) : !invoices?.length ? (
          <EmptyState
            icon={<ReceiptIcon className="size-7" />}
            title="No unpaid invoices"
            description={`${creditNote.customer.displayName} has nothing left to pay. You can refund the credit instead.`}
          />
        ) : (
          <>
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={fillOldestFirst}>
                Apply to oldest invoices
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1.5 text-left font-medium">Invoice#</th>
                    <th className="py-1.5 text-left font-medium">Date</th>
                    <th className="py-1.5 text-right font-medium">Amount</th>
                    <th className="py-1.5 text-right font-medium">Balance due</th>
                    <th className="w-36 py-1.5 text-right font-medium">Credit to apply</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-t align-top">
                      <td className="py-2 font-medium">{invoice.number}</td>
                      <td className="py-2 text-muted-foreground">{formatDate(invoice.invoiceDate, organization)}</td>
                      <td className="py-2 text-right">
                        <Money value={invoice.total} />
                      </td>
                      <td className="py-2 text-right">
                        <Money value={invoice.balanceDue} />
                      </td>
                      <td className="py-1.5">
                        <Input
                          inputMode="decimal"
                          aria-label={`Credit to apply to ${invoice.number}`}
                          className="text-right"
                          value={amounts[invoice.id] ?? ''}
                          onChange={(event) => setAmounts({ ...amounts, [invoice.id]: event.target.value })}
                        />
                        {errors[invoice.id] ? <p className="mt-1 text-right text-xs text-destructive">{errors[invoice.id]}</p> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Amount to credit</dt>
                <dd>
                  <Money value={total.toFixed(2)} />
                </dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>Remaining credits</dt>
                <dd className={remaining.lt(0) ? 'text-destructive' : undefined}>
                  <Money value={remaining.toFixed(2)} />
                </dd>
              </div>
            </dl>
          </>
        )}
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

function VoidDialog({ number, busy, onClose, onConfirm }: { number: string; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void credit note {number}?</DialogTitle>
          <DialogDescription>
            It stays on record but can no longer be used, and any goods it returned to stock are taken out again.
          </DialogDescription>
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
            Void credit note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CreditNoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const can = useCan();
  const organization = useOrganization();
  const { data: creditNote, isPending, isError } = useCreditNote(id);
  const list = useCreditNotes({ status: 'all', pageSize: 50, sort: '-date' });
  const history = useCreditNoteHistory(id);
  const markOpen = useMarkCreditNoteOpen();
  const voidCreditNote = useVoidCreditNote();
  const remove = useDeleteCreditNote();
  const addRefund = useAddCreditNoteRefund();
  const removeRefund = useRemoveCreditNoteRefund();
  const removeApplication = useRemoveCreditApplication();
  const [applying, setApplying] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = async (action: () => Promise<unknown>, message: string) => {
    try {
      await action();
      toast.success(message);
    } catch (error) {
      showApiError(error);
    }
  };

  const onDelete = async () => {
    try {
      await remove.mutateAsync(id);
      toast.success('Credit note deleted');
      router.replace('/credit-notes');
    } catch (error) {
      showApiError(error);
      setConfirmDelete(false);
    }
  };

  const canEdit = can('credit_notes:edit');

  return (
    <div className="-m-4 flex h-[calc(100svh-3.5rem)] sm:-m-6">
      <DocumentListPane
        title="All credit notes"
        listHref="/credit-notes"
        newHref={can('credit_notes:create') ? '/credit-notes/new' : undefined}
        isLoading={list.isPending}
        activeId={id}
        hrefFor={(rowId) => `/credit-notes/${rowId}`}
        rows={list.data?.data.map((row) => ({
          id: row.id,
          title: row.customer.displayName,
          amount: row.total,
          subtitle: `${row.number} · ${formatDate(row.creditNoteDate, organization)}`,
          status: row.displayStatus,
        }))}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        {isError ? (
          <EmptyState title="Credit note not found" description="It may have been deleted." className="flex-1" />
        ) : isPending || !creditNote ? (
          <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-5 py-2.5">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">{creditNote.number}</h1>
                <StatusBadge status={creditNote.displayStatus} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canEdit && canPerformCreditNoteAction('edit', creditNote) ? (
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/credit-notes/${id}/edit`} />}>
                    <PencilIcon />
                    Edit
                  </Button>
                ) : null}
                {canEdit && canPerformCreditNoteAction('markOpen', creditNote) ? (
                  <Button size="sm" disabled={markOpen.isPending} onClick={() => run(() => markOpen.mutateAsync(id), 'Credit note opened')}>
                    <CheckCircle2Icon />
                    Mark as open
                  </Button>
                ) : null}
                {canEdit && can('invoices:view') && canPerformCreditNoteAction('apply', creditNote) ? (
                  <Button size="sm" onClick={() => setApplying(true)}>
                    <ReceiptIcon />
                    Apply to invoices
                  </Button>
                ) : null}
                {canEdit && canPerformCreditNoteAction('refund', creditNote) ? (
                  <Button variant="outline" size="sm" onClick={() => setRefunding(true)}>
                    <Undo2Icon />
                    Refund
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/print/credit-notes/${id}?autoprint=1`, '_blank', 'noopener')}
                >
                  <PrinterIcon />
                  Print
                </Button>

                {(can('credit_notes:void') && canPerformCreditNoteAction('void', creditNote)) ||
                (can('credit_notes:delete') && canPerformCreditNoteAction('delete', creditNote)) ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label="More actions" />}>
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {can('credit_notes:void') && canPerformCreditNoteAction('void', creditNote) ? (
                        <DropdownMenuItem onClick={() => setVoiding(true)}>Void</DropdownMenuItem>
                      ) : null}
                      {can('credit_notes:delete') && canPerformCreditNoteAction('delete', creditNote) ? (
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
              {creditNote.status === 'void' ? (
                <p className="mx-auto max-w-[210mm] rounded-lg bg-muted px-4 py-2 text-sm text-muted-foreground">
                  Voided {creditNote.voidedAt ? formatDateTime(creditNote.voidedAt, organization) : ''}
                  {creditNote.voidReason ? `: ${creditNote.voidReason}` : '.'}
                </p>
              ) : null}
              {creditNote.status === 'draft' ? (
                <p className="mx-auto max-w-[210mm] rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-900 ring-1 ring-blue-600/20">
                  Open this credit note to apply it to invoices or refund it
                  {creditNote.returnToStock ? ', and to put the returned goods back into stock' : ''}.
                </p>
              ) : null}
              {creditNote.displayStatus === 'open' ? (
                <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-900 ring-1 ring-emerald-600/20">
                  <span>
                    Credits remaining: <Money value={creditNote.balance} className="font-semibold" />
                  </span>
                  {creditNote.returnToStock ? <span className="text-xs">Returned goods are back in stock.</span> : null}
                </div>
              ) : null}
              {creditNote.invoice ? (
                <p className="mx-auto flex max-w-[210mm] items-center gap-1.5 text-sm text-muted-foreground">
                  <ReceiptIcon className="size-4" />
                  Raised against invoice{' '}
                  <Link href={`/invoices/${creditNote.invoice.id}`} className="font-medium text-primary hover:underline">
                    {creditNote.invoice.number}
                  </Link>
                </p>
              ) : null}

              <CreditNotePreview creditNote={creditNote} />

              {creditNote.applications.length > 0 ? (
                <div className="mx-auto max-w-[210mm] rounded-xl border bg-card p-5">
                  <h2 className="mb-3 text-sm font-semibold">Invoices credited</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-xs text-muted-foreground">
                        <tr>
                          <th className="py-1.5 text-left font-medium">Date applied</th>
                          <th className="py-1.5 text-left font-medium">Invoice#</th>
                          <th className="py-1.5 text-right font-medium">Invoice balance</th>
                          <th className="py-1.5 text-right font-medium">Amount credited</th>
                          <th className="w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {creditNote.applications.map((application) => (
                          <tr key={application.id} className="border-t">
                            <td className="py-2">{formatDate(application.appliedDate, organization)}</td>
                            <td className="py-2">
                              <Link href={`/invoices/${application.invoice.id}`} className="font-medium text-primary hover:underline">
                                {application.invoice.number}
                              </Link>
                            </td>
                            <td className="py-2 text-right">
                              <Money value={application.invoice.balanceDue} muteZero />
                            </td>
                            <td className="py-2 text-right">
                              <Money value={application.amount} />
                            </td>
                            <td className="py-1 text-right">
                              {canEdit ? (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Remove credit from ${application.invoice.number}`}
                                  disabled={removeApplication.isPending}
                                  onClick={() =>
                                    run(
                                      () => removeApplication.mutateAsync({ id, applicationId: application.id }),
                                      `Credit removed from ${application.invoice.number}`,
                                    )
                                  }
                                >
                                  <Trash2Icon />
                                </Button>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {creditNote.refunds.length > 0 ? (
                <div className="mx-auto max-w-[210mm] rounded-xl border bg-card p-5">
                  <h2 className="mb-3 text-sm font-semibold">Refunds</h2>
                  <ul className="divide-y text-sm">
                    {creditNote.refunds.map((refund) => (
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
                          {canEdit ? (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Delete refund"
                              disabled={removeRefund.isPending}
                              onClick={() => run(() => removeRefund.mutateAsync({ id, refundId: refund.id }), 'Refund deleted')}
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

      {applying && creditNote ? <ApplyToInvoicesDialog creditNote={creditNote} onClose={() => setApplying(false)} /> : null}

      {refunding && creditNote ? (
        <RefundDialog
          title="Refund credit note"
          description="Record money paid back to the customer from what is left on this credit note."
          defaultAmount={creditNote.balance}
          busy={addRefund.isPending}
          onSubmit={(input) => addRefund.mutateAsync({ id, input })}
          onClose={() => setRefunding(false)}
        />
      ) : null}

      {voiding && creditNote ? (
        <VoidDialog
          number={creditNote.number}
          busy={voidCreditNote.isPending}
          onClose={() => setVoiding(false)}
          onConfirm={async (reason) => {
            try {
              await voidCreditNote.mutateAsync({ id, reason });
              toast.success('Credit note voided');
              setVoiding(false);
            } catch (error) {
              showApiError(error);
            }
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete draft ${creditNote?.number ?? ''}?`}
        description="This cannot be undone."
        confirmLabel="Delete credit note"
        destructive
        busy={remove.isPending}
        onConfirm={onDelete}
      />
    </div>
  );
}
