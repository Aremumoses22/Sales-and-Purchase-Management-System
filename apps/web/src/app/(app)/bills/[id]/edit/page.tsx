'use client';

import { canPerformBillAction } from '@spms/shared';
import { Loader2Icon } from 'lucide-react';
import { useParams } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { useBill } from '@/features/bills/api';
import { BillForm } from '@/features/bills/bill-form';

export default function EditBillPage() {
  const { id } = useParams<{ id: string }>();
  const { data: bill, isPending, isError } = useBill(id);

  if (isError) return <EmptyState title="This bill could not be loaded" />;
  if (isPending) return <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;
  if (!canPerformBillAction('edit', bill)) {
    return <EmptyState title={`Bill ${bill.billNumber} can no longer be edited`} description="Void bills are locked." />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={`Edit bill ${bill.billNumber}`}
        description={
          Number(bill.amountPaid) > 0
            ? 'Payments have been made, so the vendor is fixed and the total cannot drop below the amount paid.'
            : undefined
        }
      />
      <BillForm bill={bill} />
    </div>
  );
}
