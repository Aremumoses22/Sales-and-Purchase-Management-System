'use client';

import type { ItemListItemDto } from '@spms/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { PackageIcon, PlusIcon, SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useItems } from '@/features/items/api';
import { StockLevel } from '@/features/items/stock-level';
import { useListQuery } from '@/lib/list-query';
import { useCan } from '@/lib/session';

const EXTRA_KEYS = ['type'];

const columns: ColumnDef<ItemListItemDto, unknown>[] = [
  {
    id: 'name',
    header: 'Name',
    meta: { sortKey: 'name' },
    cell: ({ row }) => (
      <div>
        <p className="font-medium text-primary">{row.original.name}</p>
        {row.original.sku ? <p className="text-xs text-muted-foreground">SKU {row.original.sku}</p> : null}
      </div>
    ),
  },
  {
    id: 'type',
    header: 'Type',
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.type === 'goods' ? 'Goods' : 'Service'}</span>,
  },
  {
    id: 'sellingPrice',
    header: 'Selling price',
    meta: { sortKey: 'sellingPrice', align: 'right' },
    cell: ({ row }) => (row.original.sellingPrice === null ? '—' : <Money value={row.original.sellingPrice} />),
  },
  {
    id: 'costPrice',
    header: 'Cost price',
    meta: { sortKey: 'costPrice', align: 'right' },
    cell: ({ row }) => (row.original.costPrice === null ? '—' : <Money value={row.original.costPrice} />),
  },
  {
    id: 'stock',
    header: 'Stock on hand',
    meta: { align: 'right' },
    cell: ({ row }) => (
      <StockLevel stockOnHand={row.original.stockOnHand} reorderLevel={row.original.reorderLevel} unit={row.original.unit} />
    ),
  },
  {
    id: 'status',
    header: '',
    cell: ({ row }) => (row.original.isActive ? null : <StatusBadge status="inactive" />),
  },
];

export default function ItemsPage() {
  const can = useCan();
  const { state, params, update, toggleSort } = useListQuery({
    defaultStatus: 'active',
    defaultSort: 'name',
    extraKeys: EXTRA_KEYS,
  });
  const [search, setSearch] = useState(state.q);
  const { data, isPending } = useItems(params);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== state.q) update({ q: search });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, state.q, update]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Items"
        actions={
          can('items:create') ? (
            <Button nativeButton={false} render={<Link href="/items/new" />}>
              <PlusIcon />
              New item
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, SKU or description" className="pl-8" />
        </div>
        <NativeSelect aria-label="Type" value={state['type'] as string} onChange={(event) => update({ type: event.target.value })} className="w-36">
          <option value="">All types</option>
          <option value="goods">Goods</option>
          <option value="service">Services</option>
        </NativeSelect>
        <NativeSelect aria-label="Status" value={state.status} onChange={(event) => update({ status: event.target.value })} className="w-32">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All items</option>
        </NativeSelect>
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
        rowHref={(row) => `/items/${row.id}`}
        empty={
          <EmptyState
            icon={<PackageIcon className="size-8" />}
            title={state.q ? 'No items match your search' : 'No items yet'}
            description="Add the goods and services you sell or buy so they can be picked on documents."
            action={
              can('items:create') && !state.q ? (
                <Button size="sm" nativeButton={false} render={<Link href="/items/new" />}>
                  <PlusIcon />
                  New item
                </Button>
              ) : null
            }
          />
        }
      />
    </div>
  );
}
