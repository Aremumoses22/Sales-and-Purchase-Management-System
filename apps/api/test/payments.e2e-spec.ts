import type { NestExpressApplication } from '@nestjs/platform-express';
import { addDays, todayInTimeZone } from '@spms/shared';
import type {
  AvailableCreditsDto,
  ContactDto,
  InvoiceDto,
  ItemDto,
  OpenInvoiceDto,
  PaymentModeDto,
  PaymentReceivedDto,
} from '@spms/shared';
import { API, createTestApp, signIn, signInAsRole, unique, type Agent } from './helpers.js';

describe('Payments received (e2e)', () => {
  let app: NestExpressApplication;
  let admin: Agent;
  let bankTransfer: PaymentModeDto;
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
    await admin.put(`${API}/settings/number-series/payment_received`).send({ prefix: 'PAY-', nextNumber: 1, padding: 5 }).expect(200);
    const modes = (await admin.get(`${API}/settings/payment-modes`).expect(200)).body as PaymentModeDto[];
    bankTransfer = modes.find((mode) => mode.name === 'Bank Transfer') as PaymentModeDto;
  });

  afterAll(async () => {
    await app.close();
  });

  const newCustomer = async () =>
    (await admin.post(`${API}/customers`).send({ displayName: unique('Paying Customer') }).expect(201)).body as ContactDto;

  const newInvoice = async (customer: ContactDto, amount: string, overrides: Record<string, unknown> = {}) =>
    (
      await admin
        .post(`${API}/invoices`)
        .send({
          customerId: customer.id,
          invoiceDate: today,
          dueDate: addDays(today, 30),
          lines: [{ name: 'Consulting', quantity: '1', rate: amount }],
          saveAs: 'sent',
          ...overrides,
        })
        .expect(201)
    ).body as InvoiceDto;

  const pay = (customer: ContactDto, amount: string, allocations: { invoiceId: string; amount: string }[]) =>
    admin.post(`${API}/payments-received`).send({
      customerId: customer.id,
      paymentDate: today,
      amount,
      paymentModeId: bankTransfer.id,
      referenceNumber: 'TRF-001',
      allocations,
    });

  const invoice = async (id: string) => (await admin.get(`${API}/invoices/${id}`).expect(200)).body as InvoiceDto;
  const summary = async (customer: ContactDto) =>
    (await admin.get(`${API}/customers/${customer.id}/summary`).expect(200)).body as {
      outstandingReceivables: string;
      unusedCredits: string;
    };

  it('records a partial payment against an invoice', async () => {
    const customer = await newCustomer();
    const target = await newInvoice(customer, '10000');

    const payment = (await pay(customer, '4000', [{ invoiceId: target.id, amount: '4000' }]).expect(201)).body as PaymentReceivedDto;
    expect(payment.number).toMatch(/^PAY-\d{5}$/);
    expect(payment).toMatchObject({ amount: '4000.00', amountApplied: '4000.00', unusedAmount: '0.00', paymentMode: { name: 'Bank Transfer' } });
    expect(payment.allocations).toHaveLength(1);

    const updated = await invoice(target.id);
    expect(updated).toMatchObject({ amountPaid: '4000.00', balanceDue: '6000.00', displayStatus: 'partially_paid' });
    expect(updated.payments).toEqual([
      expect.objectContaining({ paymentId: payment.id, number: payment.number, amount: '4000.00', paymentMode: 'Bank Transfer' }),
    ]);
    expect(await summary(customer)).toEqual({ outstandingReceivables: '6000.00', unusedCredits: '0.00' });
  });

  it('pays several invoices and keeps the excess as unused credit', async () => {
    const customer = await newCustomer();
    const first = await newInvoice(customer, '3000');
    const second = await newInvoice(customer, '2000');

    const payment = (
      await pay(customer, '6500', [
        { invoiceId: first.id, amount: '3000' },
        { invoiceId: second.id, amount: '2000' },
      ]).expect(201)
    ).body as PaymentReceivedDto;

    expect(payment).toMatchObject({ amountApplied: '5000.00', unusedAmount: '1500.00' });
    expect((await invoice(first.id)).displayStatus).toBe('paid');
    expect((await invoice(second.id)).displayStatus).toBe('paid');
    expect(await summary(customer)).toEqual({ outstandingReceivables: '0.00', unusedCredits: '1500.00' });
  });

  it('refuses allocations that break the rules', async () => {
    const customer = await newCustomer();
    const other = await newCustomer();
    const target = await newInvoice(customer, '1000');
    const othersInvoice = await newInvoice(other, '1000');

    const tooMuch = await pay(customer, '5000', [{ invoiceId: target.id, amount: '1000.01' }]).expect(400);
    expect(tooMuch.body.error.details).toEqual([
      { path: 'allocations.0.amount', message: `Only 1000.00 is due on invoice ${target.number}` },
    ]);

    const wrongCustomer = await pay(customer, '500', [{ invoiceId: othersInvoice.id, amount: '500' }]).expect(400);
    expect(wrongCustomer.body.error.details[0]).toMatchObject({ path: 'allocations.0.invoiceId' });

    const moreThanReceived = await pay(customer, '100', [{ invoiceId: target.id, amount: '200' }]).expect(400);
    expect(moreThanReceived.body.error.details[0]).toMatchObject({ path: 'allocations' });

    const voidable = await newInvoice(customer, '700');
    await admin.post(`${API}/invoices/${voidable.id}/void`).send({}).expect(200);
    const toVoid = await pay(customer, '700', [{ invoiceId: voidable.id, amount: '700' }]).expect(400);
    expect(toVoid.body.error.details[0]).toMatchObject({ path: 'allocations.0.invoiceId' });

    // Nothing was saved by the failed attempts.
    expect((await invoice(target.id)).amountPaid).toBe('0.00');
  });

  it('marks a draft invoice as sent, taking its stock, when a payment is recorded against it', async () => {
    const customer = await newCustomer();
    const item = (
      await admin
        .post(`${API}/items`)
        .send({ type: 'goods', name: unique('Printer'), sellingPrice: '800', trackInventory: true, openingStock: '10' })
        .expect(201)
    ).body as ItemDto;
    const draft = await newInvoice(customer, '800', {
      saveAs: 'draft',
      lines: [{ itemId: item.id, name: item.name, quantity: '2', rate: '400' }],
    });
    expect(draft.status).toBe('draft');

    await pay(customer, '800', [{ invoiceId: draft.id, amount: '800' }]).expect(201);
    expect(await invoice(draft.id)).toMatchObject({ status: 'sent', displayStatus: 'paid' });
    expect(((await admin.get(`${API}/items/${item.id}`).expect(200)).body as ItemDto).stockOnHand).toBe('8');
  });

  it('moves a payment to another invoice when it is edited', async () => {
    const customer = await newCustomer();
    const first = await newInvoice(customer, '2000');
    const second = await newInvoice(customer, '2000');
    const payment = (await pay(customer, '1500', [{ invoiceId: first.id, amount: '1500' }]).expect(201)).body as PaymentReceivedDto;

    const edited = (
      await admin
        .put(`${API}/payments-received/${payment.id}`)
        .send({ customerId: customer.id, paymentDate: today, amount: '1500', allocations: [{ invoiceId: second.id, amount: '1000' }] })
        .expect(200)
    ).body as PaymentReceivedDto;

    expect(edited).toMatchObject({ amountApplied: '1000.00', unusedAmount: '500.00' });
    expect(await invoice(first.id)).toMatchObject({ amountPaid: '0.00', balanceDue: '2000.00', displayStatus: 'sent' });
    expect(await invoice(second.id)).toMatchObject({ amountPaid: '1000.00', balanceDue: '1000.00' });
  });

  it('deletes a payment and restores the invoice balances', async () => {
    const customer = await newCustomer();
    const target = await newInvoice(customer, '2500');
    const payment = (await pay(customer, '2500', [{ invoiceId: target.id, amount: '2500' }]).expect(201)).body as PaymentReceivedDto;

    expect((await admin.post(`${API}/invoices/${target.id}/void`).send({}).expect(409)).body.error.message).toBe(
      'Remove the payments and credits applied to this invoice before voiding it',
    );

    await admin.delete(`${API}/payments-received/${payment.id}`).expect(204);
    expect(await invoice(target.id)).toMatchObject({ amountPaid: '0.00', balanceDue: '2500.00', displayStatus: 'sent', payments: [] });
    await admin.post(`${API}/invoices/${target.id}/void`).send({}).expect(200);
  });

  it('refunds unused money and never more than is unused', async () => {
    const customer = await newCustomer();
    const target = await newInvoice(customer, '1000');
    const payment = (await pay(customer, '1800', [{ invoiceId: target.id, amount: '1000' }]).expect(201)).body as PaymentReceivedDto;

    const tooMuch = await admin
      .post(`${API}/payments-received/${payment.id}/refunds`)
      .send({ refundDate: today, amount: '800.01' })
      .expect(400);
    expect(tooMuch.body.error.details).toEqual([{ path: 'amount', message: 'Only 800.00 of this payment is unused' }]);

    const refunded = (
      await admin
        .post(`${API}/payments-received/${payment.id}/refunds`)
        .send({ refundDate: today, amount: '300', paymentModeId: bankTransfer.id, referenceNumber: 'RF-9' })
        .expect(201)
    ).body as PaymentReceivedDto;
    expect(refunded).toMatchObject({ amountRefunded: '300.00', unusedAmount: '500.00' });
    expect(await summary(customer)).toMatchObject({ unusedCredits: '500.00' });

    const lowered = await admin
      .put(`${API}/payments-received/${payment.id}`)
      .send({ customerId: customer.id, paymentDate: today, amount: '1200', allocations: [{ invoiceId: target.id, amount: '1000' }] })
      .expect(400);
    expect(lowered.body.error.details[0]).toMatchObject({ path: 'amount' });

    const restored = (
      await admin.delete(`${API}/payments-received/${payment.id}/refunds/${refunded.refunds[0]?.id}`).expect(200)
    ).body as PaymentReceivedDto;
    expect(restored).toMatchObject({ amountRefunded: '0.00', unusedAmount: '800.00', refunds: [] });
  });

  it('applies unused credit to a later invoice', async () => {
    const customer = await newCustomer();
    const payment = (await pay(customer, '5000', []).expect(201)).body as PaymentReceivedDto;
    expect(payment.unusedAmount).toBe('5000.00');

    const later = await newInvoice(customer, '3200');
    const credits = (await admin.get(`${API}/invoices/${later.id}/available-credits`).expect(200)).body as AvailableCreditsDto;
    expect(credits).toEqual({
      payments: [{ id: payment.id, number: payment.number, paymentDate: today, unusedAmount: '5000.00' }],
      total: '5000.00',
    });

    const beyondBalance = await admin
      .post(`${API}/invoices/${later.id}/apply-credits`)
      .send({ payments: [{ paymentId: payment.id, amount: '3200.01' }] })
      .expect(400);
    expect(beyondBalance.body.error.details[0]).toMatchObject({ path: 'payments' });

    const applied = (
      await admin
        .post(`${API}/invoices/${later.id}/apply-credits`)
        .send({ payments: [{ paymentId: payment.id, amount: '2000' }] })
        .expect(200)
    ).body as InvoiceDto;
    expect(applied).toMatchObject({ amountPaid: '2000.00', balanceDue: '1200.00', displayStatus: 'partially_paid' });

    await admin
      .post(`${API}/invoices/${later.id}/apply-credits`)
      .send({ payments: [{ paymentId: payment.id, amount: '1200' }] })
      .expect(200);
    expect(await invoice(later.id)).toMatchObject({ balanceDue: '0.00', displayStatus: 'paid', payments: [expect.objectContaining({ amount: '3200.00' })] });
    expect(((await admin.get(`${API}/payments-received/${payment.id}`).expect(200)).body as PaymentReceivedDto).unusedAmount).toBe('1800.00');
  });

  it('lists open invoices oldest first, counting a payment’s own share when editing it', async () => {
    const customer = await newCustomer();
    const older = await newInvoice(customer, '1000', { invoiceDate: addDays(today, -10), dueDate: addDays(today, 20) });
    const newer = await newInvoice(customer, '2000');
    const payment = (await pay(customer, '1000', [{ invoiceId: older.id, amount: '1000' }]).expect(201)).body as PaymentReceivedDto;

    const open = (await admin.get(`${API}/payments-received/open-invoices`).query({ customerId: customer.id }).expect(200))
      .body as OpenInvoiceDto[];
    expect(open.map((row) => row.id)).toEqual([newer.id]);

    const whileEditing = (
      await admin.get(`${API}/payments-received/open-invoices`).query({ customerId: customer.id, paymentId: payment.id }).expect(200)
    ).body as OpenInvoiceDto[];
    expect(whileEditing.map((row) => [row.number, row.balanceDue, row.allocated])).toEqual([
      [older.number, '1000.00', '1000.00'],
      [newer.number, '2000.00', '0.00'],
    ]);
  });

  it('protects invoices, customers and payment modes that have payments', async () => {
    const customer = await newCustomer();
    const target = await newInvoice(customer, '5000');
    await pay(customer, '3000', [{ invoiceId: target.id, amount: '3000' }]).expect(201);

    const lowered = await admin
      .put(`${API}/invoices/${target.id}`)
      .send({ customerId: customer.id, invoiceDate: today, dueDate: addDays(today, 30), lines: [{ name: 'Consulting', quantity: '1', rate: '2000' }] })
      .expect(400);
    expect(lowered.body.error.details[0]).toMatchObject({ path: 'lines' });

    const other = await newCustomer();
    const moved = await admin
      .put(`${API}/invoices/${target.id}`)
      .send({ customerId: other.id, invoiceDate: today, dueDate: addDays(today, 30), lines: [{ name: 'Consulting', quantity: '1', rate: '5000' }] })
      .expect(400);
    expect(moved.body.error.details[0]).toMatchObject({ path: 'customerId' });

    expect((await admin.delete(`${API}/customers/${customer.id}`).expect(409)).body.error.code).toBe('CONTACT_HAS_TRANSACTIONS');
    expect((await admin.delete(`${API}/settings/payment-modes/${bankTransfer.id}`).expect(409)).body.error.code).toBe('IN_USE');
  });

  it('respects role permissions', async () => {
    const customer = await newCustomer();
    const target = await newInvoice(customer, '1000');

    const sales = await signInAsRole(app, 'Sales');
    const payment = (
      await sales
        .post(`${API}/payments-received`)
        .send({ customerId: customer.id, paymentDate: today, amount: '1200', allocations: [{ invoiceId: target.id, amount: '1000' }] })
        .expect(201)
    ).body as PaymentReceivedDto;
    await sales.post(`${API}/payments-received/${payment.id}/refunds`).send({ refundDate: today, amount: '100' }).expect(403);
    await sales.delete(`${API}/payments-received/${payment.id}`).expect(403);

    const viewer = await signInAsRole(app, 'Viewer');
    await viewer.get(`${API}/payments-received/${payment.id}`).expect(200);
    await viewer.post(`${API}/payments-received`).send({ customerId: customer.id, paymentDate: today, amount: '10' }).expect(403);
  });
});
