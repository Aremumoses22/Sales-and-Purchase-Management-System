'use client';

import { PageHeader } from '@/components/page-header';
import { ItemForm } from '@/features/items/item-form';

export default function NewItemPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="New item" />
      <ItemForm />
    </div>
  );
}
