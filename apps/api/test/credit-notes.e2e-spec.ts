import type { NestExpressApplication } from '@nestjs/platform-express';
import { addDays, todayInTimeZone } from '@spms/shared';
import type {
  AvailableCreditsDto,
  ContactDto,
  CreditNoteDto,
  CreditNoteListItemDto,
  InvoiceDto,
  ItemDto,
  OpenInvoiceDto,
  Paginated,
  PaymentReceivedDto,
} from '@spms/shared';
import { API, createTestApp, signIn, signInAsRole, unique, type Agent } from './helpers.js';

describe('Credit notes (e2e)', () => {
  let app: NestExpressApplication;
  let admin: Agent;
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
  });

  afterAll(async () => {
    await app.close();
  });

  const newCustomer = async () =>
    (await admin.post(`${API}/customers`).send({ displayName: unique('Credit Customer') }).expect(201)).body as ContactDto;

  const newInvoice = async (customer: ContactDto, amount: string, overrides: Record<string, unknown> = {}) =>
    (
      await admin
        .post(`${API}/invoices`)
        .send({
          customerId: customer.id,
          invoiceDate: today,
          dueDate: addDays(today, 30),
          lines: [{ name: 'Office chairs', quantity: '1', rate: amount }],
          saveAs: 'sent',
          ...overrides,
        })
        .expect(201)
    ).body as InvoiceDto;

  const creditNoteBody = (customer: ContactDto, amount: string, overrides: Record<string, unknown> = {}) => ({
    customerId: customer.id,
    creditNoteDate: today,
    reason: 'Damaged in delivery',
    lines: [{ name: 'Office chairs', quantity: '1', rate: amount }],
    saveAs: 'open',
    ...overrides,
  });

  const newCreditNote = async (customer: ContactDto, amount: string, overrides: Record<string, unknown> = {}) =>
    (await admin.post(`${API}/credit-notes`).send(creditNoteBody(customer, amount, overrides)).expect(201)).body as CreditNoteDto;

  const invoice = async (id: string) => (await admin.get(`${API}/invoices/${id}`).expect(200)).body as InvoiceDto;
  const creditNote = async (id: string) => (await admin.get(`${API}/credit-notes/${id}`).expect(200)).body as CreditNoteDto;
  const summary = async (customer: ContactDto) =>
    (await admin.get(`${API}/customers/${customer.id}/summary`).expect(200)).body as {
      outstandingReceivables: string;
      unusedCredits: string;
    };

  it('creates a credit note against an invoice and applies it until the invoice is paid', async () => {
    const customer = await newCustomer();
    const target = await newInvoice(customer, '10000');

    const credit = await newCreditNote(customer, '4000', { invoiceId: target.id });
    expect(credit.number).toMatch(/^CN-\d{5}$/);
    expect(credit).toMatchObject({
      status: 'open',
      displayStatus: 'open',
      total: '4000.00',
      balance: '4000.00',
      invoice: { id: target.id, number: target.number },
    });
    expect(await summary(customer)).toEqual({ outstandingReceivables: '10000.00', unusedCredits: '4000.00' });

    const open = (await admin.get(`${API}/credit-notes/${credit.id}/open-invoices`).expect(200)).body as OpenInvoiceDto[];
    expect(open.map((row) => row.id)).toEqual([target.id]);

    const applied = (
      await admin
        .post(`${API}/credit-notes/${credit.id}/apply`)
        .send({ applications: [{ invoiceId: target.id, amount: '4000' }] })
        .expect(200)
    ).body as CreditNoteDto;
    expect(applied).toMatchObject({ displayStatus: 'closed', amountApplied: '4000.00', balance: '0.00' });
    expect(applied.applications).toEqual([
      expect.objectContaining({ amount: '4000.00', appliedDate: today, invoice: expect.objectContaining({ id: target.id, balanceDue: '6000.00' }) }),
    ]);

    const afterCredit = await invoice(target.id);
    expect(afterCredit).toMatchObject({ amountPaid: '4000.00', balanceDue: '6000.00', displayStatus: 'partially_paid' });
    expect(afterCredit.credits).toEqual([
      expect.objectContaining({ creditNoteId: credit.id, number: credit.number, amount: '4000.00' }),
    ]);
    expect(await summary(customer)).toEqual({ outstandingReceivables: '6000.00', unusedCredits: '0.00' });

    // Paying the rest makes the invoice paid.
    await admin
      .post(`${API}/payments-received`)
      .send({ customerId: customer.id, paymentDate: today, amount: '6000', allocations: [{ invoiceId: target.id, amount: '6000' }] })
      .expect(201);
    expect(await invoice(target.id)).toMatchObject({ balanceDue: '0.00', displayStatus: 'paid' });

    // A fully credited invoice cannot be voided while the credit is applied.
    await admin.post(`${API}/invoices/${target.id}/void`).send({}).expect(409);
  });

  it('splits one credit note across invoices and refuses to apply more than is left or due', async () => {
    const customer = await newCustomer();
    const first = await newInvoice(customer, '1500');
    const second = await newInvoice(customer, '3000');
    const credit = await newCreditNote(customer, '4000');

    const beyondCredit = await admin
      .post(`${API}/credit-notes/${credit.id}/apply`)
      .send({ applications: [{ invoiceId: first.id, amount: '1500' }, { invoiceId: second.id, amount: '2500.01' }] })
      .expect(400);
    expect(beyondCredit.body.error.details[0]).toMatchObject({ path: 'applications' });

    const beyondInvoice = await admin
      .post(`${API}/credit-notes/${credit.id}/apply`)
      .send({ applications: [{ invoiceId: first.id, amount: '1500.01' }] })
      .expect(400);
    expect(beyondInvoice.body.error.details).toEqual([
      { path: 'applications.0.amount', message: `Only 1500.00 is due on invoice ${first.number}` },
    ]);

    const other = await newCustomer();
    const othersInvoice = await newInvoice(other, '500');
    const wrongCustomer = await admin
      .post(`${API}/credit-notes/${credit.id}/apply`)
      .send({ applications: [{ invoiceId: othersInvoice.id, amount: '100' }] })
      .expect(400);
    expect(wrongCustomer.body.error.details[0]).toMatchObject({ path: 'applications.0.invoiceId' });

    const split = (
      await admin
        .post(`${API}/credit-notes/${credit.id}/apply`)
        .send({ applications: [{ invoiceId: first.id, amount: '1500' }, { invoiceId: second.id, amount: '1000' }] })
        .expect(200)
    ).body as CreditNoteDto;
    expect(split).toMatchObject({ amountApplied: '2500.00', balance: '1500.00', displayStatus: 'open' });
    expect((await invoice(first.id)).displayStatus).toBe('paid');
    expect((await invoice(second.id)).balanceDue).toBe('2000.00');

    // Removing an application gives the credit back and restores the invoice balance.
    const firstApplication = split.applications.find((application) => application.invoice.id === first.id);
    const removed = (
      await admin.delete(`${API}/credit-notes/${credit.id}/applications/${firstApplication?.id}`).expect(200)
    ).body as CreditNoteDto;
    expect(removed).toMatchObject({ amountApplied: '1000.00', balance: '3000.00' });
    expect(await invoice(first.id)).toMatchObject({ balanceDue: '1500.00', displayStatus: 'sent' });
  });

  it('applies credit notes and payments together from the invoice', async () => {
    const customer = await newCustomer();
    const payment = (
      await admin.post(`${API}/payments-received`).send({ customerId: customer.id, paymentDate: today, amount: '700' }).expect(201)
    ).body as PaymentReceivedDto;
    const credit = await newCreditNote(customer, '1000');
    const target = await newInvoice(customer, '1500');

    const credits = (await admin.get(`${API}/invoices/${target.id}/available-credits`).expect(200)).body as AvailableCreditsDto;
    expect(credits).toEqual({
      payments: [{ id: payment.id, number: payment.number, paymentDate: today, unusedAmount: '700.00' }],
      creditNotes: [{ id: credit.id, number: credit.number, creditNoteDate: today, balance: '1000.00' }],
      total: '1700.00',
    });

    const tooMuch = await admin
      .post(`${API}/invoices/${target.id}/apply-credits`)
      .send({ payments: [{ paymentId: payment.id, amount: '700' }], creditNotes: [{ creditNoteId: credit.id, amount: '1000' }] })
      .expect(400);
    expect(tooMuch.body.error.details[0]).toMatchObject({ path: 'payments' });

    const applied = (
      await admin
        .post(`${API}/invoices/${target.id}/apply-credits`)
        .send({ payments: [{ paymentId: payment.id, amount: '700' }], creditNotes: [{ creditNoteId: credit.id, amount: '800' }] })
        .expect(200)
    ).body as InvoiceDto;
    expect(applied).toMatchObject({ amountPaid: '1500.00', balanceDue: '0.00', displayStatus: 'paid' });
    expect(applied.credits).toEqual([expect.objectContaining({ creditNoteId: credit.id, amount: '800.00' })]);
    expect(await creditNote(credit.id)).toMatchObject({ amountApplied: '800.00', balance: '200.00' });
    expect(await summary(customer)).toEqual({ outstandingReceivables: '0.00', unusedCredits: '200.00' });
  });

  it('refunds what is left and closes the credit note', async () => {
    const customer = await newCustomer();
    const credit = await newCreditNote(customer, '2500');

    const tooMuch = await admin.post(`${API}/credit-notes/${credit.id}/refunds`).send({ refundDate: today, amount: '2500.01' }).expect(400);
    expect(tooMuch.body.error.details[0]).toMatchObject({ path: 'amount' });

    const refunded = (
      await admin.post(`${API}/credit-notes/${credit.id}/refunds`).send({ refundDate: today, amount: '2500', referenceNumber: 'RF-1' }).expect(201)
    ).body as CreditNoteDto;
    expect(refunded).toMatchObject({ amountRefunded: '2500.00', balance: '0.00', displayStatus: 'closed' });
    expect(refunded.refunds).toEqual([expect.objectContaining({ amount: '2500.00', referenceNumber: 'RF-1' })]);

    await admin.post(`${API}/credit-notes/${credit.id}/refunds`).send({ refundDate: today, amount: '1' }).expect(409);
    // Used credit cannot be voided or have its total cut below what was used.
    await admin.post(`${API}/credit-notes/${credit.id}/void`).send({}).expect(409);
    const lowered = await admin.put(`${API}/credit-notes/${credit.id}`).send(creditNoteBody(customer, '2000')).expect(400);
    expect(lowered.body.error.details[0]).toMatchObject({ path: 'lines' });

    const reopened = (await admin.delete(`${API}/credit-notes/${credit.id}/refunds/${refunded.refunds[0]?.id}`).expect(200)).body as CreditNoteDto;
    expect(reopened).toMatchObject({ balance: '2500.00', displayStatus: 'open' });
  });

  it('returns goods to stock only while an open credit note is marked as a return', async () => {
    const customer = await newCustomer();
    const item = (
      await admin
        .post(`${API}/items`)
        .send({ type: 'goods', name: unique('Desk'), sellingPrice: '900', trackInventory: true, openingStock: '10' })
        .expect(201)
    ).body as ItemDto;
    const stock = async () => ((await admin.get(`${API}/items/${item.id}`).expect(200)).body as ItemDto).stockOnHand;
    const lines = [{ itemId: item.id, name: item.name, quantity: '3', rate: '900' }];

    const draft = await newCreditNote(customer, '0', { lines, returnToStock: true, saveAs: 'draft' });
    expect(draft).toMatchObject({ status: 'draft', total: '2700.00', balance: '2700.00' });
    expect(await stock()).toBe('10');
    expect(await summary(customer)).toMatchObject({ unusedCredits: '0.00' });

    await admin.post(`${API}/credit-notes/${draft.id}/apply`).send({ applications: [{ invoiceId: draft.id, amount: '1' }] }).expect(409);

    const opened = (await admin.post(`${API}/credit-notes/${draft.id}/mark-open`).expect(200)).body as CreditNoteDto;
    expect(opened.status).toBe('open');
    expect(await stock()).toBe('13');

    await admin.put(`${API}/credit-notes/${draft.id}`).send(creditNoteBody(customer, '0', { lines, returnToStock: false })).expect(200);
    expect(await stock()).toBe('10');
    await admin.put(`${API}/credit-notes/${draft.id}`).send(creditNoteBody(customer, '0', { lines, returnToStock: true })).expect(200);
    expect(await stock()).toBe('13');

    const voided = (await admin.post(`${API}/credit-notes/${draft.id}/void`).send({ reason: 'Raised in error' }).expect(200)).body as CreditNoteDto;
    expect(voided).toMatchObject({ status: 'void', displayStatus: 'void', balance: '0.00', voidReason: 'Raised in error' });
    expect(await stock()).toBe('10');
    await admin.delete(`${API}/credit-notes/${draft.id}`).expect(409);
  });

  it('deletes drafts, lists with status tabs and refuses an invoice from another customer', async () => {
    const customer = await newCustomer();
    const other = await newCustomer();
    const othersInvoice = await newInvoice(other, '100');

    const wrongInvoice = await admin
      .post(`${API}/credit-notes`)
      .send(creditNoteBody(customer, '100', { invoiceId: othersInvoice.id }))
      .expect(400);
    expect(wrongInvoice.body.error.details[0]).toMatchObject({ path: 'invoiceId' });

    const draft = await newCreditNote(customer, '100', { saveAs: 'draft' });
    const open = await newCreditNote(customer, '200');

    const counts = (await admin.get(`${API}/credit-notes/status-counts`).query({ customerId: customer.id }).expect(200)).body;
    expect(counts).toEqual({ all: 2, draft: 1, open: 1, closed: 0, void: 0 });
    const list = (await admin.get(`${API}/credit-notes`).query({ customerId: customer.id, status: 'open' }).expect(200))
      .body as Paginated<CreditNoteListItemDto>;
    expect(list.data.map((row) => row.id)).toEqual([open.id]);

    await admin.delete(`${API}/credit-notes/${open.id}`).expect(409);
    await admin.delete(`${API}/credit-notes/${draft.id}`).expect(204);
    expect((await admin.delete(`${API}/customers/${customer.id}`).expect(409)).body.error.code).toBe('CONTACT_HAS_TRANSACTIONS');

    const history = (await admin.get(`${API}/credit-notes/${open.id}/history`).expect(200)).body as { summary: string }[];
    expect(history[0]?.summary).toContain(`Credit note ${open.number}`);
  });

  it('respects role permissions', async () => {
    const customer = await newCustomer();
    const target = await newInvoice(customer, '1000');

    const sales = await signInAsRole(app, 'Sales');
    const credit = (await sales.post(`${API}/credit-notes`).send(creditNoteBody(customer, '300')).expect(201)).body as CreditNoteDto;
    await sales.post(`${API}/credit-notes/${credit.id}/apply`).send({ applications: [{ invoiceId: target.id, amount: '300' }] }).expect(403);
    await sales
      .post(`${API}/invoices/${target.id}/apply-credits`)
      .send({ creditNotes: [{ creditNoteId: credit.id, amount: '300' }] })
      .expect(403);
    await sales.post(`${API}/credit-notes/${credit.id}/void`).send({}).expect(403);

    const viewer = await signInAsRole(app, 'Viewer');
    await viewer.get(`${API}/credit-notes/${credit.id}`).expect(200);
    await viewer.post(`${API}/credit-notes`).send(creditNoteBody(customer, '10')).expect(403);
  });
});
