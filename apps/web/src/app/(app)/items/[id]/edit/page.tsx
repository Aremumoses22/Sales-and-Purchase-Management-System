'use client';

import { Loader2Icon } from 'lucide-react';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { useItem } from '@/features/items/api';
import { ItemForm } from '@/features/items/item-form';

export default function EditItemPage() {
  const { id } = useParams<{ id: string }>();
  const { data: item, isPending, isError } = useItem(id);

  if (isError) return <p className="text-sm text-muted-foreground">This item could not be loaded.</p>;
  if (isPending) return <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title={`Edit ${item.name}`} />
      <ItemForm item={item} />
    </div>
  );
}
