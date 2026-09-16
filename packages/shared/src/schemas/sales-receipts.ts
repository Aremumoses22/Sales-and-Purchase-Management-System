import { z } from 'zod';
import { SALES_RECEIPT_STATUSES } from '../statuses.js';
import { dateSchema, idSchema, optionalIdSchema, optionalText, paginationQuerySchema } from './common.js';
import { documentFields } from './documents.js';

export const salesReceiptSchema = z.object({
  customerId: idSchema,
  receiptDate: dateSchema,
  paymentModeId: optionalIdSchema,
  referenceNumber: optionalText(50),
  ...documentFields,
  /** "completed" saves the receipt as a finished sale, which also takes its stock. */
  saveAs: z.enum(['draft', 'completed']).default('completed'),
});
export type SalesReceiptInput = z.input<typeof salesReceiptSchema>;
export type SalesReceiptOutput = z.output<typeof salesReceiptSchema>;

export const salesReceiptListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['all', ...SALES_RECEIPT_STATUSES]).default('all'),
  customerId: z.uuid().optional(),
  paymentModeId: z.uuid().optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});
export type SalesReceiptListQuery = z.output<typeof salesReceiptListQuerySchema>;
