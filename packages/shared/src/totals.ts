import { Dec, roundMoney, toDecimal, type Decimal, type NumericInput } from './money.js';
import type { DiscountType } from './constants.js';

export interface TotalsLineInput {
  quantity: NumericInput;
  rate: NumericInput;
  discountType?: DiscountType | null;
  discountValue?: NumericInput;
  taxId?: string | null;
  taxName?: string | null;
  /** Percentage, e.g. 7.5 for 7.5% */
  taxRate?: NumericInput;
}

export interface LineTotals {
  gross: string;
  discount: string;
  amount: string;
  taxAmount: string;
}

export interface TaxBreakdownEntry {
  taxId: string | null;
  taxName: string;
  rate: string;
  amount: string;
}

export interface DocumentTotals {
  lines: LineTotals[];
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  taxBreakdown: TaxBreakdownEntry[];
  shippingCharge: string;
  adjustment: string;
  total: string;
}

export interface DocumentTotalsInput {
  lines: TotalsLineInput[];
  shippingCharge?: NumericInput;
  adjustment?: NumericInput;
}

function computeLine(line: TotalsLineInput) {
  const gross = roundMoney(toDecimal(line.quantity).times(toDecimal(line.rate)));
  const discountValue = toDecimal(line.discountValue);
  const discount =
    line.discountType === 'amount'
      ? roundMoney(discountValue)
      : roundMoney(gross.times(discountValue).dividedBy(100));
  const amount = gross.minus(discount);
  const taxRate = toDecimal(line.taxRate);
  const taxAmount = roundMoney(amount.times(taxRate).dividedBy(100));
  return { gross, discount, amount, taxRate, taxAmount };
}

/** Gross line value (quantity × rate) rounded to cents; used to validate fixed discounts. */
export function lineGross(line: Pick<TotalsLineInput, 'quantity' | 'rate'>): Decimal {
  return roundMoney(toDecimal(line.quantity).times(toDecimal(line.rate)));
}

export function calculateLineTotals(line: TotalsLineInput): LineTotals {
  const { gross, discount, amount, taxAmount } = computeLine(line);
  return {
    gross: gross.toFixed(2),
    discount: discount.toFixed(2),
    amount: amount.toFixed(2),
    taxAmount: taxAmount.toFixed(2),
  };
}

/**
 * Single source of truth for document totals (PLAN.md §4.3). The browser uses it for live
 * totals and the API uses it to compute the stored values, so they can never disagree.
 */
export function calculateDocumentTotals(input: DocumentTotalsInput): DocumentTotals {
  let subtotal: Decimal = new Dec(0);
  let discountTotal: Decimal = new Dec(0);
  let taxTotal: Decimal = new Dec(0);
  const breakdown = new Map<
    string,
    { taxId: string | null; taxName: string; rate: Decimal; amount: Decimal }
  >();

  const lines = input.lines.map((line) => {
    const parts = computeLine(line);
    subtotal = subtotal.plus(parts.amount);
    discountTotal = discountTotal.plus(parts.discount);
    taxTotal = taxTotal.plus(parts.taxAmount);

    if (line.taxId || parts.taxRate.gt(0)) {
      const taxName = line.taxName ?? 'Tax';
      const key = line.taxId ?? `${taxName}@${parts.taxRate.toString()}`;
      const entry = breakdown.get(key) ?? {
        taxId: line.taxId ?? null,
        taxName,
        rate: parts.taxRate,
        amount: new Dec(0),
      };
      entry.amount = entry.amount.plus(parts.taxAmount);
      breakdown.set(key, entry);
    }

    return {
      gross: parts.gross.toFixed(2),
      discount: parts.discount.toFixed(2),
      amount: parts.amount.toFixed(2),
      taxAmount: parts.taxAmount.toFixed(2),
    };
  });

  const shippingCharge = roundMoney(input.shippingCharge);
  const adjustment = roundMoney(input.adjustment);
  const total = subtotal.plus(taxTotal).plus(shippingCharge).plus(adjustment);

  return {
    lines,
    subtotal: subtotal.toFixed(2),
    discountTotal: discountTotal.toFixed(2),
    taxTotal: taxTotal.toFixed(2),
    taxBreakdown: [...breakdown.values()].map((entry) => ({
      taxId: entry.taxId,
      taxName: entry.taxName,
      rate: entry.rate.toString(),
      amount: entry.amount.toFixed(2),
    })),
    shippingCharge: shippingCharge.toFixed(2),
    adjustment: adjustment.toFixed(2),
    total: total.toFixed(2),
  };
}

export interface ExpenseAmounts {
  subtotal: string;
  taxAmount: string;
  total: string;
}

/**
 * Splits an expense amount into subtotal and tax. A tax-inclusive amount is the total paid, so the
 * tax is taken out of it; otherwise the tax is added on top.
 */
export function calculateExpenseAmounts(input: {
  amount: NumericInput;
  taxRate?: NumericInput;
  amountIsTaxInclusive?: boolean;
}): ExpenseAmounts {
  const amount = roundMoney(input.amount);
  const rate = toDecimal(input.taxRate);
  if (rate.lte(0)) {
    const value = amount.toFixed(2);
    return { subtotal: value, taxAmount: '0.00', total: value };
  }
  if (input.amountIsTaxInclusive) {
    const subtotal = roundMoney(amount.div(rate.div(100).plus(1)));
    return { subtotal: subtotal.toFixed(2), taxAmount: amount.minus(subtotal).toFixed(2), total: amount.toFixed(2) };
  }
  const taxAmount = roundMoney(amount.times(rate).div(100));
  return { subtotal: amount.toFixed(2), taxAmount: taxAmount.toFixed(2), total: amount.plus(taxAmount).toFixed(2) };
}
