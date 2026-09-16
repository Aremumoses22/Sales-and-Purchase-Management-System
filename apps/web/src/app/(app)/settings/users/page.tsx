'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  createUserSchema,
  resetUserPasswordSchema,
  updateUserSchema,
  type CreateUserInput,
  type RoleDto,
  type UserDto,
} from '@spms/shared';
import { KeyRoundIcon, Loader2Icon, PencilIcon, PlusIcon, WandSparklesIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Field } from '@/components/field';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  useCreateUser,
  useResetUserPassword,
  useRolesQuery,
  useUpdateUser,
  useUsersQuery,
} from '@/features/settings/api';
import { formatDateTime } from '@/lib/format';
import { applyApiError } from '@/lib/forms';
import { generateTemporaryPassword } from '@/lib/password';
import { useOrganization, useSession } from '@/lib/session';

function RoleOptions({ roles }: { roles: RoleDto[] | undefined }) {
  return (
    <>
      <option value="">Select a role</option>
      {roles?.map((role) => (
        <option key={role.id} value={role.id}>
          {role.name}
        </option>
      ))}
    </>
  );
}

function NewUserDialog({ roles, onClose }: { roles: RoleDto[] | undefined; onClose: () => void }) {
  const create = useCreateUser();
  const form = useForm<CreateUserInput, unknown, z.output<typeof createUserSchema>>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: '', email: '', roleId: '', password: generateTemporaryPassword() },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await create.mutateAsync(values);
      toast.success(`${values.name} added. Share the temporary password with them securely.`);
      onClose();
    } catch (error) {
      applyApiError(error, form);
    }
  });

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New user</DialogTitle>
          <DialogDescription>They will be asked to choose their own password when they first sign in.</DialogDescription>
        </DialogHeader>
        <form id="new-user" onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Full name" htmlFor="name" required error={form.formState.errors.name?.message}>
            <Input id="name" {...form.register('name')} />
          </Field>
          <Field label="Email" htmlFor="email" required error={form.formState.errors.email?.message}>
            <Input id="email" type="email" {...form.register('email')} />
          </Field>
          <Field label="Role" htmlFor="roleId" required error={form.formState.errors.roleId?.message}>
            <NativeSelect id="roleId" {...form.register('roleId')}>
              <RoleOptions roles={roles} />
            </NativeSelect>
          </Field>
          <Field label="Temporary password" htmlFor="password" required error={form.formState.errors.password?.message}>
            <div className="flex gap-2">
              <Input id="password" className="font-mono" {...form.register('password')} />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => form.setValue('password', generateTemporaryPassword())}
                aria-label="Generate password"
              >
                <WandSparklesIcon />
              </Button>
            </div>
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-user" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2Icon className="animate-spin" /> : null}
            Add user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ user, roles, onClose }: { user: UserDto; roles: RoleDto[] | undefined; onClose: () => void }) {
  const { user: me } = useSession();
  const update = useUpdateUser();
  const form = useForm<z.input<typeof updateUserSchema>, unknown, z.output<typeof updateUserSchema>>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: { name: user.name, roleId: user.role.id, isActive: user.isActive },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync({ id: user.id, input: values });
      toast.success('User updated');
      onClose();
    } catch (error) {
      applyApiError(error, form, 'name');
    }
  });

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {user.name}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <form id="edit-user" onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Full name" htmlFor="name" required error={form.formState.errors.name?.message}>
            <Input id="name" {...form.register('name')} />
          </Field>
          <Field label="Role" htmlFor="roleId" required error={form.formState.errors.roleId?.message}>
            <NativeSelect id="roleId" {...form.register('roleId')}>
              <RoleOptions roles={roles} />
            </NativeSelect>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.watch('isActive')}
              disabled={user.id === me.id}
              onCheckedChange={(checked) => form.setValue('isActive', checked === true)}
            />
            Active (inactive users cannot sign in)
          </label>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-user" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2Icon className="animate-spin" /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: UserDto; onClose: () => void }) {
  const reset = useResetUserPassword();
  const form = useForm<z.input<typeof resetUserPasswordSchema>>({
    resolver: zodResolver(resetUserPasswordSchema),
    defaultValues: { password: generateTemporaryPassword() },
  });

  const onSubmit = form.handleSubmit(async ({ password }) => {
    try {
      await reset.mutateAsync({ id: user.id, password });
      toast.success(`Temporary password set for ${user.name}. They are signed out everywhere.`);
      onClose();
    } catch (error) {
      applyApiError(error, form, 'password');
    }
  });

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password for {user.name}</DialogTitle>
          <DialogDescription>They will be signed out and asked to choose a new password next time.</DialogDescription>
        </DialogHeader>
        <form id="reset-password" onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Temporary password" htmlFor="password" error={form.formState.errors.password?.message}>
            <div className="flex gap-2">
              <Input id="password" className="font-mono" {...form.register('password')} />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => form.setValue('password', generateTemporaryPassword())}
                aria-label="Generate password"
              >
                <WandSparklesIcon />
              </Button>
            </div>
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="reset-password" disabled={form.formState.isSubmitting}>
            Set temporary password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersSettingsPage() {
  const organization = useOrganization();
  const { data: users, isPending } = useUsersQuery();
  const { data: roles } = useRolesQuery();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<UserDto | null>(null);
  const [resetting, setResetting] = useState<UserDto | null>(null);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="font-semibold">Users</h2>
          <p className="text-sm text-muted-foreground">People who can sign in, and the role that decides what they can do.</p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <PlusIcon />
          New user
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead>User</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last sign-in</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center">
                <Loader2Icon className="mx-auto size-5 animate-spin text-muted-foreground" />
              </TableCell>
            </TableRow>
          ) : (
            users?.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <p className="font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </TableCell>
                <TableCell>{user.role.name}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={user.isActive ? 'active' : 'inactive'} />
                    {user.mustChangePassword ? (
                      <span className="text-xs text-muted-foreground">Temporary password</span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {user.lastLoginAt ? formatDateTime(user.lastLoginAt, organization) : 'Never'}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(user)} aria-label={`Edit ${user.name}`}>
                      <PencilIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setResetting(user)}
                      aria-label={`Reset password for ${user.name}`}
                    >
                      <KeyRoundIcon />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {adding ? <NewUserDialog roles={roles} onClose={() => setAdding(false)} /> : null}
      {editing ? <EditUserDialog user={editing} roles={roles} onClose={() => setEditing(null)} /> : null}
      {resetting ? <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} /> : null}
    </div>
  );
}
