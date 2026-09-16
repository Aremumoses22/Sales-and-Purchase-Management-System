import { describe, expect, it } from 'vitest';
import { formatDocumentNumber } from './constants.js';
import {
  addDays,
  addMonths,
  daysBetween,
  firstOccurrenceOnOrAfter,
  isDateOnly,
  occurrenceDate,
  todayInTimeZone,
} from './dates.js';
import { ALL_PERMISSIONS, DEFAULT_ROLES, isPermission } from './permissions.js';
import { contactSchema } from './schemas/contacts.js';
import { documentLineSchema, invoiceSchema, quoteSchema } from './schemas/documents.js';
import { itemSchema } from './schemas/items.js';
import { applyCreditNoteSchema } from './schemas/credit-notes.js';
import { paymentReceivedSchema } from './schemas/payments.js';
import { expenseSchema } from './schemas/expenses.js';
import { recurringInvoiceSchema } from './schemas/recurring-invoices.js';
import { calculateExpenseAmounts } from './totals.js';
import { salesReceiptSchema } from './schemas/sales-receipts.js';
import {
  canPerformCreditNoteAction,
  canPerformInvoiceAction,
  canPerformQuoteAction,
  getCreditNoteDisplayStatus,
  getInvoiceDisplayStatus,
  getQuoteDisplayStatus,
  getRecurringProfileDisplayStatus,
  canPerformSalesReceiptAction,
} from './statuses.js';

describe('quote status rules', () => {
  it('shows a sent quote past its expiry date as expired', () => {
    expect(getQuoteDisplayStatus('sent', '2026-01-10', '2026-01-11')).toBe('expired');
    expect(getQuoteDisplayStatus('sent', '2026-01-11', '2026-01-11')).toBe('sent');
    expect(getQuoteDisplayStatus('accepted', '2026-01-10', '2026-01-11')).toBe('accepted');
    expect(getQuoteDisplayStatus('sent', null, '2026-01-11')).toBe('sent');
  });

  it('only allows the documented transitions', () => {
    expect(canPerformQuoteAction('markSent', 'draft')).toBe(true);
    expect(canPerformQuoteAction('markSent', 'sent')).toBe(false);
    expect(canPerformQuoteAction('accept', 'draft')).toBe(false);
    expect(canPerformQuoteAction('accept', 'sent')).toBe(true);
    expect(canPerformQuoteAction('accept', 'declined')).toBe(true);
    expect(canPerformQuoteAction('decline', 'accepted')).toBe(true);
    expect(canPerformQuoteAction('convert', 'sent')).toBe(false);
    expect(canPerformQuoteAction('convert', 'accepted')).toBe(true);
    expect(canPerformQuoteAction('edit', 'invoiced')).toBe(false);
    expect(canPerformQuoteAction('delete', 'invoiced')).toBe(false);
  });
});

describe('dates', () => {
  it('validates real calendar dates only', () => {
    expect(isDateOnly('2028-02-29')).toBe(true);
    expect(isDateOnly('2026-02-29')).toBe(false);
    expect(isDateOnly('2026-9-1')).toBe(false);
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-25', 30)).toBe('2027-01-24');
    expect(addDays('2026-03-01', 0)).toBe('2026-03-01');
  });

  it("computes today in the organization's time zone", () => {
    const now = new Date('2026-09-15T23:30:00Z');
    expect(todayInTimeZone('UTC', now)).toBe('2026-09-15');
    expect(todayInTimeZone('Africa/Lagos', now)).toBe('2026-09-16');
    expect(todayInTimeZone('America/New_York', now)).toBe('2026-09-15');
  });
});

describe('document numbering', () => {
  it('pads the counter', () => {
    expect(formatDocumentNumber('INV-', 42, 5)).toBe('INV-00042');
    expect(formatDocumentNumber('', 123456, 3)).toBe('123456');
  });
});

describe('permissions', () => {
  it('gives Admin every permission and nobody an unknown one', () => {
    const admin = DEFAULT_ROLES.find((role) => role.name === 'Admin');
    expect(admin?.permissions).toEqual(ALL_PERMISSIONS);
    for (const role of DEFAULT_ROLES) {
      expect(role.permissions.every(isPermission)).toBe(true);
    }
  });

  it('keeps Viewer read-only', () => {
    const viewer = DEFAULT_ROLES.find((role) => role.name === 'Viewer');
    expect(viewer?.permissions.every((p) => p.endsWith(':view'))).toBe(true);
  });
});

describe('schemas', () => {
  const line = { name: 'Widget', quantity: '2', rate: '10.00' };

  it('rejects a fixed discount larger than the line amount', () => {
    const result = documentLineSchema.safeParse({ ...line, discountType: 'amount', discountValue: '25' });
    expect(result.success).toBe(false);
  });

  it('rejects a percentage discount above 100', () => {
    const result = documentLineSchema.safeParse({ ...line, discountValue: '101' });
    expect(result.success).toBe(false);
  });

  it('normalises numbers to strings and applies defaults', () => {
    const parsed = documentLineSchema.parse({ ...line, quantity: 2, rate: 10 });
    expect(parsed).toMatchObject({ quantity: '2', rate: '10', discountType: 'percent', discountValue: '0', itemId: null, taxId: null });
  });

  it('rejects an expiry date before the quote date', () => {
    const result = quoteSchema.safeParse({
      customerId: '0199b5a0-0000-7000-8000-000000000001',
      quoteDate: '2026-09-15',
      expiryDate: '2026-09-01',
      lines: [line],
    });
    expect(result.success).toBe(false);
  });

  it('turns blank optional contact fields into null', () => {
    const parsed = contactSchema.parse({ displayName: 'Acme Ltd', email: '', companyName: '  ', paymentTermId: '' });
    expect(parsed).toMatchObject({ email: null, companyName: null, paymentTermId: null, openingBalance: '0.00', contactPersons: [] });
  });

  it('allows only one primary contact person', () => {
    const result = contactSchema.safeParse({
      displayName: 'Acme Ltd',
      contactPersons: [
        { firstName: 'A', isPrimary: true },
        { firstName: 'B', isPrimary: true },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('only lets goods track inventory', () => {
    expect(itemSchema.safeParse({ type: 'service', name: 'Consulting', trackInventory: true }).success).toBe(false);
    expect(itemSchema.safeParse({ type: 'goods', name: 'Widget', trackInventory: true, openingStock: '10' }).success).toBe(true);
  });
});

describe('invoice status rules', () => {
  const base = { status: 'sent' as const, amountPaid: '0', balanceDue: '100', dueDate: '2026-09-30' };

  it('derives one display status from balance and due date', () => {
    expect(getInvoiceDisplayStatus({ ...base, status: 'draft' }, '2026-10-05')).toBe('draft');
    expect(getInvoiceDisplayStatus({ ...base, status: 'void' }, '2026-10-05')).toBe('void');
    expect(getInvoiceDisplayStatus(base, '2026-09-30')).toBe('sent');
    expect(getInvoiceDisplayStatus(base, '2026-10-01')).toBe('overdue');
    expect(getInvoiceDisplayStatus({ ...base, amountPaid: '40', balanceDue: '60' }, '2026-09-15')).toBe('partially_paid');
    expect(getInvoiceDisplayStatus({ ...base, amountPaid: '40', balanceDue: '60' }, '2026-10-01')).toBe('overdue');
    expect(getInvoiceDisplayStatus({ ...base, amountPaid: '100', balanceDue: '0' }, '2026-12-01')).toBe('paid');
  });

  it('allows deleting drafts only and voiding only unpaid sent invoices', () => {
    expect(canPerformInvoiceAction('delete', { ...base, status: 'draft' })).toBe(true);
    expect(canPerformInvoiceAction('delete', base)).toBe(false);
    expect(canPerformInvoiceAction('void', base)).toBe(true);
    expect(canPerformInvoiceAction('void', { ...base, amountPaid: '1', balanceDue: '99' })).toBe(false);
    expect(canPerformInvoiceAction('void', { ...base, status: 'draft' })).toBe(false);
    expect(canPerformInvoiceAction('edit', { ...base, status: 'void' })).toBe(false);
    expect(canPerformInvoiceAction('recordPayment', { ...base, amountPaid: '100', balanceDue: '0' })).toBe(false);
    expect(canPerformInvoiceAction('recordPayment', { ...base, status: 'draft' })).toBe(true);
  });

  it('counts days between dates', () => {
    expect(daysBetween('2026-09-01', '2026-10-01')).toBe(30);
    expect(daysBetween('2026-10-01', '2026-09-01')).toBe(-30);
  });

  it('rejects a due date before the invoice date', () => {
    const result = invoiceSchema.safeParse({
      customerId: '0199b5a0-0000-7000-8000-000000000001',
      invoiceDate: '2026-09-15',
      dueDate: '2026-09-14',
      lines: [{ name: 'Widget', quantity: '1', rate: '10' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('payment schemas', () => {
  const customerId = '0199b5a0-0000-7000-8000-000000000001';
  const invoiceA = '0199b5a0-0000-7000-8000-00000000000a';
  const invoiceB = '0199b5a0-0000-7000-8000-00000000000b';

  it('accepts a payment split across invoices with some left unused', () => {
    const result = paymentReceivedSchema.safeParse({
      customerId,
      paymentDate: '2026-09-16',
      amount: '1000',
      allocations: [
        { invoiceId: invoiceA, amount: '600' },
        { invoiceId: invoiceB, amount: '300.50' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('refuses to apply more than was received, the same invoice twice, or a zero amount', () => {
    const base = { customerId, paymentDate: '2026-09-16', amount: '500' };
    expect(paymentReceivedSchema.safeParse({ ...base, allocations: [{ invoiceId: invoiceA, amount: '500.01' }] }).success).toBe(false);
    expect(
      paymentReceivedSchema.safeParse({
        ...base,
        allocations: [
          { invoiceId: invoiceA, amount: '100' },
          { invoiceId: invoiceA, amount: '100' },
        ],
      }).success,
    ).toBe(false);
    expect(paymentReceivedSchema.safeParse({ ...base, amount: '0' }).success).toBe(false);
  });
});

describe('credit note rules', () => {
  const open = { status: 'open', amountApplied: '0', amountRefunded: '0', balance: '100' } as const;

  it('shows an open credit note with nothing left as closed', () => {
    expect(getCreditNoteDisplayStatus(open)).toBe('open');
    expect(getCreditNoteDisplayStatus({ ...open, balance: '0' })).toBe('closed');
    expect(getCreditNoteDisplayStatus({ ...open, status: 'draft' })).toBe('draft');
    expect(getCreditNoteDisplayStatus({ ...open, status: 'void', balance: '0' })).toBe('void');
  });

  it('applies and refunds only open credit with a balance, and voids only unused credit', () => {
    expect(canPerformCreditNoteAction('apply', open)).toBe(true);
    expect(canPerformCreditNoteAction('apply', { ...open, status: 'draft' })).toBe(false);
    expect(canPerformCreditNoteAction('refund', { ...open, amountApplied: '100', balance: '0' })).toBe(false);
    expect(canPerformCreditNoteAction('void', open)).toBe(true);
    expect(canPerformCreditNoteAction('void', { ...open, amountRefunded: '10', balance: '90' })).toBe(false);
    expect(canPerformCreditNoteAction('delete', open)).toBe(false);
    expect(canPerformCreditNoteAction('delete', { ...open, status: 'draft' })).toBe(true);
    expect(canPerformCreditNoteAction('edit', { ...open, status: 'void' })).toBe(false);
  });

  it('refuses to apply a credit note to the same invoice twice', () => {
    const invoiceId = '0199b5a0-0000-7000-8000-00000000000a';
    expect(
      applyCreditNoteSchema.safeParse({
        applications: [
          { invoiceId, amount: '10' },
          { invoiceId, amount: '20' },
        ],
      }).success,
    ).toBe(false);
    expect(applyCreditNoteSchema.safeParse({ applications: [] }).success).toBe(false);
  });
});

describe('sales receipt rules', () => {
  it('deletes only drafts, voids only completed receipts and locks void ones', () => {
    expect(canPerformSalesReceiptAction('delete', 'draft')).toBe(true);
    expect(canPerformSalesReceiptAction('delete', 'completed')).toBe(false);
    expect(canPerformSalesReceiptAction('void', 'completed')).toBe(true);
    expect(canPerformSalesReceiptAction('void', 'draft')).toBe(false);
    expect(canPerformSalesReceiptAction('complete', 'draft')).toBe(true);
    expect(canPerformSalesReceiptAction('edit', 'void')).toBe(false);
  });

  it('saves a receipt as completed unless asked to keep a draft', () => {
    const result = salesReceiptSchema.parse({
      customerId: '0199b5a0-0000-7000-8000-000000000001',
      receiptDate: '2026-09-16',
      lines: [{ name: 'Walk-in sale', quantity: '2', rate: '1500' }],
    });
    expect(result.saveAs).toBe('completed');
    expect(result.paymentModeId).toBeNull();
  });
});

describe('recurring schedules', () => {
  it('keeps month ends from drifting', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12-15', 2)).toBe('2027-02-15');
    const monthly = [0, 1, 2, 3].map((n) => occurrenceDate('2026-01-31', 'month', 1, n));
    expect(monthly).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(occurrenceDate('2028-02-29', 'year', 1, 1)).toBe('2029-02-28');
  });

  it('works out weekly, every-N-days and quarterly periods', () => {
    expect(occurrenceDate('2026-09-01', 'week', 2, 3)).toBe('2026-10-13');
    expect(occurrenceDate('2026-09-01', 'day', 10, 3)).toBe('2026-10-01');
    expect(occurrenceDate('2026-11-30', 'month', 3, 1)).toBe('2027-02-28');
  });

  it('finds the first period on or after a date', () => {
    expect(firstOccurrenceOnOrAfter('2026-01-31', 'month', 1, '2026-01-01')).toBe(0);
    expect(firstOccurrenceOnOrAfter('2026-01-31', 'month', 1, '2026-02-28')).toBe(1);
    expect(firstOccurrenceOnOrAfter('2026-01-31', 'month', 1, '2026-03-01')).toBe(2);
    expect(firstOccurrenceOnOrAfter('2020-01-01', 'day', 1, '2026-09-16')).toBe(daysBetween('2020-01-01', '2026-09-16'));
    for (const date of ['2026-05-30', '2026-05-31', '2026-06-01', '2027-01-30']) {
      const n = firstOccurrenceOnOrAfter('2026-01-31', 'month', 1, date);
      expect(occurrenceDate('2026-01-31', 'month', 1, n) >= date).toBe(true);
      if (n > 0) expect(occurrenceDate('2026-01-31', 'month', 1, n - 1) < date).toBe(true);
    }
  });

  it('shows an active profile past its end date as expired', () => {
    expect(getRecurringProfileDisplayStatus({ status: 'active', endDate: '2026-12-31', nextRunDate: '2027-01-31' })).toBe('expired');
    expect(getRecurringProfileDisplayStatus({ status: 'active', endDate: '2026-12-31', nextRunDate: '2026-12-31' })).toBe('active');
    expect(getRecurringProfileDisplayStatus({ status: 'active', endDate: null, nextRunDate: '2099-01-01' })).toBe('active');
    expect(getRecurringProfileDisplayStatus({ status: 'stopped', endDate: '2026-01-01', nextRunDate: '2027-01-01' })).toBe('stopped');
  });

  it('validates the profile schedule', () => {
    const base = {
      name: 'Monthly retainer',
      customerId: '0199b5a0-0000-7000-8000-000000000001',
      repeatEvery: '1',
      repeatUnit: 'month',
      startDate: '2026-10-01',
      lines: [{ name: 'Retainer', quantity: '1', rate: '250000' }],
    };
    const parsed = recurringInvoiceSchema.parse(base);
    expect(parsed).toMatchObject({ repeatEvery: 1, endDate: null, createAs: 'draft' });
    expect(recurringInvoiceSchema.safeParse({ ...base, endDate: '2026-09-30' }).success).toBe(false);
    expect(recurringInvoiceSchema.safeParse({ ...base, repeatEvery: '0' }).success).toBe(false);
  });
});

describe('expenses', () => {
  it('adds tax on top of an exclusive amount and takes it out of an inclusive one', () => {
    expect(calculateExpenseAmounts({ amount: '10000', taxRate: '7.5' })).toEqual({ subtotal: '10000.00', taxAmount: '750.00', total: '10750.00' });
    expect(calculateExpenseAmounts({ amount: '10750', taxRate: '7.5', amountIsTaxInclusive: true })).toEqual({
      subtotal: '10000.00',
      taxAmount: '750.00',
      total: '10750.00',
    });
    // Rounding stays within the amount paid.
    expect(calculateExpenseAmounts({ amount: '100', taxRate: '7.5', amountIsTaxInclusive: true })).toEqual({
      subtotal: '93.02',
      taxAmount: '6.98',
      total: '100.00',
    });
    expect(calculateExpenseAmounts({ amount: '99.999' })).toEqual({ subtotal: '100.00', taxAmount: '0.00', total: '100.00' });
  });

  it('requires a category and a positive amount', () => {
    const base = { expenseDate: '2026-09-16', categoryId: '0199b5a0-0000-7000-8000-000000000001', amount: '2500' };
    expect(expenseSchema.parse(base)).toMatchObject({ amountIsTaxInclusive: false, taxId: null, vendorId: null });
    expect(expenseSchema.safeParse({ ...base, amount: '0' }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...base, categoryId: '' }).success).toBe(false);
  });
});
