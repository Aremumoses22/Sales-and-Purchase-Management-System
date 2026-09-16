'use client';

import { Loader2Icon } from 'lucide-react';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { useCustomer } from '@/features/customers/api';
import { CustomerForm } from '@/features/customers/customer-form';

export default function EditCustomerPage() {
  const { id } = useParams<{ id: string }>();
  const { data: customer, isPending, isError } = useCustomer(id);

  if (isError) return <p className="text-sm text-muted-foreground">This customer could not be loaded.</p>;
  if (isPending) return <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title={`Edit ${customer.displayName}`} />
      <CustomerForm customer={customer} />
    </div>
  );
}
