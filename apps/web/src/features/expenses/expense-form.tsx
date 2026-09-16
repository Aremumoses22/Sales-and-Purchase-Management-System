'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { calculateExpenseAmounts, expenseSchema, moneySchema, type ExpenseDto, type ExpenseOutput } from '@spms/shared';
import { Loader2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { VendorCombobox } from '@/components/contact-combobox';
import { Field } from '@/components/field';
import { Money } from '@/components/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useAttachReceipt, useRemoveReceipt, useSaveExpense } from '@/features/expenses/api';
import { ReceiptDropzone } from '@/features/expenses/receipt-dropzone';
import { useLookupQuery } from '@/features/settings/api';
import { todayForInput } from '@/lib/format';
import { applyApiError, showApiError } from '@/lib/forms';
import { useOrganization } from '@/lib/session';

type FormValues = z.input<typeof expenseSchema>;

function toFormValues(expense: ExpenseDto | undefined, defaultVendorId: string | undefined): FormValues {
  return {
    expenseDate: expense?.expenseDate ?? todayForInput(),
    categoryId: expense?.category.id ?? '',
    amount: expense?.amount ?? '',
    amountIsTaxInclusive: expense?.amountIsTaxInclusive ?? false,
    taxId: expense?.tax?.id ?? '',
    paymentModeId: expense?.paymentMode?.id ?? '',
    vendorId: expense?.vendor?.id ?? defaultVendorId ?? '',
    referenceNumber: expense?.referenceNumber ?? '',
    notes: expense?.notes ?? '',
  };
}

export function ExpenseForm({ expense, defaultVendorId }: { expense?: ExpenseDto; defaultVendorId?: string }) {
  const router = useRouter();
  const organization = useOrganization();
  const save = useSaveExpense();
  const attach = useAttachReceipt();
  const removeReceipt = useRemoveReceipt();
  const { data: categories } = useLookupQuery('expense-categories', true);
  const { data: modes } = useLookupQuery('payment-modes', true);
  const { data: taxes } = useLookupQuery('taxes', true);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [dropExisting, setDropExisting] = useState(false);

  const form = useForm<FormValues, unknown, ExpenseOutput>({
    resolver: zodResolver(expenseSchema),
    defaultValues: toFormValues(expense, defaultVendorId),
  });
  const errors = form.formState.errors;
  const [amount, taxId, inclusive] = useWatch({ control: form.control, name: ['amount', 'taxId', 'amountIsTaxInclusive'] });
  const tax = taxes?.find((row) => row.id === taxId);
  // An unchanged tax keeps the rate the expense was saved with.
  const taxRate = tax ? (expense?.tax?.id === tax.id ? expense.tax.rate : tax.rate) : null;
  const amounts = moneySchema.safeParse(amount).success ? calculateExpenseAmounts({ amount, taxRate, amountIsTaxInclusive: inclusive }) : null;

  const onSubmit = form.handleSubmit(async (values) => {
    let saved: ExpenseDto;
    try {
      saved = await save.mutateAsync({ id: expense?.id, input: values });
    } catch (error) {
      applyApiError(error, form);
      return;
    }
    // The expense is saved even if the receipt fails; the user can attach it again from the detail page.
    try {
      if (receipt) await attach.mutateAsync({ id: saved.id, file: receipt });
      else if (dropExisting && expense?.receipt) await removeReceipt.mutateAsync(saved.id);
    } catch (error) {
      showApiError(error);
    }
    toast.success(expense ? 'Expense updated' : 'Expense recorded');
    router.push(`/expenses/${saved.id}`);
  });

  const busy = form.formState.isSubmitting;

  return (
    <form onSubmit={onSubmit} noValidate className="pb-20">
      <div className="grid gap-6 rounded-xl border bg-card p-6 lg:grid-cols-[1fr_20rem]">
        <div className="grid content-start gap-4 sm:grid-cols-2">
          <Field label="Date" htmlFor="expenseDate" required error={errors.expenseDate?.message}>
            <Input id="expenseDate" type="date" {...form.register('expenseDate')} />
          </Field>
          <Field label="Category" htmlFor="categoryId" required error={errors.categoryId?.message}>
            <NativeSelect id="categoryId" aria-invalid={Boolean(errors.categoryId)} {...form.register('categoryId')}>
              <option value="">Select a category</option>
              {categories
                ?.filter((row) => row.isActive || row.id === expense?.category.id)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field label={`Amount (${organization.currencySymbol})`} htmlFor="amount" required error={errors.amount?.message}>
            <Input id="amount" inputMode="decimal" className="text-right tabular-nums" {...form.register('amount')} />
          </Field>
          <Field label="Paid through" htmlFor="paymentModeId" error={errors.paymentModeId?.message}>
            <NativeSelect id="paymentModeId" {...form.register('paymentModeId')}>
              <option value="">Not specified</option>
              {modes
                ?.filter((row) => row.isActive || row.id === expense?.paymentMode?.id)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field label="Tax" htmlFor="taxId" error={errors.taxId?.message}>
            <NativeSelect id="taxId" {...form.register('taxId')}>
              <option value="">No tax</option>
              {taxes
                ?.filter((row) => row.isActive || row.id === expense?.tax?.id)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} ({row.id === expense?.tax?.id ? expense.tax.rate : row.rate}%)
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field label="Amount is" htmlFor="amountIsTaxInclusive">
            <NativeSelect
              id="amountIsTaxInclusive"
              disabled={!taxId}
              value={inclusive ? 'inclusive' : 'exclusive'}
              onChange={(event) => form.setValue('amountIsTaxInclusive', event.target.value === 'inclusive')}
            >
              <option value="exclusive">Tax exclusive (tax added on top)</option>
              <option value="inclusive">Tax inclusive (tax already in the amount)</option>
            </NativeSelect>
          </Field>
          <Field label="Vendor" htmlFor="vendorId" error={errors.vendorId?.message}>
            <Controller
              control={form.control}
              name="vendorId"
              render={({ field }) => (
                <VendorCombobox id="vendorId" value={field.value} onChange={field.onChange} invalid={Boolean(errors.vendorId)} />
              )}
            />
          </Field>
          <Field label="Reference#" htmlFor="referenceNumber" error={errors.referenceNumber?.message}>
            <Input id="referenceNumber" {...form.register('referenceNumber')} />
          </Field>
          <Field label="Notes" htmlFor="notes" className="sm:col-span-2" error={errors.notes?.message}>
            <Textarea id="notes" rows={3} placeholder="What was this for?" {...form.register('notes')} />
          </Field>

          {amounts && tax ? (
            <dl className="space-y-1 rounded-lg bg-muted/40 px-4 py-3 text-sm sm:col-span-2">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Amount before tax</dt>
                <dd>
                  <Money value={amounts.subtotal} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  {tax.name} ({taxRate}%)
                </dt>
                <dd>
                  <Money value={amounts.taxAmount} />
                </dd>
              </div>
              <div className="flex justify-between border-t pt-1 font-semibold">
                <dt>Total</dt>
                <dd>
                  <Money value={amounts.total} />
                </dd>
              </div>
            </dl>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Receipt</p>
          <ReceiptDropzone
            file={receipt}
            existingName={dropExisting ? null : expense?.receipt?.name}
            onFile={(file) => {
              setReceipt(file);
              setDropExisting(false);
            }}
            onClear={() => {
              setReceipt(null);
              setDropExisting(true);
            }}
            disabled={busy}
          />
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-6 py-3 backdrop-blur lg:left-60">
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2Icon className="animate-spin" /> : null}
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
