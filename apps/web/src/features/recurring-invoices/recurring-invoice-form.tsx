'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  occurrenceDate,
  RECURRENCE_UNITS,
  recurringInvoiceSchema,
  isDateOnly,
  type RecurrenceUnit,
  type RecurringInvoiceDto,
  type RecurringInvoiceOutput,
} from '@spms/shared';
import { Loader2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Controller, useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { CustomerCombobox } from '@/components/customer-combobox';
import { LineItemsEditor } from '@/components/documents/line-items-editor';
import { TotalsPanel } from '@/components/documents/totals-panel';
import { EMPTY_LINE, type DocumentBodyValues } from '@/components/documents/types';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useSaveRecurringInvoice } from '@/features/recurring-invoices/api';
import { formatRecurrence } from '@/features/recurring-invoices/format';
import { useLookupQuery } from '@/features/settings/api';
import { formatDate, todayForInput } from '@/lib/format';
import { applyApiError } from '@/lib/forms';
import { useOrganization } from '@/lib/session';

type FormValues = z.input<typeof recurringInvoiceSchema>;

const UNIT_LABELS: Record<RecurrenceUnit, string> = { day: 'Day(s)', week: 'Week(s)', month: 'Month(s)', year: 'Year(s)' };

function toFormValues(profile: RecurringInvoiceDto | undefined, defaultCustomerId: string | undefined): FormValues {
  if (!profile) {
    return {
      name: '',
      customerId: defaultCustomerId ?? '',
      repeatEvery: 1,
      repeatUnit: 'month',
      startDate: todayForInput(),
      endDate: '',
      paymentTermId: '',
      createAs: 'draft',
      orderNumber: '',
      subject: '',
      lines: [{ ...EMPTY_LINE }],
      shippingCharge: '0.00',
      adjustment: '0.00',
      customerNotes: '',
      terms: '',
    };
  }
  return {
    name: profile.name,
    customerId: profile.customer.id,
    repeatEvery: profile.repeatEvery,
    repeatUnit: profile.repeatUnit,
    startDate: profile.startDate,
    endDate: profile.endDate ?? '',
    paymentTermId: profile.paymentTerm?.id ?? '',
    createAs: profile.createAs,
    orderNumber: profile.orderNumber ?? '',
    subject: profile.subject ?? '',
    lines: profile.lines.map((line) => ({
      itemId: line.itemId,
      name: line.name,
      description: line.description ?? '',
      quantity: line.quantity,
      unit: line.unit,
      rate: line.rate,
      discountType: line.discountType,
      discountValue: line.discountValue,
      taxId: line.taxId ?? '',
    })),
    shippingCharge: profile.shippingCharge,
    adjustment: profile.adjustment,
    customerNotes: profile.customerNotes ?? '',
    terms: profile.terms ?? '',
  };
}

/** The first few invoice dates, so the schedule can be checked before saving. */
function SchedulePreview({ control }: { control: UseFormReturn<FormValues>['control'] }) {
  const organization = useOrganization();
  const [startDate, endDate, repeatEvery, repeatUnit] = useWatch({ control, name: ['startDate', 'endDate', 'repeatEvery', 'repeatUnit'] });
  const every = Number(repeatEvery);
  if (!isDateOnly(startDate) || !Number.isInteger(every) || every < 1) return null;
  const dates = [0, 1, 2]
    .map((n) => occurrenceDate(startDate, repeatUnit, every, n))
    .filter((date) => !endDate || date <= endDate);
  return (
    <p className="text-xs text-muted-foreground">
      {formatRecurrence(every, repeatUnit)}. Invoices on {dates.map((date) => formatDate(date, organization)).join(', ')}
      {dates.length === 3 ? '…' : '.'}
    </p>
  );
}

export function RecurringInvoiceForm({ profile, defaultCustomerId }: { profile?: RecurringInvoiceDto; defaultCustomerId?: string }) {
  const router = useRouter();
  const save = useSaveRecurringInvoice();
  const { data: taxes } = useLookupQuery('taxes', true);
  const { data: terms } = useLookupQuery('payment-terms', true);

  const form = useForm<FormValues, unknown, RecurringInvoiceOutput>({
    resolver: zodResolver(recurringInvoiceSchema),
    defaultValues: toFormValues(profile, defaultCustomerId),
  });
  const bodyForm = form as unknown as UseFormReturn<DocumentBodyValues>;
  const errors = form.formState.errors;
  const endDate = useWatch({ control: form.control, name: 'endDate' });
  const neverExpires = endDate === '' || endDate === null || endDate === undefined;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await save.mutateAsync({ id: profile?.id, input: values });
      toast.success(profile ? `Profile ${saved.name} saved` : `Profile ${saved.name} created`);
      router.push(`/recurring-invoices/${saved.id}`);
    } catch (error) {
      applyApiError(error, form);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4 pb-20">
      <div className="grid gap-5 rounded-xl border bg-card p-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Field label="Customer" htmlFor="customerId" required error={errors.customerId?.message}>
            <Controller
              control={form.control}
              name="customerId"
              render={({ field }) => (
                <CustomerCombobox id="customerId" value={field.value} onChange={field.onChange} invalid={Boolean(errors.customerId)} />
              )}
            />
          </Field>
          <Field label="Profile name" htmlFor="name" required hint="Only you see this, e.g. “Monthly IT retainer”." error={errors.name?.message}>
            <Input id="name" {...form.register('name')} />
          </Field>
          <Field label="Order number" htmlFor="orderNumber" error={errors.orderNumber?.message}>
            <Input id="orderNumber" {...form.register('orderNumber')} />
          </Field>
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Repeat every" htmlFor="repeatEvery" required error={errors.repeatEvery?.message}>
              <div className="flex gap-2">
                <Input id="repeatEvery" type="number" min={1} className="w-20" {...form.register('repeatEvery')} />
                <NativeSelect aria-label="Repeat unit" className="flex-1" {...form.register('repeatUnit')}>
                  {RECURRENCE_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {UNIT_LABELS[unit]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </Field>
            <Field label="Create invoices as" htmlFor="createAs" error={errors.createAs?.message}>
              <NativeSelect id="createAs" {...form.register('createAs')}>
                <option value="draft">Drafts, to review before sending</option>
                <option value="sent">Sent</option>
              </NativeSelect>
            </Field>
            <Field label="Start on" htmlFor="startDate" required error={errors.startDate?.message}>
              <Input id="startDate" type="date" {...form.register('startDate')} />
            </Field>
            <Field label="Ends on" htmlFor="endDate" error={errors.endDate?.message}>
              <Input id="endDate" type="date" disabled={neverExpires} {...form.register('endDate')} />
              <label className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={neverExpires}
                  onCheckedChange={(checked) =>
                    form.setValue('endDate', checked === true ? '' : form.getValues('startDate'), { shouldValidate: form.formState.isSubmitted })
                  }
                />
                Never expires
              </label>
            </Field>
          </div>
          <SchedulePreview control={form.control} />
          <Field label="Payment terms" htmlFor="paymentTermId" hint="Sets each invoice's due date." error={errors.paymentTermId?.message}>
            <NativeSelect id="paymentTermId" {...form.register('paymentTermId')}>
              <option value="">Due on the invoice date</option>
              {terms
                ?.filter((term) => term.isActive || term.id === profile?.paymentTerm?.id)
                .map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
        </div>

        <Field label="Subject" htmlFor="subject" className="lg:col-span-2" error={errors.subject?.message}>
          <Input id="subject" placeholder="Shown on every invoice, e.g. “Monthly IT support”" {...form.register('subject')} />
        </Field>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-6">
        <h2 className="text-sm font-semibold">Item table</h2>
        <LineItemsEditor form={bodyForm} taxes={taxes} />

        <div className="grid gap-6 pt-2 lg:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <Field label="Customer notes" htmlFor="customerNotes" hint="Shown on each invoice." error={errors.customerNotes?.message}>
              <Textarea id="customerNotes" rows={3} {...form.register('customerNotes')} />
            </Field>
            <Field label="Terms & conditions" htmlFor="terms" error={errors.terms?.message}>
              <Textarea id="terms" rows={3} {...form.register('terms')} />
            </Field>
          </div>
          <div className="lg:w-[26rem]">
            <TotalsPanel form={bodyForm} taxes={taxes} />
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-6 py-3 backdrop-blur lg:left-60">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2Icon className="animate-spin" /> : null}
            Save
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}
