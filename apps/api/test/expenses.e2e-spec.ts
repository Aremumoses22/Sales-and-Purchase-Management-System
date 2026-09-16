import type { NestExpressApplication } from '@nestjs/platform-express';
import { addDays, todayInTimeZone } from '@spms/shared';
import type {
  ContactDto,
  ExpenseCategoryDto,
  ExpenseDto,
  ExpenseListItemDto,
  ExpenseTotalsDto,
  Paginated,
  PaymentModeDto,
  TaxDto,
} from '@spms/shared';
import { API, createTestApp, signIn, signInAsRole, unique, type Agent } from './helpers.js';

describe('Expenses (e2e)', () => {
  let app: NestExpressApplication;
  let admin: Agent;
  let categories: ExpenseCategoryDto[];
  let bank: PaymentModeDto;
  let vat: TaxDto;
  const today = todayInTimeZone('UTC');

  beforeAll(async () => {
    app = await createTestApp();
    admin = await signIn(app);
    categories = (await admin.get(`${API}/settings/expense-categories`).expect(200)).body as ExpenseCategoryDto[];
    const modes = (await admin.get(`${API}/settings/payment-modes`).expect(200)).body as PaymentModeDto[];
    bank = modes.find((mode) => mode.name === 'Bank Transfer') as PaymentModeDto;
    vat = (await admin.post(`${API}/settings/taxes`).send({ name: unique('VAT'), rate: '7.5' }).expect(201)).body as TaxDto;
  });

  afterAll(async () => {
    await app.close();
  });

  const category = (name: string) => categories.find((row) => row.name === name) as ExpenseCategoryDto;
  const newVendor = async () =>
    (await admin.post(`${API}/vendors`).send({ displayName: unique('Ikeja Electric') }).expect(201)).body as ContactDto;

  const expense = (overrides: Record<string, unknown> = {}) => ({
    expenseDate: today,
    categoryId: category('Utilities').id,
    amount: '10000',
    paymentModeId: bank.id,
    referenceNumber: 'TRF-2201',
    ...overrides,
  });

  it('records expenses with tax added on top or included in the amount', async () => {
    const vendor = await newVendor();
    const exclusive = (
      await admin.post(`${API}/expenses`).send(expense({ taxId: vat.id, vendorId: vendor.id, notes: 'September power bill' })).expect(201)
    ).body as ExpenseDto;
    expect(exclusive).toMatchObject({
      amount: '10000.00',
      subtotal: '10000.00',
      taxAmount: '750.00',
      total: '10750.00',
      amountIsTaxInclusive: false,
      tax: { id: vat.id, rate: '7.5' },
      vendor: { id: vendor.id, displayName: vendor.displayName },
      paymentMode: { id: bank.id, name: 'Bank Transfer' },
      category: { name: 'Utilities' },
      hasReceipt: false,
      receipt: null,
    });

    const inclusive = (
      await admin.post(`${API}/expenses`).send(expense({ amount: '10750', taxId: vat.id, amountIsTaxInclusive: true })).expect(201)
    ).body as ExpenseDto;
    expect(inclusive).toMatchObject({ subtotal: '10000.00', taxAmount: '750.00', total: '10750.00' });

    // Editing the tax rate later does not change what an existing expense recorded.
    await admin.put(`${API}/settings/taxes/${vat.id}`).send({ name: vat.name, rate: '10' }).expect(200);
    const edited = (
      await admin.put(`${API}/expenses/${exclusive.id}`).send(expense({ taxId: vat.id, vendorId: vendor.id, referenceNumber: 'TRF-2202' })).expect(200)
    ).body as ExpenseDto;
    expect(edited).toMatchObject({ taxAmount: '750.00', total: '10750.00', referenceNumber: 'TRF-2202' });
    await admin.put(`${API}/settings/taxes/${vat.id}`).send({ name: vat.name, rate: '7.5' }).expect(200);

    const history = (await admin.get(`${API}/expenses/${exclusive.id}/history`).expect(200)).body as { summary: string }[];
    expect(history.map((entry) => entry.summary)).toEqual(expect.arrayContaining([expect.stringContaining('updated')]));
  });

  it('filters the list and returns totals that match the rows shown', async () => {
    const vendor = await newVendor();
    const dates = [addDays(today, -40), addDays(today, -10), addDays(today, -5)];
    for (const [index, date] of dates.entries()) {
      await admin
        .post(`${API}/expenses`)
        .send(expense({ expenseDate: date, vendorId: vendor.id, amount: String(1000 * (index + 1)), taxId: index === 2 ? vat.id : null }))
        .expect(201);
    }
    await admin.post(`${API}/expenses`).send(expense({ vendorId: vendor.id, categoryId: category('Rent').id, amount: '500000' })).expect(201);

    const filters = { vendorId: vendor.id, categoryId: category('Utilities').id, dateFrom: addDays(today, -30), dateTo: today };
    const list = (await admin.get(`${API}/expenses`).query({ ...filters, pageSize: 100 }).expect(200)).body as Paginated<ExpenseListItemDto>;
    expect(list.data.map((row) => row.total)).toEqual(['3225.00', '2000.00']);

    const totals = (await admin.get(`${API}/expenses/totals`).query(filters).expect(200)).body as ExpenseTotalsDto;
    expect(totals).toEqual({ count: 2, subtotal: '5000.00', taxTotal: '225.00', total: '5225.00' });
    const sum = list.data.reduce((acc, row) => acc + Number(row.total), 0);
    expect(Number(totals.total)).toBe(sum);

    const everything = (await admin.get(`${API}/expenses/totals`).query({ vendorId: vendor.id }).expect(200)).body as ExpenseTotalsDto;
    expect(everything).toMatchObject({ count: 4, total: '506225.00' });
  });

  it('attaches, serves, replaces and removes a receipt', async () => {
    const created = (await admin.post(`${API}/expenses`).send(expense()).expect(201)).body as ExpenseDto;
    const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(64)]);
    const pdf = Buffer.from('%PDF-1.4\n%fake receipt\n');

    const withImage = (await admin.post(`${API}/expenses/${created.id}/receipt`).attach('file', png, 'fuel-slip.png').expect(200)).body as ExpenseDto;
    expect(withImage).toMatchObject({ hasReceipt: true, receipt: { name: 'fuel-slip.png', mimeType: 'image/png', size: png.length } });
    const served = await admin.get(`${API}/expenses/${created.id}/receipt`).expect(200);
    expect(served.headers['content-type']).toBe('image/png');

    const withPdf = (await admin.post(`${API}/expenses/${created.id}/receipt`).attach('file', pdf, 'invoice.pdf').expect(200)).body as ExpenseDto;
    expect(withPdf.receipt).toMatchObject({ name: 'invoice.pdf', mimeType: 'application/pdf' });

    const text = await admin.post(`${API}/expenses/${created.id}/receipt`).attach('file', Buffer.from('not a receipt'), 'receipt.png').expect(415);
    expect(text.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');

    const removed = (await admin.delete(`${API}/expenses/${created.id}/receipt`).expect(200)).body as ExpenseDto;
    expect(removed).toMatchObject({ hasReceipt: false, receipt: null });
    await admin.get(`${API}/expenses/${created.id}/receipt`).expect(404);

    await admin.delete(`${API}/expenses/${created.id}`).expect(204);
    await admin.get(`${API}/expenses/${created.id}`).expect(404);
  });

  it('validates references and protects what expenses use', async () => {
    const vendor = await newVendor();
    const customer = (await admin.post(`${API}/customers`).send({ displayName: unique('Customer') }).expect(201)).body as ContactDto;

    const wrongVendor = await admin.post(`${API}/expenses`).send(expense({ vendorId: customer.id })).expect(400);
    expect(wrongVendor.body.error.details[0]).toMatchObject({ path: 'vendorId' });
    const noCategory = await admin.post(`${API}/expenses`).send(expense({ categoryId: '' })).expect(400);
    expect(noCategory.body.error.details[0]).toMatchObject({ path: 'categoryId' });

    const newCategory = (await admin.post(`${API}/settings/expense-categories`).send({ name: unique('Generator diesel') }).expect(201))
      .body as ExpenseCategoryDto;
    const used = (await admin.post(`${API}/expenses`).send(expense({ categoryId: newCategory.id, vendorId: vendor.id })).expect(201)).body as ExpenseDto;

    expect((await admin.delete(`${API}/settings/expense-categories/${newCategory.id}`).expect(409)).body.error.code).toBe('IN_USE');
    expect((await admin.delete(`${API}/vendors/${vendor.id}`).expect(409)).body.error.code).toBe('CONTACT_HAS_TRANSACTIONS');

    // An inactive category can no longer be chosen, but the expense that uses it can still be edited.
    await admin.put(`${API}/settings/expense-categories/${newCategory.id}`).send({ name: newCategory.name, isActive: false }).expect(200);
    await admin.post(`${API}/expenses`).send(expense({ categoryId: newCategory.id })).expect(400);
    await admin.put(`${API}/expenses/${used.id}`).send(expense({ categoryId: newCategory.id, amount: '12000' })).expect(200);
  });

  it('respects role permissions', async () => {
    const created = (await admin.post(`${API}/expenses`).send(expense()).expect(201)).body as ExpenseDto;
    const sales = await signInAsRole(app, 'Sales');
    await sales.get(`${API}/expenses`).expect(403);

    const viewer = await signInAsRole(app, 'Viewer');
    await viewer.get(`${API}/expenses/${created.id}`).expect(200);
    await viewer.get(`${API}/expenses/totals`).expect(200);
    await viewer.post(`${API}/expenses`).send(expense()).expect(403);
    await viewer.delete(`${API}/expenses/${created.id}`).expect(403);
  });
});
