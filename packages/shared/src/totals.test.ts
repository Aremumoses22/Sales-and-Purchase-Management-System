import { describe, expect, it } from 'vitest';
import { calculateDocumentTotals, calculateLineTotals } from './totals.js';

describe('calculateLineTotals', () => {
  it('multiplies quantity by rate', () => {
    expect(calculateLineTotals({ quantity: '3', rate: '12.50' })).toEqual({
      gross: '37.50',
      discount: '0.00',
      amount: '37.50',
      taxAmount: '0.00',
    });
  });

  it('applies a percentage discount before tax', () => {
    const line = calculateLineTotals({
      quantity: 2,
      rate: '100',
      discountType: 'percent',
      discountValue: '10',
      taxRate: '7.5',
    });
    expect(line).toEqual({ gross: '200.00', discount: '20.00', amount: '180.00', taxAmount: '13.50' });
  });

  it('applies a fixed discount', () => {
    const line = calculateLineTotals({
      quantity: 1,
      rate: '80',
      discountType: 'amount',
      discountValue: '15.25',
    });
    expect(line.amount).toBe('64.75');
  });

  it('rounds half up to cents', () => {
    // 3 × 3.335 = 10.005 → 10.01
    expect(calculateLineTotals({ quantity: '3', rate: '3.335' }).gross).toBe('10.01');
    // 5% of 0.25 = 0.0125 → 0.01
    expect(calculateLineTotals({ quantity: 1, rate: '0.25', taxRate: '5' }).taxAmount).toBe('0.01');
    // 10% of 1.05 = 0.105 → 0.11 (floats would give 0.10)
    expect(calculateLineTotals({ quantity: 1, rate: '1.05', taxRate: '10' }).taxAmount).toBe('0.11');
  });

  it('supports fractional quantities', () => {
    expect(calculateLineTotals({ quantity: '1.255', rate: '10' }).gross).toBe('12.55');
  });

  it('treats blank or malformed input as zero instead of throwing', () => {
    expect(calculateLineTotals({ quantity: '', rate: 'abc' }).amount).toBe('0.00');
  });
});

describe('calculateDocumentTotals', () => {
  it('sums lines, tax, shipping and a negative adjustment', () => {
    const totals = calculateDocumentTotals({
      lines: [
        { quantity: 2, rate: '100', taxId: 'vat', taxName: 'VAT', taxRate: '7.5' },
        { quantity: 1, rate: '50', discountType: 'percent', discountValue: '10', taxId: 'vat', taxName: 'VAT', taxRate: '7.5' },
        { quantity: 4, rate: '5', taxId: 'exempt', taxName: 'Exempt', taxRate: '0' },
      ],
      shippingCharge: '20',
      adjustment: '-3.50',
    });

    expect(totals.subtotal).toBe('265.00');
    expect(totals.discountTotal).toBe('5.00');
    expect(totals.taxTotal).toBe('18.38');
    expect(totals.taxBreakdown).toEqual([
      { taxId: 'vat', taxName: 'VAT', rate: '7.5', amount: '18.38' },
      { taxId: 'exempt', taxName: 'Exempt', rate: '0', amount: '0.00' },
    ]);
    expect(totals.shippingCharge).toBe('20.00');
    expect(totals.adjustment).toBe('-3.50');
    expect(totals.total).toBe('299.88');
  });

  it('adds up per-line rounded tax rather than taxing the subtotal', () => {
    // Each line: 10% of 0.05 = 0.005 → 0.01. Three lines → 0.03 (subtotal tax would be 0.02).
    const line = { quantity: 1, rate: '0.05', taxId: 't', taxName: 'T', taxRate: '10' };
    const totals = calculateDocumentTotals({ lines: [line, line, line] });
    expect(totals.taxTotal).toBe('0.03');
    expect(totals.total).toBe('0.18');
  });

  it('omits lines without tax from the breakdown', () => {
    const totals = calculateDocumentTotals({ lines: [{ quantity: 1, rate: '10' }] });
    expect(totals.taxBreakdown).toEqual([]);
    expect(totals.total).toBe('10.00');
  });

  it('handles an empty document', () => {
    const totals = calculateDocumentTotals({ lines: [] });
    expect(totals.total).toBe('0.00');
  });
});
