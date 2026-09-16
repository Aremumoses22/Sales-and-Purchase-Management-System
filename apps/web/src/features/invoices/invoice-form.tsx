'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { addDays, invoiceSchema, isDateOnly, type InvoiceDto, type InvoiceOutput } from '@spms/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
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
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { customerQuery, useCustomer } from '@/features/customers/api';
import { useSaveInvoice } from '@/features/invoices/api';
import { useLookupQuery, useNumberSeriesFor } from '@/features/settings/api';
import { addressLines } from '@/lib/address';
import { todayForInput } from '@/lib/format';
import { applyApiError } from '@/lib/forms';

type FormValues = z.input<typeof invoiceSchema>;

function toFormValues(invoice: InvoiceDto | undefined, defaultCustomerId: string | undefined): FormValues {
  if (!invoice) {
    const today = todayForInput();
    return {
      customerId: defaultCustomerId ?? '',
      invoiceDate: today,
      dueDate: today,
      paymentTermId: '',
      orderNumber: '',
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
    customerId: invoice.customer.id,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    paymentTermId: invoice.paymentTerm?.id ?? '',
    orderNumber: invoice.orderNumber ?? '',
    subject: invoice.subject ?? '',
    lines: invoice.lines.map((line) => ({
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
    shippingCharge: invoice.shippingCharge,
    adjustment: invoice.adjustment,
    customerNotes: invoice.customerNotes ?? '',
    terms: invoice.terms ?? '',
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

export function InvoiceForm({ invoice, defaultCustomerId }: { invoice?: InvoiceDto; defaultCustomerId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const save = useSaveInvoice();
  const { data: taxes } = useLookupQuery('taxes', true);
  const { data: terms } = useLookupQuery('payment-terms', true);
  const { data: series } = useNumberSeriesFor('invoice', !invoice);
  const [submitting, setSubmitting] = useState<'draft' | 'sent' | null>(null);
  const prefilled = useRef(false);

  const form = useForm<FormValues, unknown, InvoiceOutput>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: toFormValues(invoice, defaultCustomerId),
  });
  const bodyForm = form as unknown as UseFormReturn<DocumentBodyValues>;
  const customerId = useWatch({ control: form.control, name: 'customerId' });
  const errors = form.formState.errors;
  const isDraft = !invoice || invoice.status === 'draft';

  /** Due date follows the payment term, the way Zoho fills it in. */
  const applyTerm = (termId: string) => {
    form.setValue('paymentTermId', termId);
    const term = terms?.find((candidate) => candidate.id === termId);
    const invoiceDate = form.getValues('invoiceDate');
    if (term && isDateOnly(invoiceDate)) {
      form.setValue('dueDate', addDays(invoiceDate, term.days), { shouldValidate: form.formState.isSubmitted });
    }
  };

  const chooseCustomer = async (id: string) => {
    form.setValue('customerId', id, { shouldValidate: form.formState.isSubmitted });
    const customer = await queryClient.fetchQuery(customerQuery(id));
    applyTerm(customer.paymentTerm?.id ?? terms?.find((term) => term.isDefault)?.id ?? '');
  };

  // New invoices opened from a customer page start with that customer's terms.
  useEffect(() => {
    if (invoice || prefilled.current || !terms) return;
    prefilled.current = true;
    if (defaultCustomerId) void chooseCustomer(defaultCustomerId);
    else applyTerm(terms.find((term) => term.isDefault)?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terms]);

  const submit = (saveAs: 'draft' | 'sent') =>
    form.handleSubmit(async (values) => {
      setSubmitting(saveAs);
      try {
        const saved = await save.mutateAsync({ id: invoice?.id, input: { ...values, saveAs } });
        toast.success(invoice ? `Invoice ${saved.number} saved` : `Invoice ${saved.number} created`);
        router.push(`/invoices/${saved.id}`);
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
              <CustomerCombobox
                id="customerId"
                value={field.value}
                onChange={(id) => void chooseCustomer(id)}
                invalid={Boolean(errors.customerId)}
              />
            )}
          />
          {customerId ? <CustomerSummary customerId={customerId} /> : null}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Invoice#" htmlFor="number" hint={invoice ? undefined : 'Assigned automatically when saved'}>
            <Input id="number" value={invoice?.number ?? series?.preview ?? ''} readOnly disabled />
          </Field>
          <Field label="Order number" htmlFor="orderNumber" error={errors.orderNumber?.message}>
            <Input id="orderNumber" {...form.register('orderNumber')} />
          </Field>
          <Field label="Invoice date" htmlFor="invoiceDate" required error={errors.invoiceDate?.message}>
            <Input
              id="invoiceDate"
              type="date"
              {...form.register('invoiceDate', { onChange: () => applyTerm(form.getValues('paymentTermId') ?? '') })}
            />
          </Field>
          <Field label="Terms" htmlFor="paymentTermId" error={errors.paymentTermId?.message}>
            <NativeSelect
              id="paymentTermId"
              value={useWatch({ control: form.control, name: 'paymentTermId' }) ?? ''}
              onChange={(event) => applyTerm(event.target.value)}
            >
              <option value="">Custom</option>
              {terms
                ?.filter((term) => term.isActive || term.id === invoice?.paymentTerm?.id)
                .map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field label="Due date" htmlFor="dueDate" required error={errors.dueDate?.message} className="sm:col-span-2 lg:col-span-1">
            <Input
              id="dueDate"
              type="date"
              {...form.register('dueDate', { onChange: () => form.setValue('paymentTermId', '') })}
            />
          </Field>
        </div>

        <Field label="Subject" htmlFor="subject" className="lg:col-span-2" error={errors.subject?.message}>
          <Input id="subject" placeholder="Let your customer know what this invoice is for" {...form.register('subject')} />
        </Field>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-6">
        <h2 className="text-sm font-semibold">Item table</h2>
        <LineItemsEditor form={bodyForm} taxes={taxes} />

        <div className="grid gap-6 pt-2 lg:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <Field label="Customer notes" htmlFor="customerNotes" hint="Shown on the invoice." error={errors.customerNotes?.message}>
              <Textarea id="customerNotes" rows={3} placeholder="Thank you for your business." {...form.register('customerNotes')} />
            </Field>
            <Field label="Terms & conditions" htmlFor="terms" error={errors.terms?.message}>
              <Textarea id="terms" rows={3} placeholder="Bank details, late payment terms…" {...form.register('terms')} />
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
