import { z } from 'zod';
import { ACTIVE_FILTERS } from '../constants.js';
import { isDateOnly } from '../dates.js';

function decimalPattern(decimals: number, signed: boolean): RegExp {
  return new RegExp(`^${signed ? '-?' : ''}\\d{1,15}(\\.\\d{1,${decimals}})?$`);
}

function decimalString(decimals: number, signed: boolean, message: string) {
  return z
    .union([z.string(), z.number()])
    .transform((value) => String(value).trim())
    .pipe(z.string().regex(decimalPattern(decimals, signed), message));
}

function optionalDecimalString(decimals: number, message: string) {
  // `.optional()` before the transform keeps the object key optional (a union with undefined doesn't).
  return z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((value) =>
      value === null || value === undefined || String(value).trim() === ''
        ? null
        : String(value).trim(),
    )
    .pipe(z.string().regex(decimalPattern(decimals, false), message).nullable());
}

export const moneySchema = decimalString(2, false, 'Enter a valid amount');
export const signedMoneySchema = decimalString(2, true, 'Enter a valid amount');
export const optionalMoneySchema = optionalDecimalString(2, 'Enter a valid amount');
export const quantitySchema = decimalString(3, false, 'Enter a valid quantity');
export const signedQuantitySchema = decimalString(3, true, 'Enter a valid quantity');
export const optionalQuantitySchema = optionalDecimalString(3, 'Enter a valid quantity');
export const percentSchema = decimalString(3, false, 'Enter a valid percentage').refine(
  (value) => Number(value) <= 100,
  'Cannot exceed 100%',
);

export const requiredText = (max: number, label = 'This field') =>
  z
    .string(`${label} is required`)
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .nullish()
    .transform((value) => (value ? value : null));

export const emailSchema = z
  .string('Email is required')
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'));

export const optionalEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .nullish()
  .transform((value) => (value ? value : null))
  .pipe(z.email('Enter a valid email address').nullable());

export const idSchema = z.uuid('Select a valid option');

export const optionalIdSchema = z
  .union([z.uuid(), z.literal(''), z.null()])
  .optional()
  .transform((value) => (value ? value : null));

export const dateSchema = z
  .string('Date is required')
  .refine((value) => isDateOnly(value), 'Enter a valid date');

export const optionalDateSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => (value ? value : null))
  .refine((value) => value === null || isDateOnly(value), 'Enter a valid date');

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).optional(),
  sort: z
    .string()
    .trim()
    .regex(/^-?[A-Za-z]+$/)
    .optional(),
});
export type PaginationQuery = z.output<typeof paginationQuerySchema>;

export const activeFilterSchema = z.enum(ACTIVE_FILTERS).default('active');

export const activeListQuerySchema = paginationQuerySchema.extend({ status: activeFilterSchema });
export type ActiveListQuery = z.output<typeof activeListQuerySchema>;
