import { z } from 'zod';
import { addDays, addMonths } from './dates.js';
import { INVOICE_DISPLAY_STATUSES, type CreditNoteDisplayStatus, type InvoiceDisplayStatus } from './statuses.js';
import { dateSchema } from './schemas/common.js';

// ---------- Date ranges ----------

export const DATE_RANGE_PRESETS = [
  'today',
  'this_week',
  'this_month',
  'last_month',
  'this_quarter',
  'last_quarter',
  'this_year',
  'last_year',
  'custom',
] as const;
export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export const DATE_RANGE_PRESET_LABELS: Record<DateRangePreset, string> = {
  today: 'Today',
  this_week: 'This week',
  this_month: 'This month',
  last_month: 'Last month',
  this_quarter: 'This quarter',
  last_quarter: 'Last quarter',
  this_year: 'This year',
  last_year: 'Last year',
  custom: 'Custom',
};

export interface DateRange {
  from: string;
  to: string;
}

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Calendar ranges relative to `today` (weeks start on Monday). Custom returns this month as a starting point. */
export function dateRangeForPreset(preset: DateRangePreset, today: string): DateRange {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'this_week': {
      const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
      const from = addDays(today, -weekday);
      return { from, to: addDays(from, 6) };
    }
    case 'custom':
    case 'this_month': {
      const from = monthStart(today);
      return { from, to: addDays(addMonths(from, 1), -1) };
    }
    case 'last_month': {
      const from = addMonths(monthStart(today), -1);
      return { from, to: addDays(monthStart(today), -1) };
    }
    case 'this_quarter':
    case 'last_quarter': {
      const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
      const thisQuarter = `${year}-${String(quarterStartMonth).padStart(2, '0')}-01`;
      const from = preset === 'this_quarter' ? thisQuarter : addMonths(thisQuarter, -3);
      return { from, to: addDays(addMonths(from, 3), -1) };
    }
    case 'this_year':
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    case 'last_year':
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
  }
}

// ---------- Queries ----------

export const reportRangeQuerySchema = z
  .object({ from: dateSchema, to: dateSchema })
  .refine((data) => data.to >= data.from, { message: 'The end date cannot be before the start date', path: ['to'] });
export type ReportRangeQuery = z.output<typeof reportRangeQuerySchema>;

export const reportAsOfQuerySchema = z.object({ asOf: dateSchema });
export type ReportAsOfQuery = z.output<typeof reportAsOfQuerySchema>;

export const invoiceDetailsQuerySchema = z
  .object({ from: dateSchema, to: dateSchema, status: z.enum(['all', ...INVOICE_DISPLAY_STATUSES]).default('all') })
  .refine((data) => data.to >= data.from, { message: 'The end date cannot be before the start date', path: ['to'] });
export type InvoiceDetailsQuery = z.output<typeof invoiceDetailsQuerySchema>;

export const customerStatementQuerySchema = z
  .object({ customerId: z.uuid('Choose a customer'), from: dateSchema, to: dateSchema })
  .refine((data) => data.to >= data.from, { message: 'The end date cannot be before the start date', path: ['to'] });
export type CustomerStatementQuery = z.output<typeof customerStatementQuerySchema>;

// ---------- Results ----------

/** Every report returns its rows plus a totals row computed on the server. */
export interface ReportDto<Row, Totals> {
  rows: Row[];
  totals: Totals;
}

export interface SalesByCustomerRow {
  customerId: string;
  customerName: string;
  /** Sent invoices plus completed sales receipts. */
  documentCount: number;
  /** Before tax. */
  sales: string;
  salesWithTax: string;
}
export type SalesByCustomerReport = ReportDto<SalesByCustomerRow, { documentCount: number; sales: string; salesWithTax: string }>;

export interface SalesByItemRow {
  itemId: string | null;
  itemName: string;
  quantitySold: string;
  amount: string;
  averagePrice: string;
}
export type SalesByItemReport = ReportDto<SalesByItemRow, { quantitySold: string; amount: string }>;

export interface InvoiceDetailsRow {
  id: string;
  invoiceDate: string;
  number: string;
  customerName: string;
  status: InvoiceDisplayStatus;
  dueDate: string;
  total: string;
  balanceDue: string;
}
export type InvoiceDetailsReport = ReportDto<InvoiceDetailsRow, { count: number; total: string; balanceDue: string }>;

export interface PaymentsReceivedReportRow {
  id: string;
  paymentDate: string;
  number: string;
  customerName: string;
  paymentMode: string | null;
  referenceNumber: string | null;
  invoiceNumbers: string;
  amount: string;
  unusedAmount: string;
}
export type PaymentsReceivedReport = ReportDto<PaymentsReceivedReportRow, { count: number; amount: string; unusedAmount: string }>;

export interface CreditNoteDetailsRow {
  id: string;
  creditNoteDate: string;
  number: string;
  customerName: string;
  status: CreditNoteDisplayStatus;
  invoiceNumber: string | null;
  total: string;
  balance: string;
}
export type CreditNoteDetailsReport = ReportDto<CreditNoteDetailsRow, { count: number; total: string; balance: string }>;

export interface ExpenseGroupRow {
  /** Category or vendor id; null groups expenses with no vendor. */
  id: string | null;
  name: string;
  expenseCount: number;
  /** Before tax. */
  amount: string;
  amountWithTax: string;
}
export type ExpenseGroupReport = ReportDto<ExpenseGroupRow, { expenseCount: number; amount: string; amountWithTax: string }>;

export interface CustomerBalanceRow {
  customerId: string;
  customerName: string;
  openingBalance: string;
  invoiced: string;
  /** Payments received less refunds, plus credit notes less credit refunds. */
  received: string;
  balance: string;
}
export type CustomerBalancesReport = ReportDto<CustomerBalanceRow, { openingBalance: string; invoiced: string; received: string; balance: string }>;

export interface AgingRow {
  customerId: string;
  customerName: string;
  current: string;
  days1to15: string;
  days16to30: string;
  days31to45: string;
  over45: string;
  total: string;
}
export type ArAgingSummaryReport = ReportDto<AgingRow, Omit<AgingRow, 'customerId' | 'customerName'>>;

export interface VendorBalanceRow {
  vendorId: string;
  vendorName: string;
  openingBalance: string;
  billed: string;
  paid: string;
  balance: string;
}
export type VendorBalancesReport = ReportDto<VendorBalanceRow, { openingBalance: string; billed: string; paid: string; balance: string }>;

export const STATEMENT_ENTRY_TYPES = ['opening_balance', 'invoice', 'payment', 'payment_refund', 'credit_note', 'credit_refund'] as const;
export type StatementEntryType = (typeof STATEMENT_ENTRY_TYPES)[number];

export interface StatementEntry {
  date: string;
  type: StatementEntryType;
  /** The document to link to; null for the opening balance. */
  documentId: string | null;
  number: string | null;
  details: string;
  /** Invoices only. */
  dueDate: string | null;
  /** Amount that increases what the customer owes. */
  debit: string;
  /** Amount that reduces what the customer owes. */
  credit: string;
  balance: string;
}

export interface CustomerStatementReport extends ReportDto<StatementEntry, { debit: string; credit: string; closingBalance: string }> {
  customer: { id: string; displayName: string; email: string | null };
  openingBalance: string;
}
