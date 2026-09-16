'use client';

import type { SearchResultsDto } from '@spms/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronDownIcon, LogOutIcon, MenuIcon, PlusIcon, SearchIcon, UserIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useLogout } from '@/features/auth/api';
import { api } from '@/lib/api';
import { initials } from '@/lib/format';
import { useCan, useSession } from '@/lib/session';
import { SidebarNav } from './sidebar';

function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const router = useRouter();

  const { data } = useQuery({
    queryKey: ['search', term],
    queryFn: () => api.get<SearchResultsDto>('/search', { q: term }),
    enabled: open && term.trim().length > 1,
    staleTime: 10_000,
  });

  const go = (href: string) => {
    setOpen(false);
    setTerm('');
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-full max-w-md items-center gap-2 rounded-lg border bg-muted/40 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
      >
        <SearchIcon className="size-4 shrink-0" />
        <span className="truncate">
          <span className="sm:hidden">Search</span>
          <span className="hidden sm:inline">Search customers, items, quotes…</span>
        </span>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Find customers, items and quotes">
        {/* Results come pre-filtered from the API, so cmdk's own filtering is switched off. */}
        <Command shouldFilter={false}>
        <CommandInput placeholder="Search customers, items and quotes…" value={term} onValueChange={setTerm} />
        <CommandList>
          <CommandEmpty>{term.length > 1 ? 'No matches found.' : 'Type at least two characters.'}</CommandEmpty>
          {data?.customers.length ? (
            <CommandGroup heading="Customers">
              {data.customers.map((customer) => (
                <CommandItem key={customer.id} value={`customer-${customer.id}`} onSelect={() => go(`/customers/${customer.id}`)}>
                  {customer.displayName}
                  {customer.companyName ? <span className="text-muted-foreground"> · {customer.companyName}</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {data?.items.length ? (
            <CommandGroup heading="Items">
              {data.items.map((item) => (
                <CommandItem key={item.id} value={`item-${item.id}`} onSelect={() => go(`/items/${item.id}`)}>
                  {item.name}
                  {item.sku ? <span className="text-muted-foreground"> · {item.sku}</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {data?.invoices.length ? (
            <CommandGroup heading="Invoices">
              {data.invoices.map((invoice) => (
                <CommandItem key={invoice.id} value={`invoice-${invoice.id}`} onSelect={() => go(`/invoices/${invoice.id}`)}>
                  {invoice.number}
                  <span className="text-muted-foreground"> · {invoice.customerName}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {data?.salesReceipts.length ? (
            <CommandGroup heading="Sales receipts">
              {data.salesReceipts.map((receipt) => (
                <CommandItem key={receipt.id} value={`sales-receipt-${receipt.id}`} onSelect={() => go(`/sales-receipts/${receipt.id}`)}>
                  {receipt.number}
                  <span className="text-muted-foreground"> · {receipt.customerName}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {data?.creditNotes.length ? (
            <CommandGroup heading="Credit notes">
              {data.creditNotes.map((creditNote) => (
                <CommandItem key={creditNote.id} value={`credit-note-${creditNote.id}`} onSelect={() => go(`/credit-notes/${creditNote.id}`)}>
                  {creditNote.number}
                  <span className="text-muted-foreground"> · {creditNote.customerName}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {data?.quotes.length ? (
            <CommandGroup heading="Quotes">
              {data.quotes.map((quote) => (
                <CommandItem key={quote.id} value={`quote-${quote.id}`} onSelect={() => go(`/quotes/${quote.id}`)}>
                  {quote.number}
                  <span className="text-muted-foreground"> · {quote.customerName}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}

function QuickCreate() {
  const can = useCan();
  const actions = [
    { href: '/invoices/new', label: 'Invoice', permission: 'invoices:create' as const },
    { href: '/quotes/new', label: 'Quote', permission: 'quotes:create' as const },
    { href: '/sales-receipts/new', label: 'Sales receipt', permission: 'sales_receipts:create' as const },
    { href: '/payments-received/new', label: 'Payment received', permission: 'payments_received:create' as const },
    { href: '/credit-notes/new', label: 'Credit note', permission: 'credit_notes:create' as const },
    { href: '/customers/new', label: 'Customer', permission: 'customers:create' as const },
    { href: '/items/new', label: 'Item', permission: 'items:create' as const },
  ].filter((action) => can(action.permission));

  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" />}>
        <PlusIcon />
        New
        <ChevronDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => (
          <DropdownMenuItem key={action.href} render={<Link href={action.href} />}>
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Topbar() {
  const { user } = useSession();
  const logout = useLogout();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const signOut = async () => {
    await logout.mutateAsync();
    router.replace('/login');
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background px-4">
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" />}>
          <MenuIcon />
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarNav onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex-1">
        <GlobalSearch />
      </div>

      <QuickCreate />

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="gap-2" />}>
          <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
            {initials(user.name)}
          </span>
          <span className="hidden sm:inline">{user.name}</span>
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <p className="font-medium">{user.name}</p>
            <p className="text-xs font-normal text-muted-foreground">
              {user.email} · {user.role.name}
            </p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/settings/profile" />}>
            <UserIcon />
            My profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={signOut}>
            <LogOutIcon />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
