'use client';

import { expenseCategorySchema, type ExpenseCategoryDto } from '@spms/shared';
import { Field } from '@/components/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LookupSettings } from '@/features/settings/lookup-settings';

export default function ExpenseCategoriesSettingsPage() {
  return (
    <LookupSettings
      path="expense-categories"
      singular="Expense category"
      title="Expense categories"
      description="Used to group business expenses in reports (Module 11)."
      schema={expenseCategorySchema}
      emptyDefaults={{ name: '', description: '', isActive: true }}
      columns={[
        { header: 'Name', cell: (row) => <span className="font-medium">{row.name}</span> },
        {
          header: 'Description',
          cell: (row) => (
            <span className="text-muted-foreground">{(row as unknown as ExpenseCategoryDto).description ?? '—'}</span>
          ),
        },
      ]}
      fields={(form) => (
        <>
          <Field label="Name" htmlFor="name" required error={form.formState.errors.name?.message as string | undefined}>
            <Input id="name" placeholder="Office Supplies" {...form.register('name')} />
          </Field>
          <Field label="Description" htmlFor="description" error={form.formState.errors.description?.message as string | undefined}>
            <Textarea id="description" rows={3} {...form.register('description')} />
          </Field>
        </>
      )}
    />
  );
}
