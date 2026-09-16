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
  closed: 'Closed',
  active: 'Active',
  inactive: 'Inactive',
  stopped: 'Stopped',
};
