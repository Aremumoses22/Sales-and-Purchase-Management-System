import { expect, test } from '@playwright/test';
import { api, signIn, tag, today } from './support.js';

test('vendor → expense → included in the dashboard and Expenses by Vendor report', async ({ page }) => {
  await signIn(page);
  const suffix = tag();
  const vendor = await api<{ id: string; displayName: string }>(page, 'POST', '/vendors', { displayName: `Flow Five Supplies ${suffix}` });
  const before = await api<{ totals: { expenses: string } }>(page, 'GET', '/dashboard/summary?period=this_month');

  await test.step('record an expense for the vendor', async () => {
    await page.goto(`/expenses/new?vendorId=${vendor.id}`);
    await expect(page.getByText(vendor.displayName)).toBeVisible();
    await page.locator('#categoryId').selectOption({ label: 'Office Supplies' });
    await page.locator('#amount').fill('37500');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page).toHaveURL(/\/expenses\/[0-9a-f-]{36}$/);
  });

  await test.step('see it on the dashboard', async () => {
    const after = await api<{ totals: { expenses: string } }>(page, 'GET', '/dashboard/summary?period=this_month');
    expect(Number(after.totals.expenses) - Number(before.totals.expenses)).toBe(37500);
    const formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(Number(after.totals.expenses));
    await page.goto('/');
    await expect(page.getByText(`₦${formatted}`).first()).toBeVisible();
  });

  await test.step('see it in Expenses by Vendor', async () => {
    await page.goto('/reports/expenses-by-vendor');
    const row = page.getByRole('row', { name: new RegExp(vendor.displayName) });
    await expect(row).toContainText('₦37,500.00');
  });
});

test('a Viewer cannot create or void anything', async ({ page, browser }) => {
  await signIn(page);
  const suffix = tag();
  const roles = await api<{ id: string; name: string }[]>(page, 'GET', '/roles');
  const viewerRole = roles.find((role) => role.name === 'Viewer');
  const email = `viewer.${suffix.toLowerCase()}@example.com`;
  await api(page, 'POST', '/users', { name: `Viewer ${suffix}`, email, roleId: viewerRole?.id, password: 'Temp12345' });
  const date = await today(page);
  const customer = await api<{ id: string }>(page, 'POST', '/customers', { displayName: `Viewer Check ${suffix}` });
  const invoice = await api<{ id: string }>(page, 'POST', '/invoices', {
    customerId: customer.id,
    invoiceDate: date,
    dueDate: date,
    lines: [{ name: 'Item', quantity: '1', rate: '1000' }],
    saveAs: 'sent',
  });

  const context = await browser.newContext();
  const viewer = await context.newPage();
  await viewer.goto('/login');
  await viewer.locator('#email').fill(email);
  await viewer.locator('#password').fill('Temp12345');
  await viewer.getByRole('button', { name: 'Sign in' }).click();
  await viewer.waitForURL((url) => !url.pathname.startsWith('/login'));
  // A new user must replace the temporary password first.
  await api(viewer, 'POST', '/auth/change-password', { currentPassword: 'Temp12345', newPassword: 'Viewer12345' });
  await viewer.goto('/');
  await expect(viewer.getByRole('heading', { name: /Welcome/ })).toBeVisible();

  await test.step('no create or void actions are offered', async () => {
    await viewer.goto('/invoices');
    await expect(viewer.getByRole('heading', { name: 'Invoices' })).toBeVisible();
    await expect(viewer.getByRole('button', { name: 'New invoice' })).toHaveCount(0);
    await expect(viewer.getByRole('button', { name: 'New' })).toHaveCount(0);
    await viewer.goto(`/invoices/${invoice.id}`);
    await expect(viewer.getByRole('button', { name: 'Record payment' })).toHaveCount(0);
    await expect(viewer.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    await expect(viewer.getByRole('button', { name: 'More actions' })).toHaveCount(0);
  });

  await test.step('the API refuses the same actions', async () => {
    for (const [method, path, body] of [
      ['POST', '/invoices', {}],
      ['POST', `/invoices/${invoice.id}/void`, {}],
      ['POST', '/customers', { displayName: 'Nope' }],
      ['POST', '/expenses', {}],
      ['POST', '/bills', {}],
      ['DELETE', `/customers/${customer.id}`, undefined],
    ] as const) {
      const response = await viewer.request.fetch(`/api/v1${path}`, { method, data: body, headers: { 'X-Requested-With': 'e2e' } });
      expect(response.status(), `${method} ${path}`).toBe(403);
    }
  });
  await context.close();
});
