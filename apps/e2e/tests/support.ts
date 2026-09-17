import { expect, type Page } from '@playwright/test';

export const ADMIN = {
  email: process.env['E2E_ADMIN_EMAIL'] ?? 'admin@example.com',
  password: process.env['E2E_ADMIN_PASSWORD'] ?? 'Admin12345',
};

/** A short suffix so each run's records have their own names. */
export const tag = () => Math.random().toString(36).slice(2, 7).toUpperCase();

export async function signIn(page: Page, credentials = ADMIN): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill(credentials.email);
  await page.locator('#password').fill(credentials.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
}

/** Calls the API with the page's session, for setup and for checking stored figures. */
export async function api<T>(page: Page, method: string, path: string, data?: unknown): Promise<T> {
  const response = await page.request.fetch(`/api/v1${path}`, {
    method,
    data,
    headers: { 'X-Requested-With': 'e2e' },
  });
  if (!response.ok()) throw new Error(`${method} ${path} → ${response.status()} ${await response.text()}`);
  return (response.status() === 204 ? null : await response.json()) as T;
}

export async function today(page: Page): Promise<string> {
  const organization = await api<{ timezone: string }>(page, 'GET', '/settings/organization');
  return new Intl.DateTimeFormat('en-CA', { timeZone: organization.timezone }).format(new Date());
}

export function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export async function chooseCustomer(page: Page, name: string, trigger = '#customerId'): Promise<void> {
  await page.locator(trigger).click();
  await page.getByPlaceholder('Search customers').fill(name);
  await page.getByRole('option', { name: new RegExp(name) }).click();
}

/** Fills the first line of a document with a one-off item. */
export async function fillOneOffLine(page: Page, name: string, quantity: string, rate: string): Promise<void> {
  await page.getByRole('button', { name: 'Type or click to select an item' }).first().click();
  await page.getByPlaceholder('Search items, or type a one-off line').last().fill(name);
  await page.getByRole('option', { name: /as a one-off line/ }).click();
  await page.getByLabel('Line 1 quantity').fill(quantity);
  await page.getByLabel('Line 1 rate').fill(rate);
}

/** Toasts stack in the corner; wait for one and let it clear out of the header buttons. */
export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.getByText(text).first()).toBeVisible();
}

export interface Invoice {
  id: string;
  number: string;
  balanceDue: string;
  displayStatus: string;
}
