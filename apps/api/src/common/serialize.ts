import { moneyString, quantityString, type DecimalLike } from '@spms/shared';

export const toIso = (value: Date): string => value.toISOString();

export const toIsoOrNull = (value: Date | null): string | null => (value ? value.toISOString() : null);

/** `@db.Date` columns come back as UTC midnight; the API exposes them as YYYY-MM-DD. */
export const toDateOnly = (value: Date): string => value.toISOString().slice(0, 10);

export const toDateOnlyOrNull = (value: Date | null): string | null =>
  value ? toDateOnly(value) : null;

export const fromDateOnly = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

export const money = (value: DecimalLike): string => moneyString(value);

export const moneyOrNull = (value: DecimalLike | null): string | null =>
  value === null ? null : moneyString(value);

export const quantity = (value: DecimalLike): string => quantityString(value);

export const quantityOrNull = (value: DecimalLike | null): string | null =>
  value === null ? null : quantityString(value);
