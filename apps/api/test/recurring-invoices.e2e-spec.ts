import type { NestExpressApplication } from '@nestjs/platform-express';
import { addDays, addMonths, todayInTimeZone } from '@spms/shared';
import type {
  ContactDto,
  InvoiceDto,
  InvoiceListItemDto,
  ItemDto,
  Paginated,
  PaymentTermDto,
  RecurringInvoiceDto,
  RecurringInvoiceListItemDto,
} from '@spms/shared';
import { RecurringInvoicesService } from '../src/modules/recurring-invoices/recurring-invoices.service.js';
import { API, createTestApp, signIn, signInAsRole, unique, type Agent } from './helpers.js';

describe('Recurring invoices (e2e)', () => {
  let app: NestExpressApplication;
  let admin: Agent;
  let job: RecurringInvoicesService;
  let net30: PaymentTermDto;
  const today = todayInTimeZone('UTC');

  beforeAll(async () => {
    app = await createTestApp();
    admin = await signIn(app);
    job = app.get(RecurringInvoicesService);
    await admin.put(`${API}/settings/organization`).send({
      name: 'Northwind Trading Ltd',
      currencyCode: 'NGN',
      currencySymbol: '₦',
      dateFormat: 'dd MMM yyyy',
      fiscalYearStartMonth: 1,
      timezone: 'UTC',
    });
    const terms = (await admin.get(`${API}/settings/payment-terms`).expect(200)).body as PaymentTermDto[];
    net30 = terms.find((term) => term.days === 30) as PaymentTermDto;
  });

  afterAll(async () => {
    await app.close();
  });

  const newCustomer = async () =>
    (await admin.post(`${API}/customers`).send({ displayName: unique('Retainer Client') }).expect(201)).body as ContactDto;

  const profileBody = (customer: ContactDto, overrides: Record<string, unknown> = {}) => ({
    name: unique('Monthly retainer'),
    customerId: customer.id,
    repeatEvery: 1,
    repeatUnit: 'month',
    startDate: today,
    lines: [{ name: 'IT support retainer', quantity: '1', rate: '250000' }],
    ...overrides,
  });

  const newProfile = async (customer: ContactDto, overrides: Record<string, unknown> = {}) =>
    (await admin.post(`${API}/recurring-invoices`).send(profileBody(customer, overrides)).expect(201)).body as RecurringInvoiceDto;

  const invoicesOf = async (profile: RecurringInvoiceDto) =>
    (
      (await admin.get(`${API}/invoices`).query({ recurringProfileId: profile.id, sort: 'date', pageSize: 100 }).expect(200))
        .body as Paginated<InvoiceListItemDto>
    ).data;

  const profile = async (id: string) => (await admin.get(`${API}/recurring-invoices/${id}`).expect(200)).body as RecurringInvoiceDto;

  it('creates exactly one invoice per period over a simulated date range, however often the job runs', async () => {
    const customer = await newCustomer();
    const monthly = await newProfile(customer, { paymentTermId: net30.id });
    expect(monthly).toMatchObject({ displayStatus: 'active', nextRunDate: today, total: '250000.00', invoiceCount: 0 });

    // Run the job every day for 100 days, twice a day.
    for (let day = 0; day <= 100; day += 1) {
      await job.runDue(addDays(today, day));
      await job.runDue(addDays(today, day));
    }

    const expected = [0, 1, 2, 3].map((n) => addMonths(today, n)).filter((date) => date <= addDays(today, 100));
    const invoices = await invoicesOf(monthly);
    expect(invoices.map((invoice) => invoice.invoiceDate)).toEqual(expected);
    expect(invoices.map((invoice) => invoice.dueDate)).toEqual(expected.map((date) => addDays(date, 30)));
    expect(invoices.every((invoice) => invoice.status === 'draft' && invoice.total === '250000.00')).toBe(true);

    const after = await profile(monthly.id);
    expect(after).toMatchObject({ invoiceCount: expected.length, nextRunDate: addMonths(today, expected.length) });
    expect(after.lastRunAt).not.toBeNull();
  });

  it('catches up missed periods in one run and never duplicates them, even when runs overlap', async () => {
    const customer = await newCustomer();
    const weekly = await newProfile(customer, { repeatUnit: 'week', repeatEvery: 1 });

    const [first, second] = await Promise.all([job.runDue(addDays(today, 21)), job.runDue(addDays(today, 21))]);
    expect(first.created.length + second.created.length).toBe(4);
    expect((await job.runDue(addDays(today, 21))).created).toHaveLength(0);

    const invoices = await invoicesOf(weekly);
    expect(invoices.map((invoice) => invoice.invoiceDate)).toEqual([0, 7, 14, 21].map((days) => addDays(today, days)));
  });

  it('stops at the end date and shows the profile as expired', async () => {
    const customer = await newCustomer();
    const limited = await newProfile(customer, { endDate: addDays(today, 40) });

    await job.runDue(addDays(today, 200));
    expect(await invoicesOf(limited)).toHaveLength(2);
    expect(await profile(limited.id)).toMatchObject({ displayStatus: 'expired', status: 'active', nextRunDate: null });

    const counts = (await admin.get(`${API}/recurring-invoices/status-counts`).query({ customerId: customer.id }).expect(200)).body;
    expect(counts).toEqual({ all: 1, active: 0, stopped: 0, expired: 1 });
    const expired = (
      await admin.get(`${API}/recurring-invoices`).query({ customerId: customer.id, status: 'expired' }).expect(200)
    ).body as Paginated<RecurringInvoiceListItemDto>;
    expect(expired.data.map((row) => row.id)).toEqual([limited.id]);
  });

  it('creates sent invoices that take stock when the profile says so', async () => {
    const customer = await newCustomer();
    const item = (
      await admin
        .post(`${API}/items`)
        .send({ type: 'goods', name: unique('Water dispenser bottle'), sellingPrice: '1500', trackInventory: true, openingStock: '50' })
        .expect(201)
    ).body as ItemDto;
    const sent = await newProfile(customer, {
      repeatUnit: 'day',
      repeatEvery: 7,
      createAs: 'sent',
      lines: [{ itemId: item.id, name: item.name, quantity: '10', rate: '1500' }],
    });

    const result = await job.runDue(addDays(today, 7));
    expect(result.created.filter((entry) => entry.profileId === sent.id)).toHaveLength(2);
    const invoices = await invoicesOf(sent);
    expect(invoices.every((invoice) => invoice.status === 'sent')).toBe(true);
    expect(((await admin.get(`${API}/items/${item.id}`).expect(200)).body as ItemDto).stockOnHand).toBe('30');
    const summary = (await admin.get(`${API}/customers/${customer.id}/summary`).expect(200)).body;
    expect(summary.outstandingReceivables).toBe('30000.00');

    const invoice = (await admin.get(`${API}/invoices/${invoices[0]?.id}`).expect(200)).body as InvoiceDto;
    expect(invoice.recurringProfile).toEqual({ id: sent.id, name: sent.name });
  });

  it('stops, skips while stopped, and resumes from today without back-billing', async () => {
    const customer = await newCustomer();
    const weekly = await newProfile(customer, { repeatUnit: 'week' });

    const stopped = (await admin.post(`${API}/recurring-invoices/${weekly.id}/stop`).expect(200)).body as RecurringInvoiceDto;
    expect(stopped).toMatchObject({ displayStatus: 'stopped', nextRunDate: null });
    await admin.post(`${API}/recurring-invoices/${weekly.id}/stop`).expect(409);
    await job.runDue(addDays(today, 30));
    expect(await invoicesOf(weekly)).toHaveLength(0);

    const resumed = (await admin.post(`${API}/recurring-invoices/${weekly.id}/resume`).expect(200)).body as RecurringInvoiceDto;
    expect(resumed).toMatchObject({ displayStatus: 'active', nextRunDate: today });
    await job.runDue(today);
    expect(await invoicesOf(weekly)).toHaveLength(1);
  });

  it('creates an invoice on demand without moving the schedule', async () => {
    const customer = await newCustomer();
    const monthly = await newProfile(customer, { startDate: addDays(today, 10), paymentTermId: net30.id });

    const invoice = (await admin.post(`${API}/recurring-invoices/${monthly.id}/create-invoice`).expect(201)).body as InvoiceDto;
    expect(invoice).toMatchObject({ invoiceDate: today, dueDate: addDays(today, 30), status: 'draft', total: '250000.00' });
    expect(invoice.recurringProfile?.id).toBe(monthly.id);
    expect((await profile(monthly.id)).nextRunDate).toBe(addDays(today, 10));

    await job.runDue(addDays(today, 10));
    expect(await invoicesOf(monthly)).toHaveLength(2);
  });

  it('keeps invoiced periods when the profile is edited, validates dates and keeps invoices on delete', async () => {
    const customer = await newCustomer();
    const monthly = await newProfile(customer);
    await job.runDue(today);

    const past = await admin.post(`${API}/recurring-invoices`).send(profileBody(customer, { startDate: addDays(today, -1) })).expect(400);
    expect(past.body.error.details[0]).toMatchObject({ path: 'startDate' });
    const backwards = await admin
      .post(`${API}/recurring-invoices`)
      .send(profileBody(customer, { endDate: addDays(today, -1) }))
      .expect(400);
    expect(backwards.body.error.details[0]).toMatchObject({ path: 'endDate' });

    const edited = (
      await admin
        .put(`${API}/recurring-invoices/${monthly.id}`)
        .send(profileBody(customer, { name: monthly.name, repeatUnit: 'week', lines: [{ name: 'Support', quantity: '2', rate: '1000' }] }))
        .expect(200)
    ).body as RecurringInvoiceDto;
    // Today's period is already invoiced, so the weekly schedule continues next week.
    expect(edited).toMatchObject({ repeatUnit: 'week', total: '2000.00', nextRunDate: addDays(today, 7) });
    await job.runDue(today);
    expect(await invoicesOf(monthly)).toHaveLength(1);

    expect((await admin.delete(`${API}/customers/${customer.id}`).expect(409)).body.error.code).toBe('CONTACT_HAS_TRANSACTIONS');
    const [invoice] = await invoicesOf(monthly);
    await admin.delete(`${API}/recurring-invoices/${monthly.id}`).expect(204);
    const kept = (await admin.get(`${API}/invoices/${invoice?.id}`).expect(200)).body as InvoiceDto;
    expect(kept.recurringProfile).toBeNull();

    const history = (await admin.get(`${API}/invoices/${invoice?.id}/history`).expect(200)).body as { summary: string }[];
    expect(history[0]?.summary).toContain('from recurring profile');
  });

  it('records a failure on the profile and carries on with other profiles', async () => {
    const customer = await newCustomer();
    const healthy = await newCustomer();
    const failing = await newProfile(customer);
    const working = await newProfile(healthy);
    await admin.post(`${API}/customers/${customer.id}/deactivate`).expect(200);

    const result = await job.runDue(today);
    expect(result.failed.map((entry) => entry.profileId)).toContain(failing.id);
    expect(result.created.map((entry) => entry.profileId)).toContain(working.id);
    expect((await profile(failing.id)).lastError).toMatch(/active customer/i);
  });

  it('respects role permissions', async () => {
    const customer = await newCustomer();
    const monthly = await newProfile(customer);

    const sales = await signInAsRole(app, 'Sales');
    await sales.get(`${API}/recurring-invoices/${monthly.id}`).expect(200);
    await sales.post(`${API}/recurring-invoices/${monthly.id}/stop`).expect(200);
    await sales.delete(`${API}/recurring-invoices/${monthly.id}`).expect(403);

    const viewer = await signInAsRole(app, 'Viewer');
    await viewer.post(`${API}/recurring-invoices`).send(profileBody(customer)).expect(403);
    await viewer.post(`${API}/recurring-invoices/${monthly.id}/create-invoice`).expect(403);
  });
});
