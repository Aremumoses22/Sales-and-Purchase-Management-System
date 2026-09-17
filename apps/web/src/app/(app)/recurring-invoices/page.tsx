'use client';

import { RECURRING_PROFILE_DISPLAY_STATUSES, STATUS_LABELS, type RecurringInvoiceListItemDto } from '@spms/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { cn } from 'cn';
import { Loader2Icon, PlayIcon, PlusIcon, RefreshCwIcon, SearchIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCustomer } from '@/features/customers/api';
import { useRecurringInvoices, useRecurringInvoiceStatusCounts, useRunDueRecurringInvoices } from '@/features/recurring-invoices/api';
import { showApiError } from '@/lib/forms';
import { formatRecurrence } from '@/features/recurring-invoices/format';
import { formatDate, formatDateTime } from '@/lib/format';
import { useListQuery } from '@/lib/list-query';
import { useCan, useOrganization } from '@/lib/session';

const EXTRA_KEYS = ['customerId'];
const TABS = ['all', ...RECURRING_PROFILE_DISPLAY_STATUSES] as const;

function CustomerFilterChip({ customerId, onClear }: { customerId: string; onClear: () => void }) {
  const { data } = useCustomer(customerId);
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pr-1 pl-2.5 text-xs">
      Customer: {data?.displayName ?? '…'}
      <button type="button" onClick={onClear} className="rounded-full p-0.5 hover:bg-primary/10" aria-label="Clear customer filter">
        <XIcon className="size-3" />
      </button>
    </span>
  );
}

export default function RecurringInvoicesPage() {
  const runDue = useRunDueRecurringInvoices();
  const onRunDue = async () => {
    try {
      const result = await runDue.mutateAsync();
      if (result.failed.length) toast.error(`${result.failed.length} profile(s) could not create an invoice; see each profile for why.`);
      toast.success(result.created.length ? `${result.created.length} invoice(s) created` : 'No invoices were due');
    } catch (error) {
      showApiError(error);
    }
  };
  const can = useCan();
  const organization = useOrganization();
  const { state, params, update, toggleSort } = useListQuery({ defaultStatus: 'all', defaultSort: 'name', extraKeys: EXTRA_KEYS });
  const [search, setSearch] = useState(state.q);
  const { data, isPending } = useRecurringInvoices(params);

  const countParams = useMemo(() => {
    const { page: _page, pageSize: _pageSize, status: _status, sort: _sort, ...rest } = params;
    return rest;
  }, [params]);
  const { data: counts } = useRecurringInvoiceStatusCounts(countParams);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== state.q) update({ q: search });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, state.q, update]);

  const columns = useMemo<ColumnDef<RecurringInvoiceListItemDto, unknown>[]>(
    () => [
      {
        id: 'name',
        header: 'Profile name',
        meta: { sortKey: 'name' },
        cell: ({ row }) => <span className="font-medium text-primary">{row.original.name}</span>,
      },
      { id: 'customer', header: 'Customer', meta: { sortKey: 'customer' }, cell: ({ row }) => row.original.customer.displayName },
      {
        id: 'frequency',
        header: 'Frequency',
        cell: ({ row }) => formatRecurrence(row.original.repeatEvery, row.original.repeatUnit),
      },
      {
        id: 'lastRun',
        header: 'Last run',
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.lastRunAt ? formatDateTime(row.original.lastRunAt, organization) : '—'}</span>
        ),
      },
      {
        id: 'nextRunDate',
        header: 'Next invoice date',
        meta: { sortKey: 'nextRunDate' },
        cell: ({ row }) => (row.original.nextRunDate ? formatDate(row.original.nextRunDate, organization) : <span className="text-muted-foreground">—</span>),
      },
      { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.displayStatus} /> },
      { id: 'total', header: 'Amount', meta: { sortKey: 'total', align: 'right' }, cell: ({ row }) => <Money value={row.original.total} /> },
    ],
    [organization],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Recurring Invoices"
        actions={
          <div className="flex flex-wrap gap-2">
            {can('recurring_invoices:edit') && can('invoices:create') ? (
              <Button variant="outline" disabled={runDue.isPending} onClick={onRunDue}>
                {runDue.isPending ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
                Create due invoices now
              </Button>
            ) : null}
            {can('recurring_invoices:create') ? (
              <Button
                nativeButton={false}
                render={<Link href={state['customerId'] ? `/recurring-invoices/new?customerId=${state['customerId']}` : '/recurring-invoices/new'} />}
              >
                <PlusIcon />
                New recurring invoice
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap gap-1 border-b">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => update({ status: tab === 'all' ? '' : tab })}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors',
              state.status === tab
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab === 'all' ? 'All' : STATUS_LABELS[tab]}
            <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">
              {counts?.[tab] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search profile name or customer" className="pl-8" />
        </div>
        {state['customerId'] ? (
          <CustomerFilterChip customerId={String(state['customerId'])} onClear={() => update({ customerId: '' })} />
        ) : null}
      </div>

      <DataTable
        columns={columns}
        data={data?.data}
        meta={data?.meta}
        isLoading={isPending}
        sort={state.sort}
        onSortChange={toggleSort}
        onPageChange={(page) => update({ page }, { resetPage: false })}
        rowKey={(row) => row.id}
        rowHref={(row) => `/recurring-invoices/${row.id}`}
        empty={
          <EmptyState
            icon={<RefreshCwIcon className="size-8" />}
            title={state.q || state.status !== 'all' ? 'No recurring invoices match these filters' : 'No recurring invoices yet'}
            description="Bill customers on a schedule, such as a monthly retainer. Invoices are created automatically on each date."
            action={
              can('recurring_invoices:create') && !state.q ? (
                <Button size="sm" nativeButton={false} render={<Link href="/recurring-invoices/new" />}>
                  <PlusIcon />
                  New recurring invoice
                </Button>
              ) : null
            }
          />
        }
      />
    </div>
  );
}
