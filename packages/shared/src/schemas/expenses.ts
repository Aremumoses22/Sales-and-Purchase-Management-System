import { z } from 'zod';
import { toDecimal } from '../money.js';
import { dateSchema, idSchema, moneySchema, optionalIdSchema, optionalText, paginationQuerySchema } from './common.js';

export const expenseSchema = z.object({
  expenseDate: dateSchema,
  categoryId: idSchema,
  amount: moneySchema.refine((value) => toDecimal(value).gt(0), 'Must be greater than 0'),
  amountIsTaxInclusive: z.boolean().default(false),
  taxId: optionalIdSchema,
  /** "Paid through". */
  paymentModeId: optionalIdSchema,
  vendorId: optionalIdSchema,
  referenceNumber: optionalText(50),
  notes: optionalText(1000),
});
export type ExpenseInput = z.input<typeof expenseSchema>;
export type ExpenseOutput = z.output<typeof expenseSchema>;

export const expenseListQuerySchema = paginationQuerySchema.extend({
  categoryId: z.uuid().optional(),
  vendorId: z.uuid().optional(),
  paymentModeId: z.uuid().optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});
export type ExpenseListQuery = z.output<typeof expenseListQuerySchema>;
