import type { OrganizationDto } from '@spms/shared';
import { format as formatWithPattern, parseISO } from 'date-fns';

type MoneyOrganization = Pick<OrganizationDto, 'currencySymbol'>;
type DateOrganization = Pick<OrganizationDto, 'dateFormat'>;

const amountFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Money for display: symbol, thousands separators and a leading minus for negatives. */
export function formatMoney(value: string | number | null | undefined, organization: MoneyOrganization): string {
  const amount = Number(value ?? 0);
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = amountFormatter.format(Math.abs(safe));
  return `${safe < 0 ? '-' : ''}${organization.currencySymbol}${formatted}`;
}

/** Quantities and tax rates: no currency, no trailing zeros. */
export function formatNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const amount = Number(value);
  return Number.isFinite(amount) ? String(amount) : String(value);
}

export function formatDate(value: string | null | undefined, organization: DateOrganization): string {
  if (!value) return '';
  return formatWithPattern(parseISO(`${value.slice(0, 10)}T00:00:00`), organization.dateFormat);
}

export function formatDateTime(value: string | null | undefined, organization: DateOrganization): string {
  if (!value) return '';
  return formatWithPattern(parseISO(value), `${organization.dateFormat}, HH:mm`);
}

/** Today in the browser's time zone, as YYYY-MM-DD for date inputs. */
export function todayForInput(): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
