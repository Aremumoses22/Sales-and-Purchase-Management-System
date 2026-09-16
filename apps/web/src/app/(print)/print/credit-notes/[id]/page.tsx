'use client';

import { Loader2Icon, PrinterIcon } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useCreditNote } from '@/features/credit-notes/api';
import { CreditNotePreview } from '@/features/credit-notes/credit-note-preview';

function PrintCreditNote() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { data: creditNote, isError } = useCreditNote(id);
  const printed = useRef(false);

  useEffect(() => {
    if (creditNote && searchParams.get('autoprint') === '1' && !printed.current) {
      printed.current = true;
      setTimeout(() => window.print(), 300);
    }
  }, [creditNote, searchParams]);

  if (isError) return <p className="p-8 text-center text-sm text-muted-foreground">This credit note could not be loaded.</p>;
  if (!creditNote) return <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-4">
      <div className="no-print mx-auto flex max-w-[210mm] items-center justify-between px-2">
        <p className="text-sm text-muted-foreground">
          Credit note {creditNote.number}. Use your browser&apos;s print dialog to print or save as PDF.
        </p>
        <Button onClick={() => window.print()}>
          <PrinterIcon />
          Print
        </Button>
      </div>
      <CreditNotePreview creditNote={creditNote} />
    </div>
  );
}

export default function PrintCreditNotePage() {
  return (
    <Suspense>
      <PrintCreditNote />
    </Suspense>
  );
}
