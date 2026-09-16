'use client';

import type { AuditLogDto } from '@spms/shared';
import { HistoryIcon } from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import { useOrganization } from '@/lib/session';

function describe(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/** "History" panel shown on every record, built from the audit log. */
export function HistoryPanel({ entries, isLoading }: { entries: AuditLogDto[] | undefined; isLoading?: boolean }) {
  const organization = useOrganization();

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading history…</p>;
  if (!entries || entries.length === 0) return <p className="text-sm text-muted-foreground">No history yet.</p>;

  return (
    <ol className="space-y-4">
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-3">
          <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <HistoryIcon className="size-3.5" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-sm">{entry.summary}</p>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(entry.createdAt, organization)}
              {entry.user ? ` · ${entry.user.name}` : ''}
            </p>
            {entry.changes ? (
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {Object.entries(entry.changes).map(([field, change]) => (
                  <li key={field}>
                    <span className="font-medium text-foreground/80">{field}</span>: {describe(change.from)} →{' '}
                    {describe(change.to)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
