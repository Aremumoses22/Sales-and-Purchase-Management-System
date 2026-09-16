'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { changePasswordSchema, type ChangePasswordInput } from '@spms/shared';
import { Loader2Icon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Field, FormSection } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useChangePassword } from '@/features/auth/api';
import { applyApiError } from '@/lib/forms';
import { useSession } from '@/lib/session';

export default function ProfileSettingsPage() {
  const { user } = useSession();
  const changePassword = useChangePassword();
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await changePassword.mutateAsync(values);
      form.reset({ currentPassword: '', newPassword: '' });
      toast.success('Password changed. Other devices have been signed out.');
    } catch (error) {
      applyApiError(error, form, 'newPassword');
    }
  });

  return (
    <div className="space-y-6 rounded-xl border bg-card p-6">
      <FormSection title="Your account">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Name</dt>
            <dd className="font-medium">{user.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="font-medium">{user.email}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Role</dt>
            <dd className="font-medium">{user.role.name}</dd>
          </div>
        </dl>
      </FormSection>

      <FormSection title="Change password" description="Changing your password signs you out on every other device.">
        <form onSubmit={onSubmit} className="max-w-sm space-y-4" noValidate>
          <Field label="Current password" htmlFor="currentPassword" error={form.formState.errors.currentPassword?.message}>
            <Input id="currentPassword" type="password" autoComplete="current-password" {...form.register('currentPassword')} />
          </Field>
          <Field
            label="New password"
            htmlFor="newPassword"
            hint="At least 8 characters, with a letter and a number."
            error={form.formState.errors.newPassword?.message}
          >
            <Input id="newPassword" type="password" autoComplete="new-password" {...form.register('newPassword')} />
          </Field>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2Icon className="animate-spin" /> : null}
            Change password
          </Button>
        </form>
      </FormSection>
    </div>
  );
}
