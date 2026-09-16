'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { salesReceiptSchema, type SalesReceiptDto, type SalesReceiptOutput } from '@spms/shared';
import { Loader2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm, type UseFormReturn } from 'react-hook-form';
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
import { useSaveSalesReceipt } from '@/features/sales-receipts/api';
import { useLookupQuery, useNumberSeriesFor } from '@/features/settings/api';
import { todayForInput } from '@/lib/format';
import { applyApiError } from '@/lib/forms';

type FormValues = z.input<typeof salesReceiptSchema>;

function toFormValues(receipt: SalesReceiptDto | undefined, defaultCustomerId: string | undefined, defaultModeId: string): FormValues {
  if (!receipt) {
    return {
      customerId: defaultCustomerId ?? '',
      receiptDate: todayForInput(),
      paymentModeId: defaultModeId,
      referenceNumber: '',
      lines: [{ ...EMPTY_LINE }],
      shippingCharge: '0.00',
      adjustment: '0.00',
      customerNotes: '',
      terms: '',
      saveAs: 'completed',
    };
  }
  return {
    customerId: receipt.customer.id,
    receiptDate: receipt.receiptDate,
    paymentModeId: receipt.paymentMode?.id ?? '',
    referenceNumber: receipt.referenceNumber ?? '',
    lines: receipt.lines.map((line) => ({
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
    shippingCharge: receipt.shippingCharge,
    adjustment: receipt.adjustment,
    customerNotes: receipt.customerNotes ?? '',
    terms: receipt.terms ?? '',
    saveAs: 'draft',
  };
}

export function SalesReceiptForm({ receipt, defaultCustomerId }: { receipt?: SalesReceiptDto; defaultCustomerId?: string }) {
  const { data: modes } = useLookupQuery('payment-modes', true);
  // Wait for payment modes so a new receipt starts with the default one selected.
  if (!modes) return <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;
  const defaultModeId = modes.find((mode) => mode.isDefault && mode.isActive)?.id ?? '';
  return <ReceiptForm receipt={receipt} defaultCustomerId={defaultCustomerId} defaultModeId={defaultModeId} modes={modes} />;
}

function ReceiptForm({
  receipt,
  defaultCustomerId,
  defaultModeId,
  modes,
}: {
  receipt?: SalesReceiptDto;
  defaultCustomerId?: string;
  defaultModeId: string;
  modes: { id: string; name: string; isActive: boolean }[];
}) {
  const router = useRouter();
  const save = useSaveSalesReceipt();
  const { data: taxes } = useLookupQuery('taxes', true);
  const { data: series } = useNumberSeriesFor('sales_receipt', !receipt);
  const [submitting, setSubmitting] = useState<'draft' | 'completed' | null>(null);

  const form = useForm<FormValues, unknown, SalesReceiptOutput>({
    resolver: zodResolver(salesReceiptSchema),
    defaultValues: toFormValues(receipt, defaultCustomerId, defaultModeId),
  });
  const bodyForm = form as unknown as UseFormReturn<DocumentBodyValues>;
  const errors = form.formState.errors;
  const isDraft = !receipt || receipt.status === 'draft';

  const submit = (saveAs: 'draft' | 'completed') =>
    form.handleSubmit(async (values) => {
      setSubmitting(saveAs);
      try {
        const saved = await save.mutateAsync({ id: receipt?.id, input: { ...values, saveAs } });
        toast.success(receipt ? `Sales receipt ${saved.number} saved` : `Sales receipt ${saved.number} created`);
        router.push(`/sales-receipts/${saved.id}`);
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
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sales receipt#" htmlFor="number" hint={receipt ? undefined : 'Assigned automatically when saved'}>
            <Input id="number" value={receipt?.number ?? series?.preview ?? ''} readOnly disabled />
          </Field>
          <Field label="Receipt date" htmlFor="receiptDate" required error={errors.receiptDate?.message}>
            <Input id="receiptDate" type="date" {...form.register('receiptDate')} />
          </Field>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-6">
        <h2 className="text-sm font-semibold">Item table</h2>
        <LineItemsEditor form={bodyForm} taxes={taxes} />

        <div className="grid gap-6 pt-2 lg:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <Field label="Customer notes" htmlFor="customerNotes" hint="Shown on the receipt." error={errors.customerNotes?.message}>
              <Textarea id="customerNotes" rows={3} placeholder="Thank you for your business." {...form.register('customerNotes')} />
            </Field>
            <Field label="Terms & conditions" htmlFor="terms" error={errors.terms?.message}>
              <Textarea id="terms" rows={3} placeholder="Returns policy, warranty…" {...form.register('terms')} />
            </Field>
          </div>
          <div className="lg:w-[26rem]">
            <TotalsPanel form={bodyForm} taxes={taxes} />
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-6">
        <div>
          <h2 className="text-sm font-semibold">Payment</h2>
          <p className="text-xs text-muted-foreground">The customer paid the full total when the sale was made.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
          <Field label="Payment mode" htmlFor="paymentModeId" error={errors.paymentModeId?.message}>
            <NativeSelect id="paymentModeId" {...form.register('paymentModeId')}>
              <option value="">Not specified</option>
              {modes
                .filter((mode) => mode.isActive || mode.id === receipt?.paymentMode?.id)
                .map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field label="Reference#" htmlFor="referenceNumber" hint="POS slip, transfer or cheque number" error={errors.referenceNumber?.message}>
            <Input id="referenceNumber" {...form.register('referenceNumber')} />
          </Field>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-6 py-3 backdrop-blur lg:left-60">
        <div className="flex flex-wrap items-center gap-2">
          {isDraft ? (
            <>
              <Button type="button" disabled={submitting !== null} onClick={submit('completed')}>
                {submitting === 'completed' ? <Loader2Icon className="animate-spin" /> : null}
                Save
              </Button>
              <Button type="button" variant="outline" disabled={submitting !== null} onClick={submit('draft')}>
                {submitting === 'draft' ? <Loader2Icon className="animate-spin" /> : null}
                Save as draft
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
