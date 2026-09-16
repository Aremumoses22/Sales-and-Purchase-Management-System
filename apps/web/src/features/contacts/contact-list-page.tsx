'use client';

import type { ContactListItemDto, ContactType } from '@spms/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon, SearchIcon, TruckIcon, UsersIcon } from 'lucide-react';
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
import { CONTACT_LABELS, CONTACT_RESOURCES, useContacts } from '@/features/contacts/api';
import { useListQuery } from '@/lib/list-query';
import { useCan } from '@/lib/session';

const columnsFor = (type: ContactType): ColumnDef<ContactListItemDto, unknown>[] => [
  {
    id: 'name',
    header: 'Name',
    meta: { sortKey: 'name' },
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="font-medium text-primary">{row.original.displayName}</p>
        {row.original.companyName && row.original.companyName !== row.original.displayName ? (
          <p className="text-xs text-muted-foreground">{row.original.companyName}</p>
        ) : null}
      </div>
    ),
  },
  {
    id: 'email',
    header: 'Email',
    meta: { sortKey: 'email' },
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.email ?? '—'}</span>,
  },
  {
    id: 'phone',
    header: 'Work phone',
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.workPhone ?? '—'}</span>,
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => (row.original.isActive ? null : <StatusBadge status="inactive" />),
  },
  {
    id: 'balance',
    header: type === 'customer' ? 'Receivables' : 'Payables',
    meta: { align: 'right' },
    cell: ({ row }) => <Money value={row.original.balance} muteZero />,
  },
];

/** List page shared by customers and vendors. */
export function ContactListPage({ type }: { type: ContactType }) {
  const can = useCan();
  const labels = CONTACT_LABELS[type];
  const resource = CONTACT_RESOURCES[type];
  const columns = columnsFor(type);
  const { state, params, update, toggleSort } = useListQuery({ defaultStatus: 'active', defaultSort: 'name' });
  const [search, setSearch] = useState(state.q);
  const { data, isPending } = useContacts(type, params);

  // Debounce typing into the URL so every keystroke isn't a request.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== state.q) update({ q: search });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, state.q, update]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={labels.many}
        actions={
          can(`${resource}:create`) ? (
            <Button nativeButton={false} render={<Link href={`/${resource}/new`} />}>
              <PlusIcon />
              New {labels.lower}
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, company, email or phone"
            className="pl-8"
          />
        </div>
        <NativeSelect
          aria-label="Status"
          value={state.status}
          onChange={(event) => update({ status: event.target.value })}
          className="w-36"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All {labels.many.toLowerCase()}</option>
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
        rowHref={(row) => `/${resource}/${row.id}`}
        empty={
          <EmptyState
            icon={type === 'customer' ? <UsersIcon className="size-8" /> : <TruckIcon className="size-8" />}
            title={state.q ? `No ${labels.many.toLowerCase()} match your search` : `No ${labels.many.toLowerCase()} yet`}
            description={type === 'customer' ? 'Customers you add appear here with what they owe you.' : 'Suppliers you buy from appear here with what you owe them.'}
            action={
              can(`${resource}:create`) && !state.q ? (
                <Button size="sm" nativeButton={false} render={<Link href={`/${resource}/new`} />}>
                  <PlusIcon />
                  New {labels.lower}
                </Button>
              ) : null
            }
          />
        }
      />
    </div>
  );
}
