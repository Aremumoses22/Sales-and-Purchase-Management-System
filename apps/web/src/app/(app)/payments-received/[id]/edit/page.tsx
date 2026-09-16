'use client';

import { Loader2Icon } from 'lucide-react';
import { useParams } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { usePayment } from '@/features/payments/api';
import { PaymentForm } from '@/features/payments/payment-form';

export default function EditPaymentPage() {
  const { id } = useParams<{ id: string }>();
  const { data: payment, isPending, isError } = usePayment(id);

  if (isError) return <EmptyState title="This payment could not be loaded" />;
  if (isPending) return <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title={`Edit payment ${payment.number}`} />
      <PaymentForm payment={payment} />
    </div>
  );
}
