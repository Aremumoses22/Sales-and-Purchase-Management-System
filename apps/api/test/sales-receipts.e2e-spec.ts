import type { NestExpressApplication } from '@nestjs/platform-express';
import { todayInTimeZone } from '@spms/shared';
import type { ContactDto, ItemDto, Paginated, PaymentModeDto, SalesReceiptDto, SalesReceiptListItemDto } from '@spms/shared';
import { API, createTestApp, signIn, signInAsRole, unique, type Agent } from './helpers.js';

describe('Sales receipts (e2e)', () => {
  let app: NestExpressApplication;
  let admin: Agent;
  let cash: PaymentModeDto;
  const today = todayInTimeZone('UTC');

  beforeAll(async () => {
    app = await createTestApp();
    admin = await signIn(app);
    await admin.put(`${API}/settings/organization`).send({
      name: 'Northwind Trading Ltd',
      currencyCode: 'NGN',
      currencySymbol: '₦',
      dateFormat: 'dd MMM yyyy',
      fiscalYearStartMonth: 1,
      timezone: 'UTC',
    });
    const modes = (await admin.get(`${API}/settings/payment-modes`).expect(200)).body as PaymentModeDto[];
    cash = modes.find((mode) => mode.name === 'Cash') as PaymentModeDto;
  });

  afterAll(async () => {
    await app.close();
  });

  const newCustomer = async () =>
    (await admin.post(`${API}/customers`).send({ displayName: unique('Walk-in Customer') }).expect(201)).body as ContactDto;

  const newItem = async () =>
    (
      await admin
        .post(`${API}/items`)
        .send({ type: 'goods', name: unique('Paint bucket'), sellingPrice: '6500', trackInventory: true, openingStock: '10' })
        .expect(201)
    ).body as ItemDto;

  const stock = async (item: ItemDto) => ((await admin.get(`${API}/items/${item.id}`).expect(200)).body as ItemDto).stockOnHand;

  const body = (customer: ContactDto, overrides: Record<string, unknown> = {}) => ({
    customerId: customer.id,
    receiptDate: today,
    paymentModeId: cash.id,
    referenceNumber: 'POS-1182',
    lines: [{ name: 'Paint bucket', quantity: '2', rate: '6500' }],
    ...overrides,
  });

  it('records a completed sale that takes stock but is never owed', async () => {
    const customer = await newCustomer();
    const item = await newItem();

    const receipt = (
      await admin
        .post(`${API}/sales-receipts`)
        .send(body(customer, { lines: [{ itemId: item.id, name: item.name, quantity: '3', rate: '6500', taxId: null }] }))
        .expect(201)
    ).body as SalesReceiptDto;

    expect(receipt.number).toMatch(/^SR-\d{5}$/);
    expect(receipt).toMatchObject({
      status: 'completed',
      total: '19500.00',
      referenceNumber: 'POS-1182',
      paymentMode: { id: cash.id, name: 'Cash' },
    });
    expect(receipt.completedAt).not.toBeNull();
    expect(await stock(item)).toBe('7');

    const summary = (await admin.get(`${API}/customers/${customer.id}/summary`).expect(200)).body;
    expect(summary).toEqual({ outstandingReceivables: '0.00', unusedCredits: '0.00' });
  });

  it('keeps drafts out of stock until completed, and deletes only drafts', async () => {
    const customer = await newCustomer();
    const item = await newItem();
    const lines = [{ itemId: item.id, name: item.name, quantity: '4', rate: '6500' }];

    const draft = (await admin.post(`${API}/sales-receipts`).send(body(customer, { lines, saveAs: 'draft' })).expect(201))
      .body as SalesReceiptDto;
    expect(draft.status).toBe('draft');
    expect(await stock(item)).toBe('10');

    await admin.post(`${API}/sales-receipts/${draft.id}/void`).send({}).expect(409);

    const completed = (await admin.post(`${API}/sales-receipts/${draft.id}/complete`).expect(200)).body as SalesReceiptDto;
    expect(completed.status).toBe('completed');
    expect(await stock(item)).toBe('6');
    await admin.post(`${API}/sales-receipts/${draft.id}/complete`).expect(409);
    await admin.delete(`${API}/sales-receipts/${draft.id}`).expect(409);

    const another = (await admin.post(`${API}/sales-receipts`).send(body(customer, { saveAs: 'draft' })).expect(201)).body as SalesReceiptDto;
    await admin.delete(`${API}/sales-receipts/${another.id}`).expect(204);
    await admin.get(`${API}/sales-receipts/${another.id}`).expect(404);
  });

  it('recalculates totals and stock when edited, and returns stock when voided', async () => {
    const customer = await newCustomer();
    const item = await newItem();
    const receipt = (
      await admin
        .post(`${API}/sales-receipts`)
        .send(body(customer, { lines: [{ itemId: item.id, name: item.name, quantity: '2', rate: '6500' }] }))
        .expect(201)
    ).body as SalesReceiptDto;
    expect(await stock(item)).toBe('8');

    const edited = (
      await admin
        .put(`${API}/sales-receipts/${receipt.id}`)
        .send(
          body(customer, {
            lines: [{ itemId: item.id, name: item.name, quantity: '5', rate: '6000', discountType: 'amount', discountValue: '1000' }],
            adjustment: '-500',
          }),
        )
        .expect(200)
    ).body as SalesReceiptDto;
    expect(edited).toMatchObject({ subtotal: '29000.00', adjustment: '-500.00', total: '28500.00', status: 'completed' });
    expect(await stock(item)).toBe('5');

    const voided = (await admin.post(`${API}/sales-receipts/${receipt.id}/void`).send({ reason: 'Customer changed their mind' }).expect(200))
      .body as SalesReceiptDto;
    expect(voided).toMatchObject({ status: 'void', voidReason: 'Customer changed their mind' });
    expect(await stock(item)).toBe('10');
    await admin.put(`${API}/sales-receipts/${receipt.id}`).send(body(customer)).expect(409);

    const history = (await admin.get(`${API}/sales-receipts/${receipt.id}/history`).expect(200)).body as { summary: string }[];
    expect(history.map((entry) => entry.summary)).toEqual(
      expect.arrayContaining([expect.stringContaining('voided'), expect.stringContaining('updated')]),
    );
  });

  it('clones a receipt into a new draft', async () => {
    const customer = await newCustomer();
    const receipt = (await admin.post(`${API}/sales-receipts`).send(body(customer)).expect(201)).body as SalesReceiptDto;
    const copy = (await admin.post(`${API}/sales-receipts/${receipt.id}/clone`).expect(201)).body as SalesReceiptDto;
    expect(copy.id).not.toBe(receipt.id);
    expect(copy).toMatchObject({ status: 'draft', total: receipt.total, referenceNumber: null, paymentMode: { id: cash.id } });
    expect(copy.lines).toHaveLength(1);
  });

  it('lists with status counts and filters, and validates references', async () => {
    const customer = await newCustomer();
    const completed = (await admin.post(`${API}/sales-receipts`).send(body(customer)).expect(201)).body as SalesReceiptDto;
    await admin.post(`${API}/sales-receipts`).send(body(customer, { saveAs: 'draft', referenceNumber: 'POS-9' })).expect(201);

    const counts = (await admin.get(`${API}/sales-receipts/status-counts`).query({ customerId: customer.id }).expect(200)).body;
    expect(counts).toEqual({ all: 2, draft: 1, completed: 1, void: 0 });

    const list = (
      await admin.get(`${API}/sales-receipts`).query({ customerId: customer.id, status: 'completed' }).expect(200)
    ).body as Paginated<SalesReceiptListItemDto>;
    expect(list.data.map((row) => row.id)).toEqual([completed.id]);
    expect(list.data[0]).toMatchObject({ paymentMode: { name: 'Cash' }, total: '13000.00' });

    const searched = (await admin.get(`${API}/sales-receipts`).query({ q: 'POS-9', customerId: customer.id }).expect(200))
      .body as Paginated<SalesReceiptListItemDto>;
    expect(searched.data).toHaveLength(1);

    const badMode = await admin
      .post(`${API}/sales-receipts`)
      .send(body(customer, { paymentModeId: '0199b5a0-0000-7000-8000-000000000999' }))
      .expect(400);
    expect(badMode.body.error.details[0]).toMatchObject({ path: 'paymentModeId' });

    expect((await admin.delete(`${API}/customers/${customer.id}`).expect(409)).body.error.code).toBe('CONTACT_HAS_TRANSACTIONS');
    expect((await admin.delete(`${API}/settings/payment-modes/${cash.id}`).expect(409)).body.error.code).toBe('IN_USE');
  });

  it('respects role permissions', async () => {
    const customer = await newCustomer();
    const sales = await signInAsRole(app, 'Sales');
    const receipt = (await sales.post(`${API}/sales-receipts`).send(body(customer)).expect(201)).body as SalesReceiptDto;
    await sales.post(`${API}/sales-receipts/${receipt.id}/void`).send({}).expect(403);

    const viewer = await signInAsRole(app, 'Viewer');
    await viewer.get(`${API}/sales-receipts/${receipt.id}`).expect(200);
    await viewer.post(`${API}/sales-receipts`).send(body(customer)).expect(403);
  });
});
