'use client';

import type { QuoteDto } from '@spms/shared';
import { DocumentPreview } from '@/components/documents/document-preview';
import { formatDate } from '@/lib/format';
import { useOrganization } from '@/lib/session';

export function QuotePreview({ quote, className }: { quote: QuoteDto; className?: string }) {
  const organization = useOrganization();
  const meta = [
    { label: 'Quote Date', value: formatDate(quote.quoteDate, organization) },
    ...(quote.expiryDate ? [{ label: 'Expiry Date', value: formatDate(quote.expiryDate, organization) }] : []),
    ...(quote.referenceNumber ? [{ label: 'Reference#', value: quote.referenceNumber }] : []),
  ];

  return (
    <DocumentPreview
      className={className}
      title="Quote"
      number={quote.number}
      meta={meta}
      customer={quote.customer}
      subject={quote.subject}
      lines={quote.lines}
      totals={quote}
      notes={quote.customerNotes}
      terms={quote.terms}
    />
  );
}
