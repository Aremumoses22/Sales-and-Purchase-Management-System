'use client';

import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { BillForm } from '@/features/bills/bill-form';

export default function NewBillPage() {
  const searchParams = useSearchParams();
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="New bill" />
      <BillForm defaultVendorId={searchParams.get('vendorId') ?? undefined} />
    </div>
  );
}
