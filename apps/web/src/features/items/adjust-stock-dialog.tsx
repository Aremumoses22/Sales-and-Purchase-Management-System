'use client';

import { stockAdjustmentSchema, type ItemDto } from '@spms/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAdjustStock } from '@/features/items/api';
import { formatNumber, todayForInput } from '@/lib/format';
import { applyApiError } from '@/lib/forms';

const REASONS = ['Stock count', 'Damaged goods', 'Stolen goods', 'Stock written off', 'Received without a bill', 'Returned by customer'];

type Mode = 'change' | 'newQuantity';

/**
 * Zoho lets you enter either the change or the counted quantity; both become a signed
 * quantity change on the server.
 */
export function AdjustStockDialog({ item, onClose }: { item: ItemDto; onClose: () => void }) {
  const adjust = useAdjustStock();
  const [mode, setMode] = useState<Mode>('newQuantity');
  const [counted, setCounted] = useState('');
  const current = Number(item.stockOnHand ?? 0);

  const form = useForm<z.input<typeof stockAdjustmentSchema>, unknown, z.output<typeof stockAdjustmentSchema>>({
    resolver: zodResolver(stockAdjustmentSchema),
    defaultValues: { date: todayForInput(), quantityChange: '', reason: '' },
  });

  const change = mode === 'newQuantity' && counted !== '' ? String(Number(counted) - current) : form.watch('quantityChange');
  const resulting = current + Number(change || 0);

  const onSubmit = form.handleSubmit(
    async (values) => {
      try {
        await adjust.mutateAsync({ id: item.id, input: values });
        toast.success('Stock adjusted');
        onClose();
      } catch (error) {
        applyApiError(error, form);
      }
    },
  );

  const submit = (event: React.FormEvent) => {
    if (mode === 'newQuantity') {
      const delta = Number(counted) - current;
      form.setValue('quantityChange', counted === '' || Number.isNaN(delta) ? '' : String(Number(delta.toFixed(3))));
    }
    return onSubmit(event);
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            {item.name}: currently {formatNumber(item.stockOnHand)} {item.unit ?? ''} on hand.
          </DialogDescription>
        </DialogHeader>

        <form id="adjust-stock" onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
            {(['newQuantity', 'change'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className={`rounded-md px-2 py-1 ${mode === option ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}
              >
                {option === 'newQuantity' ? 'New quantity on hand' : 'Quantity change'}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" htmlFor="date" error={form.formState.errors.date?.message}>
              <Input id="date" type="date" {...form.register('date')} />
            </Field>
            {mode === 'newQuantity' ? (
              <Field label="Counted quantity" htmlFor="counted" error={form.formState.errors.quantityChange?.message}>
                <Input id="counted" inputMode="decimal" value={counted} onChange={(event) => setCounted(event.target.value)} />
              </Field>
            ) : (
              <Field
                label="Change"
                htmlFor="quantityChange"
                hint="Use a minus sign to reduce stock, e.g. -3"
                error={form.formState.errors.quantityChange?.message}
              >
                <Input id="quantityChange" inputMode="decimal" {...form.register('quantityChange')} />
              </Field>
            )}
          </div>

          <Field label="Reason" htmlFor="reason" required error={form.formState.errors.reason?.message}>
            <Input id="reason" list="adjustment-reasons" {...form.register('reason')} />
            <datalist id="adjustment-reasons">
              {REASONS.map((reason) => (
                <option key={reason} value={reason} />
              ))}
            </datalist>
          </Field>

          <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
            Stock after adjustment:{' '}
            <span className={resulting < 0 ? 'font-medium text-destructive' : 'font-medium'}>
              {Number.isFinite(resulting) ? formatNumber(resulting) : '—'}
            </span>
          </p>
        </form>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="adjust-stock" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2Icon className="animate-spin" /> : null}
            Save adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
