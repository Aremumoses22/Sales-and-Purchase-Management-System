'use client';

import type { PaymentRefundInput } from '@spms/shared';
import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useLookupQuery } from '@/features/settings/api';
import { ApiError } from '@/lib/api';
import { todayForInput } from '@/lib/format';
import { showApiError } from '@/lib/forms';

/** Records money handed back to a customer from an unused payment or a credit note. */
export function RefundDialog({
  title,
  description,
  defaultAmount,
  busy,
  onSubmit,
  onClose,
}: {
  title: string;
  description: string;
  defaultAmount: string;
  busy: boolean;
  onSubmit: (input: PaymentRefundInput) => Promise<unknown>;
  onClose: () => void;
}) {
  const { data: modes } = useLookupQuery('payment-modes');
  const [values, setValues] = useState({ refundDate: todayForInput(), amount: defaultAmount, paymentModeId: '', referenceNumber: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async () => {
    setErrors({});
    try {
      await onSubmit(values);
      toast.success('Refund recorded');
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.length) {
        setErrors(Object.fromEntries(error.fieldErrors.map((issue) => [issue.path, issue.message])));
      } else showApiError(error);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Refund date" htmlFor="refundDate" error={errors['refundDate']}>
            <Input id="refundDate" type="date" value={values.refundDate} onChange={(e) => setValues({ ...values, refundDate: e.target.value })} />
          </Field>
          <Field label="Amount" htmlFor="refundAmount" error={errors['amount']}>
            <Input id="refundAmount" inputMode="decimal" className="text-right" value={values.amount} onChange={(e) => setValues({ ...values, amount: e.target.value })} />
          </Field>
          <Field label="Paid through" htmlFor="refundMode" error={errors['paymentModeId']}>
            <NativeSelect id="refundMode" value={values.paymentModeId} onChange={(e) => setValues({ ...values, paymentModeId: e.target.value })}>
              <option value="">Not specified</option>
              {modes?.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Reference#" htmlFor="refundReference" error={errors['referenceNumber']}>
            <Input id="refundReference" value={values.referenceNumber} onChange={(e) => setValues({ ...values, referenceNumber: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2Icon className="animate-spin" /> : null}
            Save refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
