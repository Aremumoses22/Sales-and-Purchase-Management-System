'use client';

import { numberSeriesSchema, type DocumentType, type NumberSeriesDto } from '@spms/shared';
import { Loader2Icon, PencilIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useNumberSeriesQuery, useUpdateNumberSeries } from '@/features/settings/api';
import { applyApiError } from '@/lib/forms';
import { useCan } from '@/lib/session';

type FormValues = z.input<typeof numberSeriesSchema>;

function EditDialog({ series, onClose }: { series: NumberSeriesDto; onClose: () => void }) {
  const update = useUpdateNumberSeries();
  const form = useForm<FormValues, unknown, z.output<typeof numberSeriesSchema>>({
    resolver: zodResolver(numberSeriesSchema),
    defaultValues: { prefix: series.prefix, nextNumber: series.nextNumber, padding: series.padding },
  });

  const values = form.watch();
  const preview = `${values.prefix ?? ''}${String(values.nextNumber ?? 1).padStart(Number(values.padding ?? 1), '0')}`;

  const onSubmit = form.handleSubmit(async (input) => {
    try {
      await update.mutateAsync({ documentType: series.documentType as DocumentType, input });
      toast.success(`${series.label} numbering updated`);
      onClose();
    } catch (error) {
      applyApiError(error, form);
    }
  });

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{series.label} numbering</DialogTitle>
        </DialogHeader>
        <form id="numbering-form" onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Prefix" htmlFor="prefix" error={form.formState.errors.prefix?.message}>
            <Input id="prefix" {...form.register('prefix')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Next number" htmlFor="nextNumber" error={form.formState.errors.nextNumber?.message}>
              <Input id="nextNumber" type="number" min={1} {...form.register('nextNumber')} />
            </Field>
            <Field label="Digits" htmlFor="padding" error={form.formState.errors.padding?.message}>
              <Input id="padding" type="number" min={1} max={10} {...form.register('padding')} />
            </Field>
          </div>
          <p className="text-sm text-muted-foreground">
            Next document will be numbered <span className="font-medium text-foreground">{preview}</span>
          </p>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button type="submit" form="numbering-form" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2Icon className="animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function NumberingSettingsPage() {
  const { data, isPending } = useNumberSeriesQuery();
  const can = useCan();
  const [editing, setEditing] = useState<NumberSeriesDto | null>(null);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">Transaction numbering</h2>
          <p className="text-sm text-muted-foreground">
            Each document type gets numbers automatically. Numbers already in use are skipped.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Document</TableHead>
              <TableHead>Prefix</TableHead>
              <TableHead>Next number</TableHead>
              <TableHead>Preview</TableHead>
              <TableHead className="w-10" />
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
              data?.map((series) => (
                <TableRow key={series.documentType}>
                  <TableCell className="font-medium">{series.label}</TableCell>
                  <TableCell className="text-muted-foreground">{series.prefix || '—'}</TableCell>
                  <TableCell className="tabular-nums">{series.nextNumber}</TableCell>
                  <TableCell className="font-mono text-xs">{series.preview}</TableCell>
                  <TableCell>
                    {can('settings:manage') ? (
                      <Button variant="ghost" size="icon-sm" onClick={() => setEditing(series)} aria-label={`Edit ${series.label} numbering`}>
                        <PencilIcon />
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {editing ? <EditDialog series={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
