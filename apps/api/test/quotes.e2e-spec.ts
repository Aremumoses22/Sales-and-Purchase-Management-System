import type { NestExpressApplication } from '@nestjs/platform-express';
import { addDays, todayInTimeZone } from '@spms/shared';
import type {
  AuditLogDto,
  ContactDto,
  ItemDto,
  Paginated,
  QuoteDto,
  QuoteListItemDto,
  StatusCountsDto,
  TaxDto,
} from '@spms/shared';
import { API, createTestApp, signIn, signInAsRole, unique, type Agent } from './helpers.js';

describe('Quotes (e2e)', () => {
  let app: NestExpressApplication;
  let admin: Agent;
  let customer: ContactDto;
  let item: ItemDto;
  let tax: TaxDto;
  const today = todayInTimeZone('UTC');

  beforeAll(async () => {
    app = await createTestApp();
    admin = await signIn(app);
    // Quote numbering is asserted below, so pin it to the seeded default.
    await admin.put(`${API}/settings/number-series/quote`).send({ prefix: 'QT-', nextNumber: 1, padding: 5 }).expect(200);
    await admin.put(`${API}/settings/organization`).send({
      name: 'Northwind Trading Ltd',
      currencyCode: 'USD',
      currencySymbol: '$',
      dateFormat: 'dd MMM yyyy',
      fiscalYearStartMonth: 1,
      timezone: 'UTC',
    });

    tax = (await admin.post(`${API}/settings/taxes`).send({ name: unique('GST'), rate: '7.5' }).expect(201)).body;
    customer = (
      await admin
        .post(`${API}/customers`)
        .send({
          displayName: unique('Quote Customer'),
          companyName: 'Quote Customer Ltd',
          email: 'billing@example.test',
          billingAddress: { line1: '5 Harbour Road', city: 'Portside', country: 'United States' },
        })
        .expect(201)
    ).body;
    item = (
      await admin
        .post(`${API}/items`)
        .send({ type: 'goods', name: unique('Quoted item'), sellingPrice: '100', taxId: tax.id, trackInventory: false })
        .expect(201)
    ).body;
  });

  afterAll(async () => {
    await app.close();
  });

  const quotePayload = (overrides: Record<string, unknown> = {}) => ({
    customerId: customer.id,
    quoteDate: today,
    expiryDate: addDays(today, 14),
    referenceNumber: 'PO-8891',
    subject: 'Quarterly supply',
    lines: [
      { itemId: item.id, name: item.name, quantity: '2', rate: '100', taxId: tax.id },
      { name: 'On-site setup', description: 'Half day', quantity: '1', rate: '50', discountType: 'percent', discountValue: '10', taxId: tax.id },
      { name: 'Packaging', quantity: '4', rate: '5' },
    ],
    shippingCharge: '20',
    adjustment: '-3.50',
    customerNotes: 'Thank you for your business.',
    terms: 'Valid for 14 days.',
    ...overrides,
  });

  it('creates a draft quote and computes the same totals as the shared calculator', async () => {
    const quote = (await admin.post(`${API}/quotes`).send(quotePayload()).expect(201)).body as QuoteDto;

    expect(quote.number).toMatch(/^QT-\d{5}$/);
    expect(quote).toMatchObject({
      status: 'draft',
      displayStatus: 'draft',
      subtotal: '265.00',
      discountTotal: '5.00',
      taxTotal: '18.38',
      shippingCharge: '20.00',
      adjustment: '-3.50',
      total: '299.88',
      referenceNumber: 'PO-8891',
      sentAt: null,
    });
    expect(quote.taxBreakdown).toEqual([{ taxId: tax.id, taxName: tax.name, rate: '7.5', amount: '18.38' }]);
    expect(quote.lines).toHaveLength(3);
    expect(quote.lines[0]).toMatchObject({ position: 0, itemId: item.id, quantity: '2', rate: '100.00', amount: '200.00', taxAmount: '15.00' });
    expect(quote.lines[1]).toMatchObject({ discountType: 'percent', discountValue: '10.00', amount: '45.00', taxAmount: '3.38' });
    expect(quote.lines[2]).toMatchObject({ itemId: null, taxId: null, amount: '20.00', taxAmount: '0.00' });
    expect(quote.customer).toMatchObject({ id: customer.id, displayName: customer.displayName });
    expect(quote.customer.billingAddress).toMatchObject({ line1: '5 Harbour Road' });
    expect(quote.createdBy?.name).toBe('Administrator');
  });

  it('saves and marks as sent in one step', async () => {
    const quote = (await admin.post(`${API}/quotes`).send(quotePayload({ saveAs: 'sent' })).expect(201)).body as QuoteDto;
    expect(quote.status).toBe('sent');
    expect(quote.sentAt).not.toBeNull();
  });

  it('validates the document before saving', async () => {
    const noLines = await admin.post(`${API}/quotes`).send(quotePayload({ lines: [] })).expect(400);
    expect(noLines.body.error.details[0]).toMatchObject({ path: 'lines' });

    const badExpiry = await admin.post(`${API}/quotes`).send(quotePayload({ expiryDate: addDays(today, -1) })).expect(400);
    expect(badExpiry.body.error.details[0]).toMatchObject({ path: 'expiryDate' });

    const badTax = await admin
      .post(`${API}/quotes`)
      .send(quotePayload({ lines: [{ name: 'X', quantity: '1', rate: '10', taxId: '0199b5a0-0000-7000-8000-00000000cafe' }] }))
      .expect(400);
    expect(badTax.body.error.details).toEqual([{ path: 'lines.0.taxId', message: 'Select a valid tax' }]);

    const bigDiscount = await admin
      .post(`${API}/quotes`)
      .send(quotePayload({ lines: [{ name: 'X', quantity: '1', rate: '10', discountType: 'amount', discountValue: '15' }] }))
      .expect(400);
    expect(bigDiscount.body.error.details[0]).toMatchObject({ path: 'lines.0.discountValue' });

    const negativeTotal = await admin
      .post(`${API}/quotes`)
      .send(quotePayload({ lines: [{ name: 'X', quantity: '1', rate: '10' }], shippingCharge: '0', adjustment: '-50' }))
      .expect(400);
    expect(negativeTotal.body.error.details).toEqual([
      { path: 'adjustment', message: 'The adjustment makes the total negative' },
    ]);
  });

  it('refuses an inactive or unknown customer', async () => {
    const inactive = (await admin.post(`${API}/customers`).send({ displayName: unique('Dormant') }).expect(201))
      .body as ContactDto;
    await admin.post(`${API}/customers/${inactive.id}/deactivate`).expect(200);

    const res = await admin.post(`${API}/quotes`).send(quotePayload({ customerId: inactive.id })).expect(400);
    expect(res.body.error.details).toEqual([{ path: 'customerId', message: 'Select an active customer' }]);
  });

  it('follows the documented status transitions', async () => {
    const quote = (await admin.post(`${API}/quotes`).send(quotePayload()).expect(201)).body as QuoteDto;
    const url = `${API}/quotes/${quote.id}`;

    expect((await admin.post(`${url}/accept`).expect(409)).body.error.code).toBe('INVALID_QUOTE_STATUS');
    expect(((await admin.post(`${url}/mark-sent`).expect(200)).body as QuoteDto).status).toBe('sent');
    await admin.post(`${url}/mark-sent`).expect(409);
    expect(((await admin.post(`${url}/accept`).expect(200)).body as QuoteDto).status).toBe('accepted');
    expect(((await admin.post(`${url}/decline`).expect(200)).body as QuoteDto).status).toBe('declined');
    expect(((await admin.post(`${url}/accept`).expect(200)).body as QuoteDto).status).toBe('accepted');

    const history = (await admin.get(`${url}/history`).expect(200)).body as AuditLogDto[];
    expect(history.filter((entry) => entry.action === 'status_changed')).toHaveLength(4);
    expect(history.at(-1)?.action).toBe('created');
  });

  it('shows a sent quote past its expiry date as expired', async () => {
    const expired = (
      await admin
        .post(`${API}/quotes`)
        .send(quotePayload({ saveAs: 'sent', quoteDate: addDays(today, -30), expiryDate: addDays(today, -1) }))
        .expect(201)
    ).body as QuoteDto;
    expect(expired.status).toBe('sent');
    expect(expired.displayStatus).toBe('expired');

    const expiredList = (await admin.get(`${API}/quotes`).query({ status: 'expired' }).expect(200))
      .body as Paginated<QuoteListItemDto>;
    expect(expiredList.data.map((row) => row.id)).toContain(expired.id);

    const sentList = (await admin.get(`${API}/quotes`).query({ status: 'sent' }).expect(200))
      .body as Paginated<QuoteListItemDto>;
    expect(sentList.data.map((row) => row.id)).not.toContain(expired.id);

    const counts = (await admin.get(`${API}/quotes/status-counts`).expect(200)).body as StatusCountsDto;
    expect(counts['expired']).toBeGreaterThanOrEqual(1);
    expect(counts['all']).toBe(
      ['draft', 'sent', 'expired', 'accepted', 'declined', 'invoiced'].reduce((sum, key) => sum + (counts[key] ?? 0), 0),
    );
  });

  it('searches and filters the list', async () => {
    const quote = (await admin.post(`${API}/quotes`).send(quotePayload({ referenceNumber: 'REF-UNIQUE-42' })).expect(201))
      .body as QuoteDto;

    const byReference = (await admin.get(`${API}/quotes`).query({ q: 'REF-UNIQUE-42' }).expect(200))
      .body as Paginated<QuoteListItemDto>;
    expect(byReference.data.map((row) => row.id)).toEqual([quote.id]);

    const byNumber = (await admin.get(`${API}/quotes`).query({ q: quote.number }).expect(200))
      .body as Paginated<QuoteListItemDto>;
    expect(byNumber.data.map((row) => row.id)).toEqual([quote.id]);

    const byCustomer = (await admin.get(`${API}/quotes`).query({ customerId: customer.id, pageSize: 100 }).expect(200))
      .body as Paginated<QuoteListItemDto>;
    expect(byCustomer.data.map((row) => row.id)).toContain(quote.id);

    const outOfRange = (await admin
      .get(`${API}/quotes`)
      .query({ dateFrom: addDays(today, 1), dateTo: addDays(today, 5) })
      .expect(200)) as { body: Paginated<QuoteListItemDto> };
    expect(outOfRange.body.data.map((row) => row.id)).not.toContain(quote.id);
  });

  it('edits a quote and recalculates the totals', async () => {
    const quote = (await admin.post(`${API}/quotes`).send(quotePayload()).expect(201)).body as QuoteDto;
    const updated = (
      await admin
        .put(`${API}/quotes/${quote.id}`)
        .send(
          quotePayload({
            lines: [{ itemId: item.id, name: item.name, quantity: '1', rate: '100', taxId: tax.id }],
            shippingCharge: '0',
            adjustment: '0',
            saveAs: 'sent',
          }),
        )
        .expect(200)
    ).body as QuoteDto;

    expect(updated).toMatchObject({ subtotal: '100.00', taxTotal: '7.50', total: '107.50', status: 'sent' });
    expect(updated.lines).toHaveLength(1);

    const history = (await admin.get(`${API}/quotes/${quote.id}/history`).expect(200)).body as AuditLogDto[];
    expect(history[0]?.changes).toMatchObject({ total: { from: '299.88', to: '107.50' } });
  });

  it('clones a quote into a new draft', async () => {
    const quote = (await admin.post(`${API}/quotes`).send(quotePayload({ saveAs: 'sent' })).expect(201)).body as QuoteDto;
    const clone = (await admin.post(`${API}/quotes/${quote.id}/clone`).expect(201)).body as QuoteDto;

    expect(clone.id).not.toBe(quote.id);
    expect(clone.number).not.toBe(quote.number);
    expect(clone).toMatchObject({ status: 'draft', total: quote.total, quoteDate: today });
    expect(clone.lines.map((line) => line.amount)).toEqual(quote.lines.map((line) => line.amount));
  });

  it('gives every quote its own number, even when created at the same moment', async () => {
    const created = await Promise.all(
      Array.from({ length: 5 }, () => admin.post(`${API}/quotes`).send(quotePayload()).expect(201)),
    );
    const numbers = created.map((response) => (response.body as QuoteDto).number);
    expect(new Set(numbers).size).toBe(5);
  });

  it('skips numbers that are already taken after the counter is lowered', async () => {
    const existing = (await admin.get(`${API}/quotes`).query({ pageSize: 1, sort: 'number' }).expect(200))
      .body as Paginated<QuoteListItemDto>;
    const lowest = Number(existing.data[0]?.number.replace('QT-', ''));
    await admin.put(`${API}/settings/number-series/quote`).send({ prefix: 'QT-', nextNumber: lowest, padding: 5 }).expect(200);

    const quote = (await admin.post(`${API}/quotes`).send(quotePayload()).expect(201)).body as QuoteDto;
    expect(Number(quote.number.replace('QT-', ''))).toBeGreaterThan(lowest);
  });

  it('blocks deleting a customer or item that a quote uses', async () => {
    await admin.post(`${API}/quotes`).send(quotePayload()).expect(201);
    expect((await admin.delete(`${API}/customers/${customer.id}`).expect(409)).body.error.code).toBe(
      'CONTACT_HAS_TRANSACTIONS',
    );
    expect((await admin.delete(`${API}/items/${item.id}`).expect(409)).body.error.code).toBe('ITEM_IN_USE');
  });

  it('deletes a quote that has not been invoiced', async () => {
    const quote = (await admin.post(`${API}/quotes`).send(quotePayload()).expect(201)).body as QuoteDto;
    await admin.delete(`${API}/quotes/${quote.id}`).expect(204);
    await admin.get(`${API}/quotes/${quote.id}`).expect(404);
  });

  it('respects role permissions', async () => {
    const viewer = await signInAsRole(app, 'Viewer');
    await viewer.get(`${API}/quotes`).expect(200);
    await viewer.post(`${API}/quotes`).send(quotePayload()).expect(403);

    const sales = await signInAsRole(app, 'Sales');
    const quote = (await sales.post(`${API}/quotes`).send(quotePayload()).expect(201)).body as QuoteDto;
    await sales.post(`${API}/quotes/${quote.id}/mark-sent`).expect(200);
    await sales.get(`${API}/search`).query({ q: customer.displayName.slice(0, 8) }).expect(200);
  });
});
