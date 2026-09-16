import { STATUS_LABELS } from '@spms/shared';
import { cn } from 'cn';

/** Zoho-style status colours, shared by every list and detail page. */
const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  expired: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  accepted: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  declined: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  invoiced: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  partially_paid: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  overdue: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  void: 'bg-muted text-muted-foreground line-through',
  open: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  closed: 'bg-muted text-muted-foreground',
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  inactive: 'bg-muted text-muted-foreground',
};

const DOT_STYLES: Record<string, string> = {
  draft: 'bg-muted-foreground/50',
  sent: 'bg-blue-500',
  expired: 'bg-orange-500',
  accepted: 'bg-emerald-500',
  declined: 'bg-rose-500',
  invoiced: 'bg-violet-500',
  paid: 'bg-emerald-500',
  partially_paid: 'bg-amber-500',
  overdue: 'bg-rose-500',
  void: 'bg-muted-foreground/50',
  open: 'bg-blue-500',
  closed: 'bg-muted-foreground/50',
  active: 'bg-emerald-500',
  inactive: 'bg-muted-foreground/50',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-transparent',
        STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground',
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', DOT_STYLES[status] ?? 'bg-muted-foreground/50')} />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
