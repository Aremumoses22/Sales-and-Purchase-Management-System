'use client';

import { PageHeader } from '@/components/page-header';
import { CustomerForm } from '@/features/customers/customer-form';

export default function NewCustomerPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title="New customer" />
      <CustomerForm />
    </div>
  );
}
