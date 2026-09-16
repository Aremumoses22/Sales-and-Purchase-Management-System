'use client';

import { Loader2Icon, PrinterIcon } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useSalesReceipt } from '@/features/sales-receipts/api';
import { SalesReceiptPreview } from '@/features/sales-receipts/sales-receipt-preview';

function PrintSalesReceipt() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { data: receipt, isError } = useSalesReceipt(id);
  const printed = useRef(false);

  useEffect(() => {
    if (receipt && searchParams.get('autoprint') === '1' && !printed.current) {
      printed.current = true;
      setTimeout(() => window.print(), 300);
    }
  }, [receipt, searchParams]);

  if (isError) return <p className="p-8 text-center text-sm text-muted-foreground">This sales receipt could not be loaded.</p>;
  if (!receipt) return <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-4">
      <div className="no-print mx-auto flex max-w-[210mm] items-center justify-between px-2">
        <p className="text-sm text-muted-foreground">
          Sales receipt {receipt.number}. Use your browser&apos;s print dialog to print or save as PDF.
        </p>
        <Button onClick={() => window.print()}>
          <PrinterIcon />
          Print
        </Button>
      </div>
      <SalesReceiptPreview receipt={receipt} />
    </div>
  );
}

export default function PrintSalesReceiptPage() {
  return (
    <Suspense>
      <PrintSalesReceipt />
    </Suspense>
  );
}
