import DecimalImport from 'decimal.js';
import type { Decimal } from 'decimal.js';

// decimal.js ships CommonJS-style typings, so under "nodenext" its default import is typed as the
// module namespace even though at runtime (decimal.mjs) it is the constructor itself.
const DecimalCtor = DecimalImport as unknown as typeof Decimal;

/** Decimal constructor used for every money calculation: high precision, half-up rounding. */
export const Dec = DecimalCtor.clone({ precision: 40, rounding: DecimalCtor.ROUND_HALF_UP });

export type { Decimal };

/** Any decimal.js-compatible value, including Prisma's bundled Decimal. */
export interface DecimalLike {
  toFixed(decimalPlaces?: number): string;
}

export type NumericInput = string | number | Decimal | DecimalLike | null | undefined;

const NUMERIC_PATTERN = /^[-+]?(\d+\.?\d*|\.\d+)$/;

/**
 * Converts user or database input to a Decimal. Blank or malformed input becomes 0 so live
 * totals never crash while someone is typing; strict validation lives in the zod schemas.
 */
export function toDecimal(value: NumericInput): Decimal {
  if (value === null || value === undefined) return new Dec(0);
  if (typeof value === 'number') return Number.isFinite(value) ? new Dec(value) : new Dec(0);
  if (typeof value === 'object') return new Dec(value.toString());
  const trimmed = value.trim();
  return NUMERIC_PATTERN.test(trimmed) ? new Dec(trimmed) : new Dec(0);
}

export function roundMoney(value: NumericInput): Decimal {
  return toDecimal(value).toDecimalPlaces(2, DecimalCtor.ROUND_HALF_UP);
}

/** Money as a fixed two-decimal string, the format used in API payloads. */
export function moneyString(value: NumericInput): string {
  return roundMoney(value).toFixed(2);
}

/** Quantity without trailing zeros, e.g. "2" or "2.5". */
export function quantityString(value: NumericInput): string {
  return toDecimal(value).toDecimalPlaces(3, DecimalCtor.ROUND_HALF_UP).toString();
}

export function sumMoney(values: NumericInput[]): Decimal {
  return values.reduce<Decimal>((sum, value) => sum.plus(toDecimal(value)), new Dec(0));
}
