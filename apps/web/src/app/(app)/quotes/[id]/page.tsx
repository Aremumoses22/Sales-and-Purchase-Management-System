'use client';

import { canPerformQuoteAction } from '@spms/shared';
import { cn } from 'cn';
import {
  CheckIcon,
  CopyIcon,
  FileOutputIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  PrinterIcon,
  SendIcon,
  XIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { HistoryPanel } from '@/components/history-panel';
import { Money } from '@/components/money';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useCloneQuote,
  useDeleteQuote,
  useQuote,
  useQuoteHistory,
  useQuotes,
  useQuoteTransition,
  type QuoteTransition,
} from '@/features/quotes/api';
import { QuotePreview } from '@/features/quotes/quote-preview';
import { formatDate } from '@/lib/format';
import { showApiError } from '@/lib/forms';
import { useCan, useOrganization } from '@/lib/session';

const TRANSITION_MESSAGES: Record<QuoteTransition, string> = {
  'mark-sent': 'Quote marked as sent',
  accept: 'Quote marked as accepted',
  decline: 'Quote marked as declined',
};

/** Zoho's split view: the quote list stays on the left while one quote is open on the right. */
function QuoteList({ activeId }: { activeId: string }) {
  const organization = useOrganization();
  const can = useCan();
  const { data, isPending } = useQuotes({ status: 'all', pageSize: 50, sort: '-date' });

  return (
    <aside className="hidden w-80 shrink-0 flex-col border-r bg-background md:flex">
      <div className="flex h-12 items-center justify-between border-b px-4">
        <Link href="/quotes" className="text-sm font-semibold hover:underline">
          All quotes
        </Link>
        {can('quotes:create') ? (
          <Button size="icon-sm" nativeButton={false} render={<Link href="/quotes/new" />} aria-label="New quote">
            <PlusIcon />
          </Button>
        ) : null}
      </div>
      <div className="flex-1 overflow-y-auto">
        {isPending ? (
          <Loader2Icon className="mx-auto mt-6 size-5 animate-spin text-muted-foreground" />
        ) : (
          <ul className="divide-y">
            {data?.data.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/quotes/${row.id}`}
                  className={cn(
                    'block space-y-1 px-4 py-3 text-sm hover:bg-muted/50',
                    row.id === activeId && 'bg-primary/5 shadow-[inset_3px_0_0_var(--primary)]',
                  )}
                >
                  <div className="flex justify-between gap-2">
                    <span className="truncate font-medium">{row.customer.displayName}</span>
                    <Money value={row.total} className="shrink-0" />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {row.number} · {formatDate(row.quoteDate, organization)}
                    </span>
                    <StatusBadge status={row.displayStatus} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const can = useCan();
  const { data: quote, isPending, isError } = useQuote(id);
  const history = useQuoteHistory(id, true);
  const transition = useQuoteTransition();
  const clone = useCloneQuote();
  const remove = useDeleteQuote();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const runTransition = async (action: QuoteTransition) => {
    try {
      await transition.mutateAsync({ id, action });
      toast.success(TRANSITION_MESSAGES[action]);
    } catch (error) {
      showApiError(error);
    }
  };

  const onClone = async () => {
    try {
      const copy = await clone.mutateAsync(id);
      toast.success(`Draft ${copy.number} created from ${quote?.number}`);
      router.push(`/quotes/${copy.id}/edit`);
    } catch (error) {
      showApiError(error);
    }
  };

  const onDelete = async () => {
    try {
      await remove.mutateAsync(id);
      toast.success('Quote deleted');
      router.replace('/quotes');
    } catch (error) {
      showApiError(error);
      setConfirmDelete(false);
    }
  };

  const canEdit = can('quotes:edit');
  const status = quote?.status;

  return (
    <div className="-m-4 flex h-[calc(100svh-3.5rem)] sm:-m-6">
      <QuoteList activeId={id} />

      <section className="flex min-w-0 flex-1 flex-col">
        {isError ? (
          <EmptyState title="Quote not found" description="It may have been deleted." className="flex-1" />
        ) : isPending || !quote ? (
          <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-5 py-2.5">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">{quote.number}</h1>
                <StatusBadge status={quote.displayStatus} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canEdit && canPerformQuoteAction('edit', quote.status) ? (
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/quotes/${id}/edit`} />}>
                    <PencilIcon />
                    Edit
                  </Button>
                ) : null}

                {canEdit && status && canPerformQuoteAction('markSent', status) ? (
                  <Button size="sm" onClick={() => runTransition('mark-sent')} disabled={transition.isPending}>
                    <SendIcon />
                    Mark as sent
                  </Button>
                ) : null}
                {canEdit && status && canPerformQuoteAction('accept', status) ? (
                  <Button size="sm" onClick={() => runTransition('accept')} disabled={transition.isPending}>
                    <CheckIcon />
                    Mark as accepted
                  </Button>
                ) : null}
                {canEdit && status === 'sent' ? (
                  <Button variant="outline" size="sm" onClick={() => runTransition('decline')} disabled={transition.isPending}>
                    <XIcon />
                    Declined
                  </Button>
                ) : null}
                {status === 'accepted' ? (
                  <Button size="sm" disabled title="Converting to an invoice arrives with the Invoices module (Module 5)">
                    <FileOutputIcon />
                    Convert to invoice
                  </Button>
                ) : null}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/print/quotes/${id}?autoprint=1`, '_blank', 'noopener')}
                >
                  <PrinterIcon />
                  Print
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label="More actions" />}>
                    <MoreHorizontalIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {can('quotes:create') ? (
                      <DropdownMenuItem onClick={onClone}>
                        <CopyIcon />
                        Clone
                      </DropdownMenuItem>
                    ) : null}
                    {canEdit && status === 'accepted' ? (
                      <DropdownMenuItem onClick={() => runTransition('decline')}>
                        <XIcon />
                        Mark as declined
                      </DropdownMenuItem>
                    ) : null}
                    {can('quotes:delete') && status && canPerformQuoteAction('delete', status) ? (
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

            <div className="flex-1 space-y-5 overflow-y-auto bg-muted/30 p-5 sm:p-8">
              {quote.displayStatus === 'expired' ? (
                <p className="mx-auto max-w-[210mm] rounded-lg bg-orange-50 px-4 py-2 text-sm text-orange-800 ring-1 ring-orange-600/20">
                  This quote expired on {quote.expiryDate}. You can still mark it as accepted or declined.
                </p>
              ) : null}

              <QuotePreview quote={quote} />

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
        title={`Delete quote ${quote?.number ?? ''}?`}
        description="This cannot be undone."
        confirmLabel="Delete quote"
        destructive
        busy={remove.isPending}
        onConfirm={onDelete}
      />
    </div>
  );
}
