'use client';

import type { ItemListItemDto } from '@spms/shared';
import { cn } from 'cn';
import { ChevronsUpDownIcon, PackageIcon, PencilLineIcon } from 'lucide-react';
import { useState } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useItems } from '@/features/items/api';
import { formatMoney, formatNumber } from '@/lib/format';
import { useCan, useOrganization } from '@/lib/session';
import { useDebouncedValue } from '@/lib/use-debounced-value';

export function ItemCombobox({
  label,
  linked,
  invalid,
  onPickItem,
  onUseText,
}: {
  label: string | null | undefined;
  /** True when the line is tied to a saved item. */
  linked: boolean;
  invalid?: boolean;
  onPickItem: (item: ItemListItemDto) => void;
  onUseText: (text: string) => void;
}) {
  const organization = useOrganization();
  const can = useCan();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const debounced = useDebouncedValue(term);
  const { data } = useItems({ q: debounced, status: 'active', pageSize: 20, sort: 'name' }, open && can('items:view'));
  const typed = term.trim();

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setTerm(label ?? '');
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm outline-none',
              'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
              invalid && 'border-destructive ring-3 ring-destructive/20',
            )}
          />
        }
      >
        <span className={cn('flex min-w-0 items-center gap-1.5', !label && 'text-muted-foreground')}>
          {label && linked ? <PackageIcon className="size-3.5 shrink-0 text-muted-foreground" /> : null}
          <span className="truncate">{label || 'Type or click to select an item'}</span>
        </span>
        <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search items, or type a one-off line" value={term} onValueChange={setTerm} />
          <CommandList>
            <CommandEmpty>No saved items match.</CommandEmpty>
            {typed ? (
              <CommandGroup>
                <CommandItem
                  value="__free_text__"
                  onSelect={() => {
                    onUseText(typed);
                    setOpen(false);
                  }}
                >
                  <PencilLineIcon className="text-muted-foreground" />
                  Use “{typed}” as a one-off line
                </CommandItem>
              </CommandGroup>
            ) : null}
            {data?.data.length ? (
              <CommandGroup heading="Items">
                {data.data.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={() => {
                      onPickItem(item);
                      setOpen(false);
                    }}
                  >
                    <div className="flex w-full items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[item.sku ? `SKU ${item.sku}` : null, item.stockOnHand !== null ? `Stock ${formatNumber(item.stockOnHand)}` : null]
                            .filter(Boolean)
                            .join(' · ') || (item.type === 'service' ? 'Service' : 'Goods')}
                        </p>
                      </div>
                      {item.sellingPrice !== null ? (
                        <span className="shrink-0 text-xs tabular-nums">{formatMoney(item.sellingPrice, organization)}</span>
                      ) : null}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
