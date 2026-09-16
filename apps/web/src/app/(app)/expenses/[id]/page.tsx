'use client';

import { ExternalLinkIcon, Loader2Icon, MoreHorizontalIcon, PencilIcon, Trash2Icon, UploadIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DocumentListPane } from '@/components/documents/document-list-pane';
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
  receiptUrl,
  useAttachReceipt,
  useDeleteExpense,
  useExpense,
  useExpenseHistory,
  useExpenses,
  useRemoveReceipt,
} from '@/features/expenses/api';
import { MAX_RECEIPT_BYTES } from '@/features/expenses/receipt-dropzone';
import { formatDate } from '@/lib/format';
import { showApiError } from '@/lib/forms';
import { useCan, useOrganization } from '@/lib/session';

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children || '—'}</dd>
    </div>
  );
}

export default function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const can = useCan();
  const organization = useOrganization();
  const { data: expense, isPending, isError } = useExpense(id);
  const list = useExpenses({ pageSize: 50, sort: '-date' });
  const history = useExpenseHistory(id);
  const attach = useAttachReceipt();
  const removeReceipt = useRemoveReceipt();
  const remove = useDeleteExpense();
  const fileInput = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_RECEIPT_BYTES) {
      toast.error('The receipt must be 5 MB or smaller.');
      return;
    }
    try {
      await attach.mutateAsync({ id, file });
      toast.success('Receipt attached');
    } catch (error) {
      showApiError(error);
    }
  };

  const onDelete = async () => {
    try {
      await remove.mutateAsync(id);
      toast.success('Expense deleted');
      router.replace('/expenses');
    } catch (error) {
      showApiError(error);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="-m-4 flex h-[calc(100svh-3.5rem)] sm:-m-6">
      <DocumentListPane
        title="All expenses"
        listHref="/expenses"
        newHref={can('expenses:create') ? '/expenses/new' : undefined}
        isLoading={list.isPending}
        activeId={id}
        hrefFor={(rowId) => `/expenses/${rowId}`}
        rows={list.data?.data.map((row) => ({
          id: row.id,
          title: row.category.name,
          amount: row.total,
          subtitle: `${formatDate(row.expenseDate, organization)}${row.vendor ? ` · ${row.vendor.displayName}` : ''}`,
        }))}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        {isError ? (
          <EmptyState title="Expense not found" description="It may have been deleted." className="flex-1" />
        ) : isPending || !expense ? (
          <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-5 py-2.5">
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold">{expense.category.name}</h1>
                <p className="text-xs text-muted-foreground">{formatDate(expense.expenseDate, organization)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {can('expenses:edit') ? (
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/expenses/${id}/edit`} />}>
                    <PencilIcon />
                    Edit
                  </Button>
                ) : null}
                {can('expenses:delete') ? (
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

            <div className="flex-1 overflow-y-auto bg-muted/30 p-5 sm:p-8">
              <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[1fr_22rem]">
                <div className="space-y-4">
                  <div className="rounded-xl border bg-card p-5">
                    <p className="text-xs text-muted-foreground">Expense amount</p>
                    <p className="text-3xl font-semibold">
                      <Money value={expense.total} />
                    </p>
                    {expense.tax ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        <Money value={expense.subtotal} /> + {expense.tax.name} ({expense.tax.rate}%) <Money value={expense.taxAmount} />
                        {expense.amountIsTaxInclusive ? ' · tax included in the amount paid' : ''}
                      </p>
                    ) : null}
                    <dl className="mt-5 space-y-2 border-t pt-4">
                      <Detail label="Paid through">{expense.paymentMode?.name}</Detail>
                      <Detail label="Vendor">
                        {expense.vendor ? (
                          <Link href={`/vendors/${expense.vendor.id}`} className="text-primary hover:underline">
                            {expense.vendor.displayName}
                          </Link>
                        ) : null}
                      </Detail>
                      <Detail label="Reference#">{expense.referenceNumber}</Detail>
                      <Detail label="Notes">
                        {expense.notes ? <span className="whitespace-pre-line">{expense.notes}</span> : null}
                      </Detail>
                      <Detail label="Recorded by">{expense.createdBy?.name}</Detail>
                    </dl>
                  </div>

                  <div className="rounded-xl border bg-card p-5">
                    <h2 className="mb-4 text-sm font-semibold">History</h2>
                    <HistoryPanel entries={history.data} isLoading={history.isPending} />
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold">Receipt</h2>
                    {expense.receipt ? (
                      <Button variant="ghost" size="sm" nativeButton={false} render={<a href={receiptUrl(expense)} target="_blank" rel="noreferrer" />}>
                        <ExternalLinkIcon />
                        Open
                      </Button>
                    ) : null}
                  </div>
                  {expense.receipt ? (
                    expense.receipt.mimeType === 'application/pdf' ? (
                      <iframe src={receiptUrl(expense)} title="Receipt" className="h-96 w-full rounded-lg border bg-white" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={receiptUrl(expense)} alt={`Receipt ${expense.receipt.name}`} className="w-full rounded-lg border bg-white object-contain" />
                    )
                  ) : (
                    <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">No receipt attached.</p>
                  )}
                  {expense.receipt ? <p className="truncate text-xs text-muted-foreground">{expense.receipt.name}</p> : null}
                  {can('expenses:edit') ? (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" disabled={attach.isPending} onClick={() => fileInput.current?.click()}>
                        {attach.isPending ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
                        {expense.receipt ? 'Replace' : 'Attach receipt'}
                      </Button>
                      {expense.receipt ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={removeReceipt.isPending}
                          onClick={async () => {
                            try {
                              await removeReceipt.mutateAsync(id);
                              toast.success('Receipt removed');
                            } catch (error) {
                              showApiError(error);
                            }
                          }}
                        >
                          <Trash2Icon />
                          Remove
                        </Button>
                      ) : null}
                      <input
                        ref={fileInput}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,application/pdf"
                        className="hidden"
                        onChange={(event) => {
                          void onFile(event.target.files?.[0]);
                          event.target.value = '';
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this expense?"
        description="The expense and its receipt are removed. This cannot be undone."
        confirmLabel="Delete expense"
        destructive
        busy={remove.isPending}
        onConfirm={onDelete}
      />
    </div>
  );
}
