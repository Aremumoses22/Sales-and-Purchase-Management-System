import { cn } from 'cn';
import { formatNumber } from '@/lib/format';

export function isLowStock(stockOnHand: string | null, reorderLevel: string | null): boolean {
  return stockOnHand !== null && reorderLevel !== null && Number(stockOnHand) <= Number(reorderLevel);
}

/** Stock on hand with a low-stock warning at or below the reorder level. */
export function StockLevel({
  stockOnHand,
  reorderLevel,
  unit,
  className,
}: {
  stockOnHand: string | null;
  reorderLevel: string | null;
  unit?: string | null;
  className?: string;
}) {
  if (stockOnHand === null) return <span className="text-muted-foreground">—</span>;
  const low = isLowStock(stockOnHand, reorderLevel);
  return (
    <span className={cn('tabular-nums', low && 'font-medium text-amber-700', className)} title={low ? 'At or below reorder level' : undefined}>
      {formatNumber(stockOnHand)}
      {unit ? <span className="text-muted-foreground"> {unit}</span> : null}
      {low ? <span className="ml-1.5 rounded bg-amber-50 px-1 text-[10px] text-amber-700 uppercase ring-1 ring-amber-600/20">Low</span> : null}
    </span>
  );
}
