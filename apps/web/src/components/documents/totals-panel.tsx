'use client';

import { calculateDocumentTotals, type TaxDto } from '@spms/shared';
import { useMemo } from 'react';
import { useWatch, type UseFormReturn } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { formatMoney, formatNumber } from '@/lib/format';
import { useOrganization } from '@/lib/session';
import type { DocumentBodyValues } from './types';

/**
 * Live totals under the line items. Uses the same calculator the API uses to store the
 * document, so what the user sees is exactly what gets saved.
 */
export function TotalsPanel({ form, taxes }: { form: UseFormReturn<DocumentBodyValues>; taxes: TaxDto[] | undefined }) {
  const organization = useOrganization();
  const [lines, shippingCharge, adjustment] = useWatch({
    control: form.control,
    name: ['lines', 'shippingCharge', 'adjustment'],
  });

  const totals = useMemo(() => {
    const taxById = new Map((taxes ?? []).map((tax) => [tax.id, tax]));
    return calculateDocumentTotals({
      lines: (lines ?? []).map((line) => {
        const tax = line.taxId ? taxById.get(line.taxId) : undefined;
        return {
          quantity: line.quantity,
          rate: line.rate,
          discountType: line.discountType ?? 'percent',
          discountValue: line.discountValue,
          taxId: line.taxId || null,
          taxName: tax?.name ?? null,
          taxRate: tax?.rate ?? null,
        };
      }),
      shippingCharge,
      adjustment,
    });
  }, [lines, shippingCharge, adjustment, taxes]);

  const money = (value: string) => formatMoney(value, organization);
  const errors = form.formState.errors;

  return (
    <div className="w-full max-w-md space-y-2 rounded-xl bg-muted/40 p-4 text-sm">
      <div className="flex justify-between gap-4">
        <span>Sub total</span>
        <span className="tabular-nums">{money(totals.subtotal)}</span>
      </div>
      {Number(totals.discountTotal) > 0 ? (
        <p className="-mt-1 text-right text-xs text-muted-foreground">After line discounts of {money(totals.discountTotal)}</p>
      ) : null}

      {totals.taxBreakdown.map((tax) => (
        <div key={tax.taxId ?? tax.taxName} className="flex justify-between gap-4 text-muted-foreground">
          <span>
            {tax.taxName} ({formatNumber(tax.rate)}%)
          </span>
          <span className="tabular-nums">{money(tax.amount)}</span>
        </div>
      ))}

      <div className="flex items-center justify-between gap-4">
        <label htmlFor="shippingCharge">Shipping charges</label>
        <Input
          id="shippingCharge"
          inputMode="decimal"
          className="h-8 w-32 bg-background text-right tabular-nums"
          aria-invalid={Boolean(errors.shippingCharge)}
          {...form.register('shippingCharge')}
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="adjustment" title="Rounding or any other correction; can be negative">
          Adjustment
        </label>
        <Input
          id="adjustment"
          inputMode="decimal"
          className="h-8 w-32 bg-background text-right tabular-nums"
          aria-invalid={Boolean(errors.adjustment)}
          {...form.register('adjustment')}
        />
      </div>
      {errors.shippingCharge?.message || errors.adjustment?.message ? (
        <p className="text-right text-xs text-destructive">{errors.shippingCharge?.message ?? errors.adjustment?.message}</p>
      ) : null}

      <div className="flex justify-between gap-4 border-t pt-2 text-base font-semibold">
        <span>Total ({organization.currencyCode})</span>
        <span className="tabular-nums">{money(totals.total)}</span>
      </div>
    </div>
  );
}
