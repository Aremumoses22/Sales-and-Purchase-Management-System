import { toDecimal, type NumericInput } from './money.js';

export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'declined', 'invoiced'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/** "expired" is never stored: it is a sent quote whose expiry date has passed. */
export type QuoteDisplayStatus = QuoteStatus | 'expired';
export const QUOTE_DISPLAY_STATUSES = [
  'draft',
  'sent',
  'expired',
  'accepted',
  'declined',
  'invoiced',
] as const satisfies readonly QuoteDisplayStatus[];

export function getQuoteDisplayStatus(
  status: QuoteStatus,
  expiryDate: string | null,
  today: string,
): QuoteDisplayStatus {
  if (status === 'sent' && expiryDate !== null && expiryDate < today) return 'expired';
  return status;
}

export type QuoteAction = 'edit' | 'delete' | 'markSent' | 'accept' | 'decline' | 'convert';

const QUOTE_ACTION_RULES: Record<QuoteAction, readonly QuoteStatus[]> = {
  edit: ['draft', 'sent', 'accepted', 'declined'],
  delete: ['draft', 'sent', 'accepted', 'declined'],
  markSent: ['draft'],
  accept: ['sent', 'declined'],
  decline: ['sent', 'accepted'],
  convert: ['accepted'],
};

export function canPerformQuoteAction(action: QuoteAction, status: QuoteStatus): boolean {
  return QUOTE_ACTION_RULES[action].includes(status);
}

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  expired: 'Expired',
  accepted: 'Accepted',
  declined: 'Declined',
  invoiced: 'Invoiced',
  overdue: 'Overdue',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  void: 'Void',
  open: 'Open',
  completed: 'Completed',
  closed: 'Closed',
  active: 'Active',
  inactive: 'Inactive',
  stopped: 'Stopped',
};

// ---------- Invoices ----------

/** Stored lifecycle. Paid, partially paid and overdue are derived from the balance and due date. */
export const INVOICE_STATUSES = ['draft', 'sent', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_DISPLAY_STATUSES = ['draft', 'sent', 'overdue', 'partially_paid', 'paid', 'void'] as const;
export type InvoiceDisplayStatus = (typeof INVOICE_DISPLAY_STATUSES)[number];

export interface InvoiceStatusFacts {
  status: InvoiceStatus;
  amountPaid: NumericInput;
  balanceDue: NumericInput;
  dueDate: string;
}

/**
 * Every invoice shows exactly one status. A balance still owed after the due date is "overdue"
 * even when part of it has been paid, because that is the invoice that needs chasing.
 */
export function getInvoiceDisplayStatus(invoice: InvoiceStatusFacts, today: string): InvoiceDisplayStatus {
  if (invoice.status !== 'sent') return invoice.status;
  if (!toDecimal(invoice.balanceDue).gt(0)) return 'paid';
  if (invoice.dueDate < today) return 'overdue';
  return toDecimal(invoice.amountPaid).gt(0) ? 'partially_paid' : 'sent';
}

export type InvoiceAction = 'edit' | 'delete' | 'markSent' | 'void' | 'recordPayment';

export function canPerformInvoiceAction(
  action: InvoiceAction,
  invoice: Omit<InvoiceStatusFacts, 'dueDate'>,
): boolean {
  const hasPayments = toDecimal(invoice.amountPaid).gt(0);
  switch (action) {
    case 'edit':
      return invoice.status !== 'void';
    case 'delete':
      return invoice.status === 'draft' && !hasPayments;
    case 'markSent':
      return invoice.status === 'draft';
    case 'void':
      return invoice.status === 'sent' && !hasPayments;
    case 'recordPayment':
      return invoice.status !== 'void' && toDecimal(invoice.balanceDue).gt(0);
  }
}

// ---------- Credit notes ----------

/** Stored lifecycle. "Closed" is derived: an open credit note whose balance is used up. */
export const CREDIT_NOTE_STATUSES = ['draft', 'open', 'void'] as const;
export type CreditNoteStatus = (typeof CREDIT_NOTE_STATUSES)[number];

export const CREDIT_NOTE_DISPLAY_STATUSES = ['draft', 'open', 'closed', 'void'] as const;
export type CreditNoteDisplayStatus = (typeof CREDIT_NOTE_DISPLAY_STATUSES)[number];

export interface CreditNoteStatusFacts {
  status: CreditNoteStatus;
  amountApplied: NumericInput;
  amountRefunded: NumericInput;
  balance: NumericInput;
}

export function getCreditNoteDisplayStatus(creditNote: Pick<CreditNoteStatusFacts, 'status' | 'balance'>): CreditNoteDisplayStatus {
  if (creditNote.status !== 'open') return creditNote.status;
  return toDecimal(creditNote.balance).gt(0) ? 'open' : 'closed';
}

export type CreditNoteAction = 'edit' | 'delete' | 'markOpen' | 'void' | 'apply' | 'refund';

export function canPerformCreditNoteAction(action: CreditNoteAction, creditNote: CreditNoteStatusFacts): boolean {
  const used = toDecimal(creditNote.amountApplied).plus(toDecimal(creditNote.amountRefunded)).gt(0);
  switch (action) {
    case 'edit':
      return creditNote.status !== 'void';
    case 'delete':
    case 'markOpen':
      return creditNote.status === 'draft';
    case 'void':
      return creditNote.status === 'open' && !used;
    case 'apply':
    case 'refund':
      return creditNote.status === 'open' && toDecimal(creditNote.balance).gt(0);
  }
}

// ---------- Sales receipts ----------

/** A receipt records a sale that was paid on the spot, so it never has a balance or a derived status. */
export const SALES_RECEIPT_STATUSES = ['draft', 'completed', 'void'] as const;
export type SalesReceiptStatus = (typeof SALES_RECEIPT_STATUSES)[number];

export type SalesReceiptAction = 'edit' | 'delete' | 'complete' | 'void';

const SALES_RECEIPT_ACTION_RULES: Record<SalesReceiptAction, readonly SalesReceiptStatus[]> = {
  edit: ['draft', 'completed'],
  delete: ['draft'],
  complete: ['draft'],
  void: ['completed'],
};

export function canPerformSalesReceiptAction(action: SalesReceiptAction, status: SalesReceiptStatus): boolean {
  return SALES_RECEIPT_ACTION_RULES[action].includes(status);
}
