import { z } from 'zod';
import { DATE_FORMATS } from '../constants.js';
import { isValidTimeZone } from '../dates.js';
import {
  optionalEmailSchema,
  optionalText,
  percentSchema,
  requiredText,
} from './common.js';

export const organizationSchema = z.object({
  name: requiredText(200, 'Organization name'),
  email: optionalEmailSchema,
  phone: optionalText(30),
  website: optionalText(200),
  taxNumber: optionalText(50),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(100),
  state: optionalText(100),
  postalCode: optionalText(20),
  country: optionalText(100),
  currencyCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code, e.g. USD'),
  currencySymbol: requiredText(5, 'Currency symbol'),
  dateFormat: z.enum(DATE_FORMATS),
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
  timezone: z.string().trim().refine(isValidTimeZone, 'Select a valid time zone'),
});
export type OrganizationInput = z.input<typeof organizationSchema>;

export const numberSeriesSchema = z.object({
  prefix: z
    .string()
    .trim()
    .max(10, 'Prefix must be at most 10 characters')
    .regex(/^[A-Za-z0-9\-_/]*$/, 'Use letters, numbers, - _ or /'),
  nextNumber: z.coerce.number().int().min(1, 'Must be at least 1').max(999_999_999),
  padding: z.coerce.number().int().min(1).max(10),
});
export type NumberSeriesInput = z.input<typeof numberSeriesSchema>;

export const paymentTermSchema = z.object({
  name: requiredText(50, 'Name'),
  days: z.coerce.number().int().min(0, 'Cannot be negative').max(365),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type PaymentTermInput = z.input<typeof paymentTermSchema>;

export const taxSchema = z.object({
  name: requiredText(50, 'Name'),
  rate: percentSchema,
  isActive: z.boolean().default(true),
});
export type TaxInput = z.input<typeof taxSchema>;

export const paymentModeSchema = z.object({
  name: requiredText(50, 'Name'),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type PaymentModeInput = z.input<typeof paymentModeSchema>;

export const expenseCategorySchema = z.object({
  name: requiredText(100, 'Name'),
  description: optionalText(200),
  isActive: z.boolean().default(true),
});
export type ExpenseCategoryInput = z.input<typeof expenseCategorySchema>;
