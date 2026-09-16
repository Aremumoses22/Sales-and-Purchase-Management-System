'use client';

import type {
  AddressDto,
  CreditNoteListItemDto,
  InvoiceListItemDto,
  PaymentReceivedListItemDto,
  QuoteListItemDto,
} from '@spms/shared';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ArrowLeftIcon,
  BanknoteArrowDownIcon,
  ChevronDownIcon,
  FileTextIcon,
  Loader2Icon,
  MailIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  ReceiptIcon,
  WalletIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { HistoryPanel } from '@/components/history-panel';
import { Money } from '@/components/money';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useCustomer,
  useCustomerHistory,
  useCustomerSummary,
  useDeleteCustomer,
  useSetCustomerActive,
} from '@/features/customers/api';
import { useCreditNotes } from '@/features/credit-notes/api';
import { useInvoices } from '@/features/invoices/api';
import { usePayments } from '@/features/payments/api';
import { useQuotes } from '@/features/quotes/api';
import { addressLines } from '@/lib/address';
import { formatDate } from '@/lib/format';
import { showApiError } from '@/lib/forms';
import { useCan, useOrganization } from '@/lib/session';

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children || '—'}</dd>
    </div>
  );
}

function Address({ title, address }: { title: string; address: AddressDto | null }) {
  const lines = addressLines(address);
  return (
    <div className="space-y-1 text-sm">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
      {lines.length ? lines.map((line) => <p key={line}>{line}</p>) : <p className="text-muted-foreground">No address</p>}
      {address?.phone ? <p className="text-muted-foreground">Phone: {address.phone}</p> : null}
    </div>
  );
}

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
  const router = useRouter();
  const can = useCan();
  const { data: customer, isPending, isError } = useCustomer(id);
  const { data: summary } = useCustomerSummary(id);
  const [tab, setTab] = useState('overview');
  const history = useCustomerHistory(id, tab === 'history');
  const setActive = useSetCustomerActive();
  const remove = useDeleteCustomer();
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isError) {
    return (
      <EmptyState
        title="Customer not found"
        description="It may have been deleted."
        action={
          <Button variant="outline" nativeButton={false} render={<Link href="/customers" />}>
            Back to customers
          </Button>
        }
      />
    );
  }
  if (isPending) return <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;

  const toggleActive = async () => {
    try {
      await setActive.mutateAsync({ id, active: !customer.isActive });
      toast.success(customer.isActive ? 'Customer marked as inactive' : 'Customer marked as active');
    } catch (error) {
      showApiError(error);
    }
  };

  const onDelete = async () => {
    try {
      await remove.mutateAsync(id);
      toast.success('Customer deleted');
      router.replace('/customers');
    } catch (error) {
      showApiError(error);
      setConfirmDelete(false);
    }
  };

  const primary = customer.contactPersons.find((person) => person.isPrimary);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Link href="/customers" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-3" />
            Customers
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold">{customer.displayName}</h1>
            {!customer.isActive ? <StatusBadge status="inactive" /> : null}
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {customer.email ? (
              <span className="inline-flex items-center gap-1">
                <MailIcon className="size-3.5" />
                {customer.email}
              </span>
            ) : null}
            {customer.workPhone ? (
              <span className="inline-flex items-center gap-1">
                <PhoneIcon className="size-3.5" />
                {customer.workPhone}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {can('customers:edit') ? (
            <Button variant="outline" nativeButton={false} render={<Link href={`/customers/${id}/edit`} />}>
              <PencilIcon />
              Edit
            </Button>
          ) : null}
          {customer.isActive && (can('invoices:create') || can('quotes:create') || can('payments_received:create') || can('credit_notes:create')) ? (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button />}>
                <PlusIcon />
                New transaction
                <ChevronDownIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {can('invoices:create') ? (
                  <DropdownMenuItem render={<Link href={`/invoices/new?customerId=${id}`} />}>Invoice</DropdownMenuItem>
                ) : null}
                {can('quotes:create') ? (
                  <DropdownMenuItem render={<Link href={`/quotes/new?customerId=${id}`} />}>Quote</DropdownMenuItem>
                ) : null}
                {can('payments_received:create') ? (
                  <DropdownMenuItem render={<Link href={`/payments-received/new?customerId=${id}`} />}>Payment received</DropdownMenuItem>
                ) : null}
                {can('credit_notes:create') ? (
                  <DropdownMenuItem render={<Link href={`/credit-notes/new?customerId=${id}`} />}>Credit note</DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {can('customers:edit') || can('customers:delete') ? (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More actions" />}>
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {can('customers:edit') ? (
                  <DropdownMenuItem onClick={toggleActive}>
                    {customer.isActive ? 'Mark as inactive' : 'Mark as active'}
                  </DropdownMenuItem>
                ) : null}
                {can('customers:delete') ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                      Delete
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Contact details</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2">
                    <Detail label="Customer type">{customer.kind === 'business' ? 'Business' : 'Individual'}</Detail>
                    <Detail label="Contact name">
                      {[customer.salutation, customer.firstName, customer.lastName].filter(Boolean).join(' ')}
                    </Detail>
                    <Detail label="Company">{customer.companyName}</Detail>
                    <Detail label="Mobile">{customer.mobile}</Detail>
                    <Detail label="Website">{customer.website}</Detail>
                    <Detail label="Tax number">{customer.taxNumber}</Detail>
                    <Detail label="Payment terms">{customer.paymentTerm?.name}</Detail>
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Addresses</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-6 sm:grid-cols-2">
                  <Address title="Billing" address={customer.billingAddress} />
                  <Address title="Shipping" address={customer.shippingAddress} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Contact persons</CardTitle>
                </CardHeader>
                <CardContent>
                  {customer.contactPersons.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No contact persons added.</p>
                  ) : (
                    <ul className="divide-y">
                      {customer.contactPersons.map((person) => (
                        <li key={person.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                          <div>
                            <p className="font-medium">
                              {[person.salutation, person.firstName, person.lastName].filter(Boolean).join(' ')}
                              {person === primary ? (
                                <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                                  Primary
                                </span>
                              ) : null}
                            </p>
                            {person.designation ? <p className="text-xs text-muted-foreground">{person.designation}</p> : null}
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            {person.email ? <p>{person.email}</p> : null}
                            {person.workPhone || person.mobile ? <p>{person.workPhone ?? person.mobile}</p> : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Receivables</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Outstanding receivables</p>
                    <p className="text-2xl font-semibold">
                      <Money value={summary?.outstandingReceivables ?? '0'} />
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Unused credits</p>
                    <p className="text-lg font-medium">
                      <Money value={summary?.unusedCredits ?? '0'} />
                    </p>
                  </div>
                  <p className="border-t pt-3 text-xs text-muted-foreground">
                    Includes the opening balance of <Money value={customer.openingBalance} />.
                  </p>
                </CardContent>
              </Card>
              {customer.notes ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Remarks</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm whitespace-pre-line">{customer.notes}</CardContent>
                </Card>
              ) : null}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="transactions" className="mt-4">
          <div className="space-y-8">
            <CustomerInvoices customerId={id} />
            <CustomerPayments customerId={id} />
            <CustomerCreditNotes customerId={id} />
            <CustomerQuotes customerId={id} />
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <HistoryPanel entries={history.data} isLoading={history.isPending} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${customer.displayName}?`}
        description="This cannot be undone. Customers with transactions cannot be deleted; mark them inactive instead."
        confirmLabel="Delete customer"
        destructive
        busy={remove.isPending}
        onConfirm={onDelete}
      />
    </div>
  );
}
