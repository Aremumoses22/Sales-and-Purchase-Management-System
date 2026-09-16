const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date in YYYY-MM-DD form. */
export function isDateOnly(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Today's date (YYYY-MM-DD) in the organization's time zone. */
export function todayInTimeZone(timeZone = 'UTC', now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Adds calendar months, keeping the day of month where it exists and using the month's last day otherwise. */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

export const RECURRENCE_UNITS = ['day', 'week', 'month', 'year'] as const;
export type RecurrenceUnit = (typeof RECURRENCE_UNITS)[number];

/**
 * Date of the nth period of a schedule (n = 0 is the start date). Each date is worked out from the
 * start date rather than the previous period, so a schedule starting on 31 January runs on
 * 28/29 February and then 31 March again instead of drifting to the 28th.
 */
export function occurrenceDate(startDate: string, unit: RecurrenceUnit, every: number, n: number): string {
  switch (unit) {
    case 'day':
      return addDays(startDate, every * n);
    case 'week':
      return addDays(startDate, 7 * every * n);
    case 'month':
      return addMonths(startDate, every * n);
    case 'year':
      return addMonths(startDate, 12 * every * n);
  }
}

/** Index of the first period on or after `date`. */
export function firstOccurrenceOnOrAfter(startDate: string, unit: RecurrenceUnit, every: number, date: string): number {
  if (date <= startDate) return 0;
  // Jump close to the answer, then step, so long-running daily schedules stay cheap.
  const approxDays = { day: 1, week: 7, month: 28, year: 365 }[unit] * every;
  let n = Math.max(0, Math.floor(daysBetween(startDate, date) / approxDays) - 2);
  while (n > 0 && occurrenceDate(startDate, unit, every, n) >= date) n -= 1;
  while (occurrenceDate(startDate, unit, every, n) < date) n += 1;
  return n;
}
