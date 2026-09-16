'use client';

import type { ExpenseListItemDto } from '@spms/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { PaperclipIcon, PlusIcon, SearchIcon, ShoppingCartIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { VendorCombobox } from '@/components/contact-combobox';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useExpenses, useExpenseTotals } from '@/features/expenses/api';
import { useLookupQuery } from '@/features/settings/api';
import { formatDate } from '@/lib/format';
import { useListQuery } from '@/lib/list-query';
import { useCan, useOrganization } from '@/lib/session';

const EXTRA_KEYS = ['categoryId', 'vendorId', 'paymentModeId', 'dateFrom', 'dateTo'];

export default function ExpensesPage() {
  const can = useCan();
  const organization = useOrganization();
  const { state, params, update, toggleSort } = useListQuery({ defaultStatus: 'all', defaultSort: '-date', extraKeys: EXTRA_KEYS });
  const [search, setSearch] = useState(state.q);
  const { data, isPending } = useExpenses(params);
  const { data: categories } = useLookupQuery('expense-categories', true);
  const { data: modes } = useLookupQuery('payment-modes', true);

  // Totals cover every expense matching the filters, not only this page.
  const totalsParams = useMemo(() => {
    const { page: _page, pageSize: _pageSize, sort: _sort, status: _status, ...rest } = params;
    return rest;
  }, [params]);
  const { data: totals } = useExpenseTotals(totalsParams);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== state.q) update({ q: search });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, state.q, update]);

  const columns = useMemo<ColumnDef<ExpenseListItemDto, unknown>[]>(
    () => [
      { id: 'date', header: 'Date', meta: { sortKey: 'date' }, cell: ({ row }) => formatDate(row.original.expenseDate, organization) },
      {
        id: 'category',
        header: 'Category',
        meta: { sortKey: 'category' },
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5 font-medium text-primary">
            {row.original.category.name}
            {row.original.hasReceipt ? <PaperclipIcon className="size-3.5 text-muted-foreground" aria-label="Has receipt" /> : null}
          </span>
        ),
      },
      {
        id: 'reference',
        header: 'Reference#',
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.referenceNumber ?? '—'}</span>,
      },
      { id: 'vendor', header: 'Vendor', meta: { sortKey: 'vendor' }, cell: ({ row }) => row.original.vendor?.displayName ?? '—' },
      {
        id: 'paidThrough',
        header: 'Paid through',
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.paymentMode?.name ?? '—'}</span>,
      },
      { id: 'tax', header: 'Tax', meta: { align: 'right' }, cell: ({ row }) => <Money value={row.original.taxAmount} muteZero /> },
      { id: 'total', header: 'Amount', meta: { sortKey: 'total', align: 'right' }, cell: ({ row }) => <Money value={row.original.total} /> },
    ],
    [organization],
  );

  const filtered = Boolean(state.q || state['categoryId'] || state['vendorId'] || state['paymentModeId'] || state['dateFrom'] || state['dateTo']);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Expenses"
        actions={
          can('expenses:create') ? (
            <Button nativeButton={false} render={<Link href="/expenses/new" />}>
              <PlusIcon />
              Record expense
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, notes, vendor" className="pl-8" />
        </div>
        <NativeSelect aria-label="Category" value={String(state['categoryId'] ?? '')} onChange={(event) => update({ categoryId: event.target.value })} className="w-48">
          <option value="">All categories</option>
          {categories?.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Paid through" value={String(state['paymentModeId'] ?? '')} onChange={(event) => update({ paymentModeId: event.target.value })} className="w-48">
          <option value="">Any payment mode</option>
          {modes?.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </NativeSelect>
        <div className="w-56">
          <VendorCombobox value={String(state['vendorId'] ?? '')} onChange={(vendorId) => update({ vendorId })} />
        </div>
        {state['vendorId'] ? (
          <Button variant="ghost" size="sm" onClick={() => update({ vendorId: '' })}>
            Any vendor
          </Button>
        ) : null}
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
        rowHref={(row) => `/expenses/${row.id}`}
        totals={
          totals
            ? {
                date: `Total (${totals.count} ${totals.count === 1 ? 'expense' : 'expenses'})`,
                tax: <Money value={totals.taxTotal} />,
                total: <Money value={totals.total} />,
              }
            : undefined
        }
        empty={
          <EmptyState
            icon={<ShoppingCartIcon className="size-8" />}
            title={filtered ? 'No expenses match these filters' : 'No expenses yet'}
            description="Record money you have spent, such as rent, fuel or office supplies, with the receipt attached."
            action={
              can('expenses:create') && !filtered ? (
                <Button size="sm" nativeButton={false} render={<Link href="/expenses/new" />}>
                  <PlusIcon />
                  Record expense
                </Button>
              ) : null
            }
          />
        }
      />
    </div>
  );
}
