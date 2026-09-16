'use client';

import { Loader2Icon, PrinterIcon } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useQuote } from '@/features/quotes/api';
import { QuotePreview } from '@/features/quotes/quote-preview';

function PrintQuote() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { data: quote, isError } = useQuote(id);
  const printed = useRef(false);

  useEffect(() => {
    // Open the browser's print dialog once, when the document has rendered.
    if (quote && searchParams.get('autoprint') === '1' && !printed.current) {
      printed.current = true;
      setTimeout(() => window.print(), 300);
    }
  }, [quote, searchParams]);

  if (isError) return <p className="p-8 text-center text-sm text-muted-foreground">This quote could not be loaded.</p>;
  if (!quote) return <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-4">
      <div className="no-print mx-auto flex max-w-[210mm] items-center justify-between px-2">
        <p className="text-sm text-muted-foreground">
          Quote {quote.number}. Use your browser&apos;s print dialog to print or save as PDF.
        </p>
        <Button onClick={() => window.print()}>
          <PrinterIcon />
          Print
        </Button>
      </div>
      <QuotePreview quote={quote} />
    </div>
  );
}

export default function PrintQuotePage() {
  return (
    <Suspense>
      <PrintQuote />
    </Suspense>
  );
}
