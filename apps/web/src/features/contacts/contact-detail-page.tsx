'use client';

import type { AddressDto, ContactType, Permission } from '@spms/shared';
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  Loader2Icon,
  MailIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
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
  CONTACT_LABELS,
  CONTACT_RESOURCES,
  useContact,
  useContactHistory,
  useContactSummary,
  useDeleteContact,
  useSetContactActive,
} from '@/features/contacts/api';
import { addressLines } from '@/lib/address';
import { showApiError } from '@/lib/forms';
import { useCan } from '@/lib/session';

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

function BalanceCard({ type, id, openingBalance }: { type: ContactType; id: string; openingBalance: string }) {
  const { data: summary } = useContactSummary(type, id);
  const owed =
    summary && 'outstandingPayables' in summary ? summary.outstandingPayables : summary && 'outstandingReceivables' in summary ? summary.outstandingReceivables : '0';
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{type === 'customer' ? 'Receivables' : 'Payables'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground">{type === 'customer' ? 'Outstanding receivables' : 'Outstanding payables'}</p>
          <p className="text-2xl font-semibold">
            <Money value={owed} />
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Unused credits</p>
          <p className="text-lg font-medium">
            <Money value={summary?.unusedCredits ?? '0'} />
          </p>
        </div>
        <p className="border-t pt-3 text-xs text-muted-foreground">
          Includes the opening balance of <Money value={openingBalance} />.
        </p>
      </CardContent>
    </Card>
  );
}

export interface NewTransactionLink {
  href: string;
  label: string;
  permission: Permission;
}

/** Detail page shared by customers and vendors; each supplies its own transactions and actions. */
export function ContactDetailPage({
  type,
  id,
  transactions,
  newTransactions,
}: {
  type: ContactType;
  id: string;
  transactions: ReactNode;
  newTransactions: NewTransactionLink[];
}) {
  const router = useRouter();
  const can = useCan();
  const labels = CONTACT_LABELS[type];
  const resource = CONTACT_RESOURCES[type];
  const { data: customer, isPending, isError } = useContact(type, id);
  const [tab, setTab] = useState('overview');
  const history = useContactHistory(type, id, tab === 'history');
  const setActive = useSetContactActive(type);
  const remove = useDeleteContact(type);
  const allowedTransactions = newTransactions.filter((link) => can(link.permission));
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isError) {
    return (
      <EmptyState
        title={`${labels.one} not found`}
        description="It may have been deleted."
        action={
          <Button variant="outline" nativeButton={false} render={<Link href={`/${resource}`} />}>
            Back to {labels.many.toLowerCase()}
          </Button>
        }
      />
    );
  }
  if (isPending) return <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;

  const toggleActive = async () => {
    try {
      await setActive.mutateAsync({ id, active: !customer.isActive });
      toast.success(customer.isActive ? `${labels.one} marked as inactive` : `${labels.one} marked as active`);
    } catch (error) {
      showApiError(error);
    }
  };

  const onDelete = async () => {
    try {
      await remove.mutateAsync(id);
      toast.success(`${labels.one} deleted`);
      router.replace(`/${resource}`);
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
          <Link href={`/${resource}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-3" />
            {labels.many}
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
          {can(`${resource}:edit`) ? (
            <Button variant="outline" nativeButton={false} render={<Link href={`/${resource}/${id}/edit`} />}>
              <PencilIcon />
              Edit
            </Button>
          ) : null}
          {customer.isActive && allowedTransactions.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button />}>
                <PlusIcon />
                New transaction
                <ChevronDownIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {allowedTransactions.map((link) => (
                  <DropdownMenuItem key={link.href} render={<Link href={`${link.href}?${type}Id=${id}`} />}>
                    {link.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {can(`${resource}:edit`) || can(`${resource}:delete`) ? (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More actions" />}>
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {can(`${resource}:edit`) ? (
                  <DropdownMenuItem onClick={toggleActive}>
                    {customer.isActive ? 'Mark as inactive' : 'Mark as active'}
                  </DropdownMenuItem>
                ) : null}
                {can(`${resource}:delete`) ? (
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
                    <Detail label={`${labels.one} type`}>{customer.kind === 'business' ? 'Business' : 'Individual'}</Detail>
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
              <BalanceCard type={type} id={id} openingBalance={customer.openingBalance} />
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
          <div className="space-y-8">{transactions}</div>
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
        description={`This cannot be undone. ${labels.many} with transactions cannot be deleted; mark them inactive instead.`}
        confirmLabel={`Delete ${labels.lower}`}
        destructive
        busy={remove.isPending}
        onConfirm={onDelete}
      />
    </div>
  );
}
