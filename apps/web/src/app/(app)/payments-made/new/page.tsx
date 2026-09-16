'use client';

import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { PaymentMadeForm } from '@/features/payments-made/payment-made-form';

export default function NewPaymentMadePage() {
  const searchParams = useSearchParams();
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="Record payment made" />
      <PaymentMadeForm defaultVendorId={searchParams.get('vendorId') ?? undefined} defaultBillId={searchParams.get('billId') ?? undefined} />
    </div>
  );
}
