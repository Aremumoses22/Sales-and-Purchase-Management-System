'use client';

import type { CreditNoteDisplayStatus, CreditNoteDto } from '@spms/shared';
import { STATUS_LABELS } from '@spms/shared';
import { DocumentPreview, type RibbonTone } from '@/components/documents/document-preview';
import { formatDate } from '@/lib/format';
import { useOrganization } from '@/lib/session';

const RIBBONS: Record<CreditNoteDisplayStatus, RibbonTone | null> = {
  draft: 'neutral',
  open: 'info',
  closed: 'success',
  void: 'neutral',
};

export function CreditNotePreview({ creditNote, className }: { creditNote: CreditNoteDto; className?: string }) {
  const organization = useOrganization();
  const tone = RIBBONS[creditNote.displayStatus];
  const meta = [
    { label: 'Credit Date', value: formatDate(creditNote.creditNoteDate, organization) },
    ...(creditNote.invoice ? [{ label: 'Invoice#', value: creditNote.invoice.number }] : []),
    ...(creditNote.referenceNumber ? [{ label: 'Reference#', value: creditNote.referenceNumber }] : []),
  ];
  const used = (Number(creditNote.amountApplied) + Number(creditNote.amountRefunded)).toFixed(2);

  return (
    <DocumentPreview
      className={className}
      title="Credit Note"
      number={creditNote.number}
      meta={meta}
      customer={creditNote.customer}
      subject={creditNote.reason}
      subjectLabel="Reason"
      lines={creditNote.lines}
      totals={creditNote}
      payment={
        creditNote.status === 'void'
          ? undefined
          : { amountPaid: used, balanceDue: creditNote.balance, paidLabel: 'Credits used and refunded', balanceLabel: 'Credits Remaining' }
      }
      ribbon={tone ? { label: STATUS_LABELS[creditNote.displayStatus] ?? creditNote.displayStatus, tone } : undefined}
      notes={creditNote.customerNotes}
      terms={creditNote.terms}
    />
  );
}
