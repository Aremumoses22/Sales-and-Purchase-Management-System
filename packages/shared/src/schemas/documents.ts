import { z } from 'zod';
import { DISCOUNT_TYPES } from '../constants.js';
import { toDecimal } from '../money.js';
import { INVOICE_DISPLAY_STATUSES, QUOTE_DISPLAY_STATUSES } from '../statuses.js';
import { lineGross } from '../totals.js';
import {
  dateSchema,
  idSchema,
  moneySchema,
  optionalDateSchema,
  optionalIdSchema,
  optionalText,
  paginationQuerySchema,
  quantitySchema,
  requiredText,
  signedMoneySchema,
} from './common.js';

export const documentLineSchema = z
  .object({
    itemId: optionalIdSchema,
    name: requiredText(200, 'Item name'),
    description: optionalText(2000),
    quantity: quantitySchema.refine((value) => Number(value) > 0, 'Must be greater than 0'),
    unit: optionalText(20),
    rate: moneySchema,
    discountType: z.enum(DISCOUNT_TYPES).default('percent'),
    discountValue: moneySchema.default('0'),
    taxId: optionalIdSchema,
  })
  .superRefine((line, ctx) => {
    if (line.discountType === 'percent' && Number(line.discountValue) > 100) {
      ctx.addIssue({
        code: 'custom',
        path: ['discountValue'],
        message: 'Discount cannot exceed 100%',
      });
    }
    if (line.discountType === 'amount' && toDecimal(line.discountValue).gt(lineGross(line))) {
      ctx.addIssue({
        code: 'custom',
        path: ['discountValue'],
        message: 'Discount cannot exceed the line amount',
      });
    }
  });
export type DocumentLineInput = z.input<typeof documentLineSchema>;
export type DocumentLineOutput = z.output<typeof documentLineSchema>;

export const documentFields = {
  lines: z.array(documentLineSchema).min(1, 'Add at least one line item').max(200),
  shippingCharge: moneySchema.default('0'),
  adjustment: signedMoneySchema.default('0'),
  customerNotes: optionalText(2000),
  terms: optionalText(4000),
};

export const quoteSchema = z
  .object({
    customerId: idSchema,
    quoteDate: dateSchema,
    expiryDate: optionalDateSchema,
    referenceNumber: optionalText(50),
    subject: optionalText(250),
    ...documentFields,
    /** "sent" saves and marks a draft as sent in one step. */
    saveAs: z.enum(['draft', 'sent']).default('draft'),
  })
  .refine((data) => !data.expiryDate || data.expiryDate >= data.quoteDate, {
    message: 'Expiry date cannot be before the quote date',
    path: ['expiryDate'],
  });
export type QuoteInput = z.input<typeof quoteSchema>;
export type QuoteOutput = z.output<typeof quoteSchema>;

export const quoteListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['all', ...QUOTE_DISPLAY_STATUSES]).default('all'),
  customerId: z.uuid().optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});
export type QuoteListQuery = z.output<typeof quoteListQuerySchema>;

export const invoiceSchema = z
  .object({
    customerId: idSchema,
    invoiceDate: dateSchema,
    dueDate: dateSchema,
    paymentTermId: optionalIdSchema,
    orderNumber: optionalText(50),
    subject: optionalText(250),
    ...documentFields,
    /** "sent" saves and marks a draft as sent in one step. */
    saveAs: z.enum(['draft', 'sent']).default('draft'),
  })
  .refine((data) => data.dueDate >= data.invoiceDate, {
    message: 'Due date cannot be before the invoice date',
    path: ['dueDate'],
  });
export type InvoiceInput = z.input<typeof invoiceSchema>;
export type InvoiceOutput = z.output<typeof invoiceSchema>;

export const invoiceListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['all', ...INVOICE_DISPLAY_STATUSES]).default('all'),
  customerId: z.uuid().optional(),
  recurringProfileId: z.uuid().optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});
export type InvoiceListQuery = z.output<typeof invoiceListQuerySchema>;

export const voidInvoiceSchema = z.object({ reason: optionalText(500) });
export type VoidInvoiceInput = z.input<typeof voidInvoiceSchema>;
