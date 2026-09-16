'use client';

import { Loader2Icon, PrinterIcon } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { usePayment } from '@/features/payments/api';
import { PaymentReceipt } from '@/features/payments/payment-receipt';

function PrintPayment() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { data: payment, isError } = usePayment(id);
  const printed = useRef(false);

  useEffect(() => {
    if (payment && searchParams.get('autoprint') === '1' && !printed.current) {
      printed.current = true;
      setTimeout(() => window.print(), 300);
    }
  }, [payment, searchParams]);

  if (isError) return <p className="p-8 text-center text-sm text-muted-foreground">This payment could not be loaded.</p>;
  if (!payment) return <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-4">
      <div className="no-print mx-auto flex max-w-[210mm] items-center justify-between px-2">
        <p className="text-sm text-muted-foreground">Payment receipt {payment.number}.</p>
        <Button onClick={() => window.print()}>
          <PrinterIcon />
          Print
        </Button>
      </div>
      <PaymentReceipt payment={payment} />
    </div>
  );
}

export default function PrintPaymentPage() {
  return (
    <Suspense>
      <PrintPayment />
    </Suspense>
  );
}
