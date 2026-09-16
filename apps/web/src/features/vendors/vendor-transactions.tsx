'use client';

import type { BillListItemDto, ExpenseListItemDto, PaymentMadeListItemDto } from '@spms/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { BanknoteArrowUpIcon, FileSpreadsheetIcon, PlusIcon, ShoppingCartIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { useBills, usePaymentsMade } from '@/features/bills/api';
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

export function VendorBills({ vendorId }: { vendorId: string }) {
  const organization = useOrganization();
  const can = useCan();
  const [page, setPage] = useState(1);
  const { data, isPending } = useBills({ vendorId, status: 'all', page, pageSize: 10, sort: '-date' }, can('bills:view'));
  if (!can('bills:view')) return null;

  const columns: ColumnDef<BillListItemDto, unknown>[] = [
    { id: 'date', header: 'Date', cell: ({ row }) => formatDate(row.original.billDate, organization) },
    { id: 'number', header: 'Bill#', cell: ({ row }) => <span className="font-medium text-primary">{row.original.billNumber}</span> },
    { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.displayStatus} /> },
    { id: 'dueDate', header: 'Due date', cell: ({ row }) => formatDate(row.original.dueDate, organization) },
    { id: 'total', header: 'Amount', meta: { align: 'right' }, cell: ({ row }) => <Money value={row.original.total} /> },
    { id: 'balance', header: 'Balance due', meta: { align: 'right' }, cell: ({ row }) => <Money value={row.original.balanceDue} muteZero /> },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Bills</h3>
        {can('bills:create') ? (
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/bills/new?vendorId=${vendorId}`} />}>
            <PlusIcon />
            New bill
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
        rowHref={(row) => `/bills/${row.id}`}
        empty={<EmptyState icon={<FileSpreadsheetIcon className="size-7" />} title="No bills from this vendor yet" />}
      />
    </div>
  );
}

export function VendorPaymentsMade({ vendorId }: { vendorId: string }) {
  const organization = useOrganization();
  const can = useCan();
  const [page, setPage] = useState(1);
  const { data, isPending } = usePaymentsMade({ vendorId, page, pageSize: 10, sort: '-date' }, can('payments_made:view'));
  if (!can('payments_made:view')) return null;

  const columns: ColumnDef<PaymentMadeListItemDto, unknown>[] = [
    { id: 'date', header: 'Date', cell: ({ row }) => formatDate(row.original.paymentDate, organization) },
    { id: 'number', header: 'Payment#', cell: ({ row }) => <span className="font-medium text-primary">{row.original.number}</span> },
    { id: 'mode', header: 'Mode', cell: ({ row }) => row.original.paymentMode?.name ?? '—' },
    { id: 'amount', header: 'Amount', meta: { align: 'right' }, cell: ({ row }) => <Money value={row.original.amount} /> },
    { id: 'unused', header: 'Unused', meta: { align: 'right' }, cell: ({ row }) => <Money value={row.original.unusedAmount} muteZero /> },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Payments made</h3>
        {can('payments_made:create') ? (
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/payments-made/new?vendorId=${vendorId}`} />}>
            <PlusIcon />
            Record payment
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
        rowHref={(row) => `/payments-made/${row.id}`}
        empty={<EmptyState icon={<BanknoteArrowUpIcon className="size-7" />} title="No payments made to this vendor yet" />}
      />
    </div>
  );
}
