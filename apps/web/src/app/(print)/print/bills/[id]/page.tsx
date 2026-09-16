'use client';

import { Loader2Icon, PrinterIcon } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useBill } from '@/features/bills/api';
import { BillPreview } from '@/features/bills/bill-preview';

function PrintBill() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { data: bill, isError } = useBill(id);
  const printed = useRef(false);

  useEffect(() => {
    if (bill && searchParams.get('autoprint') === '1' && !printed.current) {
      printed.current = true;
      setTimeout(() => window.print(), 300);
    }
  }, [bill, searchParams]);

  if (isError) return <p className="p-8 text-center text-sm text-muted-foreground">This bill could not be loaded.</p>;
  if (!bill) return <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-4">
      <div className="no-print mx-auto flex max-w-[210mm] items-center justify-between px-2">
        <p className="text-sm text-muted-foreground">
          Bill {bill.billNumber}. Use your browser&apos;s print dialog to print or save as PDF.
        </p>
        <Button onClick={() => window.print()}>
          <PrinterIcon />
          Print
        </Button>
      </div>
      <BillPreview bill={bill} />
    </div>
  );
}

export default function PrintBillPage() {
  return (
    <Suspense>
      <PrintBill />
    </Suspense>
  );
}
