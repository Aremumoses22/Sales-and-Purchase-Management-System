'use client';

import type { AuditLogEntryDto, AuditLogFiltersDto, Paginated } from '@spms/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronDownIcon, ChevronRightIcon, SearchIcon, ShieldCheckIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useListQuery } from '@/lib/list-query';
import { useCan, useOrganization } from '@/lib/session';

const EXTRA_KEYS = ['entityType', 'action', 'userId', 'dateFrom', 'dateTo'];

/** Where each kind of audited record can be opened, when it still has a page. */
const ENTITY_LINKS: Record<string, string> = {
  customer: '/customers',
  vendor: '/vendors',
  item: '/items',
  quote: '/quotes',
  invoice: '/invoices',
  payment_received: '/payments-received',
  credit_note: '/credit-notes',
  sales_receipt: '/sales-receipts',
  recurring_invoice: '/recurring-invoices',
  expense: '/expenses',
  bill: '/bills',
  payment_made: '/payments-made',
};

const humanize = (value: string) => value.replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase());

function Changes({ entry }: { entry: AuditLogEntryDto }) {
  if (!entry.changes) return <p className="px-8 text-xs text-muted-foreground">No field changes recorded.</p>;
  const show = (value: unknown) => (value === null || value === undefined || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value));
  return (
    <table className="ml-8 w-[calc(100%-2rem)] max-w-3xl text-xs">
      <thead className="text-muted-foreground">
        <tr>
          <th className="py-1 text-left font-medium">Field</th>
          <th className="py-1 text-left font-medium">Before</th>
          <th className="py-1 text-left font-medium">After</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(entry.changes).map(([field, change]) => (
          <tr key={field} className="border-t align-top">
            <td className="py-1 pr-3 font-medium">{humanize(field)}</td>
            <td className="py-1 pr-3 break-all text-rose-700">{show(change.from)}</td>
            <td className="py-1 break-all text-emerald-700">{show(change.to)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AuditLogPage() {
  const can = useCan();
  const organization = useOrganization();
  const { state, params, update } = useListQuery({ defaultSort: '-date', extraKeys: EXTRA_KEYS });
  const [search, setSearch] = useState(state.q);
  const [expanded, setExpanded] = useState<string | null>(null);
  const apiParams = useMemo(() => {
    const { status: _status, sort: _sort, ...rest } = params;
    return rest;
  }, [params]);

  const allowed = can('audit:view');
  const { data, isPending } = useQuery({
    queryKey: ['audit-logs', apiParams],
    queryFn: ({ signal }) => api.get<Paginated<AuditLogEntryDto>>('/audit-logs', apiParams, signal),
    placeholderData: keepPreviousData,
    enabled: allowed,
  });
  const { data: filters } = useQuery({
    queryKey: ['audit-logs', 'filters'],
    queryFn: () => api.get<AuditLogFiltersDto>('/audit-logs/filters'),
    enabled: allowed,
    staleTime: 60_000,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== state.q) update({ q: search });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, state.q, update]);

  const columns = useMemo<ColumnDef<AuditLogEntryDto, unknown>[]>(
    () => [
      {
        id: 'expand',
        header: '',
        meta: { className: 'w-8' },
        cell: ({ row }) =>
          row.original.changes ? (
            expanded === row.original.id ? (
              <ChevronDownIcon className="size-4 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            )
          ) : null,
      },
      { id: 'when', header: 'When', cell: ({ row }) => <span className="whitespace-nowrap">{formatDateTime(row.original.createdAt, organization)}</span> },
      { id: 'user', header: 'User', cell: ({ row }) => row.original.user?.name ?? <span className="text-muted-foreground">System</span> },
      {
        id: 'record',
        header: 'Record',
        cell: ({ row }) => {
          const base = ENTITY_LINKS[row.original.entityType];
          const label = humanize(row.original.entityType);
          return base && row.original.action !== 'deleted' ? (
            <Link href={`${base}/${row.original.entityId}`} className="text-primary hover:underline" onClick={(event) => event.stopPropagation()}>
              {label}
            </Link>
          ) : (
            label
          );
        },
      },
      { id: 'action', header: 'Action', cell: ({ row }) => humanize(row.original.action) },
      {
        id: 'summary',
        header: 'Summary',
        meta: { className: 'min-w-72 whitespace-normal' },
        cell: ({ row }) => <span className="line-clamp-2">{row.original.summary}</span>,
      },
      { id: 'ip', header: 'IP address', cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.ipAddress ?? '—'}</span> },
    ],
    [expanded, organization],
  );

  if (!allowed) return <EmptyState icon={<ShieldCheckIcon className="size-8" />} title="You do not have access to the audit log" />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Audit log</h2>
        <p className="text-sm text-muted-foreground">Every change to transactions and settings: who made it, when, and what changed.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search summaries" className="pl-8" />
        </div>
        <NativeSelect aria-label="Record type" value={String(state['entityType'] ?? '')} onChange={(event) => update({ entityType: event.target.value })} className="w-44">
          <option value="">All records</option>
          {filters?.entityTypes.map((value) => (
            <option key={value} value={value}>
              {humanize(value)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Action" value={String(state['action'] ?? '')} onChange={(event) => update({ action: event.target.value })} className="w-40">
          <option value="">All actions</option>
          {filters?.actions.map((value) => (
            <option key={value} value={value}>
              {humanize(value)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="User" value={String(state['userId'] ?? '')} onChange={(event) => update({ userId: event.target.value })} className="w-44">
          <option value="">All users</option>
          {filters?.users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </NativeSelect>
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
        onPageChange={(page) => update({ page }, { resetPage: false })}
        rowKey={(row) => row.id}
        onRowClick={(row) => setExpanded((current) => (current === row.id ? null : row.id))}
        renderExpanded={(row) => (row.id === expanded ? <Changes entry={row} /> : null)}
        empty={<EmptyState icon={<ShieldCheckIcon className="size-8" />} title="No audit entries match these filters" />}
      />

    </div>
  );
}
