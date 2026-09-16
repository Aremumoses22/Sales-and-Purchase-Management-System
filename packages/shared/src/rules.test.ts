import { describe, expect, it } from 'vitest';
import { formatDocumentNumber } from './constants.js';
import { addDays, isDateOnly, todayInTimeZone } from './dates.js';
import { ALL_PERMISSIONS, DEFAULT_ROLES, isPermission } from './permissions.js';
import { contactSchema } from './schemas/contacts.js';
import { documentLineSchema, quoteSchema } from './schemas/documents.js';
import { itemSchema } from './schemas/items.js';
import { canPerformQuoteAction, getQuoteDisplayStatus } from './statuses.js';

describe('quote status rules', () => {
  it('shows a sent quote past its expiry date as expired', () => {
    expect(getQuoteDisplayStatus('sent', '2026-01-10', '2026-01-11')).toBe('expired');
    expect(getQuoteDisplayStatus('sent', '2026-01-11', '2026-01-11')).toBe('sent');
    expect(getQuoteDisplayStatus('accepted', '2026-01-10', '2026-01-11')).toBe('accepted');
    expect(getQuoteDisplayStatus('sent', null, '2026-01-11')).toBe('sent');
  });

  it('only allows the documented transitions', () => {
    expect(canPerformQuoteAction('markSent', 'draft')).toBe(true);
    expect(canPerformQuoteAction('markSent', 'sent')).toBe(false);
    expect(canPerformQuoteAction('accept', 'draft')).toBe(false);
    expect(canPerformQuoteAction('accept', 'sent')).toBe(true);
    expect(canPerformQuoteAction('accept', 'declined')).toBe(true);
    expect(canPerformQuoteAction('decline', 'accepted')).toBe(true);
    expect(canPerformQuoteAction('convert', 'sent')).toBe(false);
    expect(canPerformQuoteAction('convert', 'accepted')).toBe(true);
    expect(canPerformQuoteAction('edit', 'invoiced')).toBe(false);
    expect(canPerformQuoteAction('delete', 'invoiced')).toBe(false);
  });
});

describe('dates', () => {
  it('validates real calendar dates only', () => {
    expect(isDateOnly('2028-02-29')).toBe(true);
    expect(isDateOnly('2026-02-29')).toBe(false);
    expect(isDateOnly('2026-9-1')).toBe(false);
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-25', 30)).toBe('2027-01-24');
    expect(addDays('2026-03-01', 0)).toBe('2026-03-01');
  });

  it("computes today in the organization's time zone", () => {
    const now = new Date('2026-09-15T23:30:00Z');
    expect(todayInTimeZone('UTC', now)).toBe('2026-09-15');
    expect(todayInTimeZone('Africa/Lagos', now)).toBe('2026-09-16');
    expect(todayInTimeZone('America/New_York', now)).toBe('2026-09-15');
  });
});

describe('document numbering', () => {
  it('pads the counter', () => {
    expect(formatDocumentNumber('INV-', 42, 5)).toBe('INV-00042');
    expect(formatDocumentNumber('', 123456, 3)).toBe('123456');
  });
});

describe('permissions', () => {
  it('gives Admin every permission and nobody an unknown one', () => {
    const admin = DEFAULT_ROLES.find((role) => role.name === 'Admin');
    expect(admin?.permissions).toEqual(ALL_PERMISSIONS);
    for (const role of DEFAULT_ROLES) {
      expect(role.permissions.every(isPermission)).toBe(true);
    }
  });

  it('keeps Viewer read-only', () => {
    const viewer = DEFAULT_ROLES.find((role) => role.name === 'Viewer');
    expect(viewer?.permissions.every((p) => p.endsWith(':view'))).toBe(true);
  });
});

describe('schemas', () => {
  const line = { name: 'Widget', quantity: '2', rate: '10.00' };

  it('rejects a fixed discount larger than the line amount', () => {
    const result = documentLineSchema.safeParse({ ...line, discountType: 'amount', discountValue: '25' });
    expect(result.success).toBe(false);
  });

  it('rejects a percentage discount above 100', () => {
    const result = documentLineSchema.safeParse({ ...line, discountValue: '101' });
    expect(result.success).toBe(false);
  });

  it('normalises numbers to strings and applies defaults', () => {
    const parsed = documentLineSchema.parse({ ...line, quantity: 2, rate: 10 });
    expect(parsed).toMatchObject({ quantity: '2', rate: '10', discountType: 'percent', discountValue: '0', itemId: null, taxId: null });
  });

  it('rejects an expiry date before the quote date', () => {
    const result = quoteSchema.safeParse({
      customerId: '0199b5a0-0000-7000-8000-000000000001',
      quoteDate: '2026-09-15',
      expiryDate: '2026-09-01',
      lines: [line],
    });
    expect(result.success).toBe(false);
  });

  it('turns blank optional contact fields into null', () => {
    const parsed = contactSchema.parse({ displayName: 'Acme Ltd', email: '', companyName: '  ', paymentTermId: '' });
    expect(parsed).toMatchObject({ email: null, companyName: null, paymentTermId: null, openingBalance: '0.00', contactPersons: [] });
  });

  it('allows only one primary contact person', () => {
    const result = contactSchema.safeParse({
      displayName: 'Acme Ltd',
      contactPersons: [
        { firstName: 'A', isPrimary: true },
        { firstName: 'B', isPrimary: true },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('only lets goods track inventory', () => {
    expect(itemSchema.safeParse({ type: 'service', name: 'Consulting', trackInventory: true }).success).toBe(false);
    expect(itemSchema.safeParse({ type: 'goods', name: 'Widget', trackInventory: true, openingStock: '10' }).success).toBe(true);
  });
});
