'use client';

import type {
  CreditNoteListItemDto,
  InvoiceListItemDto,
  PaymentReceivedListItemDto,
  QuoteListItemDto,
  RecurringInvoiceListItemDto,
  SalesReceiptListItemDto,
} from '@spms/shared';
import type { ColumnDef } from '@tanstack/react-table';
import {
  BanknoteArrowDownIcon,
  FileTextIcon,
  PlusIcon,
  ReceiptIcon,
  RefreshCwIcon,
  ScrollTextIcon,
  WalletIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { ContactDetailPage } from '@/features/contacts/contact-detail-page';
import { useCreditNotes } from '@/features/credit-notes/api';
import { useInvoices } from '@/features/invoices/api';
import { usePayments } from '@/features/payments/api';
import { useQuotes } from '@/features/quotes/api';
import { useRecurringInvoices } from '@/features/recurring-invoices/api';
import { formatRecurrence } from '@/features/recurring-invoices/format';
import { useSalesReceipts } from '@/features/sales-receipts/api';
import { formatDate } from '@/lib/format';
import { useCan, useOrganization } from '@/lib/session';

function CustomerQuotes({ customerId }: { customerId: string }) {
  const organization = useOrganization();
  const can = useCan();
  const { data, isPending } = useQuotes({ customerId, pageSize: 10, status: 'all', sort: '-date' }, can('quotes:view'));

  const columns: ColumnDef<QuoteListItemDto, unknown>[] = [
    { id: 'date', header: 'Date', cell: ({ row }) => formatDate(row.original.quoteDate, organization) },
    { id: 'number', header: 'Quote#', cell: ({ row }) => <span className="font-medium text-primary">{row.original.number}</span> },
    { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.displayStatus} /> },
    { id: 'total', header: 'Amount', meta: { align: 'right' }, cell: ({ row }) => <Money value={row.original.total} /> },
  ];

  if (!can('quotes:view')) return <p className="text-sm text-muted-foreground">You do not have access to quotes.</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Quotes</h3>
        {can('quotes:create') ? (
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/quotes/new?customerId=${customerId}`} />}>
            <PlusIcon />
            New quote
          </Button>
        ) : null}
      </div>
      <DataTable
        columns={columns}
        data={data?.data}
        meta={data?.meta}
        isLoading={isPending}
        rowKey={(row) => row.id}
        rowHref={(row) => `/quotes/${row.id}`}
        empty={<EmptyState icon={<FileTextIcon className="size-7" />} title="No quotes for this customer yet" />}
      />
      <p className="text-xs text-muted-foreground">
        Sales receipts and credit notes appear here as those modules are added.
      </p>
    </div>
  );
}

function CustomerPayments({ customerId }: { customerId: string }) {
  const organization = useOrganization();
  const can = useCan();
  const { data, isPending } = usePayments({ customerId, pageSize: 10, sort: '-date' }, can('payments_received:view'));

  const columns: ColumnDef<PaymentReceivedListItemDto, unknown>[] = [
    { id: 'date', header: 'Date', cell: ({ row }) => formatDate(row.original.paymentDate, organization) },
    { id: 'number', header: 'Payment#', cell: ({ row }) => <span className="font-medium text-primary">{row.original.number}</span> },
    { id: 'mode', header: 'Mode', cell: ({ row }) => row.original.paymentMode?.name ?? '—' },
    { id: 'amount', header: 'Amount', meta: { align: 'right' }, cell: ({ row }) => <Money value={row.original.amount} /> },
    { id: 'unused', header: 'Unused', meta: { align: 'right' }, cell: ({ row }) => <Money value={row.original.unusedAmount} muteZero /> },
  ];

  if (!can('payments_received:view')) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Payments received</h3>
        {can('payments_received:create') ? (
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/payments-received/new?customerId=${customerId}`} />}>
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
        rowKey={(row) => row.id}
        rowHref={(row) => `/payments-received/${row.id}`}
        empty={<EmptyState icon={<BanknoteArrowDownIcon className="size-7" />} title="No payments from this customer yet" />}
      />
    </div>
  );
}

function CustomerRecurringInvoices({ customerId }: { customerId: string }) {
  const organization = useOrganization();
  const can = useCan();
  const { data, isPending } = useRecurringInvoices({ customerId, pageSize: 10, status: 'all', sort: 'name' }, can('recurring_invoices:view'));

  const columns: ColumnDef<RecurringInvoiceListItemDto, unknown>[] = [
    { id: 'name', header: 'Profile name', cell: ({ row }) => <span className="font-medium text-primary">{row.original.name}</span> },
    { id: 'frequency', header: 'Frequency', cell: ({ row }) => formatRecurrence(row.original.repeatEvery, row.original.repeatUnit) },
    {
      id: 'next',
      header: 'Next invoice date',
      cell: ({ row }) => (row.original.nextRunDate ? formatDate(row.original.nextRunDate, organization) : '—'),
    },
    { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.displayStatus} /> },
    { id: 'total', header: 'Amount', meta: { align: 'right' }, cell: ({ row }) => <Money value={row.original.total} /> },
  ];

  if (!can('recurring_invoices:view')) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Recurring invoices</h3>
        {can('recurring_invoices:create') ? (
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/recurring-invoices/new?customerId=${customerId}`} />}>
            <PlusIcon />
            New recurring invoice
          </Button>
        ) : null}
      </div>
      <DataTable
        columns={columns}
        data={data?.data}
        meta={data?.meta}
        isLoading={isPending}
        rowKey={(row) => row.id}
        rowHref={(row) => `/recurring-invoices/${row.id}`}
        empty={<EmptyState icon={<RefreshCwIcon className="size-7" />} title="No recurring invoices for this customer yet" />}
      />
    </div>
  );
}

function CustomerSalesReceipts({ customerId }: { customerId: string }) {
  const organization = useOrganization();
  const can = useCan();
  const { data, isPending } = useSalesReceipts({ customerId, pageSize: 10, status: 'all', sort: '-date' }, can('sales_receipts:view'));

  const columns: ColumnDef<SalesReceiptListItemDto, unknown>[] = [
    { id: 'date', header: 'Date', cell: ({ row }) => formatDate(row.original.receiptDate, organization) },
    { id: 'number', header: 'Receipt#', cell: ({ row }) => <span className="font-medium text-primary">{row.original.number}</span> },
    { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: 'mode', header: 'Payment mode', cell: ({ row }) => <span className="text-muted-foreground">{row.original.paymentMode?.name ?? '—'}</span> },
    { id: 'total', header: 'Amount', meta: { align: 'right' }, cell: ({ row }) => <Money value={row.original.total} /> },
  ];

  if (!can('sales_receipts:view')) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Sales receipts</h3>
        {can('sales_receipts:create') ? (
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/sales-receipts/new?customerId=${customerId}`} />}>
            <PlusIcon />
            New sales receipt
          </Button>
        ) : null}
      </div>
      <DataTable
        columns={columns}
        data={data?.data}
        meta={data?.meta}
        isLoading={isPending}
        rowKey={(row) => row.id}
        rowHref={(row) => `/sales-receipts/${row.id}`}
        empty={<EmptyState icon={<ScrollTextIcon className="size-7" />} title="No sales receipts for this customer yet" />}
      />
    </div>
  );
}

function CustomerCreditNotes({ customerId }: { customerId: string }) {
  const organization = useOrganization();
  const can = useCan();
  const { data, isPending } = useCreditNotes({ customerId, pageSize: 10, status: 'all', sort: '-date' }, can('credit_notes:view'));

  const columns: ColumnDef<CreditNoteListItemDto, unknown>[] = [
    { id: 'date', header: 'Date', cell: ({ row }) => formatDate(row.original.creditNoteDate, organization) },
    { id: 'number', header: 'Credit note#', cell: ({ row }) => <span className="font-medium text-primary">{row.original.number}</span> },
    { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.displayStatus} /> },
    { id: 'invoice', header: 'Invoice#', cell: ({ row }) => <span className="text-muted-foreground">{row.original.invoice?.number ?? '—'}</span> },
    { id: 'total', header: 'Amount', meta: { align: 'right' }, cell: ({ row }) => <Money value={row.original.total} /> },
    { id: 'balance', header: 'Balance', meta: { align: 'right' }, cell: ({ row }) => <Money value={row.original.balance} muteZero /> },
  ];

  if (!can('credit_notes:view')) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Credit notes</h3>
        {can('credit_notes:create') ? (
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/credit-notes/new?customerId=${customerId}`} />}>
            <PlusIcon />
            New credit note
          </Button>
        ) : null}
      </div>
      <DataTable
        columns={columns}
        data={data?.data}
        meta={data?.meta}
        isLoading={isPending}
        rowKey={(row) => row.id}
        rowHref={(row) => `/credit-notes/${row.id}`}
        empty={<EmptyState icon={<WalletIcon className="size-7" />} title="No credit notes for this customer yet" />}
      />
    </div>
  );
}

function CustomerInvoices({ customerId }: { customerId: string }) {
  const organization = useOrganization();
  const can = useCan();
  const { data, isPending } = useInvoices({ customerId, pageSize: 10, status: 'all', sort: '-date' }, can('invoices:view'));

  const columns: ColumnDef<InvoiceListItemDto, unknown>[] = [
    { id: 'date', header: 'Date', cell: ({ row }) => formatDate(row.original.invoiceDate, organization) },
    { id: 'number', header: 'Invoice#', cell: ({ row }) => <span className="font-medium text-primary">{row.original.number}</span> },
    { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.displayStatus} /> },
    { id: 'dueDate', header: 'Due date', cell: ({ row }) => formatDate(row.original.dueDate, organization) },
    { id: 'total', header: 'Amount', meta: { align: 'right' }, cell: ({ row }) => <Money value={row.original.total} /> },
    { id: 'balance', header: 'Balance due', meta: { align: 'right' }, cell: ({ row }) => <Money value={row.original.balanceDue} muteZero /> },
  ];

  if (!can('invoices:view')) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Invoices</h3>
        {can('invoices:create') ? (
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/invoices/new?customerId=${customerId}`} />}>
            <PlusIcon />
            New invoice
          </Button>
        ) : null}
      </div>
      <DataTable
        columns={columns}
        data={data?.data}
        meta={data?.meta}
        isLoading={isPending}
        rowKey={(row) => row.id}
        rowHref={(row) => `/invoices/${row.id}`}
        empty={<EmptyState icon={<ReceiptIcon className="size-7" />} title="No invoices for this customer yet" />}
      />
    </div>
  );
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <ContactDetailPage
      type="customer"
      id={id}
      newTransactions={[
        { href: '/invoices/new', label: 'Invoice', permission: 'invoices:create' },
        { href: '/quotes/new', label: 'Quote', permission: 'quotes:create' },
        { href: '/sales-receipts/new', label: 'Sales receipt', permission: 'sales_receipts:create' },
        { href: '/recurring-invoices/new', label: 'Recurring invoice', permission: 'recurring_invoices:create' },
        { href: '/payments-received/new', label: 'Payment received', permission: 'payments_received:create' },
        { href: '/credit-notes/new', label: 'Credit note', permission: 'credit_notes:create' },
      ]}
      transactions={
        <>
          <CustomerInvoices customerId={id} />
          <CustomerPayments customerId={id} />
          <CustomerCreditNotes customerId={id} />
          <CustomerSalesReceipts customerId={id} />
          <CustomerRecurringInvoices customerId={id} />
          <CustomerQuotes customerId={id} />
        </>
      }
    />
  );
}
