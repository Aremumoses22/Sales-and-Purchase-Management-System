'use client';

import { canPerformSalesReceiptAction } from '@spms/shared';
import { Loader2Icon } from 'lucide-react';
import { useParams } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { useSalesReceipt } from '@/features/sales-receipts/api';
import { SalesReceiptForm } from '@/features/sales-receipts/sales-receipt-form';

export default function EditSalesReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const { data: receipt, isPending, isError } = useSalesReceipt(id);

  if (isError) return <EmptyState title="This sales receipt could not be loaded" />;
  if (isPending) return <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;
  if (!canPerformSalesReceiptAction('edit', receipt.status)) {
    return <EmptyState title={`Sales receipt ${receipt.number} can no longer be edited`} description="Void receipts are locked." />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title={`Edit sales receipt ${receipt.number}`} />
      <SalesReceiptForm receipt={receipt} />
    </div>
  );
}
