'use client';

import type { PaymentReceivedDto } from '@spms/shared';
import { cn } from 'cn';
import { addressLines } from '@/lib/address';
import { formatDate, formatMoney } from '@/lib/format';
import { useOrganization } from '@/lib/session';

/** Printable payment receipt, shown on the payment page and on paper. */
export function PaymentReceipt({ payment, className }: { payment: PaymentReceivedDto; className?: string }) {
  const organization = useOrganization();
  const money = (value: string) => formatMoney(value, organization);
  const billing = addressLines(payment.customer.billingAddress);
  const orgAddress = [
    organization.addressLine1,
    [organization.city, organization.state].filter(Boolean).join(', '),
    organization.country,
  ].filter(Boolean);

  return (
    <article
      className={cn(
        'print-sheet mx-auto w-full max-w-[210mm] bg-white p-8 text-[13px] text-neutral-900 shadow-sm ring-1 ring-black/5 sm:p-10',
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-6 border-b pb-6">
        <div className="space-y-1">
          {organization.hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/v1/settings/organization/logo?v=${encodeURIComponent(organization.updatedAt)}`}
              alt=""
              className="mb-2 max-h-14 max-w-44 object-contain"
            />
          ) : null}
          <p className="text-base font-semibold">{organization.name}</p>
          {orgAddress.map((line) => (
            <p key={line} className="text-neutral-600">
              {line}
            </p>
          ))}
        </div>
        <h2 className="text-2xl font-light tracking-wide uppercase">Payment Receipt</h2>
      </header>

      <section className="mt-6 grid gap-6 sm:grid-cols-[1fr_auto]">
        <dl className="space-y-2">
          {[
            ['Payment Date', formatDate(payment.paymentDate, organization)],
            ['Receipt Number', payment.number],
            ['Reference Number', payment.referenceNumber ?? '—'],
            ['Payment Mode', payment.paymentMode?.name ?? '—'],
          ].map(([label, value]) => (
            <div key={label} className="grid grid-cols-[10rem_1fr] gap-2">
              <dt className="text-neutral-500">{label}</dt>
              <dd className="border-b border-neutral-200 pb-1 font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex min-w-48 flex-col items-center justify-center rounded-md bg-emerald-600 px-6 py-5 text-white">
          <p className="text-xs uppercase tracking-wide">Amount Received</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{money(payment.amount)}</p>
        </div>
      </section>

      <section className="mt-8">
        <p className="mb-1 text-xs text-neutral-500">Received From</p>
        <p className="font-semibold text-blue-700">{payment.customer.displayName}</p>
        {billing.map((line) => (
          <p key={line} className="text-neutral-700">
            {line}
          </p>
        ))}
      </section>

      {payment.allocations.length > 0 ? (
        <section className="mt-8">
          <h3 className="mb-2 font-semibold">Payment for</h3>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-neutral-100 text-left text-xs text-neutral-600">
                <th className="px-2 py-2 font-medium">Invoice Number</th>
                <th className="px-2 py-2 font-medium">Invoice Date</th>
                <th className="px-2 py-2 text-right font-medium">Invoice Amount</th>
                <th className="px-2 py-2 text-right font-medium">Payment Amount</th>
              </tr>
            </thead>
            <tbody>
              {payment.allocations.map((allocation) => (
                <tr key={allocation.id} className="border-b border-neutral-200">
                  <td className="px-2 py-2">{allocation.invoice.number}</td>
                  <td className="px-2 py-2">{formatDate(allocation.invoice.invoiceDate, organization)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{money(allocation.invoice.total)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{money(allocation.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="mt-6 flex justify-end">
        <dl className="w-full max-w-xs space-y-1.5">
          {Number(payment.bankCharges) > 0 ? (
            <div className="flex justify-between text-neutral-600">
              <dt>Bank charges</dt>
              <dd className="tabular-nums">{money(payment.bankCharges)}</dd>
            </div>
          ) : null}
          {Number(payment.amountRefunded) > 0 ? (
            <div className="flex justify-between text-neutral-600">
              <dt>Refunded</dt>
              <dd className="tabular-nums">{money(payment.amountRefunded)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between font-semibold">
            <dt>Unused amount</dt>
            <dd className="tabular-nums">{money(payment.unusedAmount)}</dd>
          </div>
        </dl>
      </section>
    </article>
  );
}
