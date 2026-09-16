'use client';

import { paymentTermSchema, type PaymentTermDto } from '@spms/shared';
import { Field } from '@/components/field';
import { Input } from '@/components/ui/input';
import { LookupSettings } from '@/features/settings/lookup-settings';

export default function PaymentTermsSettingsPage() {
  return (
    <LookupSettings
      path="payment-terms"
      singular="Payment term"
      title="Payment terms"
      description="How long customers have to pay. The default is applied to new customers."
      schema={paymentTermSchema}
      emptyDefaults={{ name: '', days: 30, isDefault: false, isActive: true }}
      supportsDefault
      columns={[
        { header: 'Name', cell: (row) => <span className="font-medium">{row.name}</span> },
        {
          header: 'Days',
          align: 'right',
          cell: (row) => {
            const days = (row as unknown as PaymentTermDto).days;
            return days === 0 ? 'Due on receipt' : `${days} days`;
          },
        },
      ]}
      fields={(form) => (
        <>
          <Field label="Name" htmlFor="name" required error={form.formState.errors.name?.message as string | undefined}>
            <Input id="name" placeholder="Net 30" {...form.register('name')} />
          </Field>
          <Field
            label="Days until due"
            htmlFor="days"
            hint="0 means due on receipt."
            error={form.formState.errors.days?.message as string | undefined}
          >
            <Input id="days" type="number" min={0} max={365} {...form.register('days')} />
          </Field>
        </>
      )}
    />
  );
}
