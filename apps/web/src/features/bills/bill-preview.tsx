'use client';

import type { BillDisplayStatus, BillDto } from '@spms/shared';
import { STATUS_LABELS } from '@spms/shared';
import { DocumentPreview, type RibbonTone } from '@/components/documents/document-preview';
import { formatDate } from '@/lib/format';
import { useOrganization } from '@/lib/session';

const RIBBONS: Record<BillDisplayStatus, RibbonTone | null> = {
  draft: 'neutral',
  open: null,
  overdue: 'danger',
  partially_paid: 'warning',
  paid: 'success',
  void: 'neutral',
};

export function BillPreview({ bill, className }: { bill: BillDto; className?: string }) {
  const organization = useOrganization();
  const tone = RIBBONS[bill.displayStatus];
  return (
    <DocumentPreview
      className={className}
      title="Bill"
      number={bill.billNumber}
      partyLabel="Vendor"
      meta={[
        { label: 'Bill Date', value: formatDate(bill.billDate, organization) },
        ...(bill.paymentTerm ? [{ label: 'Terms', value: bill.paymentTerm.name }] : []),
        { label: 'Due Date', value: formatDate(bill.dueDate, organization) },
        ...(bill.orderNumber ? [{ label: 'Order#', value: bill.orderNumber }] : []),
      ]}
      customer={bill.vendor}
      lines={bill.lines}
      totals={bill}
      payment={
        bill.status === 'void' ? undefined : { amountPaid: bill.amountPaid, balanceDue: bill.balanceDue, paidLabel: 'Payments made' }
      }
      ribbon={tone ? { label: STATUS_LABELS[bill.displayStatus] ?? bill.displayStatus, tone } : undefined}
      notes={bill.notes}
      terms={bill.terms}
    />
  );
}
