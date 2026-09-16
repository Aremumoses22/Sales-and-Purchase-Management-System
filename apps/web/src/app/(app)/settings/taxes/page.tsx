'use client';

import { taxSchema, type TaxDto } from '@spms/shared';
import { Field } from '@/components/field';
import { Input } from '@/components/ui/input';
import { LookupSettings } from '@/features/settings/lookup-settings';

export default function TaxesSettingsPage() {
  return (
    <LookupSettings
      path="taxes"
      singular="Tax"
      title="Taxes"
      description="Tax rates you can apply to item lines on quotes and invoices."
      schema={taxSchema}
      emptyDefaults={{ name: '', rate: '0', isActive: true }}
      columns={[
        { header: 'Name', cell: (row) => <span className="font-medium">{row.name}</span> },
        { header: 'Rate', align: 'right', cell: (row) => `${(row as unknown as TaxDto).rate}%` },
      ]}
      fields={(form) => (
        <>
          <Field label="Name" htmlFor="name" required error={form.formState.errors.name?.message as string | undefined}>
            <Input id="name" placeholder="VAT" {...form.register('name')} />
          </Field>
          <Field label="Rate (%)" htmlFor="rate" required error={form.formState.errors.rate?.message as string | undefined}>
            <Input id="rate" inputMode="decimal" placeholder="7.5" {...form.register('rate')} />
          </Field>
        </>
      )}
    />
  );
}
