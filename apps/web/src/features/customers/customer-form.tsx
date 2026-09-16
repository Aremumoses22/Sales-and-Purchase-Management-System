'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  contactSchema,
  SALUTATIONS,
  type ContactDto,
  type PaymentTermDto,
} from '@spms/shared';
import { CopyIcon, Loader2Icon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { useFieldArray, useForm, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Field, FormSection } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useSaveCustomer } from '@/features/customers/api';
import { useLookupQuery } from '@/features/settings/api';
import { applyApiError } from '@/lib/forms';

type FormValues = z.input<typeof contactSchema>;
type Form = UseFormReturn<FormValues, unknown, z.output<typeof contactSchema>>;

const EMPTY_ADDRESS = {
  attention: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  phone: '',
};

function toFormValues(customer: ContactDto | undefined, defaultTerm: PaymentTermDto | undefined): FormValues {
  if (!customer) {
    return {
      kind: 'business',
      salutation: '',
      firstName: '',
      lastName: '',
      companyName: '',
      displayName: '',
      email: '',
      workPhone: '',
      mobile: '',
      website: '',
      taxNumber: '',
      paymentTermId: defaultTerm?.id ?? '',
      openingBalance: '0.00',
      notes: '',
      billingAddress: { ...EMPTY_ADDRESS },
      shippingAddress: { ...EMPTY_ADDRESS },
      contactPersons: [],
    };
  }
  return {
    kind: customer.kind,
    salutation: customer.salutation ?? '',
    firstName: customer.firstName ?? '',
    lastName: customer.lastName ?? '',
    companyName: customer.companyName ?? '',
    displayName: customer.displayName,
    email: customer.email ?? '',
    workPhone: customer.workPhone ?? '',
    mobile: customer.mobile ?? '',
    website: customer.website ?? '',
    taxNumber: customer.taxNumber ?? '',
    paymentTermId: customer.paymentTerm?.id ?? '',
    openingBalance: customer.openingBalance,
    notes: customer.notes ?? '',
    billingAddress: { ...EMPTY_ADDRESS, ...stripNulls(customer.billingAddress) },
    shippingAddress: { ...EMPTY_ADDRESS, ...stripNulls(customer.shippingAddress) },
    contactPersons: customer.contactPersons.map((person) => ({
      salutation: person.salutation ?? '',
      firstName: person.firstName,
      lastName: person.lastName ?? '',
      email: person.email ?? '',
      workPhone: person.workPhone ?? '',
      mobile: person.mobile ?? '',
      designation: person.designation ?? '',
      isPrimary: person.isPrimary,
    })),
  };
}

function stripNulls<T extends object>(value: T | null): Partial<Record<keyof T, string>> {
  if (!value) return {};
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, v ?? ''])) as Partial<Record<keyof T, string>>;
}

function AddressFields({ form, prefix }: { form: Form; prefix: 'billingAddress' | 'shippingAddress' }) {
  const id = (field: string) => `${prefix}-${field}`;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Attention" htmlFor={id('attention')} className="sm:col-span-2">
        <Input id={id('attention')} {...form.register(`${prefix}.attention`)} />
      </Field>
      <Field label="Street" htmlFor={id('line1')} className="sm:col-span-2">
        <Input id={id('line1')} placeholder="Street 1" {...form.register(`${prefix}.line1`)} />
      </Field>
      <Input aria-label="Street 2" placeholder="Street 2" className="sm:col-span-2" {...form.register(`${prefix}.line2`)} />
      <Field label="City" htmlFor={id('city')}>
        <Input id={id('city')} {...form.register(`${prefix}.city`)} />
      </Field>
      <Field label="State / Province" htmlFor={id('state')}>
        <Input id={id('state')} {...form.register(`${prefix}.state`)} />
      </Field>
      <Field label="Postal code" htmlFor={id('postalCode')}>
        <Input id={id('postalCode')} {...form.register(`${prefix}.postalCode`)} />
      </Field>
      <Field label="Country" htmlFor={id('country')}>
        <Input id={id('country')} {...form.register(`${prefix}.country`)} />
      </Field>
      <Field label="Phone" htmlFor={id('phone')}>
        <Input id={id('phone')} {...form.register(`${prefix}.phone`)} />
      </Field>
    </div>
  );
}

function ContactPersons({ form }: { form: Form }) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'contactPersons' });
  const errors = form.formState.errors.contactPersons;

  return (
    <div className="space-y-3">
      {fields.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="w-24 px-2 py-2 text-left font-medium">Salutation</th>
                <th className="px-2 py-2 text-left font-medium">First name *</th>
                <th className="px-2 py-2 text-left font-medium">Last name</th>
                <th className="px-2 py-2 text-left font-medium">Email</th>
                <th className="px-2 py-2 text-left font-medium">Work phone</th>
                <th className="px-2 py-2 text-left font-medium">Designation</th>
                <th className="px-2 py-2 text-center font-medium">Primary</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr key={field.id} className="border-t align-top">
                  <td className="p-1.5">
                    <NativeSelect aria-label="Salutation" {...form.register(`contactPersons.${index}.salutation`)}>
                      <option value="" />
                      {SALUTATIONS.map((salutation) => (
                        <option key={salutation}>{salutation}</option>
                      ))}
                    </NativeSelect>
                  </td>
                  <td className="p-1.5">
                    <Input
                      aria-label="First name"
                      aria-invalid={Boolean(errors?.[index]?.firstName)}
                      {...form.register(`contactPersons.${index}.firstName`)}
                    />
                    {errors?.[index]?.firstName ? (
                      <p className="mt-1 text-xs text-destructive">{errors[index]?.firstName?.message}</p>
                    ) : null}
                  </td>
                  <td className="p-1.5">
                    <Input aria-label="Last name" {...form.register(`contactPersons.${index}.lastName`)} />
                  </td>
                  <td className="p-1.5">
                    <Input aria-label="Email" type="email" {...form.register(`contactPersons.${index}.email`)} />
                    {errors?.[index]?.email ? (
                      <p className="mt-1 text-xs text-destructive">{errors[index]?.email?.message}</p>
                    ) : null}
                  </td>
                  <td className="p-1.5">
                    <Input aria-label="Work phone" {...form.register(`contactPersons.${index}.workPhone`)} />
                  </td>
                  <td className="p-1.5">
                    <Input aria-label="Designation" {...form.register(`contactPersons.${index}.designation`)} />
                  </td>
                  <td className="p-1.5 text-center">
                    <Checkbox
                      className="mt-2"
                      aria-label="Primary contact"
                      checked={Boolean(form.watch(`contactPersons.${index}.isPrimary`))}
                      onCheckedChange={(checked) => {
                        // Only one primary contact at a time.
                        fields.forEach((_, other) => form.setValue(`contactPersons.${other}.isPrimary`, false));
                        form.setValue(`contactPersons.${index}.isPrimary`, checked === true);
                      }}
                    />
                  </td>
                  <td className="p-1.5">
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(index)} aria-label="Remove contact person">
                      <Trash2Icon />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          append({
            salutation: '',
            firstName: '',
            lastName: '',
            email: '',
            workPhone: '',
            mobile: '',
            designation: '',
            isPrimary: fields.length === 0,
          })
        }
      >
        <PlusIcon />
        Add contact person
      </Button>
    </div>
  );
}

export function CustomerForm({ customer }: { customer?: ContactDto }) {
  const router = useRouter();
  const save = useSaveCustomer();
  const { data: terms } = useLookupQuery('payment-terms');
  const defaultTerm = terms?.find((term) => term.isDefault);

  const form: Form = useForm<FormValues, unknown, z.output<typeof contactSchema>>({
    resolver: zodResolver(contactSchema),
    defaultValues: toFormValues(customer, defaultTerm),
  });

  // Apply the default payment term once the list arrives (new customers only).
  useEffect(() => {
    if (!customer && defaultTerm && !form.getValues('paymentTermId')) {
      form.setValue('paymentTermId', defaultTerm.id);
    }
  }, [customer, defaultTerm, form]);

  const [salutation, firstName, lastName, companyName] = form.watch(['salutation', 'firstName', 'lastName', 'companyName']);
  const displayNameSuggestions = useMemo(() => {
    const person = [firstName, lastName].filter(Boolean).join(' ');
    const formal = [salutation, firstName, lastName].filter(Boolean).join(' ');
    return [...new Set([companyName, person, formal, lastName && firstName ? `${lastName}, ${firstName}` : ''])].filter(
      (value): value is string => Boolean(value),
    );
  }, [salutation, firstName, lastName, companyName]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await save.mutateAsync({ id: customer?.id, input: values });
      toast.success(customer ? 'Customer updated' : 'Customer created');
      router.push(`/customers/${saved.id}`);
    } catch (error) {
      applyApiError(error, form);
    }
  });

  const errors = form.formState.errors;

  return (
    <form onSubmit={onSubmit} noValidate className="pb-20">
      <div className="space-y-6 rounded-xl border bg-card p-6">
        <FormSection title="Customer details">
          <Field label="Customer type">
            <RadioGroup
              value={form.watch('kind')}
              onValueChange={(value) => form.setValue('kind', value as 'business' | 'individual')}
              className="flex gap-6"
            >
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="business" /> Business
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="individual" /> Individual
              </label>
            </RadioGroup>
          </Field>

          <div className="grid gap-4 sm:grid-cols-[7rem_1fr_1fr]">
            <Field label="Salutation" htmlFor="salutation">
              <NativeSelect id="salutation" {...form.register('salutation')}>
                <option value="" />
                {SALUTATIONS.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="First name" htmlFor="firstName" error={errors.firstName?.message}>
              <Input id="firstName" {...form.register('firstName')} />
            </Field>
            <Field label="Last name" htmlFor="lastName" error={errors.lastName?.message}>
              <Input id="lastName" {...form.register('lastName')} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name" htmlFor="companyName" error={errors.companyName?.message}>
              <Input id="companyName" {...form.register('companyName')} />
            </Field>
            <Field
              label="Display name"
              htmlFor="displayName"
              required
              hint="How the customer appears on documents. Pick a suggestion or type your own."
              error={errors.displayName?.message}
            >
              <Input id="displayName" list="display-name-suggestions" aria-invalid={Boolean(errors.displayName)} {...form.register('displayName')} />
              <datalist id="display-name-suggestions">
                {displayNameSuggestions.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
            </Field>
            <Field label="Email" htmlFor="email" error={errors.email?.message}>
              <Input id="email" type="email" {...form.register('email')} />
            </Field>
            <Field label="Website" htmlFor="website" error={errors.website?.message}>
              <Input id="website" {...form.register('website')} />
            </Field>
            <Field label="Work phone" htmlFor="workPhone" error={errors.workPhone?.message}>
              <Input id="workPhone" {...form.register('workPhone')} />
            </Field>
            <Field label="Mobile" htmlFor="mobile" error={errors.mobile?.message}>
              <Input id="mobile" {...form.register('mobile')} />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Financial details">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Payment terms" htmlFor="paymentTermId" error={errors.paymentTermId?.message}>
              <NativeSelect id="paymentTermId" {...form.register('paymentTermId')}>
                <option value="">None</option>
                {terms?.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              label="Opening balance"
              htmlFor="openingBalance"
              hint="What the customer already owed when you started using the system."
              error={errors.openingBalance?.message}
            >
              <Input id="openingBalance" inputMode="decimal" className="text-right tabular-nums" {...form.register('openingBalance')} />
            </Field>
            <Field label="Tax registration number" htmlFor="taxNumber" error={errors.taxNumber?.message}>
              <Input id="taxNumber" {...form.register('taxNumber')} />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Addresses">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Billing address</h3>
              <AddressFields form={form} prefix="billingAddress" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">Shipping address</h3>
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  onClick={() => form.setValue('shippingAddress', { ...form.getValues('billingAddress') })}
                >
                  <CopyIcon />
                  Copy billing address
                </Button>
              </div>
              <AddressFields form={form} prefix="shippingAddress" />
            </div>
          </div>
        </FormSection>

        <FormSection title="Contact persons" description="People you deal with at this customer.">
          <ContactPersons form={form} />
          {errors.contactPersons?.message ? (
            <p className="text-xs text-destructive">{errors.contactPersons.message}</p>
          ) : null}
        </FormSection>

        <FormSection title="Remarks">
          <Field htmlFor="notes" hint="For internal use only." error={errors.notes?.message}>
            <Textarea id="notes" rows={3} {...form.register('notes')} />
          </Field>
        </FormSection>
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
