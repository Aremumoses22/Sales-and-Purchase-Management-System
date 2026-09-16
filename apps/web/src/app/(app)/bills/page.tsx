'use client';

import { BILL_DISPLAY_STATUSES, daysBetween, STATUS_LABELS, todayInTimeZone, type BillListItemDto } from '@spms/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { cn } from 'cn';
import { FileSpreadsheetIcon, PlusIcon, SearchIcon, XIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBills, useBillStatusCounts } from '@/features/bills/api';
import { useVendor } from '@/features/vendors/api';
import { formatDate } from '@/lib/format';
import { useListQuery } from '@/lib/list-query';
import { useCan, useOrganization } from '@/lib/session';

const EXTRA_KEYS = ['vendorId', 'dateFrom', 'dateTo'];
const TABS = ['all', ...BILL_DISPLAY_STATUSES] as const;

function VendorFilterChip({ vendorId, onClear }: { vendorId: string; onClear: () => void }) {
  const { data } = useVendor(vendorId);
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pr-1 pl-2.5 text-xs">
      Vendor: {data?.displayName ?? '…'}
      <button type="button" onClick={onClear} className="rounded-full p-0.5 hover:bg-primary/10" aria-label="Clear vendor filter">
        <XIcon className="size-3" />
      </button>
    </span>
  );
}

export default function BillsPage() {
  const can = useCan();
  const organization = useOrganization();
  const { state, params, update, toggleSort } = useListQuery({ defaultStatus: 'all', defaultSort: '-date', extraKeys: EXTRA_KEYS });
  const [search, setSearch] = useState(state.q);
  const { data, isPending } = useBills(params);

  const countParams = useMemo(() => {
    const { page: _page, pageSize: _pageSize, status: _status, sort: _sort, ...rest } = params;
    return rest;
  }, [params]);
  const { data: counts } = useBillStatusCounts(countParams);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== state.q) update({ q: search });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, state.q, update]);

  const columns = useMemo<ColumnDef<BillListItemDto, unknown>[]>(() => {
    const today = todayInTimeZone(organization.timezone);
    return [
      { id: 'date', header: 'Date', meta: { sortKey: 'date' }, cell: ({ row }) => formatDate(row.original.billDate, organization) },
      {
        id: 'number',
        header: 'Bill#',
        meta: { sortKey: 'number' },
        cell: ({ row }) => <span className="font-medium text-primary">{row.original.billNumber}</span>,
      },
      {
        id: 'order',
        header: 'Order number',
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.orderNumber ?? '—'}</span>,
      },
      { id: 'vendor', header: 'Vendor', meta: { sortKey: 'vendor' }, cell: ({ row }) => row.original.vendor.displayName },
      { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.displayStatus} /> },
      {
        id: 'dueDate',
        header: 'Due date',
        meta: { sortKey: 'dueDate' },
        cell: ({ row }) =>
          row.original.displayStatus === 'overdue' ? (
            <span className="text-rose-700">Overdue by {daysBetween(row.original.dueDate, today)} days</span>
          ) : (
            <span className="text-muted-foreground">{formatDate(row.original.dueDate, organization)}</span>
          ),
      },
      { id: 'total', header: 'Amount', meta: { sortKey: 'total', align: 'right' }, cell: ({ row }) => <Money value={row.original.total} /> },
      {
        id: 'balance',
        header: 'Balance due',
        meta: { sortKey: 'balance', align: 'right' },
        cell: ({ row }) => <Money value={row.original.balanceDue} muteZero />,
      },
    ];
  }, [organization]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bills"
        actions={
          can('bills:create') ? (
            <Button
              nativeButton={false}
              render={<Link href={state['vendorId'] ? `/bills/new?vendorId=${state['vendorId']}` : '/bills/new'} />}
            >
              <PlusIcon />
              New bill
            </Button>
          ) : null
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
            <span className={cn('rounded-full bg-muted px-1.5 text-xs tabular-nums', tab === 'overdue' && counts?.[tab] && 'bg-rose-100 text-rose-700')}>
              {counts?.[tab] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search bill number, order number, vendor" className="pl-8" />
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Input type="date" aria-label="From date" value={String(state['dateFrom'] ?? '')} onChange={(event) => update({ dateFrom: event.target.value })} className="w-36" />
          <span>to</span>
          <Input type="date" aria-label="To date" value={String(state['dateTo'] ?? '')} onChange={(event) => update({ dateTo: event.target.value })} className="w-36" />
        </div>
        {state['vendorId'] ? (
          <VendorFilterChip vendorId={String(state['vendorId'])} onClear={() => update({ vendorId: '' })} />
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
        rowHref={(row) => `/bills/${row.id}`}
        empty={
          <EmptyState
            icon={<FileSpreadsheetIcon className="size-8" />}
            title={state.q || state.status !== 'all' ? 'No bills match these filters' : 'No bills yet'}
            description="Record bills from your vendors to track what you owe and when it is due."
            action={
              can('bills:create') && !state.q ? (
                <Button size="sm" nativeButton={false} render={<Link href="/bills/new" />}>
                  <PlusIcon />
                  New bill
                </Button>
              ) : null
            }
          />
        }
      />
    </div>
  );
}
