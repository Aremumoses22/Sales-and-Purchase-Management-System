'use client';

import { canPerformCreditNoteAction, toDecimal } from '@spms/shared';
import { Loader2Icon } from 'lucide-react';
import { useParams } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { useCreditNote } from '@/features/credit-notes/api';
import { CreditNoteForm } from '@/features/credit-notes/credit-note-form';

export default function EditCreditNotePage() {
  const { id } = useParams<{ id: string }>();
  const { data: creditNote, isPending, isError } = useCreditNote(id);

  if (isError) return <EmptyState title="This credit note could not be loaded" />;
  if (isPending) return <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;
  if (!canPerformCreditNoteAction('edit', creditNote)) {
    return <EmptyState title={`Credit note ${creditNote.number} can no longer be edited`} description="Void credit notes are locked." />;
  }
  const used = toDecimal(creditNote.amountApplied).plus(creditNote.amountRefunded);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={`Edit credit note ${creditNote.number}`}
        description={
          used.gt(0)
            ? 'Part of this credit has been used, so the customer is fixed and the total cannot drop below what was used.'
            : undefined
        }
      />
      <CreditNoteForm creditNote={creditNote} />
    </div>
  );
}
