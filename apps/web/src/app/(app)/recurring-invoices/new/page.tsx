'use client';

import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { RecurringInvoiceForm } from '@/features/recurring-invoices/recurring-invoice-form';

export default function NewRecurringInvoicePage() {
  const searchParams = useSearchParams();
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="New recurring invoice" />
      <RecurringInvoiceForm defaultCustomerId={searchParams.get('customerId') ?? undefined} />
    </div>
  );
}
