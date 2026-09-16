'use client';

import type { SalesReceiptDto } from '@spms/shared';
import { DocumentPreview } from '@/components/documents/document-preview';
import { formatDate } from '@/lib/format';
import { useOrganization } from '@/lib/session';

export function SalesReceiptPreview({ receipt, className }: { receipt: SalesReceiptDto; className?: string }) {
  const organization = useOrganization();
  const meta = [
    { label: 'Receipt Date', value: formatDate(receipt.receiptDate, organization) },
    ...(receipt.paymentMode ? [{ label: 'Payment Mode', value: receipt.paymentMode.name }] : []),
    ...(receipt.referenceNumber ? [{ label: 'Reference#', value: receipt.referenceNumber }] : []),
  ];

  return (
    <DocumentPreview
      className={className}
      title="Sales Receipt"
      number={receipt.number}
      meta={meta}
      customer={receipt.customer}
      lines={receipt.lines}
      totals={receipt}
      // A completed receipt was paid in full on the spot.
      payment={
        receipt.status === 'completed'
          ? { amountPaid: receipt.total, balanceDue: '0.00', paidLabel: 'Payment received', balanceLabel: 'Balance Due' }
          : undefined
      }
      ribbon={
        receipt.status === 'draft'
          ? { label: 'Draft', tone: 'neutral' }
          : receipt.status === 'void'
            ? { label: 'Void', tone: 'neutral' }
            : { label: 'Paid', tone: 'success' }
      }
      notes={receipt.customerNotes}
      terms={receipt.terms}
    />
  );
}
