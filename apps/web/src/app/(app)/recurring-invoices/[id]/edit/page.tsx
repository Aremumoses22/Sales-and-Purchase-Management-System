'use client';

import { Loader2Icon } from 'lucide-react';
import { useParams } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { useRecurringInvoice } from '@/features/recurring-invoices/api';
import { RecurringInvoiceForm } from '@/features/recurring-invoices/recurring-invoice-form';

export default function EditRecurringInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { data: profile, isPending, isError } = useRecurringInvoice(id);

  if (isError) return <EmptyState title="This recurring invoice could not be loaded" />;
  if (isPending) return <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={`Edit ${profile.name}`}
        description={
          profile.invoiceCount > 0
            ? 'Changes apply to invoices created from now on. Invoices already created are not changed.'
            : undefined
        }
      />
      <RecurringInvoiceForm profile={profile} />
    </div>
  );
}
