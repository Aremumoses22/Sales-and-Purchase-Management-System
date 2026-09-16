import { z } from 'zod';
import { sumMoney, toDecimal } from '../money.js';
import {
  dateSchema,
  idSchema,
  moneySchema,
  optionalIdSchema,
  optionalText,
  paginationQuerySchema,
} from './common.js';

const positiveMoney = moneySchema.refine((value) => toDecimal(value).gt(0), 'Must be greater than 0');

export const paymentAllocationSchema = z.object({
  invoiceId: idSchema,
  amount: positiveMoney,
});

export const paymentReceivedSchema = z
  .object({
    customerId: idSchema,
    paymentDate: dateSchema,
    amount: positiveMoney,
    bankCharges: moneySchema.default('0'),
    paymentModeId: optionalIdSchema,
    referenceNumber: optionalText(50),
    notes: optionalText(1000),
    /** How the amount is split across the customer's invoices; any remainder stays as unused credit. */
    allocations: z.array(paymentAllocationSchema).max(200).default([]),
  })
  .superRefine((data, ctx) => {
    const invoiceIds = data.allocations.map((allocation) => allocation.invoiceId);
    if (new Set(invoiceIds).size !== invoiceIds.length) {
      ctx.addIssue({ code: 'custom', path: ['allocations'], message: 'Each invoice can appear only once' });
    }
    if (sumMoney(data.allocations.map((allocation) => allocation.amount)).gt(toDecimal(data.amount))) {
      ctx.addIssue({
        code: 'custom',
        path: ['allocations'],
        message: 'The amount applied to invoices cannot exceed the amount received',
      });
    }
  });
export type PaymentReceivedInput = z.input<typeof paymentReceivedSchema>;
export type PaymentReceivedOutput = z.output<typeof paymentReceivedSchema>;

export const paymentListQuerySchema = paginationQuerySchema.extend({
  customerId: z.uuid().optional(),
  paymentModeId: z.uuid().optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});
export type PaymentListQuery = z.output<typeof paymentListQuerySchema>;

export const openInvoicesQuerySchema = z.object({
  customerId: z.uuid(),
  /** When editing a payment, its own allocations count as still available. */
  paymentId: z.uuid().optional(),
});
export type OpenInvoicesQuery = z.output<typeof openInvoicesQuerySchema>;

export const paymentRefundSchema = z.object({
  refundDate: dateSchema,
  amount: positiveMoney,
  paymentModeId: optionalIdSchema,
  referenceNumber: optionalText(50),
  notes: optionalText(500),
});
export type PaymentRefundInput = z.input<typeof paymentRefundSchema>;
export type PaymentRefundOutput = z.output<typeof paymentRefundSchema>;

/** Applies unused payments and open credit notes to one invoice. */
export const applyCreditsSchema = z
  .object({
    payments: z
      .array(z.object({ paymentId: idSchema, amount: positiveMoney }))
      .max(50)
      .default([]),
    creditNotes: z
      .array(z.object({ creditNoteId: idSchema, amount: positiveMoney }))
      .max(50)
      .default([]),
  })
  .superRefine((data, ctx) => {
    if (data.payments.length + data.creditNotes.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['payments'], message: 'Enter an amount to apply' });
    }
    if (new Set(data.payments.map((entry) => entry.paymentId)).size !== data.payments.length) {
      ctx.addIssue({ code: 'custom', path: ['payments'], message: 'Each payment can appear only once' });
    }
    if (new Set(data.creditNotes.map((entry) => entry.creditNoteId)).size !== data.creditNotes.length) {
      ctx.addIssue({ code: 'custom', path: ['creditNotes'], message: 'Each credit note can appear only once' });
    }
  });
export type ApplyCreditsInput = z.input<typeof applyCreditsSchema>;
export type ApplyCreditsOutput = z.output<typeof applyCreditsSchema>;
