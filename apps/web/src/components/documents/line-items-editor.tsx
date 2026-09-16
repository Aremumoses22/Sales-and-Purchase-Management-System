'use client';

import { calculateLineTotals, type ItemListItemDto, type TaxDto } from '@spms/shared';
import { PlusIcon, XIcon } from 'lucide-react';
import { useFieldArray, useWatch, type UseFormReturn } from 'react-hook-form';
import { ItemCombobox } from '@/components/item-combobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { formatMoney } from '@/lib/format';
import { useOrganization } from '@/lib/session';
import { EMPTY_LINE, type DocumentBodyValues } from './types';

function LineAmount({ form, index }: { form: UseFormReturn<DocumentBodyValues>; index: number }) {
  const organization = useOrganization();
  const line = useWatch({ control: form.control, name: `lines.${index}` });
  const totals = calculateLineTotals({
    quantity: line?.quantity,
    rate: line?.rate,
    discountType: line?.discountType ?? 'percent',
    discountValue: line?.discountValue,
  });
  return <span className="tabular-nums">{formatMoney(totals.amount, organization)}</span>;
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-xs text-destructive">{message}</p> : null;
}

/**
 * Zoho-style item table. The item cell is a combobox: pick a saved item (fills description,
 * rate, unit and tax) or type anything for a one-off line.
 */
export function LineItemsEditor({ form, taxes }: { form: UseFormReturn<DocumentBodyValues>; taxes: TaxDto[] | undefined }) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' });
  const lineErrors = form.formState.errors.lines;
  const activeTaxes = taxes?.filter((tax) => tax.isActive) ?? [];

  const pickItem = (index: number, item: ItemListItemDto) => {
    form.setValue(`lines.${index}.itemId`, item.id, { shouldDirty: true });
    form.setValue(`lines.${index}.name`, item.name, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
    form.setValue(`lines.${index}.description`, item.salesDescription ?? '');
    form.setValue(`lines.${index}.rate`, item.sellingPrice ?? '0');
    form.setValue(`lines.${index}.unit`, item.unit);
    form.setValue(`lines.${index}.taxId`, item.taxId);
  };

  const applyText = (index: number, text: string) => {
    form.setValue(`lines.${index}.itemId`, null, { shouldDirty: true });
    form.setValue(`lines.${index}.name`, text, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2 text-left font-medium">#</th>
              <th className="px-2 py-2 text-left font-medium">Item details</th>
              <th className="w-24 px-2 py-2 text-right font-medium">Quantity</th>
              <th className="w-28 px-2 py-2 text-right font-medium">Rate</th>
              <th className="w-36 px-2 py-2 text-right font-medium">Discount</th>
              <th className="w-44 px-2 py-2 text-left font-medium">Tax</th>
              <th className="w-28 px-2 py-2 text-right font-medium">Amount</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {fields.map((field, index) => {
              const errors = Array.isArray(lineErrors) ? lineErrors[index] : undefined;
              const name = form.watch(`lines.${index}.name`);
              const itemId = form.watch(`lines.${index}.itemId`);
              return (
                <tr key={field.id} className="border-t align-top">
                  <td className="px-2 py-3 text-muted-foreground">{index + 1}</td>
                  <td className="space-y-1.5 px-2 py-2">
                    <ItemCombobox
                      label={name}
                      linked={Boolean(itemId)}
                      invalid={Boolean(errors?.name)}
                      onPickItem={(item) => pickItem(index, item)}
                      onUseText={(text) => applyText(index, text)}
                    />
                    <FieldError message={errors?.name?.message ?? errors?.itemId?.message} />
                    <Textarea
                      rows={1}
                      placeholder="Description"
                      className="min-h-8 resize-y text-xs"
                      aria-label={`Line ${index + 1} description`}
                      {...form.register(`lines.${index}.description`)}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      inputMode="decimal"
                      className="text-right tabular-nums"
                      aria-label={`Line ${index + 1} quantity`}
                      aria-invalid={Boolean(errors?.quantity)}
                      {...form.register(`lines.${index}.quantity`)}
                    />
                    <FieldError message={errors?.quantity?.message} />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      inputMode="decimal"
                      className="text-right tabular-nums"
                      aria-label={`Line ${index + 1} rate`}
                      aria-invalid={Boolean(errors?.rate)}
                      {...form.register(`lines.${index}.rate`)}
                    />
                    <FieldError message={errors?.rate?.message} />
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex">
                      <Input
                        inputMode="decimal"
                        className="rounded-r-none text-right tabular-nums"
                        aria-label={`Line ${index + 1} discount`}
                        aria-invalid={Boolean(errors?.discountValue)}
                        {...form.register(`lines.${index}.discountValue`)}
                      />
                      <select
                        aria-label={`Line ${index + 1} discount type`}
                        className="h-9 rounded-r-lg border border-l-0 border-input bg-muted/40 px-1.5 text-xs"
                        {...form.register(`lines.${index}.discountType`)}
                      >
                        <option value="percent">%</option>
                        <option value="amount">Amt</option>
                      </select>
                    </div>
                    <FieldError message={errors?.discountValue?.message} />
                  </td>
                  <td className="px-2 py-2">
                    <NativeSelect aria-label={`Line ${index + 1} tax`} {...form.register(`lines.${index}.taxId`)}>
                      <option value="">No tax</option>
                      {(taxes ?? [])
                        .filter((tax) => tax.isActive || tax.id === form.getValues(`lines.${index}.taxId`))
                        .map((tax) => (
                          <option key={tax.id} value={tax.id}>
                            {tax.name} ({tax.rate}%)
                          </option>
                        ))}
                    </NativeSelect>
                    <FieldError message={errors?.taxId?.message} />
                  </td>
                  <td className="px-2 py-3 text-right font-medium">
                    <LineAmount form={form} index={index} />
                  </td>
                  <td className="px-1 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => remove(index)}
                      disabled={fields.length === 1}
                      aria-label={`Remove line ${index + 1}`}
                    >
                      <XIcon />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {lineErrors && !Array.isArray(lineErrors) && 'message' in lineErrors && lineErrors.message ? (
        <p className="text-xs text-destructive">{String(lineErrors.message)}</p>
      ) : null}

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={() => append({ ...EMPTY_LINE })}>
          <PlusIcon />
          Add another line
        </Button>
        {activeTaxes.length === 0 ? (
          <p className="text-xs text-muted-foreground">No taxes set up yet. Add them in Settings → Taxes.</p>
        ) : null}
      </div>
    </div>
  );
}
