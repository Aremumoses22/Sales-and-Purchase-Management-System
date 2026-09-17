import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  ArAgingSummaryReport,
  BillDto,
  ContactDto,
  CreditNoteDetailsReport,
  CreditNoteDto,
  CustomerBalancesReport,
  CustomerStatementReport,
  ExpenseCategoryDto,
  ExpenseGroupReport,
  InvoiceDetailsReport,
  InvoiceDto,
  ItemDto,
  PaymentReceivedDto,
  PaymentsReceivedReport,
  SalesByCustomerReport,
  SalesByItemReport,
  TaxDto,
  VendorBalancesReport,
} from '@spms/shared';
import { API, createTestApp, signIn, signInAsRole, unique, type Agent } from './helpers.js';

/**
 * Every figure below is worked out by hand from the documents created in beforeAll. They are
 * dated in 2030, a period no other test file uses, so the period reports see only this data.
 *
 * Customer A (opening balance 1,000)
 *   A0  10 Feb  4,000 (paid by PA0 on 20 Feb)
 *   A1   5 Mar  2 × X @ 5,000 = 10,000, due 20 Mar
 *   A2  10 Mar  1 × Y @ 3,000 less 10% = 2,700 + 7.5% VAT 202.50 = 2,902.50, due 9 Apr
 *   draft 12 Mar 900 (never counts)
 *   PA1 25 Mar  12,000 → 10,000 to A1, 2,000 unused; 500 refunded on 28 Mar
 *   CN  26 Mar  1,000 applied to A2 (A2 balance 1,902.50)
 * Customer B
 *   B1  15 Mar  3 × X @ 5,000 = 15,000, due 15 Mar
 *   void 18 Mar 700 (never counts)
 *   SR  20 Mar  sales receipt, one-off "Delivery" 2,000
 * Vendor V: bill 4 Mar 50,000; payment made 10 Mar 20,000; expense 2 Mar rent 100,000
 * Expenses without a vendor: 3 Mar utilities 10,000 + 7.5% = 10,750; 1 Apr rent 50,000 (outside March)
 */
describe('Reports (e2e)', () => {
  let app: NestExpressApplication;
  let admin: Agent;
  let customerA: ContactDto;
  let customerB: ContactDto;
  let vendor: ContactDto;
  let itemX: ItemDto;
  let itemY: ItemDto;
  let invoiceA1: InvoiceDto;
  let invoiceA2: InvoiceDto;
  let invoiceB1: InvoiceDto;
  let voided: InvoiceDto;
  let paymentA1: PaymentReceivedDto;
  let creditNote: CreditNoteDto;
  const march = { from: '2030-03-01', to: '2030-03-31' };

  beforeAll(async () => {
    app = await createTestApp();
    admin = await signIn(app);
    const post = async <T>(path: string, body: Record<string, unknown>, status = 201) =>
      (await admin.post(`${API}${path}`).send(body).expect(status)).body as T;

    customerA = await post<ContactDto>('/customers', { displayName: unique('Report Customer A'), openingBalance: '1000' });
    customerB = await post<ContactDto>('/customers', { displayName: unique('Report Customer B') });
    vendor = await post<ContactDto>('/vendors', { displayName: unique('Report Vendor V') });
    itemX = await post<ItemDto>('/items', { type: 'goods', name: unique('Report item X'), sellingPrice: '5000' });
    itemY = await post<ItemDto>('/items', { type: 'goods', name: unique('Report item Y'), sellingPrice: '3000' });
    const vat = await post<TaxDto>('/settings/taxes', { name: unique('Report VAT'), rate: '7.5' });

    const invoice = (customer: ContactDto, invoiceDate: string, dueDate: string, lines: Record<string, unknown>[], saveAs = 'sent') =>
      post<InvoiceDto>('/invoices', { customerId: customer.id, invoiceDate, dueDate, lines, saveAs });

    const invoiceA0 = await invoice(customerA, '2030-02-10', '2030-02-25', [{ name: 'Earlier work', quantity: '1', rate: '4000' }]);
    invoiceA1 = await invoice(customerA, '2030-03-05', '2030-03-20', [{ itemId: itemX.id, name: itemX.name, quantity: '2', rate: '5000' }]);
    invoiceA2 = await invoice(customerA, '2030-03-10', '2030-04-09', [
      { itemId: itemY.id, name: itemY.name, quantity: '1', rate: '3000', discountType: 'percent', discountValue: '10', taxId: vat.id },
    ]);
    await invoice(customerA, '2030-03-12', '2030-03-12', [{ name: 'Draft work', quantity: '1', rate: '900' }], 'draft');
    invoiceB1 = await invoice(customerB, '2030-03-15', '2030-03-15', [{ itemId: itemX.id, name: itemX.name, quantity: '3', rate: '5000' }]);
    voided = await invoice(customerB, '2030-03-18', '2030-03-18', [{ name: 'Cancelled', quantity: '1', rate: '700' }]);
    await post(`/invoices/${voided.id}/void`, {}, 200);
    await post('/sales-receipts', {
      customerId: customerB.id,
      receiptDate: '2030-03-20',
      lines: [{ name: 'Delivery', quantity: '1', rate: '2000' }],
    });

    await post('/payments-received', {
      customerId: customerA.id,
      paymentDate: '2030-02-20',
      amount: '4000',
      allocations: [{ invoiceId: invoiceA0.id, amount: '4000' }],
    });
    paymentA1 = await post<PaymentReceivedDto>('/payments-received', {
      customerId: customerA.id,
      paymentDate: '2030-03-25',
      amount: '12000',
      allocations: [{ invoiceId: invoiceA1.id, amount: '10000' }],
    });
    await post(`/payments-received/${paymentA1.id}/refunds`, { refundDate: '2030-03-28', amount: '500' });
    creditNote = await post<CreditNoteDto>('/credit-notes', {
      customerId: customerA.id,
      creditNoteDate: '2030-03-26',
      lines: [{ name: 'Goodwill credit', quantity: '1', rate: '1000' }],
      saveAs: 'open',
    });
    await post(`/credit-notes/${creditNote.id}/apply`, { applications: [{ invoiceId: invoiceA2.id, amount: '1000' }] }, 200);

    const bill = await post<BillDto>('/bills', {
      vendorId: vendor.id,
      billNumber: unique('V-BILL'),
      billDate: '2030-03-04',
      dueDate: '2030-04-03',
      lines: [{ name: 'Stock purchase', quantity: '1', rate: '50000' }],
    });
    await post('/payments-made', {
      vendorId: vendor.id,
      paymentDate: '2030-03-10',
      amount: '20000',
      allocations: [{ billId: bill.id, amount: '20000' }],
    });

    const categories = (await admin.get(`${API}/settings/expense-categories`).expect(200)).body as ExpenseCategoryDto[];
    const category = (name: string) => categories.find((row) => row.name === name)?.id;
    await post('/expenses', { expenseDate: '2030-03-02', categoryId: category('Rent'), amount: '100000', vendorId: vendor.id });
    await post('/expenses', { expenseDate: '2030-03-03', categoryId: category('Utilities'), amount: '10000', taxId: vat.id });
    await post('/expenses', { expenseDate: '2030-04-01', categoryId: category('Rent'), amount: '50000' });
  });

  afterAll(async () => {
    await app.close();
  });

  const report = async <T>(path: string, query: Record<string, string>) =>
    (await admin.get(`${API}/reports/${path}`).query(query).expect(200)).body as T;

  it('totals sales by customer, counting sent invoices and sales receipts before and after tax', async () => {
    const result = await report<SalesByCustomerReport>('sales-by-customer', march);
    expect(result.rows).toEqual([
      { customerId: customerB.id, customerName: customerB.displayName, documentCount: 2, sales: '17000.00', salesWithTax: '17000.00' },
      { customerId: customerA.id, customerName: customerA.displayName, documentCount: 2, sales: '12700.00', salesWithTax: '12902.50' },
    ]);
    expect(result.totals).toEqual({ documentCount: 4, sales: '29700.00', salesWithTax: '29902.50' });
  });

  it('totals sales by item, grouping one-off lines by their text', async () => {
    const result = await report<SalesByItemReport>('sales-by-item', march);
    expect(result.rows).toEqual([
      { itemId: itemX.id, itemName: itemX.name, quantitySold: '5', amount: '25000.00', averagePrice: '5000.00' },
      { itemId: itemY.id, itemName: itemY.name, quantitySold: '1', amount: '2700.00', averagePrice: '2700.00' },
      { itemId: null, itemName: 'Delivery', quantitySold: '1', amount: '2000.00', averagePrice: '2000.00' },
    ]);
    expect(result.totals).toEqual({ quantitySold: '7', amount: '29700.00' });
  });

  it('lists invoice details with statuses and balances, and filters by status', async () => {
    const result = await report<InvoiceDetailsReport>('invoice-details', march);
    expect(result.rows.map((row) => [row.number, row.status, row.total, row.balanceDue])).toEqual([
      [invoiceA1.number, 'paid', '10000.00', '0.00'],
      [invoiceA2.number, 'partially_paid', '2902.50', '1902.50'],
      // Due 15 Mar 2030, which is still in the future when the tests run.
      [invoiceB1.number, 'sent', '15000.00', '15000.00'],
      [voided.number, 'void', '700.00', '0.00'],
    ]);
    expect(result.totals).toEqual({ count: 3, total: '27902.50', balanceDue: '16902.50' });

    const paid = await report<InvoiceDetailsReport>('invoice-details', { ...march, status: 'paid' });
    expect(paid.rows.map((row) => row.number)).toEqual([invoiceA1.number]);
  });

  it('lists payments received and credit notes for the period', async () => {
    const payments = await report<PaymentsReceivedReport>('payments-received', march);
    expect(payments.rows).toEqual([
      expect.objectContaining({ number: paymentA1.number, invoiceNumbers: invoiceA1.number, amount: '12000.00', unusedAmount: '1500.00' }),
    ]);
    expect(payments.totals).toEqual({ count: 1, amount: '12000.00', unusedAmount: '1500.00' });

    const credits = await report<CreditNoteDetailsReport>('credit-note-details', march);
    expect(credits.rows).toEqual([expect.objectContaining({ number: creditNote.number, status: 'closed', total: '1000.00', balance: '0.00' })]);
    expect(credits.totals).toEqual({ count: 1, total: '1000.00', balance: '0.00' });
  });

  it('groups expenses by category and by vendor', async () => {
    const byCategory = await report<ExpenseGroupReport>('expenses-by-category', march);
    expect(byCategory.rows.map((row) => [row.name, row.expenseCount, row.amount, row.amountWithTax])).toEqual([
      ['Rent', 1, '100000.00', '100000.00'],
      ['Utilities', 1, '10000.00', '10750.00'],
    ]);
    expect(byCategory.totals).toEqual({ expenseCount: 2, amount: '110000.00', amountWithTax: '110750.00' });

    const byVendor = await report<ExpenseGroupReport>('expenses-by-vendor', march);
    expect(byVendor.rows).toEqual([
      { id: vendor.id, name: vendor.displayName, expenseCount: 1, amount: '100000.00', amountWithTax: '100000.00' },
      { id: null, name: 'No vendor', expenseCount: 1, amount: '10000.00', amountWithTax: '10750.00' },
    ]);
  });

  it('builds a customer statement whose closing balance matches receivables less unused credits', async () => {
    const statement = await report<CustomerStatementReport>('customer-statement', { customerId: customerA.id, ...march });
    expect(statement.openingBalance).toBe('1000.00');
    expect(statement.rows.map((row) => [row.date, row.type, row.debit, row.credit, row.balance])).toEqual([
      ['2030-03-01', 'opening_balance', '0.00', '0.00', '1000.00'],
      ['2030-03-05', 'invoice', '10000.00', '0.00', '11000.00'],
      ['2030-03-10', 'invoice', '2902.50', '0.00', '13902.50'],
      ['2030-03-25', 'payment', '0.00', '12000.00', '1902.50'],
      ['2030-03-26', 'credit_note', '0.00', '1000.00', '902.50'],
      ['2030-03-28', 'payment_refund', '500.00', '0.00', '1402.50'],
    ]);
    expect(statement.totals).toEqual({ debit: '13402.50', credit: '13000.00', closingBalance: '1402.50' });

    const summary = (await admin.get(`${API}/customers/${customerA.id}/summary`).expect(200)).body;
    expect(Number(summary.outstandingReceivables) - Number(summary.unusedCredits)).toBe(1402.5);
  });

  it('reports customer balances, receivables aging and vendor balances as of a date', async () => {
    const balances = await report<CustomerBalancesReport>('customer-balances', { asOf: '2030-03-31' });
    const ours = balances.rows.filter((row) => [customerA.id, customerB.id].includes(row.customerId));
    expect(ours).toEqual([
      { customerId: customerA.id, customerName: customerA.displayName, openingBalance: '1000.00', invoiced: '16902.50', received: '16500.00', balance: '1402.50' },
      { customerId: customerB.id, customerName: customerB.displayName, openingBalance: '0.00', invoiced: '15000.00', received: '0.00', balance: '15000.00' },
    ]);

    const aging = await report<ArAgingSummaryReport>('ar-aging-summary', { asOf: '2030-04-20' });
    expect(aging.rows.find((row) => row.customerId === customerA.id)).toMatchObject({ current: '0.00', days1to15: '1902.50', total: '1902.50' });
    expect(aging.rows.find((row) => row.customerId === customerB.id)).toMatchObject({ days31to45: '15000.00', total: '15000.00' });

    const vendors = await report<VendorBalancesReport>('vendor-balances', { asOf: '2030-03-31' });
    expect(vendors.rows.find((row) => row.vendorId === vendor.id)).toEqual({
      vendorId: vendor.id,
      vendorName: vendor.displayName,
      openingBalance: '0.00',
      billed: '50000.00',
      paid: '20000.00',
      balance: '30000.00',
    });
  });

  it('validates dates and requires the reports permission', async () => {
    await admin.get(`${API}/reports/sales-by-customer`).query({ from: '2030-03-31', to: '2030-03-01' }).expect(400);
    await admin.get(`${API}/reports/customer-statement`).query(march).expect(400);

    const sales = await signInAsRole(app, 'Sales');
    await sales.get(`${API}/reports/sales-by-customer`).query(march).expect(403);
    const viewer = await signInAsRole(app, 'Viewer');
    await viewer.get(`${API}/reports/sales-by-customer`).query(march).expect(200);
  });
});
