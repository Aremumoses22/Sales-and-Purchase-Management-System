'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { creditNoteSchema, type CreditNoteDto, type CreditNoteOutput, type DocumentLineDto, type InvoiceDto } from '@spms/shared';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useSaveCreditNote } from '@/features/credit-notes/api';
import { useInvoices } from '@/features/invoices/api';
import { useLookupQuery, useNumberSeriesFor } from '@/features/settings/api';
import { todayForInput } from '@/lib/format';
import { applyApiError } from '@/lib/forms';
import { useCan } from '@/lib/session';

type FormValues = z.input<typeof creditNoteSchema>;

function linesToForm(lines: DocumentLineDto[]): FormValues['lines'] {
  return lines.map((line) => ({
    itemId: line.itemId,
    name: line.name,
    description: line.description ?? '',
    quantity: line.quantity,
    unit: line.unit,
    rate: line.rate,
    discountType: line.discountType,
    discountValue: line.discountValue,
    taxId: line.taxId ?? '',
  }));
}

function toFormValues(
  creditNote: CreditNoteDto | undefined,
  fromInvoice: InvoiceDto | undefined,
  defaultCustomerId: string | undefined,
): FormValues {
  if (creditNote) {
    return {
      customerId: creditNote.customer.id,
      creditNoteDate: creditNote.creditNoteDate,
      invoiceId: creditNote.invoice?.id ?? '',
      referenceNumber: creditNote.referenceNumber ?? '',
      reason: creditNote.reason ?? '',
      returnToStock: creditNote.returnToStock,
      lines: linesToForm(creditNote.lines),
      shippingCharge: creditNote.shippingCharge,
      adjustment: creditNote.adjustment,
      customerNotes: creditNote.customerNotes ?? '',
      terms: creditNote.terms ?? '',
      saveAs: 'draft',
    };
  }
  // A credit note raised from an invoice starts as a copy of it, ready to trim down.
  return {
    customerId: fromInvoice?.customer.id ?? defaultCustomerId ?? '',
    creditNoteDate: todayForInput(),
    invoiceId: fromInvoice?.id ?? '',
    referenceNumber: '',
    reason: '',
    returnToStock: false,
    lines: fromInvoice ? linesToForm(fromInvoice.lines) : [{ ...EMPTY_LINE }],
    shippingCharge: fromInvoice?.shippingCharge ?? '0.00',
    adjustment: fromInvoice?.adjustment ?? '0.00',
    customerNotes: '',
    terms: '',
    saveAs: 'draft',
  };
}

function InvoiceSelect({ customerId, value, onChange }: { customerId: string; value: string; onChange: (id: string) => void }) {
  const can = useCan();
  const { data } = useInvoices({ customerId, status: 'all', pageSize: 100, sort: '-date' }, Boolean(customerId) && can('invoices:view'));
  const invoices = data?.data.filter((invoice) => invoice.status !== 'void' || invoice.id === value) ?? [];
  return (
    <NativeSelect id="invoiceId" value={value} onChange={(event) => onChange(event.target.value)} disabled={!customerId}>
      <option value="">None</option>
      {invoices.map((invoice) => (
        <option key={invoice.id} value={invoice.id}>
          {invoice.number}
        </option>
      ))}
    </NativeSelect>
  );
}

export function CreditNoteForm({
  creditNote,
  fromInvoice,
  defaultCustomerId,
}: {
  creditNote?: CreditNoteDto;
  fromInvoice?: InvoiceDto;
  defaultCustomerId?: string;
}) {
  const router = useRouter();
  const save = useSaveCreditNote();
  const { data: taxes } = useLookupQuery('taxes', true);
  const { data: series } = useNumberSeriesFor('credit_note', !creditNote);
  const [submitting, setSubmitting] = useState<'draft' | 'open' | null>(null);

  const form = useForm<FormValues, unknown, CreditNoteOutput>({
    resolver: zodResolver(creditNoteSchema),
    defaultValues: toFormValues(creditNote, fromInvoice, defaultCustomerId),
  });
  const bodyForm = form as unknown as UseFormReturn<DocumentBodyValues>;
  const customerId = useWatch({ control: form.control, name: 'customerId' });
  const invoiceId = useWatch({ control: form.control, name: 'invoiceId' }) ?? '';
  const returnToStock = useWatch({ control: form.control, name: 'returnToStock' });
  const errors = form.formState.errors;
  const isDraft = !creditNote || creditNote.status === 'draft';
  const used = creditNote ? Number(creditNote.amountApplied) + Number(creditNote.amountRefunded) > 0 : false;

  const submit = (saveAs: 'draft' | 'open') =>
    form.handleSubmit(async (values) => {
      setSubmitting(saveAs);
      try {
        const saved = await save.mutateAsync({ id: creditNote?.id, input: { ...values, saveAs } });
        toast.success(creditNote ? `Credit note ${saved.number} saved` : `Credit note ${saved.number} created`);
        router.push(`/credit-notes/${saved.id}`);
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
                disabled={used}
                onChange={(id) => {
                  field.onChange(id);
                  // The reference invoice must belong to the chosen customer.
                  form.setValue('invoiceId', '');
                }}
                invalid={Boolean(errors.customerId)}
              />
            )}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Credit note#" htmlFor="number" hint={creditNote ? undefined : 'Assigned automatically when saved'}>
            <Input id="number" value={creditNote?.number ?? series?.preview ?? ''} readOnly disabled />
          </Field>
          <Field label="Credit note date" htmlFor="creditNoteDate" required error={errors.creditNoteDate?.message}>
            <Input id="creditNoteDate" type="date" {...form.register('creditNoteDate')} />
          </Field>
          <Field label="Invoice#" htmlFor="invoiceId" hint="The invoice this credit relates to." error={errors.invoiceId?.message}>
            <InvoiceSelect customerId={customerId} value={invoiceId} onChange={(id) => form.setValue('invoiceId', id)} />
          </Field>
          <Field label="Reference#" htmlFor="referenceNumber" error={errors.referenceNumber?.message}>
            <Input id="referenceNumber" {...form.register('referenceNumber')} />
          </Field>
        </div>

        <Field label="Reason" htmlFor="reason" className="lg:col-span-2" error={errors.reason?.message}>
          <Input id="reason" placeholder="For example: goods returned, damaged in delivery, overcharge" {...form.register('reason')} />
        </Field>

        <label className="flex items-start gap-2 text-sm lg:col-span-2">
          <Checkbox
            className="mt-0.5"
            checked={Boolean(returnToStock)}
            onCheckedChange={(checked) => form.setValue('returnToStock', checked === true)}
          />
          <span>
            Goods were returned
            <span className="block text-xs text-muted-foreground">
              Tracked items on this credit note go back into stock once it is open.
            </span>
          </span>
        </label>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-6">
        <h2 className="text-sm font-semibold">Item table</h2>
        <LineItemsEditor form={bodyForm} taxes={taxes} />

        <div className="grid gap-6 pt-2 lg:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <Field label="Customer notes" htmlFor="customerNotes" hint="Shown on the credit note." error={errors.customerNotes?.message}>
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
          {isDraft ? (
            <>
              <Button type="button" variant="outline" disabled={submitting !== null} onClick={submit('draft')}>
                {submitting === 'draft' ? <Loader2Icon className="animate-spin" /> : null}
                Save as draft
              </Button>
              <Button type="button" disabled={submitting !== null} onClick={submit('open')}>
                {submitting === 'open' ? <Loader2Icon className="animate-spin" /> : null}
                Save as open
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
