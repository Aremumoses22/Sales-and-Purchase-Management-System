'use client';

import type { InvoiceDisplayStatus, InvoiceDto } from '@spms/shared';
import { STATUS_LABELS } from '@spms/shared';
import { DocumentPreview, type RibbonTone } from '@/components/documents/document-preview';
import { formatDate } from '@/lib/format';
import { useOrganization } from '@/lib/session';

const RIBBONS: Record<InvoiceDisplayStatus, RibbonTone | null> = {
  draft: 'neutral',
  sent: null,
  overdue: 'danger',
  partially_paid: 'warning',
  paid: 'success',
  void: 'neutral',
};

export function InvoicePreview({ invoice, className }: { invoice: InvoiceDto; className?: string }) {
  const organization = useOrganization();
  const tone = RIBBONS[invoice.displayStatus];
  const meta = [
    { label: 'Invoice Date', value: formatDate(invoice.invoiceDate, organization) },
    ...(invoice.paymentTerm ? [{ label: 'Terms', value: invoice.paymentTerm.name }] : []),
    { label: 'Due Date', value: formatDate(invoice.dueDate, organization) },
    ...(invoice.orderNumber ? [{ label: 'Order#', value: invoice.orderNumber }] : []),
  ];

  return (
    <DocumentPreview
      className={className}
      title="Invoice"
      number={invoice.number}
      meta={meta}
      customer={invoice.customer}
      subject={invoice.subject}
      lines={invoice.lines}
      totals={invoice}
      payment={invoice.status === 'void' ? undefined : { amountPaid: invoice.amountPaid, balanceDue: invoice.balanceDue }}
      ribbon={tone ? { label: STATUS_LABELS[invoice.displayStatus] ?? invoice.displayStatus, tone } : undefined}
      notes={invoice.customerNotes}
      terms={invoice.terms}
    />
  );
}
