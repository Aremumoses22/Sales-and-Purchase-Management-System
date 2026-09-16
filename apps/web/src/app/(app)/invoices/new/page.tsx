'use client';

import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { InvoiceForm } from '@/features/invoices/invoice-form';

export default function NewInvoicePage() {
  const searchParams = useSearchParams();
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="New invoice" />
      <InvoiceForm defaultCustomerId={searchParams.get('customerId') ?? undefined} />
    </div>
  );
}
