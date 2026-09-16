'use client';

import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { SalesReceiptForm } from '@/features/sales-receipts/sales-receipt-form';

export default function NewSalesReceiptPage() {
  const searchParams = useSearchParams();
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="New sales receipt" />
      <SalesReceiptForm defaultCustomerId={searchParams.get('customerId') ?? undefined} />
    </div>
  );
}
