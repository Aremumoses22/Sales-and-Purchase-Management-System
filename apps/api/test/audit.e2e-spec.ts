import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AuditLogEntryDto, AuditLogFiltersDto, ContactDto, Paginated } from '@spms/shared';
import { API, createTestApp, signIn, signInAsRole, unique, type Agent } from './helpers.js';

describe('Audit log (e2e)', () => {
  let app: NestExpressApplication;
  let admin: Agent;

  beforeAll(async () => {
    app = await createTestApp();
    admin = await signIn(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists every change newest first with filters', async () => {
    const name = unique('Audited Customer');
    const customer = (await admin.post(`${API}/customers`).send({ displayName: name }).expect(201)).body as ContactDto;
    await admin.put(`${API}/customers/${customer.id}`).send({ displayName: name, notes: 'Pays by transfer' }).expect(200);

    const found = (await admin.get(`${API}/audit-logs`).query({ q: name, pageSize: 10 }).expect(200)).body as Paginated<AuditLogEntryDto>;
    expect(found.data.map((entry) => entry.action)).toEqual(['updated', 'created']);
    expect(found.data[0]).toMatchObject({
      entityType: 'customer',
      entityId: customer.id,
      user: { name: 'Administrator' },
      changes: { notes: { from: null, to: 'Pays by transfer' } },
    });

    const created = (await admin.get(`${API}/audit-logs`).query({ q: name, action: 'created', entityType: 'customer' }).expect(200))
      .body as Paginated<AuditLogEntryDto>;
    expect(created.meta.total).toBe(1);

    const today = found.data[0]?.createdAt.slice(0, 10) as string;
    const byDate = (await admin.get(`${API}/audit-logs`).query({ q: name, dateFrom: today, dateTo: today }).expect(200))
      .body as Paginated<AuditLogEntryDto>;
    expect(byDate.meta.total).toBe(2);
    const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const none = (await admin.get(`${API}/audit-logs`).query({ q: name, dateFrom: tomorrow }).expect(200)).body as Paginated<AuditLogEntryDto>;
    expect(none.meta.total).toBe(0);

    const filters = (await admin.get(`${API}/audit-logs/filters`).expect(200)).body as AuditLogFiltersDto;
    expect(filters.entityTypes).toContain('customer');
    expect(filters.actions).toEqual(expect.arrayContaining(['created', 'updated']));
    expect(filters.users.map((user) => user.name)).toContain('Administrator');
  });

  it('is only for users allowed to view the audit log', async () => {
    const viewer = await signInAsRole(app, 'Viewer');
    await viewer.get(`${API}/audit-logs`).expect(403);
    const accountant = await signInAsRole(app, 'Accountant');
    await accountant.get(`${API}/audit-logs`).expect(200);
  });
});
