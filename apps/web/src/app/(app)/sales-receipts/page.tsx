'use client';

import { SALES_RECEIPT_STATUSES, STATUS_LABELS, type SalesReceiptListItemDto } from '@spms/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { cn } from 'cn';
import { PlusIcon, ScrollTextIcon, SearchIcon, XIcon } from 'lucide-react';
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
import { useSalesReceipts, useSalesReceiptStatusCounts } from '@/features/sales-receipts/api';
import { formatDate } from '@/lib/format';
import { useListQuery } from '@/lib/list-query';
import { useCan, useOrganization } from '@/lib/session';

const EXTRA_KEYS = ['customerId', 'dateFrom', 'dateTo'];
const TABS = ['all', ...SALES_RECEIPT_STATUSES] as const;

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

export default function SalesReceiptsPage() {
  const can = useCan();
  const organization = useOrganization();
  const { state, params, update, toggleSort } = useListQuery({ defaultStatus: 'all', defaultSort: '-date', extraKeys: EXTRA_KEYS });
  const [search, setSearch] = useState(state.q);
  const { data, isPending } = useSalesReceipts(params);

  const countParams = useMemo(() => {
    const { page: _page, pageSize: _pageSize, status: _status, sort: _sort, ...rest } = params;
    return rest;
  }, [params]);
  const { data: counts } = useSalesReceiptStatusCounts(countParams);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== state.q) update({ q: search });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, state.q, update]);

  const columns = useMemo<ColumnDef<SalesReceiptListItemDto, unknown>[]>(
    () => [
      { id: 'date', header: 'Date', meta: { sortKey: 'date' }, cell: ({ row }) => formatDate(row.original.receiptDate, organization) },
      {
        id: 'number',
        header: 'Sales receipt#',
        meta: { sortKey: 'number' },
        cell: ({ row }) => <span className="font-medium text-primary">{row.original.number}</span>,
      },
      {
        id: 'reference',
        header: 'Reference#',
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.referenceNumber ?? '—'}</span>,
      },
      { id: 'customer', header: 'Customer', meta: { sortKey: 'customer' }, cell: ({ row }) => row.original.customer.displayName },
      {
        id: 'mode',
        header: 'Payment mode',
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.paymentMode?.name ?? '—'}</span>,
      },
      { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { id: 'total', header: 'Amount', meta: { sortKey: 'total', align: 'right' }, cell: ({ row }) => <Money value={row.original.total} /> },
    ],
    [organization],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sales Receipts"
        actions={
          can('sales_receipts:create') ? (
            <Button
              nativeButton={false}
              render={<Link href={state['customerId'] ? `/sales-receipts/new?customerId=${state['customerId']}` : '/sales-receipts/new'} />}
            >
              <PlusIcon />
              New sales receipt
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
            <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">
              {counts?.[tab] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search number, reference, customer" className="pl-8" />
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Input type="date" aria-label="From date" value={String(state['dateFrom'] ?? '')} onChange={(event) => update({ dateFrom: event.target.value })} className="w-36" />
          <span>to</span>
          <Input type="date" aria-label="To date" value={String(state['dateTo'] ?? '')} onChange={(event) => update({ dateTo: event.target.value })} className="w-36" />
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
        rowHref={(row) => `/sales-receipts/${row.id}`}
        empty={
          <EmptyState
            icon={<ScrollTextIcon className="size-8" />}
            title={state.q || state.status !== 'all' ? 'No sales receipts match these filters' : 'No sales receipts yet'}
            description="Record sales that are paid on the spot. Receipts count as sales but never leave anything owed."
            action={
              can('sales_receipts:create') && !state.q ? (
                <Button size="sm" nativeButton={false} render={<Link href="/sales-receipts/new" />}>
                  <PlusIcon />
                  New sales receipt
                </Button>
              ) : null
            }
          />
        }
      />
    </div>
  );
}
