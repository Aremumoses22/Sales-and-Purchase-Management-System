import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ContactDto, ContactListItemDto, ItemDto, Paginated, SearchResultsDto } from '@spms/shared';
import { API, createTestApp, signIn, signInAsRole, unique, type Agent } from './helpers.js';

describe('Vendors (e2e)', () => {
  let app: NestExpressApplication;
  let admin: Agent;

  beforeAll(async () => {
    app = await createTestApp();
    admin = await signIn(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const vendorPayload = (displayName: string, overrides: Record<string, unknown> = {}) => ({
    kind: 'business',
    companyName: `${displayName} Limited`,
    displayName,
    email: 'sales@supplier.test',
    workPhone: '+234 803 000 0000',
    openingBalance: '15000',
    billingAddress: { line1: '4 Creek Road', city: 'Apapa', country: 'Nigeria' },
    contactPersons: [{ firstName: 'Tunde', lastName: 'Bello', isPrimary: true }],
    ...overrides,
  });

  it('manages vendors separately from customers', async () => {
    const name = unique('Dangote Supplies');
    const vendor = (await admin.post(`${API}/vendors`).send(vendorPayload(name)).expect(201)).body as ContactDto;
    expect(vendor).toMatchObject({ displayName: name, openingBalance: '15000.00', isActive: true });

    // The same name can be a customer too, but a vendor is never found under customers.
    await admin.post(`${API}/customers`).send({ displayName: name }).expect(201);
    await admin.get(`${API}/customers/${vendor.id}`).expect(404);
    const duplicate = await admin.post(`${API}/vendors`).send(vendorPayload(name.toLowerCase())).expect(400);
    expect(duplicate.body.error.details[0]).toMatchObject({ path: 'displayName' });

    const list = (await admin.get(`${API}/vendors`).query({ q: name }).expect(200)).body as Paginated<ContactListItemDto>;
    expect(list.data).toEqual([expect.objectContaining({ id: vendor.id, balance: '15000.00' })]);

    expect((await admin.get(`${API}/vendors/${vendor.id}/summary`).expect(200)).body).toEqual({
      outstandingPayables: '15000.00',
      unusedCredits: '0.00',
    });

    const updated = (
      await admin.put(`${API}/vendors/${vendor.id}`).send(vendorPayload(name, { workPhone: '+234 803 111 1111' })).expect(200)
    ).body as ContactDto;
    expect(updated.workPhone).toBe('+234 803 111 1111');
    await admin.post(`${API}/vendors/${vendor.id}/deactivate`).expect(200);
    const history = (await admin.get(`${API}/vendors/${vendor.id}/history`).expect(200)).body as { summary: string }[];
    expect(history.map((entry) => entry.summary)).toEqual(
      expect.arrayContaining([`Vendor ${name} created`, `Vendor ${name} marked as inactive`]),
    );
  });

  it('links an item to its preferred vendor and finds vendors in search', async () => {
    const name = unique('Lagos Timber');
    const vendor = (await admin.post(`${API}/vendors`).send(vendorPayload(name)).expect(201)).body as ContactDto;
    const customer = (await admin.post(`${API}/customers`).send({ displayName: unique('Not a vendor') }).expect(201)).body as ContactDto;

    const item = (
      await admin
        .post(`${API}/items`)
        .send({ type: 'goods', name: unique('Plywood sheet'), costPrice: '9000', preferredVendorId: vendor.id })
        .expect(201)
    ).body as ItemDto;
    expect(item.preferredVendor).toEqual({ id: vendor.id, displayName: name });

    const wrong = await admin
      .post(`${API}/items`)
      .send({ type: 'goods', name: unique('Nails'), preferredVendorId: customer.id })
      .expect(400);
    expect(wrong.body.error.details[0]).toMatchObject({ path: 'preferredVendorId' });

    const results = (await admin.get(`${API}/search`).query({ q: name }).expect(200)).body as SearchResultsDto;
    expect(results.vendors.map((row) => row.id)).toEqual([vendor.id]);

    // A vendor that is only someone's preferred vendor can still be deleted; the item forgets it.
    await admin.delete(`${API}/vendors/${vendor.id}`).expect(204);
    expect(((await admin.get(`${API}/items/${item.id}`).expect(200)).body as ItemDto).preferredVendor).toBeNull();
  });

  it('respects role permissions', async () => {
    const vendor = (await admin.post(`${API}/vendors`).send(vendorPayload(unique('Ikeja Paper'))).expect(201)).body as ContactDto;

    const sales = await signInAsRole(app, 'Sales');
    await sales.get(`${API}/vendors`).expect(403);
    const results = (await sales.get(`${API}/search`).query({ q: 'Ikeja Paper' }).expect(200)).body as SearchResultsDto;
    expect(results.vendors).toEqual([]);

    const viewer = await signInAsRole(app, 'Viewer');
    await viewer.get(`${API}/vendors/${vendor.id}`).expect(200);
    await viewer.post(`${API}/vendors`).send(vendorPayload(unique('Nope'))).expect(403);
  });
});
