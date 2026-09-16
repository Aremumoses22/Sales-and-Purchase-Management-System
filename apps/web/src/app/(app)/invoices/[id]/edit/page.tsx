'use client';

import { canPerformInvoiceAction } from '@spms/shared';
import { Loader2Icon } from 'lucide-react';
import { useParams } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { useInvoice } from '@/features/invoices/api';
import { InvoiceForm } from '@/features/invoices/invoice-form';

export default function EditInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { data: invoice, isPending, isError } = useInvoice(id);

  if (isError) return <EmptyState title="This invoice could not be loaded" />;
  if (isPending) return <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;
  if (!canPerformInvoiceAction('edit', invoice)) {
    return <EmptyState title={`Invoice ${invoice.number} can no longer be edited`} description="Void invoices are locked." />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={`Edit invoice ${invoice.number}`}
        description={
          Number(invoice.amountPaid) > 0
            ? 'Payments have been recorded, so the customer is fixed and the total cannot drop below the amount paid.'
            : undefined
        }
      />
      <InvoiceForm invoice={invoice} />
    </div>
  );
}
