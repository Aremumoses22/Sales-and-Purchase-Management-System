'use client';

import { Loader2Icon } from 'lucide-react';
import { useParams } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { usePaymentMade } from '@/features/bills/api';
import { PaymentMadeForm } from '@/features/payments-made/payment-made-form';

export default function EditPaymentMadePage() {
  const { id } = useParams<{ id: string }>();
  const { data: payment, isPending, isError } = usePaymentMade(id);

  if (isError) return <EmptyState title="This payment could not be loaded" />;
  if (isPending) return <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title={`Edit payment ${payment.number}`} />
      <PaymentMadeForm payment={payment} />
    </div>
  );
}
