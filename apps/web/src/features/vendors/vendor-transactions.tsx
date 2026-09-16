'use client';

import type { ExpenseListItemDto } from '@spms/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon, ShoppingCartIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { Button } from '@/components/ui/button';
import { useExpenses, useExpenseTotals } from '@/features/expenses/api';
import { formatDate } from '@/lib/format';
import { useCan, useOrganization } from '@/lib/session';

export function VendorExpenses({ vendorId }: { vendorId: string }) {
  const organization = useOrganization();
  const can = useCan();
  const [page, setPage] = useState(1);
  const allowed = can('expenses:view');
  const { data, isPending } = useExpenses({ vendorId, page, pageSize: 10, sort: '-date' }, allowed);
  const { data: totals } = useExpenseTotals({ vendorId }, allowed);
  if (!allowed) return null;

  const columns: ColumnDef<ExpenseListItemDto, unknown>[] = [
    { id: 'date', header: 'Date', cell: ({ row }) => formatDate(row.original.expenseDate, organization) },
    { id: 'category', header: 'Category', cell: ({ row }) => <span className="font-medium text-primary">{row.original.category.name}</span> },
    { id: 'reference', header: 'Reference#', cell: ({ row }) => <span className="text-muted-foreground">{row.original.referenceNumber ?? '—'}</span> },
    { id: 'paidThrough', header: 'Paid through', cell: ({ row }) => row.original.paymentMode?.name ?? '—' },
    { id: 'total', header: 'Amount', meta: { align: 'right' }, cell: ({ row }) => <Money value={row.original.total} /> },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Expenses</h3>
        {can('expenses:create') ? (
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/expenses/new?vendorId=${vendorId}`} />}>
            <PlusIcon />
            Record expense
          </Button>
        ) : null}
      </div>
      <DataTable
        columns={columns}
        data={data?.data}
        meta={data?.meta}
        isLoading={isPending}
        onPageChange={setPage}
        rowKey={(row) => row.id}
        rowHref={(row) => `/expenses/${row.id}`}
        totals={totals ? { date: 'Total', total: <Money value={totals.total} /> } : undefined}
        empty={<EmptyState icon={<ShoppingCartIcon className="size-7" />} title="No expenses from this vendor yet" />}
      />
    </div>
  );
}
