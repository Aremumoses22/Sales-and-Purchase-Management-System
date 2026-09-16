'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { changePasswordSchema, type ChangePasswordInput } from '@spms/shared';
import { Loader2Icon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useChangePassword } from '@/features/auth/api';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';

/** Shown instead of the app when an admin has issued a temporary password. */
export function ChangePasswordRequired() {
  const { user } = useSession();
  const changePassword = useChangePassword();
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await changePassword.mutateAsync(values);
      toast.success('Password updated');
    } catch (error) {
      if (error instanceof ApiError) {
        for (const issue of error.fieldErrors) {
          form.setError(issue.path as keyof ChangePasswordInput, { message: issue.message });
        }
        if (error.fieldErrors.length === 0) form.setError('newPassword', { message: error.message });
      }
    }
  });

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Choose a new password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {user.name}, your account uses a temporary password. Set your own to continue.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          <Field label="Temporary password" htmlFor="currentPassword" error={form.formState.errors.currentPassword?.message}>
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
          <Button type="submit" className="w-full" size="lg" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2Icon className="animate-spin" /> : null}
            Update password
          </Button>
        </form>
      </div>
    </div>
  );
}
