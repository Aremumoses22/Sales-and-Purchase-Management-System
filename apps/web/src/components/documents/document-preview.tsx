'use client';

import type { DocumentCustomerDto, DocumentLineDto, TaxBreakdownEntry } from '@spms/shared';
import { cn } from 'cn';
import type { ReactNode } from 'react';
import { addressLines } from '@/lib/address';
import { formatMoney, formatNumber } from '@/lib/format';
import { useOrganization } from '@/lib/session';

export interface DocumentPreviewProps {
  title: string;
  number: string;
  meta: { label: string; value: ReactNode }[];
  customer: DocumentCustomerDto;
  subject?: string | null;
  lines: DocumentLineDto[];
  totals: {
    subtotal: string;
    discountTotal: string;
    taxBreakdown: TaxBreakdownEntry[];
    shippingCharge: string;
    adjustment: string;
    total: string;
  };
  notes?: string | null;
  terms?: string | null;
  banner?: ReactNode;
  className?: string;
}

/** The printed layout of a sales document; the same component renders on screen and on paper. */
export function DocumentPreview({
  title,
  number,
  meta,
  customer,
  subject,
  lines,
  totals,
  notes,
  terms,
  banner,
  className,
}: DocumentPreviewProps) {
  const organization = useOrganization();
  const money = (value: string) => formatMoney(value, organization);
  const hasDiscount = lines.some((line) => Number(line.discountValue) > 0);
  const hasTax = lines.some((line) => line.taxId || line.taxName);
  const orgAddress = [
    organization.addressLine1,
    organization.addressLine2,
    [organization.city, organization.state, organization.postalCode].filter(Boolean).join(', '),
    organization.country,
  ].filter(Boolean);
  const billing = addressLines(customer.billingAddress);
  const shipping = addressLines(customer.shippingAddress);

  return (
    <article className={cn('print-sheet relative mx-auto w-full max-w-[210mm] bg-white p-8 text-[13px] text-neutral-900 shadow-sm ring-1 ring-black/5 sm:p-10', className)}>
      {banner}

      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-1">
          {organization.hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/v1/settings/organization/logo?v=${encodeURIComponent(organization.updatedAt)}`}
              alt=""
              className="mb-2 max-h-16 max-w-48 object-contain"
            />
          ) : null}
          <p className="text-base font-semibold">{organization.name}</p>
          {orgAddress.map((line) => (
            <p key={line} className="text-neutral-600">
              {line}
            </p>
          ))}
          {organization.email || organization.phone ? (
            <p className="text-neutral-600">{[organization.phone, organization.email].filter(Boolean).join(' · ')}</p>
          ) : null}
          {organization.taxNumber ? <p className="text-neutral-600">Tax No: {organization.taxNumber}</p> : null}
        </div>
        <div className="text-right">
          <h2 className="text-3xl font-light tracking-wide uppercase">{title}</h2>
          <p className="mt-1 font-medium"># {number}</p>
        </div>
      </header>

      <section className="mt-8 grid gap-6 sm:grid-cols-[1fr_1fr_auto]">
        <div>
          <p className="mb-1 text-xs text-neutral-500">Bill To</p>
          <p className="font-semibold text-blue-700">{customer.displayName}</p>
          {billing.map((line) => (
            <p key={line} className="text-neutral-700">
              {line}
            </p>
          ))}
        </div>
        <div>
          {shipping.length ? (
            <>
              <p className="mb-1 text-xs text-neutral-500">Ship To</p>
              {shipping.map((line) => (
                <p key={line} className="text-neutral-700">
                  {line}
                </p>
              ))}
            </>
          ) : null}
        </div>
        <dl className="space-y-1">
          {meta.map((row) => (
            <div key={row.label} className="grid grid-cols-[auto_auto] justify-end gap-x-4">
              <dt className="text-right text-neutral-500">{row.label}:</dt>
              <dd className="text-right">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {subject ? (
        <section className="mt-6">
          <p className="text-xs text-neutral-500">Subject</p>
          <p>{subject}</p>
        </section>
      ) : null}

      <table className="mt-6 w-full border-collapse">
        <thead>
          <tr className="bg-neutral-800 text-left text-xs text-white">
            <th className="w-8 px-2 py-2 font-medium">#</th>
            <th className="px-2 py-2 font-medium">Item &amp; Description</th>
            <th className="px-2 py-2 text-right font-medium">Qty</th>
            <th className="px-2 py-2 text-right font-medium">Rate</th>
            {hasDiscount ? <th className="px-2 py-2 text-right font-medium">Discount</th> : null}
            {hasTax ? <th className="px-2 py-2 text-right font-medium">Tax</th> : null}
            <th className="px-2 py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={line.id} className="border-b border-neutral-200 align-top">
              <td className="px-2 py-2.5 text-neutral-500">{index + 1}</td>
              <td className="px-2 py-2.5">
                <p className="font-medium">{line.name}</p>
                {line.description ? <p className="whitespace-pre-line text-neutral-600">{line.description}</p> : null}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                {formatNumber(line.quantity)}
                {line.unit ? <span className="text-neutral-500"> {line.unit}</span> : null}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">{money(line.rate)}</td>
              {hasDiscount ? (
                <td className="px-2 py-2.5 text-right tabular-nums">
                  {Number(line.discountValue) > 0
                    ? line.discountType === 'percent'
                      ? `${formatNumber(line.discountValue)}%`
                      : money(line.discountValue)
                    : '—'}
                </td>
              ) : null}
              {hasTax ? (
                <td className="px-2 py-2.5 text-right tabular-nums">
                  {line.taxName ? `${formatNumber(line.taxRate)}%` : '—'}
                </td>
              ) : null}
              <td className="px-2 py-2.5 text-right tabular-nums">{money(line.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-4 flex justify-end">
        <dl className="w-full max-w-xs space-y-1.5">
          <div className="flex justify-between">
            <dt>Sub Total</dt>
            <dd className="tabular-nums">{money(totals.subtotal)}</dd>
          </div>
          {totals.taxBreakdown.map((tax) => (
            <div key={tax.taxId ?? tax.taxName} className="flex justify-between text-neutral-600">
              <dt>
                {tax.taxName} ({formatNumber(tax.rate)}%)
              </dt>
              <dd className="tabular-nums">{money(tax.amount)}</dd>
            </div>
          ))}
          {Number(totals.shippingCharge) !== 0 ? (
            <div className="flex justify-between text-neutral-600">
              <dt>Shipping charges</dt>
              <dd className="tabular-nums">{money(totals.shippingCharge)}</dd>
            </div>
          ) : null}
          {Number(totals.adjustment) !== 0 ? (
            <div className="flex justify-between text-neutral-600">
              <dt>Adjustment</dt>
              <dd className="tabular-nums">{money(totals.adjustment)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-neutral-300 bg-neutral-100 px-2 py-2 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{money(totals.total)}</dd>
          </div>
        </dl>
      </section>

      {notes ? (
        <section className="mt-8 break-inside-avoid">
          <p className="text-xs text-neutral-500">Notes</p>
          <p className="whitespace-pre-line">{notes}</p>
        </section>
      ) : null}
      {terms ? (
        <section className="mt-4 break-inside-avoid">
          <p className="text-xs text-neutral-500">Terms &amp; Conditions</p>
          <p className="whitespace-pre-line">{terms}</p>
        </section>
      ) : null}
    </article>
  );
}
