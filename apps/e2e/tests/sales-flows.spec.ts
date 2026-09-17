import { expect, test } from '@playwright/test';
import { addDays, api, chooseCustomer, expectToast, fillOneOffLine, signIn, tag, today, type Invoice } from './support.js';

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('customer → quote → accept → invoice → partial payment → full payment', async ({ page }) => {
  const suffix = tag();
  const customer = await api<{ id: string; displayName: string }>(page, 'POST', '/customers', { displayName: `Flow One Ltd ${suffix}` });

  await test.step('create and send a quote', async () => {
    await page.goto(`/quotes/new?customerId=${customer.id}`);
    await expect(page.getByText(customer.displayName)).toBeVisible();
    await fillOneOffLine(page, 'Website redesign', '1', '400000');
    await page.getByRole('button', { name: 'Save and mark as sent' }).click();
    await expect(page).toHaveURL(/\/quotes\/[0-9a-f-]{36}$/);
  });

  await test.step('accept it and convert to an invoice', async () => {
    await page.getByRole('button', { name: 'Mark as accepted' }).click();
    await expectToast(page, /accepted/i);
    await page.getByRole('button', { name: 'Convert to invoice' }).click();
    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}/);
  });

  const invoiceId = page.url().match(/invoices\/([0-9a-f-]{36})/)?.[1] as string;
  if (page.url().endsWith('/edit')) {
    await page.getByRole('button', { name: 'Save and mark as sent' }).click();
    await expect(page).toHaveURL(new RegExp(`/invoices/${invoiceId}$`));
  } else {
    await page.getByRole('button', { name: 'Mark as sent' }).click();
    await expectToast(page, /marked as sent/i);
  }

  await test.step('record a partial payment', async () => {
    await page.getByRole('button', { name: 'Record payment' }).click();
    await expect(page).toHaveURL(/payments-received\/new/);
    const invoice = await api<Invoice>(page, 'GET', `/invoices/${invoiceId}`);
    const row = page.getByLabel(`Payment for ${invoice.number}`);
    await expect(row).toHaveValue('400000.00');
    await page.locator('#amount').fill('150000');
    await row.fill('150000');
    await page.getByRole('button', { name: 'Record payment' }).click();
    await expect(page).toHaveURL(/\/payments-received\/[0-9a-f-]{36}$/);
    expect(await api<Invoice>(page, 'GET', `/invoices/${invoiceId}`)).toMatchObject({ displayStatus: 'partially_paid', balanceDue: '250000.00' });
  });

  await test.step('pay the rest', async () => {
    await page.goto(`/invoices/${invoiceId}`);
    await expect(page.getByText('Partially Paid').first()).toBeVisible();
    await page.getByRole('button', { name: 'Record payment' }).click();
    const invoice = await api<Invoice>(page, 'GET', `/invoices/${invoiceId}`);
    await expect(page.getByLabel(`Payment for ${invoice.number}`)).toHaveValue('250000.00');
    await page.getByRole('button', { name: 'Record payment' }).click();
    await expect(page).toHaveURL(/\/payments-received\/[0-9a-f-]{36}$/);
    await page.goto(`/invoices/${invoiceId}`);
    await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
    expect((await api<Invoice>(page, 'GET', `/invoices/${invoiceId}`)).balanceDue).toBe('0.00');
  });
});

test('customer → invoice → credit note → apply → invoice paid', async ({ page }) => {
  const suffix = tag();
  const customer = await api<{ id: string; displayName: string }>(page, 'POST', '/customers', { displayName: `Flow Two Ltd ${suffix}` });

  await page.goto(`/invoices/new?customerId=${customer.id}`);
  await expect(page.getByText(customer.displayName)).toBeVisible();
  await fillOneOffLine(page, 'Office chairs', '4', '25000');
  await page.getByRole('button', { name: 'Save and mark as sent' }).click();
  await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}$/);
  const invoiceId = page.url().split('/').pop() as string;

  await test.step('raise a credit note from the invoice for the full amount', async () => {
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Create credit note' }).click();
    await expect(page.getByLabel('Line 1 quantity')).toHaveValue('4');
    await page.locator('#reason').fill('Order cancelled');
    await page.getByRole('button', { name: 'Save as open' }).click();
    await expect(page).toHaveURL(/\/credit-notes\/[0-9a-f-]{36}$/);
  });

  await test.step('apply it to the invoice', async () => {
    const invoice = await api<Invoice>(page, 'GET', `/invoices/${invoiceId}`);
    await page.getByRole('button', { name: 'Apply to invoices' }).click();
    await page.getByLabel(`Credit to apply to ${invoice.number}`).fill('100000');
    await page.getByRole('dialog').getByRole('button', { name: 'Apply credits' }).click();
    await expectToast(page, 'Credit applied');
    await expect(page.getByText('Closed').first()).toBeVisible();
  });

  const invoice = await api<Invoice>(page, 'GET', `/invoices/${invoiceId}`);
  expect(invoice).toMatchObject({ displayStatus: 'paid', balanceDue: '0.00' });
  await page.goto(`/invoices/${invoiceId}`);
  await expect(page.getByRole('heading', { name: 'Credits applied' })).toBeVisible();
});

test('overpayment → excess applied to the next invoice', async ({ page }) => {
  const suffix = tag();
  const date = await today(page);
  const customer = await api<{ id: string; displayName: string }>(page, 'POST', '/customers', { displayName: `Flow Three Ltd ${suffix}` });
  const first = await api<Invoice>(page, 'POST', '/invoices', {
    customerId: customer.id,
    invoiceDate: date,
    dueDate: addDays(date, 30),
    lines: [{ name: 'Consulting', quantity: '1', rate: '50000' }],
    saveAs: 'sent',
  });

  await test.step('pay more than is owed', async () => {
    await page.goto(`/payments-received/new?customerId=${customer.id}&invoiceId=${first.id}`);
    await expect(page.getByLabel(`Payment for ${first.number}`)).toHaveValue('50000.00');
    await page.locator('#amount').fill('80000');
    await expect(page.getByText('Amount in excess')).toBeVisible();
    await page.getByRole('button', { name: 'Record payment' }).click();
    await expect(page.getByText(/30,000\.00 unused/)).toBeVisible();
  });

  const second = await api<Invoice>(page, 'POST', '/invoices', {
    customerId: customer.id,
    invoiceDate: date,
    dueDate: addDays(date, 30),
    lines: [{ name: 'Support', quantity: '1', rate: '20000' }],
    saveAs: 'sent',
  });

  await test.step('apply the excess to the next invoice', async () => {
    await page.goto(`/invoices/${second.id}`);
    await expect(page.getByText('Credits available')).toBeVisible();
    await page.getByRole('button', { name: 'Apply credits' }).click();
    await expect(page.getByRole('dialog').getByRole('textbox').first()).toHaveValue('20000.00');
    await page.getByRole('dialog').getByRole('button', { name: 'Apply credits' }).click();
    await expectToast(page, 'Credits applied');
  });

  expect(await api<Invoice>(page, 'GET', `/invoices/${second.id}`)).toMatchObject({ displayStatus: 'paid' });
  const summary = await api<{ unusedCredits: string; outstandingReceivables: string }>(page, 'GET', `/customers/${customer.id}/summary`);
  expect(summary).toEqual({ outstandingReceivables: '0.00', unusedCredits: '10000.00' });
});

test('recurring profile → job run → invoices generated', async ({ page }) => {
  const suffix = tag();
  const customer = await api<{ id: string; displayName: string }>(page, 'POST', '/customers', { displayName: `Flow Four Ltd ${suffix}` });

  await page.goto(`/recurring-invoices/new?customerId=${customer.id}`);
  await page.locator('#name').fill(`Monthly retainer ${suffix}`);
  await expect(page.getByText(/Every month\. Invoices on/)).toBeVisible();
  await fillOneOffLine(page, 'Retainer', '1', '120000');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/recurring-invoices\/[0-9a-f-]{36}$/);
  const profileId = page.url().split('/').pop() as string;

  await test.step('run the job twice; only one invoice is created', async () => {
    await page.goto('/recurring-invoices');
    await page.getByRole('button', { name: 'Create due invoices now' }).click();
    await expectToast(page, /invoice\(s\) created|No invoices were due/);
    await page.getByRole('button', { name: 'Create due invoices now' }).click();
    await expectToast(page, 'No invoices were due');
  });

  const invoices = await api<{ data: { invoiceDate: string; total: string }[] }>(page, 'GET', `/invoices?recurringProfileId=${profileId}`);
  expect(invoices.data).toHaveLength(1);
  expect(invoices.data[0]?.total).toBe('120000.00');
  await page.goto(`/recurring-invoices/${profileId}`);
  await expect(page.getByRole('cell', { name: /^INV-/ })).toHaveCount(1);
});
