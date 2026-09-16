'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ITEM_UNITS, itemSchema, type ItemDto } from '@spms/shared';
import { Loader2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { VendorCombobox } from '@/components/contact-combobox';
import { Field, FormSection } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useSaveItem } from '@/features/items/api';
import { useLookupQuery } from '@/features/settings/api';
import { applyApiError } from '@/lib/forms';
import { useOrganization } from '@/lib/session';

type FormValues = z.input<typeof itemSchema>;

function toFormValues(item: ItemDto | undefined): FormValues {
  return {
    type: item?.type ?? 'goods',
    name: item?.name ?? '',
    sku: item?.sku ?? '',
    unit: item?.unit ?? '',
    sellingPrice: item?.sellingPrice ?? '',
    salesDescription: item?.salesDescription ?? '',
    costPrice: item?.costPrice ?? '',
    purchaseDescription: item?.purchaseDescription ?? '',
    taxId: item?.tax?.id ?? '',
    preferredVendorId: item?.preferredVendor?.id ?? '',
    trackInventory: item?.trackInventory ?? false,
    openingStock: '',
    reorderLevel: item?.reorderLevel ?? '',
  };
}

export function ItemForm({ item }: { item?: ItemDto }) {
  const router = useRouter();
  const organization = useOrganization();
  const save = useSaveItem();
  const { data: taxes } = useLookupQuery('taxes');

  const form = useForm<FormValues, unknown, z.output<typeof itemSchema>>({
    resolver: zodResolver(itemSchema),
    defaultValues: toFormValues(item),
  });
  const errors = form.formState.errors;
  const type = form.watch('type');
  const trackInventory = form.watch('trackInventory');
  // Opening stock can only be set when tracking starts; later changes go through stock adjustments.
  const canSetOpeningStock = !item?.trackInventory;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await save.mutateAsync({ id: item?.id, input: values });
      toast.success(item ? 'Item updated' : 'Item created');
      router.push(`/items/${saved.id}`);
    } catch (error) {
      applyApiError(error, form);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="pb-20">
      <div className="space-y-6 rounded-xl border bg-card p-6">
        <FormSection title="Item">
          <Field label="Type">
            <RadioGroup
              value={type}
              onValueChange={(value) => {
                form.setValue('type', value as 'goods' | 'service');
                if (value === 'service') form.setValue('trackInventory', false);
              }}
              className="flex gap-6"
            >
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="goods" /> Goods
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="service" /> Service
              </label>
            </RadioGroup>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="name" required error={errors.name?.message} className="sm:col-span-2">
              <Input id="name" aria-invalid={Boolean(errors.name)} {...form.register('name')} />
            </Field>
            <Field label="SKU" htmlFor="sku" hint="Stock keeping unit, optional." error={errors.sku?.message}>
              <Input id="sku" {...form.register('sku')} />
            </Field>
            <Field label="Unit" htmlFor="unit" error={errors.unit?.message}>
              <Input id="unit" list="item-units" placeholder="pcs" {...form.register('unit')} />
              <datalist id="item-units">
                {ITEM_UNITS.map((unit) => (
                  <option key={unit} value={unit} />
                ))}
              </datalist>
            </Field>
            <Field label="Default tax" htmlFor="taxId" error={errors.taxId?.message}>
              <NativeSelect id="taxId" {...form.register('taxId')}>
                <option value="">No tax</option>
                {taxes?.map((tax) => (
                  <option key={tax.id} value={tax.id}>
                    {tax.name} ({tax.rate}%)
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </FormSection>

        <div className="grid gap-6 lg:grid-cols-2">
          <FormSection title="Sales information" description="Used on quotes, invoices and sales receipts.">
            <Field label={`Selling price (${organization.currencySymbol})`} htmlFor="sellingPrice" error={errors.sellingPrice?.message}>
              <Input id="sellingPrice" inputMode="decimal" className="tabular-nums" {...form.register('sellingPrice')} />
            </Field>
            <Field label="Sales description" htmlFor="salesDescription" error={errors.salesDescription?.message}>
              <Textarea id="salesDescription" rows={3} {...form.register('salesDescription')} />
            </Field>
          </FormSection>

          <FormSection title="Purchase information" description="What the item costs you.">
            <Field label={`Cost price (${organization.currencySymbol})`} htmlFor="costPrice" error={errors.costPrice?.message}>
              <Input id="costPrice" inputMode="decimal" className="tabular-nums" {...form.register('costPrice')} />
            </Field>
            <Field label="Purchase description" htmlFor="purchaseDescription" error={errors.purchaseDescription?.message}>
              <Textarea id="purchaseDescription" rows={3} {...form.register('purchaseDescription')} />
            </Field>
            <Field label="Preferred vendor" htmlFor="preferredVendorId" error={errors.preferredVendorId?.message}>
              <Controller
                control={form.control}
                name="preferredVendorId"
                render={({ field }) => (
                  <VendorCombobox
                    id="preferredVendorId"
                    value={field.value}
                    onChange={field.onChange}
                    invalid={Boolean(errors.preferredVendorId)}
                  />
                )}
              />
            </Field>
          </FormSection>
        </div>

        {type === 'goods' ? (
          <FormSection title="Inventory">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={Boolean(trackInventory)}
                onCheckedChange={(checked) => form.setValue('trackInventory', checked === true)}
              />
              Track stock for this item
            </label>
            {errors.trackInventory?.message ? (
              <p className="text-xs text-destructive">{errors.trackInventory.message}</p>
            ) : null}

            {trackInventory ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {canSetOpeningStock ? (
                  <Field label="Opening stock" htmlFor="openingStock" hint="Quantity on hand today." error={errors.openingStock?.message}>
                    <Input id="openingStock" inputMode="decimal" className="tabular-nums" {...form.register('openingStock')} />
                  </Field>
                ) : null}
                <Field
                  label="Reorder level"
                  htmlFor="reorderLevel"
                  hint="Flag the item as low on stock at or below this quantity."
                  error={errors.reorderLevel?.message}
                >
                  <Input id="reorderLevel" inputMode="decimal" className="tabular-nums" {...form.register('reorderLevel')} />
                </Field>
              </div>
            ) : null}
          </FormSection>
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-6 py-3 backdrop-blur lg:left-60">
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2Icon className="animate-spin" /> : null}
            Save
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}
