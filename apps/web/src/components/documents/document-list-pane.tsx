'use client';

import { cn } from 'cn';
import { Loader2Icon, PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { Money } from '@/components/money';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';

export interface DocumentListRow {
  id: string;
  title: string;
  amount: string;
  subtitle: string;
  status: string;
}

/** The left column of Zoho's split view: the list stays visible while one document is open. */
export function DocumentListPane({
  title,
  listHref,
  newHref,
  rows,
  isLoading,
  activeId,
  hrefFor,
}: {
  title: string;
  listHref: string;
  /** Omit when the user cannot create documents. */
  newHref?: string;
  rows: DocumentListRow[] | undefined;
  isLoading: boolean;
  activeId: string;
  hrefFor: (id: string) => string;
}) {
  return (
    <aside className="hidden w-80 shrink-0 flex-col border-r bg-background md:flex">
      <div className="flex h-12 items-center justify-between border-b px-4">
        <Link href={listHref} className="text-sm font-semibold hover:underline">
          {title}
        </Link>
        {newHref ? (
          <Button size="icon-sm" nativeButton={false} render={<Link href={newHref} />} aria-label={`New ${title.toLowerCase()}`}>
            <PlusIcon />
          </Button>
        ) : null}
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <Loader2Icon className="mx-auto mt-6 size-5 animate-spin text-muted-foreground" />
        ) : (
          <ul className="divide-y">
            {rows?.map((row) => (
              <li key={row.id}>
                <Link
                  href={hrefFor(row.id)}
                  className={cn(
                    'block space-y-1 px-4 py-3 text-sm hover:bg-muted/50',
                    row.id === activeId && 'bg-primary/5 shadow-[inset_3px_0_0_var(--primary)]',
                  )}
                >
                  <div className="flex justify-between gap-2">
                    <span className="truncate font-medium">{row.title}</span>
                    <Money value={row.amount} className="shrink-0" />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{row.subtitle}</span>
                    <StatusBadge status={row.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
