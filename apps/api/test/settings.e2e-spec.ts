import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PaymentTermDto, TaxDto } from '@spms/shared';
import request from 'supertest';
import { API, createTestApp, signIn, unique, type Agent } from './helpers.js';

describe('Settings (e2e)', () => {
  let app: NestExpressApplication;
  let admin: Agent;

  beforeAll(async () => {
    app = await createTestApp();
    admin = await signIn(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const organization = {
    name: 'Northwind Trading Ltd',
    email: 'Hello@Northwind.test',
    currencyCode: 'gbp',
    currencySymbol: '£',
    dateFormat: 'dd/MM/yyyy',
    fiscalYearStartMonth: 4,
    timezone: 'Europe/London',
  };

  it('updates the organization profile', async () => {
    const res = await admin.put(`${API}/settings/organization`).send(organization).expect(200);
    expect(res.body).toMatchObject({
      name: 'Northwind Trading Ltd',
      email: 'hello@northwind.test',
      currencyCode: 'GBP',
      fiscalYearStartMonth: 4,
      phone: null,
      hasLogo: false,
    });
  });

  it('rejects an unknown time zone with a field error', async () => {
    const res = await admin.put(`${API}/settings/organization`).send({ ...organization, timezone: 'Mars/Olympus' }).expect(400);
    expect(res.body.error.details).toEqual([{ path: 'timezone', message: 'Select a valid time zone' }]);
  });

  it('changes document numbering and shows the next number', async () => {
    const res = await admin.put(`${API}/settings/number-series/quote`).send({ prefix: 'Q-', nextNumber: 7, padding: 3 }).expect(200);
    expect(res.body).toMatchObject({ documentType: 'quote', preview: 'Q-007' });
    expect((await admin.get(`${API}/settings/number-series/quote`).expect(200)).body.preview).toBe('Q-007');
    await admin.put(`${API}/settings/number-series/unknown`).send({ prefix: 'X', nextNumber: 1, padding: 1 }).expect(400);
    await admin.put(`${API}/settings/number-series/quote`).send({ prefix: 'QT-', nextNumber: 1, padding: 5 }).expect(200);
  });

  it('manages taxes with case-insensitive unique names', async () => {
    const name = unique('VAT');
    const created = await admin.post(`${API}/settings/taxes`).send({ name, rate: '7.5' }).expect(201);
    expect(created.body).toMatchObject({ name, rate: '7.5', isActive: true });

    const duplicate = await admin.post(`${API}/settings/taxes`).send({ name: name.toLowerCase(), rate: '5' }).expect(400);
    expect(duplicate.body.error.details[0].path).toBe('name');

    const updated = await admin.put(`${API}/settings/taxes/${created.body.id}`).send({ name, rate: '10', isActive: false }).expect(200);
    expect(updated.body.rate).toBe('10');

    const active = (await admin.get(`${API}/settings/taxes`).expect(200)).body as TaxDto[];
    expect(active.some((tax) => tax.id === created.body.id)).toBe(false);
    const all = (await admin.get(`${API}/settings/taxes?includeInactive=true`).expect(200)).body as TaxDto[];
    expect(all.some((tax) => tax.id === created.body.id)).toBe(true);

    await admin.delete(`${API}/settings/taxes/${created.body.id}`).expect(204);
  });

  it('keeps exactly one default payment term', async () => {
    const created = await admin.post(`${API}/settings/payment-terms`).send({ name: unique('Net 7'), days: 7, isDefault: true }).expect(201);
    const terms = (await admin.get(`${API}/settings/payment-terms`).expect(200)).body as PaymentTermDto[];
    expect(terms.filter((term) => term.isDefault).map((term) => term.id)).toEqual([created.body.id]);

    // Restore the seeded default so other suites see predictable data.
    const net30 = terms.find((term) => term.name === 'Net 30');
    await admin.put(`${API}/settings/payment-terms/${net30?.id}`).send({ name: 'Net 30', days: 30, isDefault: true }).expect(200);
    await admin.delete(`${API}/settings/payment-terms/${created.body.id}`).expect(204);
  });

  it('uploads, serves and removes the organization logo', async () => {
    const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(32)]);
    const uploaded = await admin.post(`${API}/settings/organization/logo`).attach('file', png, 'logo.png').expect(201);
    expect(uploaded.body.hasLogo).toBe(true);

    const logo = await request(app.getHttpServer()).get(`${API}/settings/organization/logo`).expect(200);
    expect(logo.headers['content-type']).toBe('image/png');

    const text = await admin.post(`${API}/settings/organization/logo`).attach('file', Buffer.from('hello'), 'logo.png').expect(415);
    expect(text.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');

    await admin.delete(`${API}/settings/organization/logo`).expect(204);
    await request(app.getHttpServer()).get(`${API}/settings/organization/logo`).expect(404);
  });
});
