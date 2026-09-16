'use client';

import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { QuoteForm } from '@/features/quotes/quote-form';

export default function NewQuotePage() {
  const searchParams = useSearchParams();
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="New quote" />
      <QuoteForm defaultCustomerId={searchParams.get('customerId') ?? undefined} />
    </div>
  );
}
