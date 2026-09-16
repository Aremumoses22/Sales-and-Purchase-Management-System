export const DOCUMENT_TYPES = [
  'quote',
  'invoice',
  'sales_receipt',
  'payment_received',
  'credit_note',
  'payment_made',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  quote: 'Quotes',
  invoice: 'Invoices',
  sales_receipt: 'Sales Receipts',
  payment_received: 'Payments Received',
  credit_note: 'Credit Notes',
  payment_made: 'Payments Made',
};

export const DEFAULT_NUMBER_SERIES: Record<DocumentType, { prefix: string; padding: number }> = {
  quote: { prefix: 'QT-', padding: 5 },
  invoice: { prefix: 'INV-', padding: 5 },
  sales_receipt: { prefix: 'SR-', padding: 5 },
  payment_received: { prefix: 'PAY-', padding: 5 },
  credit_note: { prefix: 'CN-', padding: 5 },
  payment_made: { prefix: 'PM-', padding: 5 },
};

export function formatDocumentNumber(prefix: string, value: number, padding: number): string {
  return `${prefix}${String(value).padStart(padding, '0')}`;
}

export const CONTACT_TYPES = ['customer', 'vendor'] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const CONTACT_KINDS = ['business', 'individual'] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

export const SALUTATIONS = ['Mr.', 'Mrs.', 'Ms.', 'Miss', 'Dr.'] as const;

export const ITEM_TYPES = ['goods', 'service'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_UNITS = ['pcs', 'box', 'dozen', 'set', 'kg', 'g', 'l', 'ml', 'm', 'cm', 'hr', 'day'] as const;

export const DISCOUNT_TYPES = ['percent', 'amount'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const STOCK_MOVEMENT_TYPES = [
  'opening',
  'adjustment',
  'invoice',
  'sales_receipt',
  'credit_note',
  'bill',
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const DATE_FORMATS = ['dd MMM yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const ACTIVE_FILTERS = ['active', 'inactive', 'all'] as const;
export type ActiveFilter = (typeof ACTIVE_FILTERS)[number];
