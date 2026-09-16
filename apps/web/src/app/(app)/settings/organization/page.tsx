'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { DATE_FORMATS, MONTHS, organizationSchema, type OrganizationInput } from '@spms/shared';
import { ImageIcon, Loader2Icon, TrashIcon, UploadIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Field, FormSection } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  useOrganizationQuery,
  useRemoveLogo,
  useUpdateOrganization,
  useUploadLogo,
} from '@/features/settings/api';
import { applyApiError, showApiError } from '@/lib/forms';
import { useCan } from '@/lib/session';

type FormValues = z.input<typeof organizationSchema>;

const TIME_ZONES = Intl.supportedValuesOf('timeZone');

export default function OrganizationSettingsPage() {
  const can = useCan();
  const editable = can('settings:manage');
  const { data: organization, isPending } = useOrganizationQuery();
  const update = useUpdateOrganization();
  const uploadLogo = useUploadLogo();
  const removeLogo = useRemoveLogo();
  const fileInput = useRef<HTMLInputElement>(null);
  const [logoVersion, setLogoVersion] = useState(0);

  const form = useForm<FormValues, unknown, OrganizationInput>({
    resolver: zodResolver(organizationSchema),
  });

  useEffect(() => {
    if (organization) form.reset(organization as FormValues);
  }, [organization, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync(values);
      toast.success('Organization profile saved');
    } catch (error) {
      applyApiError(error, form);
    }
  });

  const onLogoChange = async (file: File | undefined) => {
    if (!file) return;
    try {
      await uploadLogo.mutateAsync(file);
      setLogoVersion((version) => version + 1);
      toast.success('Logo updated');
    } catch (error) {
      showApiError(error);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  if (isPending || !organization) {
    return <div className="h-64 animate-pulse rounded-xl border bg-card" />;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 rounded-xl border bg-card p-6" noValidate>
      <FormSection title="Company" description="Shown on quotes, invoices and other printed documents.">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex size-20 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
            {organization.hasLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/v1/settings/organization/logo?v=${logoVersion}`}
                alt="Organization logo"
                className="size-full object-contain"
              />
            ) : (
              <ImageIcon className="size-6 text-muted-foreground" />
            )}
          </div>
          {editable ? (
            <div className="flex items-center gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => onLogoChange(event.target.files?.[0])}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={uploadLogo.isPending}>
                {uploadLogo.isPending ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
                {organization.hasLogo ? 'Replace logo' : 'Upload logo'}
              </Button>
              {organization.hasLogo ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await removeLogo.mutateAsync();
                    toast.success('Logo removed');
                  }}
                >
                  <TrashIcon />
                  Remove
                </Button>
              ) : null}
              <p className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to 1 MB.</p>
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Organization name" htmlFor="name" required error={form.formState.errors.name?.message}>
            <Input id="name" disabled={!editable} {...form.register('name')} />
          </Field>
          <Field label="Tax registration number" htmlFor="taxNumber" error={form.formState.errors.taxNumber?.message}>
            <Input id="taxNumber" disabled={!editable} {...form.register('taxNumber')} />
          </Field>
          <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
            <Input id="email" type="email" disabled={!editable} {...form.register('email')} />
          </Field>
          <Field label="Phone" htmlFor="phone" error={form.formState.errors.phone?.message}>
            <Input id="phone" disabled={!editable} {...form.register('phone')} />
          </Field>
          <Field label="Website" htmlFor="website" className="sm:col-span-2" error={form.formState.errors.website?.message}>
            <Input id="website" disabled={!editable} {...form.register('website')} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Address">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Address line 1" htmlFor="addressLine1" className="sm:col-span-2">
            <Input id="addressLine1" disabled={!editable} {...form.register('addressLine1')} />
          </Field>
          <Field label="Address line 2" htmlFor="addressLine2" className="sm:col-span-2">
            <Input id="addressLine2" disabled={!editable} {...form.register('addressLine2')} />
          </Field>
          <Field label="City" htmlFor="city">
            <Input id="city" disabled={!editable} {...form.register('city')} />
          </Field>
          <Field label="State / Province" htmlFor="state">
            <Input id="state" disabled={!editable} {...form.register('state')} />
          </Field>
          <Field label="Postal code" htmlFor="postalCode">
            <Input id="postalCode" disabled={!editable} {...form.register('postalCode')} />
          </Field>
          <Field label="Country" htmlFor="country">
            <Input id="country" disabled={!editable} {...form.register('country')} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Currency, dates and fiscal year">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Currency code"
            htmlFor="currencyCode"
            required
            hint="Three letters, e.g. USD"
            error={form.formState.errors.currencyCode?.message}
          >
            <Input id="currencyCode" maxLength={3} disabled={!editable} {...form.register('currencyCode')} />
          </Field>
          <Field label="Currency symbol" htmlFor="currencySymbol" required error={form.formState.errors.currencySymbol?.message}>
            <Input id="currencySymbol" maxLength={5} disabled={!editable} {...form.register('currencySymbol')} />
          </Field>
          <Field label="Date format" htmlFor="dateFormat" error={form.formState.errors.dateFormat?.message}>
            <NativeSelect id="dateFormat" disabled={!editable} {...form.register('dateFormat')}>
              {DATE_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {format}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Fiscal year starts" htmlFor="fiscalYearStartMonth">
            <NativeSelect id="fiscalYearStartMonth" disabled={!editable} {...form.register('fiscalYearStartMonth')}>
              {MONTHS.map((month, index) => (
                <option key={month} value={index + 1}>
                  {month}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label="Time zone"
            htmlFor="timezone"
            className="sm:col-span-2"
            hint="Used to decide what counts as today for due and expiry dates."
            error={form.formState.errors.timezone?.message}
          >
            <NativeSelect id="timezone" disabled={!editable} {...form.register('timezone')}>
              {TIME_ZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </FormSection>

      {editable ? (
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2Icon className="animate-spin" /> : null}
            Save changes
          </Button>
        </div>
      ) : null}
    </form>
  );
}
