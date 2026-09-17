import type { NestExpressApplication } from '@nestjs/platform-express';
import { addDays, todayInTimeZone } from '@spms/shared';
import type {
  BillAvailableCreditsDto,
  BillDto,
  BillListItemDto,
  ContactDto,
  ItemDto,
  OpenBillDto,
  Paginated,
  PaymentMadeDto,
  PaymentModeDto,
  SearchResultsDto,
} from '@spms/shared';
import { API, createTestApp, signIn, signInAsRole, unique, type Agent } from './helpers.js';

describe('Bills and payments made (e2e)', () => {
  let app: NestExpressApplication;
  let admin: Agent;
  let bank: PaymentModeDto;
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
    bank = modes.find((mode) => mode.name === 'Bank Transfer') as PaymentModeDto;
  });

  afterAll(async () => {
    await app.close();
  });

  const newVendor = async (overrides: Record<string, unknown> = {}) =>
    (await admin.post(`${API}/vendors`).send({ displayName: unique('Apapa Cement'), ...overrides }).expect(201)).body as ContactDto;

  const billBody = (vendor: ContactDto, amount: string, overrides: Record<string, unknown> = {}) => ({
    vendorId: vendor.id,
    billNumber: unique('INV'),
    billDate: today,
    dueDate: addDays(today, 30),
    lines: [{ name: 'Cement bags', quantity: '1', rate: amount }],
    ...overrides,
  });

  const newBill = async (vendor: ContactDto, amount: string, overrides: Record<string, unknown> = {}) =>
    (await admin.post(`${API}/bills`).send(billBody(vendor, amount, overrides)).expect(201)).body as BillDto;

  const pay = (vendor: ContactDto, amount: string, allocations: { billId: string; amount: string }[]) =>
    admin.post(`${API}/payments-made`).send({ vendorId: vendor.id, paymentDate: today, amount, paymentModeId: bank.id, allocations });

  const bill = async (id: string) => (await admin.get(`${API}/bills/${id}`).expect(200)).body as BillDto;
  const summary = async (vendor: ContactDto) => (await admin.get(`${API}/vendors/${vendor.id}/summary`).expect(200)).body;

  it('records a bill that adds to payables and stock', async () => {
    const vendor = await newVendor({ openingBalance: '5000' });
    const item = (
      await admin.post(`${API}/items`).send({ type: 'goods', name: unique('Cement 50kg'), costPrice: '5000', trackInventory: true, openingStock: '10' }).expect(201)
    ).body as ItemDto;

    const created = await newBill(vendor, '0', { lines: [{ itemId: item.id, name: item.name, quantity: '20', rate: '5000' }], shippingCharge: '2500' });
    expect(created).toMatchObject({ status: 'open', displayStatus: 'open', total: '102500.00', balanceDue: '102500.00', vendor: { id: vendor.id } });
    expect(((await admin.get(`${API}/items/${item.id}`).expect(200)).body as ItemDto).stockOnHand).toBe('30');
    expect(await summary(vendor)).toEqual({ outstandingPayables: '107500.00', unusedCredits: '0.00' });

    // Bill numbers are the vendor's own, so they must be unique per vendor only.
    const duplicate = await admin.post(`${API}/bills`).send(billBody(vendor, '100', { billNumber: created.billNumber })).expect(400);
    expect(duplicate.body.error.details[0]).toMatchObject({ path: 'billNumber' });
    const otherVendor = await newVendor();
    await admin.post(`${API}/bills`).send(billBody(otherVendor, '100', { billNumber: created.billNumber })).expect(201);

    const voided = (await admin.post(`${API}/bills/${created.id}/void`).send({ reason: 'Wrong vendor' }).expect(200)).body as BillDto;
    expect(voided).toMatchObject({ status: 'void', balanceDue: '0.00' });
    expect(((await admin.get(`${API}/items/${item.id}`).expect(200)).body as ItemDto).stockOnHand).toBe('10');
  });

  it('keeps drafts out of payables until opened and deletes only drafts', async () => {
    const vendor = await newVendor();
    const draft = await newBill(vendor, '8000', { saveAs: 'draft' });
    expect(draft.status).toBe('draft');
    expect((await summary(vendor)).outstandingPayables).toBe('0.00');
    await admin.post(`${API}/bills/${draft.id}/void`).send({}).expect(409);

    await admin.post(`${API}/bills/${draft.id}/mark-open`).expect(200);
    expect((await summary(vendor)).outstandingPayables).toBe('8000.00');
    await admin.delete(`${API}/bills/${draft.id}`).expect(409);

    const another = await newBill(vendor, '100', { saveAs: 'draft' });
    await admin.delete(`${API}/bills/${another.id}`).expect(204);
  });

  it('pays bills partly and fully, keeps the excess and restores balances when a payment is deleted', async () => {
    const vendor = await newVendor();
    const first = await newBill(vendor, '30000', { billDate: addDays(today, -10), dueDate: addDays(today, 20) });
    const second = await newBill(vendor, '20000');

    const partial = (await pay(vendor, '10000', [{ billId: first.id, amount: '10000' }]).expect(201)).body as PaymentMadeDto;
    expect(partial.number).toMatch(/^PM-\d{5}$/);
    expect(await bill(first.id)).toMatchObject({ amountPaid: '10000.00', balanceDue: '20000.00', displayStatus: 'partially_paid' });

    const open = (await admin.get(`${API}/payments-made/open-bills`).query({ vendorId: vendor.id }).expect(200)).body as OpenBillDto[];
    expect(open.map((row) => [row.billNumber, row.balanceDue])).toEqual([
      [first.billNumber, '20000.00'],
      [second.billNumber, '20000.00'],
    ]);

    const tooMuch = await pay(vendor, '50000', [{ billId: second.id, amount: '20000.01' }]).expect(400);
    expect(tooMuch.body.error.details[0]).toMatchObject({ path: 'allocations.0.amount' });

    const full = (
      await pay(vendor, '45000', [
        { billId: first.id, amount: '20000' },
        { billId: second.id, amount: '20000' },
      ]).expect(201)
    ).body as PaymentMadeDto;
    expect(full).toMatchObject({ amountApplied: '40000.00', unusedAmount: '5000.00' });
    expect((await bill(first.id)).displayStatus).toBe('paid');
    expect((await bill(second.id)).payments).toEqual([expect.objectContaining({ paymentId: full.id, amount: '20000.00' })]);
    expect(await summary(vendor)).toEqual({ outstandingPayables: '0.00', unusedCredits: '5000.00' });

    // A paid bill cannot be voided or cut below what was paid.
    await admin.post(`${API}/bills/${first.id}/void`).send({}).expect(409);
    const lowered = await admin.put(`${API}/bills/${first.id}`).send(billBody(vendor, '1000', { billNumber: first.billNumber })).expect(400);
    expect(lowered.body.error.details[0]).toMatchObject({ path: 'lines' });

    await admin.delete(`${API}/payments-made/${full.id}`).expect(204);
    expect(await bill(first.id)).toMatchObject({ balanceDue: '20000.00', displayStatus: 'partially_paid' });
    expect(await summary(vendor)).toEqual({ outstandingPayables: '40000.00', unusedCredits: '0.00' });

    // Editing a payment moves its money to another bill.
    const moved = (
      await admin
        .put(`${API}/payments-made/${partial.id}`)
        .send({ vendorId: vendor.id, paymentDate: today, amount: '10000', allocations: [{ billId: second.id, amount: '10000' }] })
        .expect(200)
    ).body as PaymentMadeDto;
    expect(moved.allocations.map((allocation) => allocation.bill.id)).toEqual([second.id]);
    expect((await bill(first.id)).balanceDue).toBe('30000.00');
    expect((await bill(second.id)).balanceDue).toBe('10000.00');
  });

  it('applies unused payments to a later bill from the bill and records vendor refunds', async () => {
    const vendor = await newVendor();
    const advance = (await pay(vendor, '30000', []).expect(201)).body as PaymentMadeDto;
    expect(advance.unusedAmount).toBe('30000.00');

    const later = await newBill(vendor, '12000');
    const credits = (await admin.get(`${API}/bills/${later.id}/available-credits`).expect(200)).body as BillAvailableCreditsDto;
    expect(credits).toEqual({
      payments: [{ id: advance.id, number: advance.number, paymentDate: today, unusedAmount: '30000.00' }],
      total: '30000.00',
    });

    const beyond = await admin.post(`${API}/bills/${later.id}/apply-credits`).send({ payments: [{ paymentId: advance.id, amount: '12000.01' }] }).expect(400);
    expect(beyond.body.error.details[0]).toMatchObject({ path: 'payments' });

    const applied = (await admin.post(`${API}/bills/${later.id}/apply-credits`).send({ payments: [{ paymentId: advance.id, amount: '12000' }] }).expect(200))
      .body as BillDto;
    expect(applied).toMatchObject({ amountPaid: '12000.00', balanceDue: '0.00', displayStatus: 'paid' });
    expect(applied.payments).toEqual([expect.objectContaining({ paymentId: advance.id, amount: '12000.00' })]);
    expect(await summary(vendor)).toEqual({ outstandingPayables: '0.00', unusedCredits: '18000.00' });

    const tooMuch = await admin.post(`${API}/payments-made/${advance.id}/refunds`).send({ refundDate: today, amount: '18000.01' }).expect(400);
    expect(tooMuch.body.error.details[0]).toMatchObject({ path: 'amount' });
    const refunded = (
      await admin.post(`${API}/payments-made/${advance.id}/refunds`).send({ refundDate: today, amount: '8000', paymentModeId: bank.id, referenceNumber: 'RF-77' }).expect(201)
    ).body as PaymentMadeDto;
    expect(refunded).toMatchObject({ amountApplied: '12000.00', amountRefunded: '8000.00', unusedAmount: '10000.00' });
    expect(refunded.refunds).toEqual([expect.objectContaining({ amount: '8000.00', referenceNumber: 'RF-77', paymentMode: { id: bank.id, name: 'Bank Transfer' } })]);
    expect(await summary(vendor)).toEqual({ outstandingPayables: '0.00', unusedCredits: '10000.00' });

    // The payment can no longer be cut below what was applied and refunded.
    const lowered = await admin
      .put(`${API}/payments-made/${advance.id}`)
      .send({ vendorId: vendor.id, paymentDate: today, amount: '15000', allocations: [{ billId: later.id, amount: '12000' }] })
      .expect(400);
    expect(lowered.body.error.details[0]).toMatchObject({ path: 'amount' });

    const restored = (await admin.delete(`${API}/payments-made/${advance.id}/refunds/${refunded.refunds[0]?.id}`).expect(200)).body as PaymentMadeDto;
    expect(restored.unusedAmount).toBe('18000.00');

    const sales = await signInAsRole(app, 'Sales');
    await sales.post(`${API}/payments-made/${advance.id}/refunds`).send({ refundDate: today, amount: '1' }).expect(403);
  });

  it('lists with overdue status tabs, searches and protects vendors in use', async () => {
    const vendor = await newVendor();
    const overdue = await newBill(vendor, '1000', { billDate: addDays(today, -40), dueDate: addDays(today, -10) });
    await newBill(vendor, '2000');

    const counts = (await admin.get(`${API}/bills/status-counts`).query({ vendorId: vendor.id }).expect(200)).body;
    expect(counts).toMatchObject({ all: 2, open: 1, overdue: 1, paid: 0 });
    const list = (await admin.get(`${API}/bills`).query({ vendorId: vendor.id, status: 'overdue' }).expect(200)).body as Paginated<BillListItemDto>;
    expect(list.data.map((row) => row.id)).toEqual([overdue.id]);

    const results = (await admin.get(`${API}/search`).query({ q: overdue.billNumber }).expect(200)).body as SearchResultsDto;
    expect(results.bills.map((row) => row.id)).toEqual([overdue.id]);
    expect((await admin.delete(`${API}/vendors/${vendor.id}`).expect(409)).body.error.code).toBe('CONTACT_HAS_TRANSACTIONS');

    const customer = (await admin.post(`${API}/customers`).send({ displayName: unique('Customer') }).expect(201)).body as ContactDto;
    const notVendor = await admin.post(`${API}/bills`).send({ ...billBody(vendor, '10'), vendorId: customer.id }).expect(400);
    expect(notVendor.body.error.details[0]).toMatchObject({ path: 'vendorId' });
  });

  it('respects role permissions', async () => {
    const vendor = await newVendor();
    const created = await newBill(vendor, '500');
    const sales = await signInAsRole(app, 'Sales');
    await sales.get(`${API}/bills`).expect(403);
    await sales.get(`${API}/payments-made`).expect(403);

    const viewer = await signInAsRole(app, 'Viewer');
    await viewer.get(`${API}/bills/${created.id}`).expect(200);
    await viewer.post(`${API}/bills`).send(billBody(vendor, '10')).expect(403);
    await viewer.post(`${API}/payments-made`).send({ vendorId: vendor.id, paymentDate: today, amount: '10' }).expect(403);
  });
});
