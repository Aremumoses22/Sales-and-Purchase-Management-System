'use client';

import {
  PERMISSION_ACTION_LABELS,
  PERMISSION_GROUPS,
  type Permission,
  type RoleDto,
} from '@spms/shared';
import { cn } from 'cn';
import { Loader2Icon, LockIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useDeleteRole, useRolesQuery, useSaveRole } from '@/features/settings/api';
import { ApiError } from '@/lib/api';
import { showApiError } from '@/lib/forms';

const ALL_ACTIONS = [...new Set(PERMISSION_GROUPS.flatMap((group) => [...group.actions]))];

interface Draft {
  id?: string;
  name: string;
  description: string;
  permissions: Set<Permission>;
  isSystem: boolean;
}

function toDraft(role: RoleDto | null): Draft {
  return {
    id: role?.id,
    name: role?.name ?? '',
    description: role?.description ?? '',
    permissions: new Set(role?.permissions ?? []),
    isSystem: role?.isSystem ?? false,
  };
}

function PermissionMatrix({
  permissions,
  readOnly,
  onChange,
}: {
  permissions: Set<Permission>;
  readOnly: boolean;
  onChange: (next: Set<Permission>) => void;
}) {
  const toggle = (permission: Permission, checked: boolean) => {
    const next = new Set(permissions);
    if (checked) next.add(permission);
    else next.delete(permission);
    onChange(next);
  };

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Module</th>
            {ALL_ACTIONS.map((action) => (
              <th key={action} className="px-2 py-2 text-center font-medium whitespace-nowrap">
                {PERMISSION_ACTION_LABELS[action] ?? action}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERMISSION_GROUPS.map((group) => (
            <tr key={group.module} className="border-t">
              <td className="px-3 py-2 font-medium">{group.label}</td>
              {ALL_ACTIONS.map((action) => {
                const permission = `${group.module}:${action}` as Permission;
                const available = (group.actions as readonly string[]).includes(action);
                return (
                  <td key={action} className="px-2 py-2 text-center">
                    {available ? (
                      <Checkbox
                        checked={permissions.has(permission)}
                        disabled={readOnly}
                        onCheckedChange={(checked) => toggle(permission, checked === true)}
                        aria-label={`${group.label}: ${PERMISSION_ACTION_LABELS[action] ?? action}`}
                      />
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RolesSettingsPage() {
  const { data: roles, isPending } = useRolesQuery();
  const save = useSaveRole();
  const remove = useDeleteRole();
  const [editing, setDraft] = useState<Draft | null>(null);
  const [nameError, setNameError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Until a role is picked (or after one is deleted), show the first role.
  const draft = editing ?? (roles?.[0] ? toDraft(roles[0]) : null);
  const selected = useMemo(() => roles?.find((role) => role.id === draft?.id) ?? null, [roles, draft?.id]);

  const select = (role: RoleDto | null) => {
    setDraft(toDraft(role));
    setNameError(undefined);
  };

  const onSave = async () => {
    if (!draft) return;
    try {
      const saved = await save.mutateAsync({
        id: draft.id,
        input: { name: draft.name, description: draft.description, permissions: [...draft.permissions] },
      });
      toast.success(draft.id ? 'Role updated' : 'Role created');
      select(saved);
    } catch (error) {
      const issue = error instanceof ApiError ? error.fieldErrors.find((i) => i.path === 'name') : undefined;
      if (issue) setNameError(issue.message);
      else showApiError(error);
    }
  };

  const onDelete = async () => {
    if (!draft?.id) return;
    try {
      await remove.mutateAsync(draft.id);
      toast.success('Role deleted');
      setDraft(null);
    } catch (error) {
      showApiError(error);
    } finally {
      setConfirmDelete(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[16rem_1fr]">
      <div className="h-fit overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Roles</h2>
          <Button size="xs" variant="outline" onClick={() => select(null)}>
            <PlusIcon />
            New
          </Button>
        </div>
        {isPending ? (
          <Loader2Icon className="mx-auto my-6 size-5 animate-spin text-muted-foreground" />
        ) : (
          <ul className="divide-y">
            {roles?.map((role) => (
              <li key={role.id}>
                <button
                  type="button"
                  onClick={() => select(role)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-muted/50',
                    draft?.id === role.id && 'bg-muted/60 font-medium',
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {role.isSystem ? <LockIcon className="size-3.5 text-muted-foreground" /> : null}
                    {role.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {role.userCount} user{role.userCount === 1 ? '' : 's'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {draft ? (
        <div className="space-y-5 rounded-xl border bg-card p-5">
          {draft.isSystem ? (
            <p className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
              <LockIcon className="size-4" />
              The Admin role always has every permission and cannot be edited.
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role name" htmlFor="role-name" required error={nameError}>
              <Input
                id="role-name"
                value={draft.name}
                disabled={draft.isSystem}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </Field>
            <Field label="Description" htmlFor="role-description">
              <Textarea
                id="role-description"
                rows={1}
                value={draft.description}
                disabled={draft.isSystem}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </Field>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Permissions</h3>
            <PermissionMatrix
              permissions={draft.permissions}
              readOnly={draft.isSystem}
              onChange={(permissions) => setDraft({ ...draft, permissions })}
            />
          </div>

          {!draft.isSystem ? (
            <div className="flex justify-between gap-2 border-t pt-4">
              {draft.id ? (
                <Button variant="destructive" onClick={() => setConfirmDelete(true)} disabled={(selected?.userCount ?? 0) > 0}>
                  <TrashIcon />
                  Delete role
                </Button>
              ) : (
                <span />
              )}
              <Button onClick={onSave} disabled={save.isPending}>
                {save.isPending ? <Loader2Icon className="animate-spin" /> : null}
                {draft.id ? 'Save changes' : 'Create role'}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete the ${draft?.name ?? ''} role?`}
        description="This cannot be undone."
        confirmLabel="Delete"
        destructive
        busy={remove.isPending}
        onConfirm={onDelete}
      />
    </div>
  );
}
