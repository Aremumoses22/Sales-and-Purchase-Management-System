'use client';

import type { InvoiceListItemDto } from '@spms/shared';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangleIcon,
  FilePlusIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  ReceiptIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { DocumentListPane } from '@/components/documents/document-list-pane';
import { DocumentPreview } from '@/components/documents/document-preview';
import { EmptyState } from '@/components/empty-state';
import { HistoryPanel } from '@/components/history-panel';
import { Money } from '@/components/money';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useInvoices } from '@/features/invoices/api';
import {
  useCreateInvoiceNow,
  useDeleteRecurringInvoice,
  useRecurringInvoice,
  useRecurringInvoiceHistory,
  useRecurringInvoices,
  useResumeRecurringInvoice,
  useStopRecurringInvoice,
} from '@/features/recurring-invoices/api';
import { formatRecurrence } from '@/features/recurring-invoices/format';
import { formatDate, formatDateTime } from '@/lib/format';
import { showApiError } from '@/lib/forms';
import { useCan, useOrganization } from '@/lib/session';

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function ChildInvoices({ profileId }: { profileId: string }) {
  const organization = useOrganization();
  const can = useCan();
  const [page, setPage] = useState(1);
  const { data, isPending } = useInvoices(
    { recurringProfileId: profileId, status: 'all', sort: '-date', page, pageSize: 10 },
    can('invoices:view'),
  );
  if (!can('invoices:view')) return null;

  const columns: ColumnDef<InvoiceListItemDto, unknown>[] = [
    { id: 'date', header: 'Date', cell: ({ row }) => formatDate(row.original.invoiceDate, organization) },
    { id: 'number', header: 'Invoice#', cell: ({ row }) => <span className="font-medium text-primary">{row.original.number}</span> },
    { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.displayStatus} /> },
    { id: 'dueDate', header: 'Due date', cell: ({ row }) => formatDate(row.original.dueDate, organization) },
    { id: 'total', header: 'Amount', meta: { align: 'right' }, cell: ({ row }) => <Money value={row.original.total} /> },
    { id: 'balance', header: 'Balance due', meta: { align: 'right' }, cell: ({ row }) => <Money value={row.original.balanceDue} muteZero /> },
  ];

  return (
    <div className="mx-auto max-w-[210mm] space-y-3 rounded-xl border bg-card p-5">
      <h2 className="text-sm font-semibold">Invoices created</h2>
      <DataTable
        columns={columns}
        data={data?.data}
        meta={data?.meta}
        isLoading={isPending}
        onPageChange={setPage}
        rowKey={(row) => row.id}
        rowHref={(row) => `/invoices/${row.id}`}
        empty={<EmptyState icon={<ReceiptIcon className="size-7" />} title="No invoices created yet" />}
      />
    </div>
  );
}

export default function RecurringInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const can = useCan();
  const organization = useOrganization();
  const { data: profile, isPending, isError } = useRecurringInvoice(id);
  const list = useRecurringInvoices({ status: 'all', pageSize: 50, sort: 'name' });
  const history = useRecurringInvoiceHistory(id);
  const stop = useStopRecurringInvoice();
  const resume = useResumeRecurringInvoice();
  const createNow = useCreateInvoiceNow();
  const remove = useDeleteRecurringInvoice();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCreate, setConfirmCreate] = useState(false);

  const run = async (action: () => Promise<unknown>, message: string) => {
    try {
      await action();
      toast.success(message);
    } catch (error) {
      showApiError(error);
    }
  };

  const onCreateNow = async () => {
    try {
      const invoice = await createNow.mutateAsync(id);
      toast.success(`Invoice ${invoice.number} created`);
      router.push(`/invoices/${invoice.id}`);
    } catch (error) {
      showApiError(error);
      setConfirmCreate(false);
    }
  };

  const onDelete = async () => {
    try {
      await remove.mutateAsync(id);
      toast.success('Recurring invoice deleted');
      router.replace('/recurring-invoices');
    } catch (error) {
      showApiError(error);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="-m-4 flex h-[calc(100svh-3.5rem)] sm:-m-6">
      <DocumentListPane
        title="All recurring invoices"
        listHref="/recurring-invoices"
        newHref={can('recurring_invoices:create') ? '/recurring-invoices/new' : undefined}
        isLoading={list.isPending}
        activeId={id}
        hrefFor={(rowId) => `/recurring-invoices/${rowId}`}
        rows={list.data?.data.map((row) => ({
          id: row.id,
          title: row.name,
          amount: row.total,
          subtitle: `${row.customer.displayName} · ${formatRecurrence(row.repeatEvery, row.repeatUnit)}`,
          status: row.displayStatus,
        }))}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        {isError ? (
          <EmptyState title="Recurring invoice not found" description="It may have been deleted." className="flex-1" />
        ) : isPending || !profile ? (
          <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-5 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-lg font-semibold">{profile.name}</h1>
                <StatusBadge status={profile.displayStatus} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {can('recurring_invoices:edit') ? (
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/recurring-invoices/${id}/edit`} />}>
                    <PencilIcon />
                    Edit
                  </Button>
                ) : null}
                {can('recurring_invoices:edit') && profile.status === 'active' ? (
                  <Button variant="outline" size="sm" disabled={stop.isPending} onClick={() => run(() => stop.mutateAsync(id), 'Recurring invoice stopped')}>
                    <PauseIcon />
                    Stop
                  </Button>
                ) : null}
                {can('recurring_invoices:edit') && profile.status === 'stopped' ? (
                  <Button size="sm" disabled={resume.isPending} onClick={() => run(() => resume.mutateAsync(id), 'Recurring invoice resumed')}>
                    <PlayIcon />
                    Resume
                  </Button>
                ) : null}
                {can('invoices:create') ? (
                  <Button size="sm" variant={profile.status === 'stopped' ? 'outline' : 'default'} onClick={() => setConfirmCreate(true)}>
                    <FilePlusIcon />
                    Create invoice now
                  </Button>
                ) : null}
                {can('recurring_invoices:delete') ? (
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
              {profile.lastError ? (
                <p className="mx-auto flex max-w-[210mm] items-start gap-2 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-800 ring-1 ring-rose-600/20">
                  <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                  The last invoice could not be created: {profile.lastError}
                </p>
              ) : null}

              <dl className="mx-auto grid max-w-[210mm] gap-4 rounded-xl border bg-card p-5 sm:grid-cols-3">
                <Detail label="Customer">
                  <Link href={`/customers/${profile.customer.id}`} className="font-medium text-primary hover:underline">
                    {profile.customer.displayName}
                  </Link>
                </Detail>
                <Detail label="Frequency">{formatRecurrence(profile.repeatEvery, profile.repeatUnit)}</Detail>
                <Detail label="Next invoice date">
                  {profile.nextRunDate ? (
                    <span className="font-medium">{formatDate(profile.nextRunDate, organization)}</span>
                  ) : (
                    <span className="text-muted-foreground">{profile.displayStatus === 'expired' ? 'Expired' : 'Stopped'}</span>
                  )}
                </Detail>
                <Detail label="Start date">{formatDate(profile.startDate, organization)}</Detail>
                <Detail label="End date">{profile.endDate ? formatDate(profile.endDate, organization) : 'Never expires'}</Detail>
                <Detail label="Payment terms">{profile.paymentTerm?.name ?? 'Due on the invoice date'}</Detail>
                <Detail label="Invoices are created as">{profile.createAs === 'sent' ? 'Sent' : 'Drafts'}</Detail>
                <Detail label="Invoices created">{profile.invoiceCount}</Detail>
                <Detail label="Last run">{profile.lastRunAt ? formatDateTime(profile.lastRunAt, organization) : '—'}</Detail>
              </dl>

              <ChildInvoices profileId={id} />

              <DocumentPreview
                title="Invoice"
                number="Created on each date"
                meta={[{ label: 'Frequency', value: formatRecurrence(profile.repeatEvery, profile.repeatUnit) }]}
                customer={profile.customer}
                subject={profile.subject}
                lines={profile.lines}
                totals={profile}
                notes={profile.customerNotes}
                terms={profile.terms}
              />

              <div className="mx-auto max-w-[210mm] rounded-xl border bg-card p-5">
                <h2 className="mb-4 text-sm font-semibold">History</h2>
                <HistoryPanel entries={history.data} isLoading={history.isPending} />
              </div>
            </div>
          </>
        )}
      </section>

      <ConfirmDialog
        open={confirmCreate}
        onOpenChange={setConfirmCreate}
        title="Create an invoice now?"
        description={`An extra ${profile?.createAs === 'sent' ? 'sent' : 'draft'} invoice dated today is created from this profile. The schedule does not change.`}
        confirmLabel="Create invoice"
        busy={createNow.isPending}
        onConfirm={onCreateNow}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${profile?.name ?? ''}?`}
        description="No more invoices will be created. Invoices already created are kept."
        confirmLabel="Delete profile"
        destructive
        busy={remove.isPending}
        onConfirm={onDelete}
      />
    </div>
  );
}
