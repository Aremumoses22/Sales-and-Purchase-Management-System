import type { RecurrenceUnit } from '@spms/shared';

const UNIT_NAMES: Record<RecurrenceUnit, [string, string]> = {
  day: ['day', 'days'],
  week: ['week', 'weeks'],
  month: ['month', 'months'],
  year: ['year', 'years'],
};

/** "Every month", "Every 2 weeks". */
export function formatRecurrence(every: number, unit: RecurrenceUnit): string {
  const [one, many] = UNIT_NAMES[unit];
  return every === 1 ? `Every ${one}` : `Every ${every} ${many}`;
}
