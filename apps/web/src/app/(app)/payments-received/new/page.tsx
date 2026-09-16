'use client';

import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { PaymentForm } from '@/features/payments/payment-form';

export default function RecordPaymentPage() {
  const searchParams = useSearchParams();
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="Record payment" />
      <PaymentForm
        defaultCustomerId={searchParams.get('customerId') ?? undefined}
        defaultInvoiceId={searchParams.get('invoiceId') ?? undefined}
      />
    </div>
  );
}
