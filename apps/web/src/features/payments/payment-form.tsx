'use client';

import { moneyString, toDecimal, type PaymentReceivedDto } from '@spms/shared';
import { cn } from 'cn';
import { Loader2Icon, WandSparklesIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { CustomerCombobox } from '@/components/customer-combobox';
import { Field } from '@/components/field';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useOpenInvoices, useSavePayment } from '@/features/payments/api';
import { useLookupQuery, useNumberSeriesFor } from '@/features/settings/api';
import { ApiError } from '@/lib/api';
import { formatDate, formatMoney, todayForInput } from '@/lib/format';
import { useOrganization } from '@/lib/session';

interface HeaderValues {
  customerId: string;
  paymentDate: string;
  amount: string;
  bankCharges: string;
  paymentModeId: string;
  referenceNumber: string;
  notes: string;
}

const HEADER_FIELDS: (keyof HeaderValues)[] = ['customerId', 'paymentDate', 'amount', 'bankCharges', 'paymentModeId', 'referenceNumber', 'notes'];

function isAmount(value: string): boolean {
  return /^\d{1,15}(\.\d{1,2})?$/.test(value.trim());
}

/**
 * Zoho's "Record payment": choose the customer, and their unpaid invoices appear with a
 * payment box each. Whatever is not applied stays with the customer as unused credit.
 */
export function PaymentForm({
  payment,
  defaultCustomerId,
  defaultInvoiceId,
}: {
  payment?: PaymentReceivedDto;
  defaultCustomerId?: string;
  defaultInvoiceId?: string;
}) {
  const router = useRouter();
  const organization = useOrganization();
  const save = useSavePayment();
  const { data: modes } = useLookupQuery('payment-modes');
  const { data: series } = useNumberSeriesFor('payment_received', !payment);

  const form = useForm<HeaderValues>({
    defaultValues: {
      customerId: payment?.customer.id ?? defaultCustomerId ?? '',
      paymentDate: payment?.paymentDate ?? todayForInput(),
      amount: payment?.amount ?? '',
      bankCharges: payment && Number(payment.bankCharges) > 0 ? payment.bankCharges : '',
      paymentModeId: payment?.paymentMode?.id ?? '',
      referenceNumber: payment?.referenceNumber ?? '',
      notes: payment?.notes ?? '',
    },
  });
  const customerId = form.watch('customerId');
  const amount = form.watch('amount');
  const errors = form.formState.errors;

  const { data: invoices, isFetching } = useOpenInvoices(customerId, payment?.id);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const initialisedFor = useRef<string | null>(null);

  // Default payment mode for new payments.
  useEffect(() => {
    if (!payment && modes && !form.getValues('paymentModeId')) {
      form.setValue('paymentModeId', modes.find((mode) => mode.isDefault)?.id ?? '');
    }
  }, [modes, payment, form]);

  // When a customer's invoices load: keep an edited payment's split, or pre-fill the invoice we came from.
  useEffect(() => {
    if (!invoices || initialisedFor.current === customerId) return;
    initialisedFor.current = customerId;
    const next: Record<string, string> = {};
    for (const invoice of invoices) {
      if (Number(invoice.allocated) > 0) next[invoice.id] = invoice.allocated;
    }
    const target = defaultInvoiceId ? invoices.find((invoice) => invoice.id === defaultInvoiceId) : undefined;
    if (target && !payment) {
      next[target.id] = target.balanceDue;
      if (!form.getValues('amount')) form.setValue('amount', target.balanceDue);
    }
    setAllocations(next);
    setRowErrors({});
  }, [invoices, customerId, defaultInvoiceId, payment, form]);

  const received = isAmount(amount) ? toDecimal(amount) : toDecimal(0);
  const used = useMemo(
    () => Object.values(allocations).reduce((sum, value) => sum.plus(isAmount(value) ? toDecimal(value) : 0), toDecimal(0)),
    [allocations],
  );
  const excess = received.minus(used);
  const money = (value: string | number) => formatMoney(value, organization);

  const setAllocation = (invoiceId: string, value: string) => {
    setAllocations((current) => ({ ...current, [invoiceId]: value }));
    setRowErrors((current) => ({ ...current, [invoiceId]: '' }));
  };

  /** Spreads the amount received across invoices, oldest first. */
  const applyToOldest = () => {
    let remaining = received;
    const next: Record<string, string> = {};
    for (const invoice of invoices ?? []) {
      if (remaining.lte(0)) break;
      const share = remaining.lt(invoice.balanceDue) ? remaining : toDecimal(invoice.balanceDue);
      next[invoice.id] = moneyString(share);
      remaining = remaining.minus(share);
    }
    setAllocations(next);
    setRowErrors({});
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(undefined);
    const submitted = Object.entries(allocations)
      .filter(([, value]) => isAmount(value) && Number(value) > 0)
      .map(([invoiceId, value]) => ({ invoiceId, amount: value.trim() }));

    const localErrors: Record<string, string> = {};
    for (const invoice of invoices ?? []) {
      const value = allocations[invoice.id]?.trim();
      if (value && !isAmount(value)) localErrors[invoice.id] = 'Enter a valid amount';
      else if (value && toDecimal(value).gt(invoice.balanceDue)) localErrors[invoice.id] = `Only ${money(invoice.balanceDue)} is due`;
    }
    if (Object.keys(localErrors).length) {
      setRowErrors(localErrors);
      return;
    }
    if (used.gt(received)) {
      setFormError('The amount applied to invoices is more than the amount received.');
      return;
    }

    try {
      const saved = await save.mutateAsync({
        id: payment?.id,
        input: {
          customerId: values.customerId,
          paymentDate: values.paymentDate,
          amount: values.amount,
          bankCharges: values.bankCharges || '0',
          paymentModeId: values.paymentModeId,
          referenceNumber: values.referenceNumber,
          notes: values.notes,
          allocations: submitted,
        },
      });
      toast.success(payment ? `Payment ${saved.number} updated` : `Payment ${saved.number} recorded`);
      router.push(`/payments-received/${saved.id}`);
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFormError('Something went wrong. Please try again.');
        return;
      }
      const fromServer: Record<string, string> = {};
      for (const issue of error.fieldErrors) {
        const match = /^allocations\.(\d+)\./.exec(issue.path);
        const allocation = match ? submitted[Number(match[1])] : undefined;
        if (allocation) fromServer[allocation.invoiceId] = issue.message;
        else if (HEADER_FIELDS.includes(issue.path as keyof HeaderValues)) {
          form.setError(issue.path as keyof HeaderValues, { message: issue.message });
        } else setFormError(issue.message);
      }
      setRowErrors(fromServer);
      if (error.fieldErrors.length === 0) setFormError(error.message);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4 pb-20">
      <div className="grid gap-5 rounded-xl border bg-card p-6 lg:grid-cols-2">
        <Field label="Customer" htmlFor="customerId" required error={errors.customerId?.message}>
          <CustomerCombobox
            id="customerId"
            value={customerId}
            invalid={Boolean(errors.customerId)}
            onChange={(id) => {
              form.setValue('customerId', id);
              form.clearErrors('customerId');
            }}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount received" htmlFor="amount" required error={errors.amount?.message}>
            <Input
              id="amount"
              inputMode="decimal"
              className="text-right tabular-nums"
              aria-invalid={Boolean(errors.amount)}
              {...form.register('amount', {
                required: 'Enter the amount received',
                validate: (value) => (isAmount(value) && Number(value) > 0) || 'Enter an amount greater than 0',
              })}
            />
          </Field>
          <Field label="Bank charges" htmlFor="bankCharges" hint="If any" error={errors.bankCharges?.message}>
            <Input
              id="bankCharges"
              inputMode="decimal"
              className="text-right tabular-nums"
              {...form.register('bankCharges', { validate: (value) => !value || isAmount(value) || 'Enter a valid amount' })}
            />
          </Field>
          <Field label="Payment date" htmlFor="paymentDate" required error={errors.paymentDate?.message}>
            <Input id="paymentDate" type="date" {...form.register('paymentDate', { required: 'Choose the payment date' })} />
          </Field>
          <Field label="Payment#" htmlFor="number" hint={payment ? undefined : 'Assigned automatically when saved'}>
            <Input id="number" value={payment?.number ?? series?.preview ?? ''} readOnly disabled />
          </Field>
          <Field label="Payment mode" htmlFor="paymentModeId" error={errors.paymentModeId?.message}>
            <NativeSelect id="paymentModeId" {...form.register('paymentModeId')}>
              <option value="">Not specified</option>
              {modes?.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Reference#" htmlFor="referenceNumber" hint="Transfer or cheque number" error={errors.referenceNumber?.message}>
            <Input id="referenceNumber" {...form.register('referenceNumber')} />
          </Field>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Unpaid invoices</h2>
          {invoices?.length ? (
            <Button type="button" variant="outline" size="sm" onClick={applyToOldest} disabled={received.lte(0)}>
              <WandSparklesIcon />
              Apply to oldest invoices
            </Button>
          ) : null}
        </div>

        {!customerId ? (
          <p className="text-sm text-muted-foreground">Choose a customer to see their unpaid invoices.</p>
        ) : isFetching && !invoices ? (
          <Loader2Icon className="mx-auto my-6 size-5 animate-spin text-muted-foreground" />
        ) : !invoices?.length ? (
          <p className="text-sm text-muted-foreground">
            This customer has no unpaid invoices. The full amount will be kept as unused credit.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-left font-medium">Invoice#</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Invoice amount</th>
                  <th className="px-3 py-2 text-right font-medium">Amount due</th>
                  <th className="w-44 px-3 py-2 text-right font-medium">Payment</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t align-top">
                    <td className="px-3 py-2.5">
                      {formatDate(invoice.invoiceDate, organization)}
                      <p className="text-xs text-muted-foreground">Due {formatDate(invoice.dueDate, organization)}</p>
                    </td>
                    <td className="px-3 py-2.5 font-medium">{invoice.number}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={invoice.displayStatus} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(invoice.total)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {money(invoice.balanceDue)}
                      <button
                        type="button"
                        className="block w-full text-right text-xs text-primary hover:underline"
                        onClick={() => setAllocation(invoice.id, invoice.balanceDue)}
                      >
                        Pay in full
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        inputMode="decimal"
                        aria-label={`Payment for ${invoice.number}`}
                        className="text-right tabular-nums"
                        aria-invalid={Boolean(rowErrors[invoice.id])}
                        value={allocations[invoice.id] ?? ''}
                        onChange={(event) => setAllocation(invoice.id, event.target.value)}
                      />
                      {rowErrors[invoice.id] ? <p className="mt-1 text-right text-xs text-destructive">{rowErrors[invoice.id]}</p> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-start justify-between gap-6">
          <Field label="Notes" htmlFor="notes" className="w-full max-w-md" hint="For internal use." error={errors.notes?.message}>
            <Textarea id="notes" rows={3} {...form.register('notes')} />
          </Field>
          <dl className="w-full max-w-sm space-y-2 rounded-xl bg-muted/40 p-4 text-sm">
            <div className="flex justify-between">
              <dt>Amount received</dt>
              <dd className="tabular-nums">{money(received.toFixed(2))}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Amount used for payments</dt>
              <dd className="tabular-nums">{money(used.toFixed(2))}</dd>
            </div>
            <div className={cn('flex justify-between border-t pt-2 font-semibold', excess.lt(0) && 'text-destructive')}>
              <dt>Amount in excess</dt>
              <dd className="tabular-nums">{money(excess.toFixed(2))}</dd>
            </div>
            {excess.gt(0) ? (
              <p className="text-xs text-muted-foreground">Kept as unused credit that can be applied to later invoices or refunded.</p>
            ) : null}
          </dl>
        </div>
        {formError ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p> : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-6 py-3 backdrop-blur lg:left-60">
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2Icon className="animate-spin" /> : null}
            {payment ? 'Save changes' : 'Record payment'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}
