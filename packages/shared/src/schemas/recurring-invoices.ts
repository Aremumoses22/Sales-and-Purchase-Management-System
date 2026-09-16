import { z } from 'zod';
import { RECURRENCE_UNITS } from '../dates.js';
import { RECURRING_PROFILE_DISPLAY_STATUSES } from '../statuses.js';
import {
  dateSchema,
  idSchema,
  optionalDateSchema,
  optionalIdSchema,
  optionalText,
  paginationQuerySchema,
  requiredText,
} from './common.js';
import { documentFields } from './documents.js';

export const recurringInvoiceSchema = z
  .object({
    name: requiredText(100, 'Profile name'),
    customerId: idSchema,
    repeatEvery: z.coerce.number().int('Enter a whole number').min(1, 'Must be at least 1').max(365, 'At most 365'),
    repeatUnit: z.enum(RECURRENCE_UNITS),
    startDate: dateSchema,
    /** Empty when the profile never expires. */
    endDate: optionalDateSchema,
    paymentTermId: optionalIdSchema,
    createAs: z.enum(['draft', 'sent']).default('draft'),
    orderNumber: optionalText(50),
    subject: optionalText(250),
    ...documentFields,
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: 'End date cannot be before the start date',
    path: ['endDate'],
  });
export type RecurringInvoiceInput = z.input<typeof recurringInvoiceSchema>;
export type RecurringInvoiceOutput = z.output<typeof recurringInvoiceSchema>;

export const recurringInvoiceListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['all', ...RECURRING_PROFILE_DISPLAY_STATUSES]).default('all'),
  customerId: z.uuid().optional(),
});
export type RecurringInvoiceListQuery = z.output<typeof recurringInvoiceListQuerySchema>;
