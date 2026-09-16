import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ContactDto, ContactListItemDto, Paginated, PaymentTermDto } from '@spms/shared';
import { API, createTestApp, signIn, signInAsRole, unique, type Agent } from './helpers.js';

describe('Customers (e2e)', () => {
  let app: NestExpressApplication;
  let admin: Agent;

  beforeAll(async () => {
    app = await createTestApp();
    admin = await signIn(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const customerPayload = (displayName: string) => ({
    kind: 'business',
    companyName: `${displayName} Limited`,
    displayName,
    email: 'Accounts@Example.test',
    workPhone: '+1 555 0100',
    billingAddress: { line1: '12 Market Street', city: 'Springfield', country: 'United States' },
    shippingAddress: { line1: 'Warehouse 4', city: 'Springfield', country: 'United States' },
    contactPersons: [
      { firstName: 'Dana', lastName: 'Reed', email: 'dana@example.test', isPrimary: true },
      { firstName: 'Sam', lastName: 'Price' },
    ],
  });

  it('creates a customer with addresses and contact people', async () => {
    const name = unique('Acme');
    const res = await admin.post(`${API}/customers`).send(customerPayload(name)).expect(201);
    const customer = res.body as ContactDto;

    expect(customer).toMatchObject({
      displayName: name,
      email: 'accounts@example.test',
      isActive: true,
      openingBalance: '0.00',
      mobile: null,
      paymentTerm: null,
    });
    expect(customer.billingAddress).toMatchObject({ line1: '12 Market Street', city: 'Springfield', phone: null });
    expect(customer.contactPersons.map((person) => person.firstName)).toEqual(['Dana', 'Sam']);
    expect(customer.contactPersons[0]?.isPrimary).toBe(true);

    const fetched = (await admin.get(`${API}/customers/${customer.id}`).expect(200)).body as ContactDto;
    expect(fetched.id).toBe(customer.id);
    expect((await admin.get(`${API}/customers/${customer.id}/summary`).expect(200)).body).toEqual({
      outstandingReceivables: '0.00',
      unusedCredits: '0.00',
    });
  });

  it('refuses a duplicate display name regardless of case', async () => {
    const name = unique('Globex');
    await admin.post(`${API}/customers`).send(customerPayload(name)).expect(201);
    const res = await admin.post(`${API}/customers`).send(customerPayload(name.toUpperCase())).expect(400);
    expect(res.body.error.details).toEqual([
      { path: 'displayName', message: 'A customer with this display name already exists' },
    ]);
  });

  it('validates required fields and references', async () => {
    const missingName = await admin.post(`${API}/customers`).send({ displayName: '  ' }).expect(400);
    expect(missingName.body.error.details[0]).toMatchObject({ path: 'displayName' });

    const badTerm = await admin
      .post(`${API}/customers`)
      .send({ displayName: unique('Bad'), paymentTermId: '0199b5a0-0000-7000-8000-00000000dead' })
      .expect(400);
    expect(badTerm.body.error.details).toEqual([{ path: 'paymentTermId', message: 'Select a valid payment term' }]);
  });

  it('searches, paginates and filters by status', async () => {
    const name = unique('Initech');
    const created = (await admin.post(`${API}/customers`).send(customerPayload(name)).expect(201)).body as ContactDto;

    const found = (await admin.get(`${API}/customers`).query({ q: name.split(' ')[1], pageSize: 5 }).expect(200))
      .body as Paginated<ContactListItemDto>;
    expect(found.data.some((row) => row.id === created.id)).toBe(true);
    expect(found.meta).toMatchObject({ page: 1, pageSize: 5 });

    const byCompany = (await admin.get(`${API}/customers`).query({ q: `${name} Limited` }).expect(200))
      .body as Paginated<ContactListItemDto>;
    expect(byCompany.data.some((row) => row.id === created.id)).toBe(true);

    await admin.post(`${API}/customers/${created.id}/deactivate`).expect(200);
    const active = (await admin.get(`${API}/customers`).query({ q: name }).expect(200)).body as Paginated<ContactListItemDto>;
    expect(active.data.some((row) => row.id === created.id)).toBe(false);

    const inactive = (await admin.get(`${API}/customers`).query({ q: name, status: 'inactive' }).expect(200))
      .body as Paginated<ContactListItemDto>;
    expect(inactive.data.map((row) => row.id)).toContain(created.id);

    await admin.post(`${API}/customers/${created.id}/activate`).expect(200);
  });

  it('updates a customer and records what changed', async () => {
    const name = unique('Umbrella');
    const created = (await admin.post(`${API}/customers`).send(customerPayload(name)).expect(201)).body as ContactDto;
    const terms = (await admin.get(`${API}/settings/payment-terms`).expect(200)).body as PaymentTermDto[];
    const net30 = terms.find((term) => term.name === 'Net 30');

    const updated = (
      await admin
        .put(`${API}/customers/${created.id}`)
        .send({
          ...customerPayload(name),
          mobile: '+1 555 0111',
          paymentTermId: net30?.id,
          openingBalance: '250.50',
          contactPersons: [{ firstName: 'Dana', lastName: 'Reed', email: 'dana@example.test', isPrimary: true }],
        })
        .expect(200)
    ).body as ContactDto;

    expect(updated).toMatchObject({ mobile: '+1 555 0111', openingBalance: '250.50' });
    expect(updated.paymentTerm).toMatchObject({ name: 'Net 30', days: 30 });
    expect(updated.contactPersons).toHaveLength(1);
    expect((await admin.get(`${API}/customers/${created.id}/summary`).expect(200)).body.outstandingReceivables).toBe('250.50');

    const history = (await admin.get(`${API}/customers/${created.id}/history`).expect(200)).body as {
      action: string;
      changes: Record<string, { from: unknown; to: unknown }> | null;
    }[];
    expect(history.map((entry) => entry.action)).toEqual(['updated', 'created']);
    expect(history[0]?.changes).toMatchObject({
      mobile: { from: null, to: '+1 555 0111' },
      openingBalance: { from: '0.00', to: '250.50' },
      paymentTerm: { from: null, to: 'Net 30' },
    });
  });

  it('deletes an unused customer', async () => {
    const created = (await admin.post(`${API}/customers`).send(customerPayload(unique('Temp'))).expect(201))
      .body as ContactDto;
    await admin.delete(`${API}/customers/${created.id}`).expect(204);
    await admin.get(`${API}/customers/${created.id}`).expect(404);
  });

  it('keeps a payment term that a customer uses', async () => {
    const term = (
      await admin.post(`${API}/settings/payment-terms`).send({ name: unique('Net 21'), days: 21 }).expect(201)
    ).body as PaymentTermDto;
    await admin
      .post(`${API}/customers`)
      .send({ ...customerPayload(unique('Termed')), paymentTermId: term.id })
      .expect(201);

    const res = await admin.delete(`${API}/settings/payment-terms/${term.id}`).expect(409);
    expect(res.body.error.code).toBe('IN_USE');
  });

  it('lets a Viewer read but not change customers', async () => {
    const viewer = await signInAsRole(app, 'Viewer');
    await viewer.get(`${API}/customers`).expect(200);
    expect((await viewer.post(`${API}/customers`).send(customerPayload(unique('Nope'))).expect(403)).body.error.code).toBe(
      'FORBIDDEN',
    );
  });
});
