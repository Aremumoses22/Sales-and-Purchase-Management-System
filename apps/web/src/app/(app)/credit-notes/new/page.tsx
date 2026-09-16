'use client';

import { Loader2Icon } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { CreditNoteForm } from '@/features/credit-notes/credit-note-form';
import { useInvoice } from '@/features/invoices/api';

function FromInvoice({ invoiceId }: { invoiceId: string }) {
  const { data: invoice, isPending, isError } = useInvoice(invoiceId);
  if (isPending) return <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;
  return <CreditNoteForm fromInvoice={isError ? undefined : invoice} />;
}

export default function NewCreditNotePage() {
  const searchParams = useSearchParams();
  const invoiceId = searchParams.get('invoiceId');
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="New credit note" />
      {invoiceId ? (
        <FromInvoice invoiceId={invoiceId} />
      ) : (
        <CreditNoteForm defaultCustomerId={searchParams.get('customerId') ?? undefined} />
      )}
    </div>
  );
}
