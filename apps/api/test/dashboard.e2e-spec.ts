import type { NestExpressApplication } from '@nestjs/platform-express';
import { addDays, todayInTimeZone } from '@spms/shared';
import type {
  ArAgingSummaryReport,
  ContactDto,
  DashboardSummaryDto,
  ExpenseCategoryDto,
  ExpenseGroupReport,
  InvoiceDto,
  SalesByCustomerReport,
  StatusCountsDto,
} from '@spms/shared';
import { API, createTestApp, signIn, signInAsRole, unique, type Agent } from './helpers.js';

describe('Dashboard (e2e)', () => {
  let app: NestExpressApplication;
  let admin: Agent;
  let today: string;

  beforeAll(async () => {
    app = await createTestApp();
    admin = await signIn(app);
    const org = (await admin.get(`${API}/settings/organization`).expect(200)).body as { timezone: string };
    today = todayInTimeZone(org.timezone);
  });

  afterAll(async () => {
    await app.close();
  });

  const summary = async (period = 'this_month') =>
    (await admin.get(`${API}/dashboard/summary`).query({ period }).expect(200)).body as DashboardSummaryDto;
  const n = (value: string) => Number(value);

  it('matches the reports for the same period', async () => {
    for (const period of ['this_month', 'last_quarter', 'this_year']) {
      const dashboard = await summary(period);
      const range = { from: dashboard.period.from, to: dashboard.period.to };
      const [sales, expenses, aging, counts] = await Promise.all([
        admin.get(`${API}/reports/sales-by-customer`).query(range).expect(200),
        admin.get(`${API}/reports/expenses-by-category`).query(range).expect(200),
        admin.get(`${API}/reports/ar-aging-summary`).query({ asOf: today }).expect(200),
        admin.get(`${API}/invoices/status-counts`).expect(200),
      ]);
      expect(dashboard.totals.sales).toBe((sales.body as SalesByCustomerReport).totals.salesWithTax);
      expect(dashboard.totals.expenses).toBe((expenses.body as ExpenseGroupReport).totals.amountWithTax);
      const agingTotals = (aging.body as ArAgingSummaryReport).totals;
      expect(dashboard.receivables.total).toBe(agingTotals.total);
      expect(dashboard.receivables.buckets.over45).toBe(agingTotals.over45);
      const { all: _all, ...byStatus } = counts.body as StatusCountsDto;
      expect(dashboard.invoiceCounts).toEqual(byStatus);
      expect(dashboard.months).toHaveLength(12);
      expect(dashboard.months.at(-1)?.month).toBe(dashboard.period.to.slice(0, 7));
    }
  });

  it('counts new sales, receipts, expenses and payables this month', async () => {
    const before = await summary();
    const customer = (await admin.post(`${API}/customers`).send({ displayName: unique('Dashboard Customer') }).expect(201)).body as ContactDto;
    const vendor = (await admin.post(`${API}/vendors`).send({ displayName: unique('Dashboard Vendor') }).expect(201)).body as ContactDto;
    const categories = (await admin.get(`${API}/settings/expense-categories`).expect(200)).body as ExpenseCategoryDto[];
    const fuel = categories.find((category) => category.name === 'Fuel & Transport') as ExpenseCategoryDto;

    const invoice = (
      await admin
        .post(`${API}/invoices`)
        .send({ customerId: customer.id, invoiceDate: today, dueDate: addDays(today, 30), lines: [{ name: 'Work', quantity: '1', rate: '70000' }], saveAs: 'sent' })
        .expect(201)
    ).body as InvoiceDto;
    await admin
      .post(`${API}/payments-received`)
      .send({ customerId: customer.id, paymentDate: today, amount: '30000', allocations: [{ invoiceId: invoice.id, amount: '30000' }] })
      .expect(201);
    await admin.post(`${API}/sales-receipts`).send({ customerId: customer.id, receiptDate: today, lines: [{ name: 'Walk-in', quantity: '1', rate: '5000' }] }).expect(201);
    await admin.post(`${API}/expenses`).send({ expenseDate: today, categoryId: fuel.id, amount: '9000' }).expect(201);
    await admin
      .post(`${API}/bills`)
      .send({ vendorId: vendor.id, billNumber: unique('DB'), billDate: addDays(today, -40), dueDate: addDays(today, -10), lines: [{ name: 'Supplies', quantity: '1', rate: '12000' }] })
      .expect(201);

    const after = await summary();
    expect(n(after.totals.sales) - n(before.totals.sales)).toBe(75000);
    expect(n(after.totals.receipts) - n(before.totals.receipts)).toBe(35000);
    expect(n(after.totals.expenses) - n(before.totals.expenses)).toBe(9000);
    expect(n(after.receivables.total) - n(before.receivables.total)).toBe(40000);
    expect(n(after.receivables.buckets.current) - n(before.receivables.buckets.current)).toBe(40000);
    expect(n(after.payables.overdue) - n(before.payables.overdue)).toBe(12000);

    const thisMonth = (s: DashboardSummaryDto) => s.months.at(-1) as DashboardSummaryDto['months'][number];
    expect(n(thisMonth(after).sales) - n(thisMonth(before).sales)).toBe(75000);
    expect(n(thisMonth(after).receipts) - n(thisMonth(before).receipts)).toBe(35000);
    expect(after.recentTransactions[0]).toMatchObject({ type: 'bill', party: vendor.displayName, amount: '12000.00' });
    const amounts = after.topExpenseCategories.map((category) => n(category.amount));
    expect(amounts.length).toBeLessThanOrEqual(5);
    expect(amounts).toEqual([...amounts].sort((x, y) => y - x));
  });

  it('requires the dashboard permission and validates the period', async () => {
    await admin.get(`${API}/dashboard/summary`).query({ period: 'forever' }).expect(400);
    const viewer = await signInAsRole(app, 'Viewer');
    await viewer.get(`${API}/dashboard/summary`).expect(200);
  });
});
