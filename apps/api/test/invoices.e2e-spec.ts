import type { NestExpressApplication } from '@nestjs/platform-express';
import { addDays, daysBetween, todayInTimeZone } from '@spms/shared';
import type {
  AuditLogDto,
  ContactDto,
  InvoiceDto,
  InvoiceListItemDto,
  ItemDto,
  Paginated,
  PaymentTermDto,
  QuoteDto,
  SearchResultsDto,
  StatusCountsDto,
  StockMovementDto,
  TaxDto,
} from '@spms/shared';
import { API, createTestApp, signIn, signInAsRole, unique, type Agent } from './helpers.js';

describe('Invoices (e2e)', () => {
  let app: NestExpressApplication;
  let admin: Agent;
  let tax: TaxDto;
  let net30: PaymentTermDto;
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
    await admin.put(`${API}/settings/number-series/invoice`).send({ prefix: 'INV-', nextNumber: 1, padding: 5 }).expect(200);
    tax = (await admin.post(`${API}/settings/taxes`).send({ name: unique('VAT'), rate: '7.5' }).expect(201)).body;
    const terms = (await admin.get(`${API}/settings/payment-terms`).expect(200)).body as PaymentTermDto[];
    net30 = terms.find((term) => term.name === 'Net 30') as PaymentTermDto;
  });

  afterAll(async () => {
    await app.close();
  });

  const newCustomer = async (overrides: Record<string, unknown> = {}) =>
    (
      await admin
        .post(`${API}/customers`)
        .send({ displayName: unique('Invoice Customer'), paymentTermId: net30.id, ...overrides })
        .expect(201)
    ).body as ContactDto;

  const newItem = async (openingStock = '50') =>
    (
      await admin
        .post(`${API}/items`)
        .send({
          type: 'goods',
          name: unique('Office Chair'),
          sellingPrice: '1000',
          taxId: tax.id,
          trackInventory: true,
          openingStock,
        })
        .expect(201)
    ).body as ItemDto;

  const payload = (customer: ContactDto, item: ItemDto, overrides: Record<string, unknown> = {}) => ({
    customerId: customer.id,
    invoiceDate: today,
    dueDate: addDays(today, 30),
    paymentTermId: net30.id,
    orderNumber: 'SO-1001',
    subject: 'Office furniture',
    lines: [
      { itemId: item.id, name: item.name, quantity: '3', rate: '1000', taxId: tax.id },
      { name: 'Delivery', quantity: '1', rate: '2500' },
    ],
    shippingCharge: '0',
    adjustment: '0',
    ...overrides,
  });

  const stockOf = async (item: ItemDto) => ((await admin.get(`${API}/items/${item.id}`).expect(200)).body as ItemDto).stockOnHand;
  const receivablesOf = async (customer: ContactDto) =>
    (await admin.get(`${API}/customers/${customer.id}/summary`).expect(200)).body.outstandingReceivables as string;

  it('creates a draft invoice that neither moves stock nor counts as owed', async () => {
    const [customer, item] = await Promise.all([newCustomer(), newItem()]);
    const invoice = (await admin.post(`${API}/invoices`).send(payload(customer, item)).expect(201)).body as InvoiceDto;

    expect(invoice.number).toMatch(/^INV-\d{5}$/);
    expect(invoice).toMatchObject({
      status: 'draft',
      displayStatus: 'draft',
      subtotal: '5500.00',
      taxTotal: '225.00',
      total: '5725.00',
      amountPaid: '0.00',
      balanceDue: '5725.00',
      orderNumber: 'SO-1001',
      quote: null,
    });
    expect(invoice.paymentTerm).toMatchObject({ name: 'Net 30', days: 30 });
    expect(await stockOf(item)).toBe('50');
    expect(await receivablesOf(customer)).toBe('0.00');
  });

  it('takes stock and adds to receivables once marked as sent', async () => {
    const [customer, item] = await Promise.all([newCustomer(), newItem()]);
    const draft = (await admin.post(`${API}/invoices`).send(payload(customer, item)).expect(201)).body as InvoiceDto;

    const sent = (await admin.post(`${API}/invoices/${draft.id}/mark-sent`).expect(200)).body as InvoiceDto;
    expect(sent).toMatchObject({ status: 'sent', displayStatus: 'sent' });
    expect(sent.sentAt).not.toBeNull();
    expect(await stockOf(item)).toBe('47');
    expect(await receivablesOf(customer)).toBe('5725.00');

    const movements = (await admin.get(`${API}/items/${item.id}/stock-movements`).expect(200)).body as StockMovementDto[];
    expect(movements[0]).toMatchObject({ type: 'invoice', quantity: '-3', reason: `Invoice ${draft.number}`, sourceId: draft.id });

    expect((await admin.post(`${API}/invoices/${draft.id}/mark-sent`).expect(409)).body.error.code).toBe('INVALID_INVOICE_STATUS');
  });

  it('re-syncs stock when a sent invoice is edited instead of double counting', async () => {
    const [customer, item] = await Promise.all([newCustomer(), newItem()]);
    const invoice = (await admin.post(`${API}/invoices`).send(payload(customer, item, { saveAs: 'sent' })).expect(201))
      .body as InvoiceDto;
    expect(await stockOf(item)).toBe('47');

    const edited = (
      await admin
        .put(`${API}/invoices/${invoice.id}`)
        .send(payload(customer, item, { lines: [{ itemId: item.id, name: item.name, quantity: '5', rate: '1000', taxId: tax.id }] }))
        .expect(200)
    ).body as InvoiceDto;

    expect(edited).toMatchObject({ status: 'sent', total: '5375.00', balanceDue: '5375.00' });
    expect(await stockOf(item)).toBe('45');
    expect(await receivablesOf(customer)).toBe('5375.00');

    const history = (await admin.get(`${API}/invoices/${invoice.id}/history`).expect(200)).body as AuditLogDto[];
    expect(history[0]?.changes).toMatchObject({ total: { from: '5725.00', to: '5375.00' } });
  });

  it('shows unpaid invoices past their due date as overdue', async () => {
    const [customer, item] = await Promise.all([newCustomer(), newItem()]);
    const overdue = (
      await admin
        .post(`${API}/invoices`)
        .send(payload(customer, item, { invoiceDate: addDays(today, -40), dueDate: addDays(today, -10), saveAs: 'sent' }))
        .expect(201)
    ).body as InvoiceDto;
    expect(overdue.displayStatus).toBe('overdue');

    const filter = async (status: string) =>
      ((await admin.get(`${API}/invoices`).query({ status, customerId: customer.id }).expect(200)).body as Paginated<InvoiceListItemDto>)
        .data.map((row) => row.id);
    expect(await filter('overdue')).toEqual([overdue.id]);
    expect(await filter('sent')).toEqual([]);

    const counts = (await admin.get(`${API}/invoices/status-counts`).query({ customerId: customer.id }).expect(200))
      .body as StatusCountsDto;
    expect(counts).toMatchObject({ all: 1, overdue: 1, sent: 0, draft: 0, paid: 0, partially_paid: 0, void: 0 });
  });

  it('voids a sent invoice, returning its stock and clearing what is owed', async () => {
    const [customer, item] = await Promise.all([newCustomer(), newItem()]);
    const invoice = (await admin.post(`${API}/invoices`).send(payload(customer, item, { saveAs: 'sent' })).expect(201))
      .body as InvoiceDto;

    expect((await admin.delete(`${API}/invoices/${invoice.id}`).expect(409)).body.error.message).toBe(
      'Only draft invoices can be deleted. Void the invoice instead.',
    );

    const voided = (await admin.post(`${API}/invoices/${invoice.id}/void`).send({ reason: 'Raised in error' }).expect(200))
      .body as InvoiceDto;
    expect(voided).toMatchObject({
      status: 'void',
      displayStatus: 'void',
      voidReason: 'Raised in error',
      total: '5725.00',
      balanceDue: '0.00',
    });
    expect(await stockOf(item)).toBe('50');
    expect(await receivablesOf(customer)).toBe('0.00');

    await admin.post(`${API}/invoices/${invoice.id}/void`).send({}).expect(409);
    await admin.put(`${API}/invoices/${invoice.id}`).send(payload(customer, item)).expect(409);
  });

  it('deletes drafts, and refuses to void them', async () => {
    const [customer, item] = await Promise.all([newCustomer(), newItem()]);
    const draft = (await admin.post(`${API}/invoices`).send(payload(customer, item)).expect(201)).body as InvoiceDto;
    expect((await admin.post(`${API}/invoices/${draft.id}/void`).send({}).expect(409)).body.error.message).toBe(
      'Draft invoices are deleted rather than voided',
    );
    await admin.delete(`${API}/invoices/${draft.id}`).expect(204);
    await admin.get(`${API}/invoices/${draft.id}`).expect(404);
  });

  it('validates dates, payment terms and the customer', async () => {
    const [customer, item] = await Promise.all([newCustomer(), newItem()]);

    const badDue = await admin
      .post(`${API}/invoices`)
      .send(payload(customer, item, { dueDate: addDays(today, -1) }))
      .expect(400);
    expect(badDue.body.error.details[0]).toMatchObject({ path: 'dueDate' });

    const badTerm = await admin
      .post(`${API}/invoices`)
      .send(payload(customer, item, { paymentTermId: '0199b5a0-0000-7000-8000-00000000abcd' }))
      .expect(400);
    expect(badTerm.body.error.details).toEqual([{ path: 'paymentTermId', message: 'Select a valid payment term' }]);

    await admin.post(`${API}/customers/${customer.id}/deactivate`).expect(200);
    const inactive = await admin.post(`${API}/invoices`).send(payload(customer, item)).expect(400);
    expect(inactive.body.error.details).toEqual([{ path: 'customerId', message: 'Select an active customer' }]);
  });

  it('converts an accepted quote into a draft invoice, once', async () => {
    const [customer, item] = await Promise.all([newCustomer(), newItem()]);
    const quote = (
      await admin
        .post(`${API}/quotes`)
        .send({
          customerId: customer.id,
          quoteDate: today,
          referenceNumber: 'RFQ-77',
          subject: 'Chairs for the new office',
          lines: [{ itemId: item.id, name: item.name, quantity: '2', rate: '1000', taxId: tax.id }],
          shippingCharge: '500',
          adjustment: '0',
          saveAs: 'sent',
        })
        .expect(201)
    ).body as QuoteDto;

    expect((await admin.post(`${API}/quotes/${quote.id}/convert-to-invoice`).expect(409)).body.error.code).toBe(
      'INVALID_QUOTE_STATUS',
    );
    await admin.post(`${API}/quotes/${quote.id}/accept`).expect(200);

    const invoice = (await admin.post(`${API}/quotes/${quote.id}/convert-to-invoice`).expect(201)).body as InvoiceDto;
    expect(invoice).toMatchObject({
      status: 'draft',
      orderNumber: 'RFQ-77',
      subject: 'Chairs for the new office',
      total: quote.total,
      quote: { id: quote.id, number: quote.number },
      invoiceDate: today,
      dueDate: addDays(today, 30),
    });
    expect(invoice.lines.map((line) => line.amount)).toEqual(quote.lines.map((line) => line.amount));

    const invoiced = (await admin.get(`${API}/quotes/${quote.id}`).expect(200)).body as QuoteDto;
    expect(invoiced).toMatchObject({ status: 'invoiced', invoice: { id: invoice.id, number: invoice.number } });
    await admin.post(`${API}/quotes/${quote.id}/convert-to-invoice`).expect(409);
    await admin.delete(`${API}/quotes/${quote.id}`).expect(409);

    // Deleting the draft invoice frees the quote to be converted again.
    await admin.delete(`${API}/invoices/${invoice.id}`).expect(204);
    const reopened = (await admin.get(`${API}/quotes/${quote.id}`).expect(200)).body as QuoteDto;
    expect(reopened).toMatchObject({ status: 'accepted', invoice: null });
    await admin.post(`${API}/quotes/${quote.id}/convert-to-invoice`).expect(201);
  });

  it('clones an invoice into a draft with the same payment period', async () => {
    const [customer, item] = await Promise.all([newCustomer(), newItem()]);
    const source = (
      await admin
        .post(`${API}/invoices`)
        .send(payload(customer, item, { invoiceDate: addDays(today, -20), dueDate: addDays(today, -5), saveAs: 'sent' }))
        .expect(201)
    ).body as InvoiceDto;

    const clone = (await admin.post(`${API}/invoices/${source.id}/clone`).expect(201)).body as InvoiceDto;
    expect(clone.number).not.toBe(source.number);
    expect(clone).toMatchObject({ status: 'draft', invoiceDate: today, total: source.total });
    expect(daysBetween(clone.invoiceDate, clone.dueDate)).toBe(15);
  });

  it('searches invoices and protects customers and items that are invoiced', async () => {
    const [customer, item] = await Promise.all([newCustomer(), newItem()]);
    const invoice = (
      await admin.post(`${API}/invoices`).send(payload(customer, item, { orderNumber: 'SO-UNIQUE-9', saveAs: 'sent' })).expect(201)
    ).body as InvoiceDto;

    const byOrder = (await admin.get(`${API}/invoices`).query({ q: 'SO-UNIQUE-9' }).expect(200)).body as Paginated<InvoiceListItemDto>;
    expect(byOrder.data.map((row) => row.id)).toEqual([invoice.id]);

    const search = (await admin.get(`${API}/search`).query({ q: invoice.number }).expect(200)).body as SearchResultsDto;
    expect(search.invoices.map((row) => row.id)).toContain(invoice.id);

    expect((await admin.delete(`${API}/customers/${customer.id}`).expect(409)).body.error.code).toBe('CONTACT_HAS_TRANSACTIONS');
    expect((await admin.delete(`${API}/items/${item.id}`).expect(409)).body.error.code).toBe('ITEM_IN_USE');
  });

  it('respects role permissions', async () => {
    const [customer, item] = await Promise.all([newCustomer(), newItem()]);

    const sales = await signInAsRole(app, 'Sales');
    const invoice = (await sales.post(`${API}/invoices`).send(payload(customer, item)).expect(201)).body as InvoiceDto;
    await sales.post(`${API}/invoices/${invoice.id}/mark-sent`).expect(200);
    await sales.post(`${API}/invoices/${invoice.id}/void`).send({}).expect(403);
    await sales.delete(`${API}/invoices/${invoice.id}`).expect(403);

    const viewer = await signInAsRole(app, 'Viewer');
    await viewer.get(`${API}/invoices/${invoice.id}`).expect(200);
    await viewer.post(`${API}/invoices`).send(payload(customer, item)).expect(403);
  });
});
