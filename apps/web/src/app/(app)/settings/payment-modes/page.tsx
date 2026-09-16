'use client';

import { paymentModeSchema } from '@spms/shared';
import { Field } from '@/components/field';
import { Input } from '@/components/ui/input';
import { LookupSettings } from '@/features/settings/lookup-settings';

export default function PaymentModesSettingsPage() {
  return (
    <LookupSettings
      path="payment-modes"
      singular="Payment mode"
      title="Payment modes"
      description="How money is received or paid: cash, bank transfer, cheque, card."
      schema={paymentModeSchema}
      emptyDefaults={{ name: '', isDefault: false, isActive: true }}
      supportsDefault
      columns={[{ header: 'Name', cell: (row) => <span className="font-medium">{row.name}</span> }]}
      fields={(form) => (
        <Field label="Name" htmlFor="name" required error={form.formState.errors.name?.message as string | undefined}>
          <Input id="name" placeholder="Bank Transfer" {...form.register('name')} />
        </Field>
      )}
    />
  );
}
