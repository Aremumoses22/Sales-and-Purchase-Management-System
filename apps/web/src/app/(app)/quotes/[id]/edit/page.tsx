'use client';

import { canPerformQuoteAction } from '@spms/shared';
import { Loader2Icon } from 'lucide-react';
import { useParams } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { useQuote } from '@/features/quotes/api';
import { QuoteForm } from '@/features/quotes/quote-form';

export default function EditQuotePage() {
  const { id } = useParams<{ id: string }>();
  const { data: quote, isPending, isError } = useQuote(id);

  if (isError) return <EmptyState title="This quote could not be loaded" />;
  if (isPending) return <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;
  if (!canPerformQuoteAction('edit', quote.status)) {
    return <EmptyState title={`Quote ${quote.number} can no longer be edited`} description="Invoiced quotes are locked." />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title={`Edit quote ${quote.number}`} />
      <QuoteForm quote={quote} />
    </div>
  );
}
