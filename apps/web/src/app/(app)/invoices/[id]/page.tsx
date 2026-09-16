'use client';

import { canPerformInvoiceAction, daysBetween, todayInTimeZone } from '@spms/shared';
import {
  BanknoteArrowDownIcon,
  CopyIcon,
  FileTextIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PrinterIcon,
  SendIcon,
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
import { formatDate, formatDateTime } from '@/lib/format';
import { showApiError } from '@/lib/forms';
import { useCan, useOrganization } from '@/lib/session';

function VoidDialog({ invoiceNumber, busy, onClose, onConfirm }: {
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
            The invoice stays on record but no longer counts as owed, and any stock it took is returned.
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
            Void invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
          <EmptyState title="Invoice not found" description="It may have been deleted." className="flex-1" />
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
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/invoices/${id}/edit`} />}>
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
                {canPerformInvoiceAction('recordPayment', invoice) ? (
                  <Button
                    size="sm"
                    variant={invoice.status === 'draft' ? 'outline' : 'default'}
                    disabled
                    title="Recording payments arrives with the Payments Received module (Module 6)"
                  >
                    <BanknoteArrowDownIcon />
                    Record payment
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/print/invoices/${id}?autoprint=1`, '_blank', 'noopener')}
                >
                  <PrinterIcon />
                  Print
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label="More actions" />}>
                    <MoreHorizontalIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {can('invoices:create') ? (
                      <DropdownMenuItem onClick={onClone}>
                        <CopyIcon />
                        Clone
                      </DropdownMenuItem>
                    ) : null}
                    {can('invoices:void') && canPerformInvoiceAction('void', invoice) ? (
                      <DropdownMenuItem onClick={() => setVoiding(true)}>Void</DropdownMenuItem>
                    ) : null}
                    {can('invoices:delete') && canPerformInvoiceAction('delete', invoice) ? (
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
              {invoice.displayStatus === 'overdue' ? (
                <p className="mx-auto max-w-[210mm] rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-800 ring-1 ring-rose-600/20">
                  Overdue by {daysBetween(invoice.dueDate, today)} days. Due on {formatDate(invoice.dueDate, organization)}.
                </p>
              ) : null}
              {invoice.status === 'void' ? (
                <p className="mx-auto max-w-[210mm] rounded-lg bg-muted px-4 py-2 text-sm text-muted-foreground">
                  Voided {invoice.voidedAt ? formatDateTime(invoice.voidedAt, organization) : ''}
                  {invoice.voidReason ? `: ${invoice.voidReason}` : '.'}
                </p>
              ) : null}
              {invoice.quote ? (
                <p className="mx-auto flex max-w-[210mm] items-center gap-1.5 text-sm text-muted-foreground">
                  <FileTextIcon className="size-4" />
                  Created from quote{' '}
                  <Link href={`/quotes/${invoice.quote.id}`} className="font-medium text-primary hover:underline">
                    {invoice.quote.number}
                  </Link>
                </p>
              ) : null}

              <InvoicePreview invoice={invoice} />

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
          invoice?.quote ? `Quote ${invoice.quote.number} will return to accepted so it can be converted again.` : 'This cannot be undone.'
        }
        confirmLabel="Delete invoice"
        destructive
        busy={remove.isPending}
        onConfirm={onDelete}
      />
    </div>
  );
}
