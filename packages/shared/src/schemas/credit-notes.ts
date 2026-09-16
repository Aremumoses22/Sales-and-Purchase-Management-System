import { z } from 'zod';
import { toDecimal } from '../money.js';
import { CREDIT_NOTE_DISPLAY_STATUSES } from '../statuses.js';
import { dateSchema, idSchema, moneySchema, optionalIdSchema, optionalText, paginationQuerySchema } from './common.js';
import { documentFields } from './documents.js';

const positiveMoney = moneySchema.refine((value) => toDecimal(value).gt(0), 'Must be greater than 0');

export const creditNoteSchema = z.object({
  customerId: idSchema,
  creditNoteDate: dateSchema,
  /** The invoice the credit relates to, for reference only. */
  invoiceId: optionalIdSchema,
  referenceNumber: optionalText(50),
  reason: optionalText(500),
  /** Puts goods on the credit note back into stock while it is open. */
  returnToStock: z.boolean().default(false),
  ...documentFields,
  /** "open" saves and opens a draft in one step, so it can be applied or refunded. */
  saveAs: z.enum(['draft', 'open']).default('draft'),
});
export type CreditNoteInput = z.input<typeof creditNoteSchema>;
export type CreditNoteOutput = z.output<typeof creditNoteSchema>;

export const creditNoteListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['all', ...CREDIT_NOTE_DISPLAY_STATUSES]).default('all'),
  customerId: z.uuid().optional(),
  invoiceId: z.uuid().optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});
export type CreditNoteListQuery = z.output<typeof creditNoteListQuerySchema>;

export const applyCreditNoteSchema = z
  .object({
    applications: z
      .array(z.object({ invoiceId: idSchema, amount: positiveMoney }))
      .min(1, 'Enter an amount to apply')
      .max(200),
  })
  .refine((data) => new Set(data.applications.map((entry) => entry.invoiceId)).size === data.applications.length, {
    message: 'Each invoice can appear only once',
    path: ['applications'],
  });
export type ApplyCreditNoteInput = z.input<typeof applyCreditNoteSchema>;
export type ApplyCreditNoteOutput = z.output<typeof applyCreditNoteSchema>;
