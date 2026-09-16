'use client';

import { moneyString, toDecimal, type PaymentMadeDto } from '@spms/shared';
import { cn } from 'cn';
import { Loader2Icon, WandSparklesIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { VendorCombobox } from '@/components/contact-combobox';
import { Field } from '@/components/field';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useOpenBills, useSavePaymentMade } from '@/features/bills/api';
import { useLookupQuery, useNumberSeriesFor } from '@/features/settings/api';
import { ApiError } from '@/lib/api';
import { formatDate, formatMoney, todayForInput } from '@/lib/format';
import { useOrganization } from '@/lib/session';

interface HeaderValues {
  vendorId: string;
  paymentDate: string;
  amount: string;
  paymentModeId: string;
  referenceNumber: string;
  notes: string;
}

const HEADER_FIELDS: (keyof HeaderValues)[] = ['vendorId', 'paymentDate', 'amount', 'paymentModeId', 'referenceNumber', 'notes'];

function isAmount(value: string): boolean {
  return /^\d{1,15}(\.\d{1,2})?$/.test(value.trim());
}

/**
 * Pay a vendor: choose the vendor, and their unpaid bills appear with a payment box each.
 * Whatever is not applied stays with the vendor as unused credit.
 */
export function PaymentMadeForm({
  payment,
  defaultVendorId,
  defaultBillId,
}: {
  payment?: PaymentMadeDto;
  defaultVendorId?: string;
  defaultBillId?: string;
}) {
  const router = useRouter();
  const organization = useOrganization();
  const save = useSavePaymentMade();
  const { data: modes } = useLookupQuery('payment-modes');
  const { data: series } = useNumberSeriesFor('payment_made', !payment);

  const form = useForm<HeaderValues>({
    defaultValues: {
      vendorId: payment?.vendor.id ?? defaultVendorId ?? '',
      paymentDate: payment?.paymentDate ?? todayForInput(),
      amount: payment?.amount ?? '',
      paymentModeId: payment?.paymentMode?.id ?? '',
      referenceNumber: payment?.referenceNumber ?? '',
      notes: payment?.notes ?? '',
    },
  });
  const vendorId = form.watch('vendorId');
  const amount = form.watch('amount');
  const errors = form.formState.errors;

  const { data: bills, isFetching } = useOpenBills(vendorId, payment?.id);
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

  // When a vendor's bills load: keep an edited payment's split, or pre-fill the bill we came from.
  useEffect(() => {
    if (!bills || initialisedFor.current === vendorId) return;
    initialisedFor.current = vendorId;
    const next: Record<string, string> = {};
    for (const bill of bills) {
      if (Number(bill.allocated) > 0) next[bill.id] = bill.allocated;
    }
    const target = defaultBillId ? bills.find((bill) => bill.id === defaultBillId) : undefined;
    if (target && !payment) {
      next[target.id] = target.balanceDue;
      if (!form.getValues('amount')) form.setValue('amount', target.balanceDue);
    }
    setAllocations(next);
    setRowErrors({});
  }, [bills, vendorId, defaultBillId, payment, form]);

  const received = isAmount(amount) ? toDecimal(amount) : toDecimal(0);
  const used = useMemo(
    () => Object.values(allocations).reduce((sum, value) => sum.plus(isAmount(value) ? toDecimal(value) : 0), toDecimal(0)),
    [allocations],
  );
  const excess = received.minus(used);
  const money = (value: string | number) => formatMoney(value, organization);

  const setAllocation = (billId: string, value: string) => {
    setAllocations((current) => ({ ...current, [billId]: value }));
    setRowErrors((current) => ({ ...current, [billId]: '' }));
  };

  /** Spreads the amount paid across bills, oldest first. */
  const applyToOldest = () => {
    let remaining = received;
    const next: Record<string, string> = {};
    for (const bill of bills ?? []) {
      if (remaining.lte(0)) break;
      const share = remaining.lt(bill.balanceDue) ? remaining : toDecimal(bill.balanceDue);
      next[bill.id] = moneyString(share);
      remaining = remaining.minus(share);
    }
    setAllocations(next);
    setRowErrors({});
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(undefined);
    const submitted = Object.entries(allocations)
      .filter(([, value]) => isAmount(value) && Number(value) > 0)
      .map(([billId, value]) => ({ billId, amount: value.trim() }));

    const localErrors: Record<string, string> = {};
    for (const bill of bills ?? []) {
      const value = allocations[bill.id]?.trim();
      if (value && !isAmount(value)) localErrors[bill.id] = 'Enter a valid amount';
      else if (value && toDecimal(value).gt(bill.balanceDue)) localErrors[bill.id] = `Only ${money(bill.balanceDue)} is due`;
    }
    if (Object.keys(localErrors).length) {
      setRowErrors(localErrors);
      return;
    }
    if (used.gt(received)) {
      setFormError('The amount applied to bills is more than the amount paid.');
      return;
    }

    try {
      const saved = await save.mutateAsync({
        id: payment?.id,
        input: {
          vendorId: values.vendorId,
          paymentDate: values.paymentDate,
          amount: values.amount,
          paymentModeId: values.paymentModeId,
          referenceNumber: values.referenceNumber,
          notes: values.notes,
          allocations: submitted,
        },
      });
      toast.success(payment ? `Payment ${saved.number} updated` : `Payment ${saved.number} recorded`);
      router.push(`/payments-made/${saved.id}`);
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFormError('Something went wrong. Please try again.');
        return;
      }
      const fromServer: Record<string, string> = {};
      for (const issue of error.fieldErrors) {
        const match = /^allocations\.(\d+)\./.exec(issue.path);
        const allocation = match ? submitted[Number(match[1])] : undefined;
        if (allocation) fromServer[allocation.billId] = issue.message;
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
        <Field label="Vendor" htmlFor="vendorId" required error={errors.vendorId?.message}>
          <VendorCombobox
            id="vendorId"
            value={vendorId}
            invalid={Boolean(errors.vendorId)}
            onChange={(id) => {
              form.setValue('vendorId', id);
              form.clearErrors('vendorId');
            }}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount paid" htmlFor="amount" required error={errors.amount?.message}>
            <Input
              id="amount"
              inputMode="decimal"
              className="text-right tabular-nums"
              aria-invalid={Boolean(errors.amount)}
              {...form.register('amount', {
                required: 'Enter the amount paid',
                validate: (value) => (isAmount(value) && Number(value) > 0) || 'Enter an amount greater than 0',
              })}
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
          <h2 className="text-sm font-semibold">Unpaid bills</h2>
          {bills?.length ? (
            <Button type="button" variant="outline" size="sm" onClick={applyToOldest} disabled={received.lte(0)}>
              <WandSparklesIcon />
              Apply to oldest bills
            </Button>
          ) : null}
        </div>

        {!vendorId ? (
          <p className="text-sm text-muted-foreground">Choose a vendor to see their unpaid bills.</p>
        ) : isFetching && !bills ? (
          <Loader2Icon className="mx-auto my-6 size-5 animate-spin text-muted-foreground" />
        ) : !bills?.length ? (
          <p className="text-sm text-muted-foreground">
            This vendor has no unpaid bills. The full amount will be kept as unused credit.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-left font-medium">Bill#</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Bill amount</th>
                  <th className="px-3 py-2 text-right font-medium">Amount due</th>
                  <th className="w-44 px-3 py-2 text-right font-medium">Payment</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => (
                  <tr key={bill.id} className="border-t align-top">
                    <td className="px-3 py-2.5">
                      {formatDate(bill.billDate, organization)}
                      <p className="text-xs text-muted-foreground">Due {formatDate(bill.dueDate, organization)}</p>
                    </td>
                    <td className="px-3 py-2.5 font-medium">{bill.billNumber}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={bill.displayStatus} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(bill.total)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {money(bill.balanceDue)}
                      <button
                        type="button"
                        className="block w-full text-right text-xs text-primary hover:underline"
                        onClick={() => setAllocation(bill.id, bill.balanceDue)}
                      >
                        Pay in full
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        inputMode="decimal"
                        aria-label={`Payment for ${bill.billNumber}`}
                        className="text-right tabular-nums"
                        aria-invalid={Boolean(rowErrors[bill.id])}
                        value={allocations[bill.id] ?? ''}
                        onChange={(event) => setAllocation(bill.id, event.target.value)}
                      />
                      {rowErrors[bill.id] ? <p className="mt-1 text-right text-xs text-destructive">{rowErrors[bill.id]}</p> : null}
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
              <dt>Amount paid</dt>
              <dd className="tabular-nums">{money(received.toFixed(2))}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Amount used for bills</dt>
              <dd className="tabular-nums">{money(used.toFixed(2))}</dd>
            </div>
            <div className={cn('flex justify-between border-t pt-2 font-semibold', excess.lt(0) && 'text-destructive')}>
              <dt>Amount in excess</dt>
              <dd className="tabular-nums">{money(excess.toFixed(2))}</dd>
            </div>
            {excess.gt(0) ? (
              <p className="text-xs text-muted-foreground">Kept as unused credit with the vendor, to apply to later bills by editing this payment.</p>
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
