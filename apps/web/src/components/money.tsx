'use client';

import { cn } from 'cn';
import { formatMoney } from '@/lib/format';
import { useOrganization } from '@/lib/session';

/** Money in the organization's currency, right-aligned with tabular figures. */
export function Money({
  value,
  className,
  muteZero = false,
}: {
  value: string | number | null | undefined;
  className?: string;
  muteZero?: boolean;
}) {
  const organization = useOrganization();
  const isZero = Number(value ?? 0) === 0;
  return (
    <span className={cn('tabular-nums', muteZero && isZero && 'text-muted-foreground', className)}>
      {formatMoney(value, organization)}
    </span>
  );
}
