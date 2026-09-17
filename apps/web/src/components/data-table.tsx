'use client';

import type { PageMeta } from '@spms/shared';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
} from '@tanstack/react-table';
import { cn } from 'cn';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Loader2Icon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Fragment, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Sort key sent to the API; omit to make the column unsortable. */
    sortKey?: string;
    align?: 'left' | 'right';
    className?: string;
  }
}

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[] | undefined;
  isLoading?: boolean;
  empty?: ReactNode;
  meta?: PageMeta;
  sort?: string;
  onSortChange?: (field: string) => void;
  onPageChange?: (page: number) => void;
  rowHref?: (row: T) => string;
  rowKey: (row: T) => string;
  /** Called when a row without `rowHref` is clicked. */
  onRowClick?: (row: T) => void;
  /** Content shown in a full-width row under a row, e.g. details the user expanded. */
  renderExpanded?: (row: T) => ReactNode;
  /** A totals row under the data, keyed by column id; columns without an entry stay blank. */
  totals?: Partial<Record<string, ReactNode>>;
}

export function DataTable<T>({
  columns,
  data,
  isLoading,
  empty,
  meta,
  sort,
  onSortChange,
  onPageChange,
  rowHref,
  rowKey,
  onRowClick,
  renderExpanded,
  totals,
}: DataTableProps<T>) {
  const router = useRouter();
  const rows = data ?? [];
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: rowKey,
  });

  const from = meta && meta.total > 0 ? (meta.page - 1) * meta.pageSize + 1 : 0;
  const to = meta ? Math.min(meta.page * meta.pageSize, meta.total) : 0;
  const lastPage = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted/40 hover:bg-muted/40">
                {headerGroup.headers.map((header) => {
                  const columnMeta = header.column.columnDef.meta;
                  const sortKey = columnMeta?.sortKey;
                  const isSorted = sortKey && (sort === sortKey || sort === `-${sortKey}`);
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        'h-9 text-xs font-medium whitespace-nowrap text-muted-foreground',
                        columnMeta?.align === 'right' && 'text-right',
                        columnMeta?.className,
                      )}
                    >
                      {header.isPlaceholder ? null : sortKey && onSortChange ? (
                        <button
                          type="button"
                          onClick={() => onSortChange(sortKey)}
                          className={cn(
                            'inline-flex items-center gap-1 hover:text-foreground',
                            isSorted && 'text-foreground',
                          )}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sort === sortKey ? (
                            <ArrowUpIcon className="size-3" />
                          ) : sort === `-${sortKey}` ? (
                            <ArrowDownIcon className="size-3" />
                          ) : null}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-muted-foreground"
                >
                  <Loader2Icon className="mx-auto size-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="p-0">
                  {empty ?? (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                      Nothing to show yet.
                    </p>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => {
                const expanded = renderExpanded?.(row.original);
                return (
                  <Fragment key={row.id}>
                    <TableRow
                      className={cn((rowHref || onRowClick) && 'cursor-pointer')}
                      onClick={
                        rowHref
                          ? () => router.push(rowHref(row.original))
                          : onRowClick
                            ? () => onRowClick(row.original)
                            : undefined
                      }
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            'py-2.5',
                            cell.column.columnDef.meta?.align === 'right' && 'text-right',
                            cell.column.columnDef.meta?.className,
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                    {expanded ? (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={columns.length} className="whitespace-normal">
                          {expanded}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </TableBody>
          {totals && !isLoading && rows.length > 0 ? (
            <TableFooter>
              <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                {table.getVisibleLeafColumns().map((column) => (
                  <TableCell
                    key={column.id}
                    className={cn(
                      'py-2.5',
                      column.columnDef.meta?.align === 'right' && 'text-right',
                      column.columnDef.meta?.className,
                    )}
                  >
                    {totals[column.id] ?? null}
                  </TableCell>
                ))}
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </div>

      {meta && meta.total > 0 ? (
        <div className="flex items-center justify-between gap-4 border-t px-4 py-2.5 text-xs text-muted-foreground">
          <span>
            Showing {from}–{to} of {meta.total}
          </span>
          {lastPage > 1 && onPageChange ? (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                disabled={meta.page <= 1}
                onClick={() => onPageChange(meta.page - 1)}
                aria-label="Previous page"
              >
                <ChevronLeftIcon />
              </Button>
              <span className="px-1">
                Page {meta.page} of {lastPage}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={meta.page >= lastPage}
                onClick={() => onPageChange(meta.page + 1)}
                aria-label="Next page"
              >
                <ChevronRightIcon />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
