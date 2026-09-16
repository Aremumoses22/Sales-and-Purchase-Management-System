'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { addDays, billSchema, isDateOnly, type BillDto, type BillOutput } from '@spms/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { VendorCombobox } from '@/components/contact-combobox';
import { LineItemsEditor } from '@/components/documents/line-items-editor';
import { TotalsPanel } from '@/components/documents/totals-panel';
import { EMPTY_LINE, type DocumentBodyValues } from '@/components/documents/types';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useSaveBill } from '@/features/bills/api';
import { useLookupQuery } from '@/features/settings/api';
import { vendorQuery } from '@/features/vendors/api';
import { todayForInput } from '@/lib/format';
import { applyApiError } from '@/lib/forms';

type FormValues = z.input<typeof billSchema>;

function toFormValues(bill: BillDto | undefined, defaultVendorId: string | undefined): FormValues {
  if (!bill) {
    const today = todayForInput();
    return {
      vendorId: defaultVendorId ?? '',
      billNumber: '',
      orderNumber: '',
      billDate: today,
      dueDate: today,
      paymentTermId: '',
      lines: [{ ...EMPTY_LINE }],
      shippingCharge: '0.00',
      adjustment: '0.00',
      customerNotes: '',
      terms: '',
      saveAs: 'open',
    };
  }
  return {
    vendorId: bill.vendor.id,
    billNumber: bill.billNumber,
    orderNumber: bill.orderNumber ?? '',
    billDate: bill.billDate,
    dueDate: bill.dueDate,
    paymentTermId: bill.paymentTerm?.id ?? '',
    lines: bill.lines.map((line) => ({
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
    shippingCharge: bill.shippingCharge,
    adjustment: bill.adjustment,
    customerNotes: bill.notes ?? '',
    terms: bill.terms ?? '',
    saveAs: 'draft',
  };
}

export function BillForm({ bill, defaultVendorId }: { bill?: BillDto; defaultVendorId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const save = useSaveBill();
  const { data: taxes } = useLookupQuery('taxes', true);
  const { data: terms } = useLookupQuery('payment-terms', true);
  const [submitting, setSubmitting] = useState<'draft' | 'open' | null>(null);
  const prefilled = useRef(false);

  const form = useForm<FormValues, unknown, BillOutput>({
    resolver: zodResolver(billSchema),
    defaultValues: toFormValues(bill, defaultVendorId),
  });
  const bodyForm = form as unknown as UseFormReturn<DocumentBodyValues>;
  const paymentTermId = useWatch({ control: form.control, name: 'paymentTermId' }) ?? '';
  const errors = form.formState.errors;
  const isDraft = !bill || bill.status === 'draft';

  /** Due date follows the payment term. */
  const applyTerm = (termId: string) => {
    form.setValue('paymentTermId', termId);
    const term = terms?.find((candidate) => candidate.id === termId);
    const billDate = form.getValues('billDate');
    if (term && isDateOnly(billDate)) {
      form.setValue('dueDate', addDays(billDate, term.days), { shouldValidate: form.formState.isSubmitted });
    }
  };

  const chooseVendor = async (id: string) => {
    form.setValue('vendorId', id, { shouldValidate: form.formState.isSubmitted });
    const vendor = await queryClient.fetchQuery(vendorQuery(id));
    applyTerm(vendor.paymentTerm?.id ?? terms?.find((term) => term.isDefault)?.id ?? '');
  };

  useEffect(() => {
    if (bill || prefilled.current || !terms) return;
    prefilled.current = true;
    if (defaultVendorId) void chooseVendor(defaultVendorId);
    else applyTerm(terms.find((term) => term.isDefault)?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terms]);

  const submit = (saveAs: 'draft' | 'open') =>
    form.handleSubmit(async (values) => {
      setSubmitting(saveAs);
      try {
        const saved = await save.mutateAsync({ id: bill?.id, input: { ...values, saveAs } });
        toast.success(bill ? `Bill ${saved.billNumber} saved` : `Bill ${saved.billNumber} recorded`);
        router.push(`/bills/${saved.id}`);
      } catch (error) {
        applyApiError(error, form);
      } finally {
        setSubmitting(null);
      }
    });

  return (
    <form onSubmit={submit('draft')} noValidate className="space-y-4 pb-20">
      <div className="grid gap-5 rounded-xl border bg-card p-6 lg:grid-cols-2">
        <Field label="Vendor" htmlFor="vendorId" required error={errors.vendorId?.message}>
          <Controller
            control={form.control}
            name="vendorId"
            render={({ field }) => (
              <VendorCombobox id="vendorId" value={field.value} onChange={(id) => void chooseVendor(id)} invalid={Boolean(errors.vendorId)} />
            )}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bill#" htmlFor="billNumber" required hint="The number on the vendor's invoice." error={errors.billNumber?.message}>
            <Input id="billNumber" aria-invalid={Boolean(errors.billNumber)} {...form.register('billNumber')} />
          </Field>
          <Field label="Order number" htmlFor="orderNumber" error={errors.orderNumber?.message}>
            <Input id="orderNumber" {...form.register('orderNumber')} />
          </Field>
          <Field label="Bill date" htmlFor="billDate" required error={errors.billDate?.message}>
            <Input id="billDate" type="date" {...form.register('billDate', { onChange: () => applyTerm(form.getValues('paymentTermId') ?? '') })} />
          </Field>
          <Field label="Terms" htmlFor="paymentTermId" error={errors.paymentTermId?.message}>
            <NativeSelect id="paymentTermId" value={paymentTermId} onChange={(event) => applyTerm(event.target.value)}>
              <option value="">Custom</option>
              {terms
                ?.filter((term) => term.isActive || term.id === bill?.paymentTerm?.id)
                .map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field label="Due date" htmlFor="dueDate" required error={errors.dueDate?.message}>
            <Input id="dueDate" type="date" {...form.register('dueDate', { onChange: () => form.setValue('paymentTermId', '') })} />
          </Field>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-6">
        <h2 className="text-sm font-semibold">Item table</h2>
        <LineItemsEditor form={bodyForm} taxes={taxes} pricing="purchase" />
        <div className="grid gap-6 pt-2 lg:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <Field label="Notes" htmlFor="customerNotes" hint="For internal use." error={errors.customerNotes?.message}>
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
