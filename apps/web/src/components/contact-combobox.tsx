'use client';

import { cn } from 'cn';
import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ContactType } from '@spms/shared';
import { CONTACT_LABELS, CONTACT_RESOURCES, useContact, useContacts } from '@/features/contacts/api';
import { useCan } from '@/lib/session';
import { useDebouncedValue } from '@/lib/use-debounced-value';

/** Searchable picker over active customers or vendors. */
export function ContactCombobox({
  type,
  id,
  value,
  onChange,
  invalid,
  disabled,
}: {
  type: ContactType;
  id?: string;
  value: string | null | undefined;
  onChange: (customerId: string) => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const can = useCan();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const debounced = useDebouncedValue(term);
  const labels = CONTACT_LABELS[type];
  const { data: selected } = useContact(type, value ?? '');
  const { data } = useContacts(type, { q: debounced, status: 'active', pageSize: 20, sort: 'name' }, open);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            id={id}
            type="button"
            disabled={disabled}
            className={cn(
              'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60',
              'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
              invalid && 'border-destructive ring-3 ring-destructive/20',
            )}
          />
        }
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected?.displayName ?? `Select or search a ${labels.lower}`}
        </span>
        <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) min-w-72 p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder={`Search ${labels.many.toLowerCase()}`} value={term} onValueChange={setTerm} />
          <CommandList>
            <CommandEmpty>No active {labels.many.toLowerCase()} match.</CommandEmpty>
            {data?.data.length ? (
              <CommandGroup>
                {data.data.map((customer) => (
                  <CommandItem
                    key={customer.id}
                    value={customer.id}
                    onSelect={() => {
                      onChange(customer.id);
                      setOpen(false);
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{customer.displayName}</p>
                      {customer.email || customer.companyName ? (
                        <p className="truncate text-xs text-muted-foreground">{customer.email ?? customer.companyName}</p>
                      ) : null}
                    </div>
                    {customer.id === value ? <CheckIcon className="size-4" /> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
          {can(`${CONTACT_RESOURCES[type]}:create`) ? (
            <Link
              href={`/${CONTACT_RESOURCES[type]}/new`}
              target="_blank"
              className="flex items-center gap-1.5 border-t px-3 py-2 text-sm text-primary hover:bg-muted/50"
            >
              <PlusIcon className="size-4" />
              New {labels.lower}
            </Link>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function CustomerCombobox(props: Omit<Parameters<typeof ContactCombobox>[0], 'type'>) {
  return <ContactCombobox type="customer" {...props} />;
}

export function VendorCombobox(props: Omit<Parameters<typeof ContactCombobox>[0], 'type'>) {
  return <ContactCombobox type="vendor" {...props} />;
}
