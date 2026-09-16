'use client';

import { Loader2Icon } from 'lucide-react';
import { useParams } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { useExpense } from '@/features/expenses/api';
import { ExpenseForm } from '@/features/expenses/expense-form';

export default function EditExpensePage() {
  const { id } = useParams<{ id: string }>();
  const { data: expense, isPending, isError } = useExpense(id);

  if (isError) return <EmptyState title="This expense could not be loaded" />;
  if (isPending) return <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="Edit expense" />
      <ExpenseForm expense={expense} />
    </div>
  );
}
