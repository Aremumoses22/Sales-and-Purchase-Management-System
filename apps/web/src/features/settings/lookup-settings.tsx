'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon, PencilIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm, type FieldValues, type Resolver, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDeleteLookup, useLookupQuery, useSaveLookup, type LookupPath } from '@/features/settings/api';
import { applyApiError, showApiError } from '@/lib/forms';
import { useCan } from '@/lib/session';

interface Row {
  id: string;
  name: string;
  isActive: boolean;
  isDefault?: boolean;
}

export interface LookupColumn<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right';
}

/**
 * The shared Settings list screen: a table plus an add/edit dialog.
 * Taxes, payment terms, payment modes and expense categories all use it.
 */
export function LookupSettings<P extends LookupPath, S extends z.ZodType<FieldValues, FieldValues>>({
  path,
  title,
  description,
  schema,
  emptyDefaults,
  columns,
  fields,
  singular,
  supportsDefault = false,
}: {
  path: P;
  title: string;
  description: string;
  schema: S;
  emptyDefaults: z.input<S>;
  columns: LookupColumn<Row>[];
  fields: (form: UseFormReturn<z.input<S>, unknown, z.output<S>>) => ReactNode;
  singular: string;
  supportsDefault?: boolean;
}) {
  const can = useCan();
  const editable = can('settings:manage');
  const [showInactive, setShowInactive] = useState(false);
  const { data, isPending } = useLookupQuery(path, showInactive);
  const save = useSaveLookup(path);
  const remove = useDeleteLookup(path);

  const [editing, setEditing] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const form = useForm<z.input<S>, unknown, z.output<S>>({
    resolver: zodResolver(schema) as unknown as Resolver<z.input<S>, unknown, z.output<S>>,
  });
  const flags = form.watch() as { isActive?: boolean; isDefault?: boolean };
  const rows = (data ?? []) as unknown as Row[];

  const openForm = (row: Row | null) => {
    form.reset((row ?? emptyDefaults) as z.input<S>);
    setEditing(row);
    setAdding(row === null);
  };

  const closeForm = () => {
    setEditing(null);
    setAdding(false);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync({ id: editing?.id, input: values as never });
      toast.success(editing ? `${singular} updated` : `${singular} added`);
      closeForm();
    } catch (error) {
      applyApiError(error, form);
    }
  });

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success(`${singular} deleted`);
      setDeleting(null);
    } catch (error) {
      showApiError(error);
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={showInactive} onCheckedChange={(checked) => setShowInactive(checked === true)} />
              Show inactive
            </label>
            {editable ? (
              <Button size="sm" onClick={() => openForm(null)}>
                <PlusIcon />
                New
              </Button>
            ) : null}
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              {columns.map((column) => (
                <TableHead key={column.header} className={column.align === 'right' ? 'text-right' : undefined}>
                  {column.header}
                </TableHead>
              ))}
              <TableHead>Status</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              <TableRow>
                <TableCell colSpan={columns.length + 2} className="h-24 text-center">
                  <Loader2Icon className="mx-auto size-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length + 2} className="p-0">
                  <EmptyState title={`No ${title.toLowerCase()} yet`} description={description} />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {columns.map((column) => (
                    <TableCell key={column.header} className={column.align === 'right' ? 'text-right' : undefined}>
                      {column.cell(row)}
                    </TableCell>
                  ))}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={row.isActive ? 'active' : 'inactive'} />
                      {supportsDefault && row.isDefault ? (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">Default</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {editable ? (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openForm(row)} aria-label={`Edit ${row.name}`}>
                          <PencilIcon />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(row)} aria-label={`Delete ${row.name}`}>
                          <TrashIcon />
                        </Button>
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={adding || editing !== null} onOpenChange={(open) => (open ? undefined : closeForm())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit ${singular.toLowerCase()}` : `New ${singular.toLowerCase()}`}
            </DialogTitle>
          </DialogHeader>
          <form id="lookup-form" onSubmit={onSubmit} className="space-y-4" noValidate>
            {fields(form)}
            <div className="flex flex-wrap gap-4 pt-1">
              {supportsDefault ? (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={Boolean(flags.isDefault)}
                    onCheckedChange={(checked) => form.setValue('isDefault' as never, (checked === true) as never)}
                  />
                  Use as default
                </label>
              ) : null}
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={flags.isActive !== false}
                  onCheckedChange={(checked) => form.setValue('isActive' as never, (checked === true) as never)}
                />
                <Label className="font-normal">Active</Label>
              </label>
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={closeForm}>
              Cancel
            </Button>
            <Button type="submit" form="lookup-form" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2Icon className="animate-spin" /> : null}
              {editing ? 'Save changes' : `Add ${singular.toLowerCase()}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => (open ? undefined : setDeleting(null))}
        title={`Delete ${deleting?.name ?? ''}?`}
        description="Records already using it keep their values. If it is in use, mark it inactive instead."
        confirmLabel="Delete"
        destructive
        busy={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
