import { z } from 'zod';
import { sumMoney, toDecimal } from '../money.js';
import { BILL_DISPLAY_STATUSES } from '../statuses.js';
import {
  dateSchema,
  idSchema,
  moneySchema,
  optionalIdSchema,
  optionalText,
  paginationQuerySchema,
  requiredText,
} from './common.js';
import { documentFields } from './documents.js';

const positiveMoney = moneySchema.refine((value) => toDecimal(value).gt(0), 'Must be greater than 0');

export const billSchema = z
  .object({
    vendorId: idSchema,
    /** The vendor's own invoice number, as printed on their bill. */
    billNumber: requiredText(50, 'Bill number'),
    orderNumber: optionalText(50),
    billDate: dateSchema,
    dueDate: dateSchema,
    paymentTermId: optionalIdSchema,
    ...documentFields,
    /** "open" saves and opens a draft in one step, adding it to what is owed. */
    saveAs: z.enum(['draft', 'open']).default('open'),
  })
  .refine((data) => data.dueDate >= data.billDate, {
    message: 'Due date cannot be before the bill date',
    path: ['dueDate'],
  });
export type BillInput = z.input<typeof billSchema>;
export type BillOutput = z.output<typeof billSchema>;

export const billListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['all', ...BILL_DISPLAY_STATUSES]).default('all'),
  vendorId: z.uuid().optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});
export type BillListQuery = z.output<typeof billListQuerySchema>;

export const paymentMadeSchema = z
  .object({
    vendorId: idSchema,
    paymentDate: dateSchema,
    amount: positiveMoney,
    paymentModeId: optionalIdSchema,
    referenceNumber: optionalText(50),
    notes: optionalText(1000),
    /** How the amount is split across the vendor's bills; any remainder stays as unused credit. */
    allocations: z
      .array(z.object({ billId: idSchema, amount: positiveMoney }))
      .max(200)
      .default([]),
  })
  .superRefine((data, ctx) => {
    const billIds = data.allocations.map((allocation) => allocation.billId);
    if (new Set(billIds).size !== billIds.length) {
      ctx.addIssue({ code: 'custom', path: ['allocations'], message: 'Each bill can appear only once' });
    }
    if (sumMoney(data.allocations.map((allocation) => allocation.amount)).gt(toDecimal(data.amount))) {
      ctx.addIssue({ code: 'custom', path: ['allocations'], message: 'The amount applied to bills cannot exceed the amount paid' });
    }
  });
export type PaymentMadeInput = z.input<typeof paymentMadeSchema>;
export type PaymentMadeOutput = z.output<typeof paymentMadeSchema>;

export const paymentMadeListQuerySchema = paginationQuerySchema.extend({
  vendorId: z.uuid().optional(),
  paymentModeId: z.uuid().optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});
export type PaymentMadeListQuery = z.output<typeof paymentMadeListQuerySchema>;

export const openBillsQuerySchema = z.object({
  vendorId: z.uuid(),
  /** When editing a payment, its own allocations count as still available. */
  paymentId: z.uuid().optional(),
});
export type OpenBillsQuery = z.output<typeof openBillsQuerySchema>;

/** Applies unused payments made to one bill. */
export const applyBillCreditsSchema = z
  .object({
    payments: z
      .array(z.object({ paymentId: idSchema, amount: positiveMoney }))
      .min(1, 'Enter an amount to apply')
      .max(50),
  })
  .refine((data) => new Set(data.payments.map((entry) => entry.paymentId)).size === data.payments.length, {
    message: 'Each payment can appear only once',
    path: ['payments'],
  });
export type ApplyBillCreditsInput = z.input<typeof applyBillCreditsSchema>;
export type ApplyBillCreditsOutput = z.output<typeof applyBillCreditsSchema>;
