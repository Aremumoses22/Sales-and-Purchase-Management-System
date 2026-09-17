import { z } from 'zod';
import type { InvoiceDisplayStatus } from './statuses.js';

export const DASHBOARD_PERIODS = ['this_month', 'last_month', 'this_quarter', 'last_quarter', 'this_year', 'last_year'] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export const dashboardQuerySchema = z.object({ period: z.enum(DASHBOARD_PERIODS).default('this_month') });
export type DashboardQuery = z.output<typeof dashboardQuerySchema>;

export interface AgingBuckets {
  current: string;
  days1to15: string;
  days16to30: string;
  days31to45: string;
  over45: string;
}

export interface DashboardMonth {
  /** YYYY-MM */
  month: string;
  /** Sent invoices and completed sales receipts, with tax. */
  sales: string;
  /** Payments received plus completed sales receipts, less payment refunds. */
  receipts: string;
  /** Expenses with tax. */
  expenses: string;
}

export const RECENT_TRANSACTION_TYPES = ['invoice', 'payment_received', 'sales_receipt', 'expense', 'bill', 'payment_made'] as const;
export type RecentTransactionType = (typeof RECENT_TRANSACTION_TYPES)[number];

export interface RecentTransaction {
  type: RecentTransactionType;
  id: string;
  date: string;
  /** Document number, or the expense category for expenses. */
  reference: string;
  party: string | null;
  amount: string;
  createdAt: string;
}

/** Everything the dashboard shows, in one request (PLAN.md module 12). */
export interface DashboardSummaryDto {
  period: { key: DashboardPeriod; from: string; to: string };
  receivables: { total: string; overdue: string; buckets: AgingBuckets };
  payables: { total: string; current: string; overdue: string };
  totals: { sales: string; receipts: string; expenses: string };
  /** Twelve months ending with the month the period ends in. */
  months: DashboardMonth[];
  topExpenseCategories: { id: string; name: string; amount: string }[];
  invoiceCounts: Record<InvoiceDisplayStatus, number>;
  recentTransactions: RecentTransaction[];
}
