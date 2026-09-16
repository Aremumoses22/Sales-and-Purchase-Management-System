'use client';

import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { ExpenseForm } from '@/features/expenses/expense-form';

export default function NewExpensePage() {
  const searchParams = useSearchParams();
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="Record expense" />
      <ExpenseForm defaultVendorId={searchParams.get('vendorId') ?? undefined} />
    </div>
  );
}
