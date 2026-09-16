'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { quoteSchema, type QuoteDto, type QuoteOutput } from '@spms/shared';
import { Loader2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { CustomerCombobox } from '@/components/contact-combobox';
import { LineItemsEditor } from '@/components/documents/line-items-editor';
import { TotalsPanel } from '@/components/documents/totals-panel';
import { EMPTY_LINE, type DocumentBodyValues } from '@/components/documents/types';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCustomer } from '@/features/customers/api';
import { useSaveQuote } from '@/features/quotes/api';
import { useLookupQuery, useNumberSeriesFor } from '@/features/settings/api';
import { addressLines } from '@/lib/address';
import { todayForInput } from '@/lib/format';
import { applyApiError } from '@/lib/forms';

type FormValues = z.input<typeof quoteSchema>;

function toFormValues(quote: QuoteDto | undefined, defaultCustomerId: string | undefined): FormValues {
  if (!quote) {
    return {
      customerId: defaultCustomerId ?? '',
      quoteDate: todayForInput(),
      expiryDate: '',
      referenceNumber: '',
      subject: '',
      lines: [{ ...EMPTY_LINE }],
      shippingCharge: '0.00',
      adjustment: '0.00',
      customerNotes: '',
      terms: '',
      saveAs: 'draft',
    };
  }
  return {
    customerId: quote.customer.id,
    quoteDate: quote.quoteDate,
    expiryDate: quote.expiryDate ?? '',
    referenceNumber: quote.referenceNumber ?? '',
    subject: quote.subject ?? '',
    lines: quote.lines.map((line) => ({
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
    shippingCharge: quote.shippingCharge,
    adjustment: quote.adjustment,
    customerNotes: quote.customerNotes ?? '',
    terms: quote.terms ?? '',
    saveAs: 'draft',
  };
}

function CustomerSummary({ customerId }: { customerId: string }) {
  const { data: customer } = useCustomer(customerId);
  if (!customer) return null;
  const billing = addressLines(customer.billingAddress);
  return (
    <div className="mt-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      {customer.email ? <p>{customer.email}</p> : null}
      {billing.length ? <p>{billing.join(', ')}</p> : <p>No billing address on file</p>}
    </div>
  );
}

export function QuoteForm({ quote, defaultCustomerId }: { quote?: QuoteDto; defaultCustomerId?: string }) {
  const router = useRouter();
  const save = useSaveQuote();
  // Include inactive taxes so lines saved with one still show their tax.
  const { data: taxes } = useLookupQuery('taxes', true);
  const { data: series } = useNumberSeriesFor('quote', !quote);
  const [submitting, setSubmitting] = useState<'draft' | 'sent' | null>(null);

  const form = useForm<FormValues, unknown, QuoteOutput>({
    resolver: zodResolver(quoteSchema),
    defaultValues: toFormValues(quote, defaultCustomerId),
  });
  const bodyForm = form as unknown as UseFormReturn<DocumentBodyValues>;
  const customerId = useWatch({ control: form.control, name: 'customerId' });
  const errors = form.formState.errors;
  const isDraft = !quote || quote.status === 'draft';

  const submit = (saveAs: 'draft' | 'sent') =>
    form.handleSubmit(async (values) => {
      setSubmitting(saveAs);
      try {
        const saved = await save.mutateAsync({ id: quote?.id, input: { ...values, saveAs } });
        toast.success(quote ? `Quote ${saved.number} saved` : `Quote ${saved.number} created`);
        router.push(`/quotes/${saved.id}`);
      } catch (error) {
        applyApiError(error, form);
      } finally {
        setSubmitting(null);
      }
    });

  return (
    <form onSubmit={submit('draft')} noValidate className="space-y-4 pb-20">
      <div className="grid gap-5 rounded-xl border bg-card p-6 lg:grid-cols-2">
        <Field label="Customer" htmlFor="customerId" required error={errors.customerId?.message}>
          <Controller
            control={form.control}
            name="customerId"
            render={({ field }) => (
              <CustomerCombobox id="customerId" value={field.value} onChange={field.onChange} invalid={Boolean(errors.customerId)} />
            )}
          />
          {customerId ? <CustomerSummary customerId={customerId} /> : null}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Quote#" htmlFor="number" hint={quote ? undefined : 'Assigned automatically when saved'}>
            <Input id="number" value={quote?.number ?? series?.preview ?? ''} readOnly disabled />
          </Field>
          <Field label="Reference#" htmlFor="referenceNumber" error={errors.referenceNumber?.message}>
            <Input id="referenceNumber" {...form.register('referenceNumber')} />
          </Field>
          <Field label="Quote date" htmlFor="quoteDate" required error={errors.quoteDate?.message}>
            <Input id="quoteDate" type="date" {...form.register('quoteDate')} />
          </Field>
          <Field label="Expiry date" htmlFor="expiryDate" error={errors.expiryDate?.message}>
            <Input id="expiryDate" type="date" {...form.register('expiryDate')} />
          </Field>
        </div>

        <Field label="Subject" htmlFor="subject" className="lg:col-span-2" error={errors.subject?.message}>
          <Input id="subject" placeholder="Let your customer know what this quote is for" {...form.register('subject')} />
        </Field>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-6">
        <h2 className="text-sm font-semibold">Item table</h2>
        <LineItemsEditor form={bodyForm} taxes={taxes} />

        <div className="grid gap-6 pt-2 lg:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <Field label="Customer notes" htmlFor="customerNotes" hint="Shown on the quote." error={errors.customerNotes?.message}>
              <Textarea id="customerNotes" rows={3} placeholder="Thank you for the opportunity." {...form.register('customerNotes')} />
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
          {isDraft ? (
            <>
              <Button type="button" variant="outline" disabled={submitting !== null} onClick={submit('draft')}>
                {submitting === 'draft' ? <Loader2Icon className="animate-spin" /> : null}
                Save as draft
              </Button>
              <Button type="button" disabled={submitting !== null} onClick={submit('sent')}>
                {submitting === 'sent' ? <Loader2Icon className="animate-spin" /> : null}
                Save and mark as sent
              </Button>
            </>
          ) : (
            <Button type="submit" disabled={submitting !== null}>
              {submitting ? <Loader2Icon className="animate-spin" /> : null}
              Save
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}
