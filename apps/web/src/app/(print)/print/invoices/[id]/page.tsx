'use client';

import { Loader2Icon, PrinterIcon } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useInvoice } from '@/features/invoices/api';
import { InvoicePreview } from '@/features/invoices/invoice-preview';

function PrintInvoice() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { data: invoice, isError } = useInvoice(id);
  const printed = useRef(false);

  useEffect(() => {
    if (invoice && searchParams.get('autoprint') === '1' && !printed.current) {
      printed.current = true;
      setTimeout(() => window.print(), 300);
    }
  }, [invoice, searchParams]);

  if (isError) return <p className="p-8 text-center text-sm text-muted-foreground">This invoice could not be loaded.</p>;
  if (!invoice) return <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-4">
      <div className="no-print mx-auto flex max-w-[210mm] items-center justify-between px-2">
        <p className="text-sm text-muted-foreground">
          Invoice {invoice.number}. Use your browser&apos;s print dialog to print or save as PDF.
        </p>
        <Button onClick={() => window.print()}>
          <PrinterIcon />
          Print
        </Button>
      </div>
      <InvoicePreview invoice={invoice} />
    </div>
  );
}

export default function PrintInvoicePage() {
  return (
    <Suspense>
      <PrintInvoice />
    </Suspense>
  );
}
