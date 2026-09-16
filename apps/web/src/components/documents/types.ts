import type { DocumentLineInput } from '@spms/shared';

/** The part of every document form (quotes now; invoices, receipts, credit notes later) the editors touch. */
export interface DocumentBodyValues {
  lines: DocumentLineInput[];
  shippingCharge?: string | number;
  adjustment?: string | number;
}

export const EMPTY_LINE: DocumentLineInput = {
  itemId: null,
  name: '',
  description: '',
  quantity: '1',
  unit: null,
  rate: '0',
  discountType: 'percent',
  discountValue: '0',
  taxId: null,
};
