import { Injectable } from '@nestjs/common';
import {
  addMonths,
  dateRangeForPreset,
  Dec,
  invoiceListQuerySchema,
  todayInTimeZone,
  toDecimal,
  type DashboardMonth,
  type DashboardQuery,
  type DashboardSummaryDto,
  type Decimal,
  type InvoiceDisplayStatus,
  type RecentTransaction,
} from '@spms/shared';
import { fromDateOnly, money, toDateOnly, toIso } from '../../common/serialize.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { InvoicesService } from '../invoices/invoices.service.js';
import { ReportsService } from '../reports/reports.service.js';
import { OrganizationService } from '../settings/organization.service.js';

const RECENT_LIMIT = 8;

interface MonthTotal {
  month: string;
  /** A database decimal, or null when there were no rows. */
  amount: { toString(): string } | null;
}

/**
 * Dashboard figures (PLAN.md module 12). Receivables, sales and expense totals come from the same
 * report queries, so every number here matches the corresponding report for the same period.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationService,
    private readonly reports: ReportsService,
    private readonly invoices: InvoicesService,
  ) {}

  async summary(query: DashboardQuery): Promise<DashboardSummaryDto> {
    const today = todayInTimeZone(await this.organization.timezone());
    const period = dateRangeForPreset(query.period, today);
    const chartFrom = addMonths(`${period.to.slice(0, 7)}-01`, -11);

    const [aging, sales, expenses, payables, receipts, months, invoiceCounts, recentTransactions] = await Promise.all([
      this.reports.arAgingSummary({ asOf: today }),
      this.reports.salesByCustomer(period),
      this.reports.expensesByCategory(period),
      this.payables(today),
      this.receipts(period.from, period.to),
      this.months(chartFrom, period.to),
      this.invoices.statusCounts(invoiceListQuerySchema.parse({})),
      this.recentTransactions(),
    ]);

    const { total, ...buckets } = aging.totals;
    return {
      period: { key: query.period, ...period },
      receivables: {
        total,
        overdue: money(
          [buckets.days1to15, buckets.days16to30, buckets.days31to45, buckets.over45].reduce<Decimal>(
            (sum, value) => sum.plus(toDecimal(value)),
            new Dec(0),
          ),
        ),
        buckets,
      },
      payables,
      totals: { sales: sales.totals.salesWithTax, receipts: money(receipts), expenses: expenses.totals.amountWithTax },
      months,
      topExpenseCategories: expenses.rows
        .slice(0, 5)
        .flatMap((row) => (row.id ? [{ id: row.id, name: row.name, amount: row.amountWithTax }] : [])),
      invoiceCounts: Object.fromEntries(
        Object.entries(invoiceCounts).filter(([key]) => key !== 'all'),
      ) as Record<InvoiceDisplayStatus, number>,
      recentTransactions,
    };
  }

  /** What is owed on open bills today, split into not yet due and overdue. */
  private async payables(today: string) {
    const todayDate = fromDateOnly(today);
    const [current, overdue] = await Promise.all([
      this.prisma.bill.aggregate({ where: { status: 'open', balanceDue: { gt: 0 }, dueDate: { gte: todayDate } }, _sum: { balanceDue: true } }),
      this.prisma.bill.aggregate({ where: { status: 'open', balanceDue: { gt: 0 }, dueDate: { lt: todayDate } }, _sum: { balanceDue: true } }),
    ]);
    const currentAmount = toDecimal(current._sum.balanceDue);
    const overdueAmount = toDecimal(overdue._sum.balanceDue);
    return { total: money(currentAmount.plus(overdueAmount)), current: money(currentAmount), overdue: money(overdueAmount) };
  }

  /** Money that came in: payments received and paid sales receipts, less refunds paid out. */
  private async receipts(from: string, to: string): Promise<Decimal> {
    const range = { gte: fromDateOnly(from), lte: fromDateOnly(to) };
    const [payments, salesReceipts, paymentRefunds, creditRefunds] = await Promise.all([
      this.prisma.paymentReceived.aggregate({ where: { paymentDate: range }, _sum: { amount: true } }),
      this.prisma.salesReceipt.aggregate({ where: { status: 'completed', receiptDate: range }, _sum: { total: true } }),
      this.prisma.paymentRefund.aggregate({ where: { refundDate: range }, _sum: { amount: true } }),
      this.prisma.creditNoteRefund.aggregate({ where: { refundDate: range, creditNote: { status: 'open' } }, _sum: { amount: true } }),
    ]);
    return toDecimal(payments._sum.amount)
      .plus(toDecimal(salesReceipts._sum.total))
      .minus(toDecimal(paymentRefunds._sum.amount))
      .minus(toDecimal(creditRefunds._sum.amount));
  }

  /** Monthly sales, receipts and expenses, grouped in the database. */
  private async months(from: string, to: string): Promise<DashboardMonth[]> {
    const start = fromDateOnly(from);
    const end = fromDateOnly(to);
    const [invoiceSales, receiptSales, payments, refunds, creditRefunds, expenses] = await Promise.all([
      this.prisma.$queryRaw<MonthTotal[]>`
        SELECT to_char(invoice_date, 'YYYY-MM') AS month, SUM(total) AS amount FROM invoices
        WHERE status = 'sent' AND invoice_date BETWEEN ${start} AND ${end} GROUP BY 1`,
      this.prisma.$queryRaw<MonthTotal[]>`
        SELECT to_char(receipt_date, 'YYYY-MM') AS month, SUM(total) AS amount FROM sales_receipts
        WHERE status = 'completed' AND receipt_date BETWEEN ${start} AND ${end} GROUP BY 1`,
      this.prisma.$queryRaw<MonthTotal[]>`
        SELECT to_char(payment_date, 'YYYY-MM') AS month, SUM(amount) AS amount FROM payments_received
        WHERE payment_date BETWEEN ${start} AND ${end} GROUP BY 1`,
      this.prisma.$queryRaw<MonthTotal[]>`
        SELECT to_char(refund_date, 'YYYY-MM') AS month, SUM(amount) AS amount FROM payment_refunds
        WHERE refund_date BETWEEN ${start} AND ${end} GROUP BY 1`,
      this.prisma.$queryRaw<MonthTotal[]>`
        SELECT to_char(r.refund_date, 'YYYY-MM') AS month, SUM(r.amount) AS amount FROM credit_note_refunds r
        JOIN credit_notes c ON c.id = r.credit_note_id
        WHERE c.status = 'open' AND r.refund_date BETWEEN ${start} AND ${end} GROUP BY 1`,
      this.prisma.$queryRaw<MonthTotal[]>`
        SELECT to_char(expense_date, 'YYYY-MM') AS month, SUM(total) AS amount FROM expenses
        WHERE expense_date BETWEEN ${start} AND ${end} GROUP BY 1`,
    ]);
    const lookup = (rows: MonthTotal[]) => new Map(rows.map((row) => [row.month, toDecimal(row.amount?.toString() ?? '0')]));
    const [a, b, c, d, e, f] = [invoiceSales, receiptSales, payments, refunds, creditRefunds, expenses].map(lookup) as Map<string, Decimal>[];
    const zero = new Dec(0);
    const result: DashboardMonth[] = [];
    for (let month = from.slice(0, 7); month <= to.slice(0, 7); month = addMonths(`${month}-01`, 1).slice(0, 7)) {
      const pick = (map: Map<string, Decimal> | undefined) => map?.get(month) ?? zero;
      result.push({
        month,
        sales: money(pick(a).plus(pick(b))),
        receipts: money(pick(c).plus(pick(b)).minus(pick(d)).minus(pick(e))),
        expenses: money(pick(f)),
      });
    }
    return result;
  }

  /** The newest documents of each kind, merged and cut to the latest few. */
  private async recentTransactions(): Promise<RecentTransaction[]> {
    const take = RECENT_LIMIT;
    const orderBy = { createdAt: 'desc' as const };
    const [invoices, payments, salesReceipts, expenses, bills, paymentsMade] = await Promise.all([
      this.prisma.invoice.findMany({ where: { status: { not: 'draft' } }, take, orderBy, include: { customer: { select: { displayName: true } } } }),
      this.prisma.paymentReceived.findMany({ take, orderBy, include: { customer: { select: { displayName: true } } } }),
      this.prisma.salesReceipt.findMany({ where: { status: 'completed' }, take, orderBy, include: { customer: { select: { displayName: true } } } }),
      this.prisma.expense.findMany({ take, orderBy, include: { category: { select: { name: true } }, vendor: { select: { displayName: true } } } }),
      this.prisma.bill.findMany({ where: { status: { not: 'draft' } }, take, orderBy, include: { vendor: { select: { displayName: true } } } }),
      this.prisma.paymentMade.findMany({ take, orderBy, include: { vendor: { select: { displayName: true } } } }),
    ]);
    const entries: RecentTransaction[] = [
      ...invoices.map((row) => ({ type: 'invoice' as const, id: row.id, date: toDateOnly(row.invoiceDate), reference: row.number, party: row.customer.displayName, amount: money(row.total), createdAt: toIso(row.createdAt) })),
      ...payments.map((row) => ({ type: 'payment_received' as const, id: row.id, date: toDateOnly(row.paymentDate), reference: row.number, party: row.customer.displayName, amount: money(row.amount), createdAt: toIso(row.createdAt) })),
      ...salesReceipts.map((row) => ({ type: 'sales_receipt' as const, id: row.id, date: toDateOnly(row.receiptDate), reference: row.number, party: row.customer.displayName, amount: money(row.total), createdAt: toIso(row.createdAt) })),
      ...expenses.map((row) => ({ type: 'expense' as const, id: row.id, date: toDateOnly(row.expenseDate), reference: row.category.name, party: row.vendor?.displayName ?? null, amount: money(row.total), createdAt: toIso(row.createdAt) })),
      ...bills.map((row) => ({ type: 'bill' as const, id: row.id, date: toDateOnly(row.billDate), reference: row.billNumber, party: row.vendor.displayName, amount: money(row.total), createdAt: toIso(row.createdAt) })),
      ...paymentsMade.map((row) => ({ type: 'payment_made' as const, id: row.id, date: toDateOnly(row.paymentDate), reference: row.number, party: row.vendor.displayName, amount: money(row.amount), createdAt: toIso(row.createdAt) })),
    ];
    return entries.sort((x, y) => y.createdAt.localeCompare(x.createdAt)).slice(0, RECENT_LIMIT);
  }
}
