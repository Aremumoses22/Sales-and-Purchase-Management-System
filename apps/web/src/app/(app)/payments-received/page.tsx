'use client';

import type { PaymentReceivedListItemDto } from '@spms/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { BanknoteArrowDownIcon, PlusIcon, SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePayments } from '@/features/payments/api';
import { formatDate } from '@/lib/format';
import { useListQuery } from '@/lib/list-query';
import { useCan, useOrganization } from '@/lib/session';

const EXTRA_KEYS = ['customerId', 'dateFrom', 'dateTo'];

export default function PaymentsReceivedPage() {
  const can = useCan();
  const organization = useOrganization();
  const { state, params, update, toggleSort } = useListQuery({ defaultSort: '-date', extraKeys: EXTRA_KEYS });
  const [search, setSearch] = useState(state.q);
  const apiParams = useMemo(() => {
    const { status: _status, ...rest } = params;
    return rest;
  }, [params]);
  const { data, isPending } = usePayments(apiParams);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== state.q) update({ q: search });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, state.q, update]);

  const columns = useMemo<ColumnDef<PaymentReceivedListItemDto, unknown>[]>(
    () => [
      { id: 'date', header: 'Date', meta: { sortKey: 'date' }, cell: ({ row }) => formatDate(row.original.paymentDate, organization) },
      {
        id: 'number',
        header: 'Payment#',
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
        header: 'Mode',
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.paymentMode?.name ?? '—'}</span>,
      },
      { id: 'amount', header: 'Amount', meta: { sortKey: 'amount', align: 'right' }, cell: ({ row }) => <Money value={row.original.amount} /> },
      {
        id: 'unused',
        header: 'Unused amount',
        meta: { align: 'right' },
        cell: ({ row }) => <Money value={row.original.unusedAmount} muteZero />,
      },
    ],
    [organization],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Payments received"
        actions={
          can('payments_received:create') ? (
            <Button nativeButton={false} render={<Link href="/payments-received/new" />}>
              <PlusIcon />
              Record payment
            </Button>
          ) : null
        }
      />

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
        rowHref={(row) => `/payments-received/${row.id}`}
        empty={
          <EmptyState
            icon={<BanknoteArrowDownIcon className="size-8" />}
            title={state.q ? 'No payments match your search' : 'No payments recorded yet'}
            description="Record money received from customers and apply it to their invoices."
          />
        }
      />
    </div>
  );
}
