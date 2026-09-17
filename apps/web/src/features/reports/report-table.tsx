'use client';

import { STATUS_LABELS } from '@spms/shared';
import { cn } from 'cn';
import Link from 'next/link';
import { StatusBadge } from '@/components/status-badge';
import { formatDate, formatMoney } from '@/lib/format';
import { useOrganization } from '@/lib/session';
import type { ReportColumn, ReportDefinition } from './definitions';
import type { ReportResult } from './report-data';

const NUMERIC: ReportColumn['kind'][] = ['money', 'count', 'quantity'];

type Organization = ReturnType<typeof useOrganization>;

export function cellText(column: ReportColumn, value: unknown, organization: Organization): string {
  if (value === null || value === undefined || value === '') return column.kind === 'money' ? formatMoney(0, organization) : '—';
  switch (column.kind) {
    case 'money':
      return formatMoney(String(value), organization);
    case 'date':
      return formatDate(String(value), organization);
    case 'status':
      return STATUS_LABELS[String(value)] ?? String(value);
    case 'count':
    case 'quantity':
      return Number(value).toLocaleString('en-NG', { maximumFractionDigits: 3 });
    default:
      return column.label ? column.label(value) : String(value);
  }
}

/** The report table, shared by the screen and the print view. `printable` drops links and badges. */
export function ReportTable({ report, data, printable = false }: { report: ReportDefinition; data: ReportResult; printable?: boolean }) {
  const organization = useOrganization();
  const hasTotals = Object.keys(report.totals).length > 0;

  return (
    <div className={cn('overflow-x-auto', !printable && 'rounded-xl border bg-card')}>
      <table className={cn('w-full', printable ? 'text-xs' : 'text-sm')}>
        <thead className={cn('text-xs', printable ? 'border-b-2 border-neutral-800' : 'bg-muted/40 text-muted-foreground')}>
          <tr>
            {report.columns.map((column) => (
              <th
                key={column.key}
                className={cn('px-3 py-2 font-medium whitespace-nowrap', NUMERIC.includes(column.kind) ? 'text-right' : 'text-left')}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.length === 0 ? (
            <tr>
              <td colSpan={report.columns.length} className="px-3 py-10 text-center text-muted-foreground">
                Nothing to show for this period.
              </td>
            </tr>
          ) : (
            data.rows.map((row, index) => (
              <tr key={index} className={cn('border-t', row['type'] === 'opening_balance' && 'bg-muted/30 italic')}>
                {report.columns.map((column) => {
                  const value = row[column.key];
                  const href = !printable ? column.href?.(row) : null;
                  const text = column.format?.(row, organization) ?? cellText(column, value, organization);
                  return (
                    <td
                      key={column.key}
                      className={cn(
                        printable ? 'px-2 py-1.5' : 'px-3 py-2',
                        NUMERIC.includes(column.kind) ? 'text-right tabular-nums whitespace-nowrap' : 'text-left',
                        column.kind === 'text' && 'min-w-32',
                      )}
                    >
                      {column.kind === 'status' && !printable && value ? (
                        <StatusBadge status={String(value)} />
                      ) : href ? (
                        <Link href={href} className="font-medium text-primary hover:underline">
                          {text}
                        </Link>
                      ) : (
                        text
                      )}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
        {hasTotals && data.rows.length > 0 ? (
          <tfoot>
            <tr className={cn('font-semibold', printable ? 'border-t-2 border-neutral-800' : 'border-t bg-muted/40')}>
              {report.columns.map((column, index) => {
                const totalKey = report.totals[column.key];
                const value = totalKey ? data.totals[totalKey] : undefined;
                return (
                  <td key={column.key} className={cn('px-3 py-2', NUMERIC.includes(column.kind) ? 'text-right tabular-nums whitespace-nowrap' : 'text-left')}>
                    {index === 0 && value === undefined
                      ? 'Total'
                      : value === undefined
                        ? null
                        : column.kind === 'text'
                          ? `${Number(value)} ${Number(value) === 1 ? 'document' : 'documents'}`
                          : cellText(column, value, organization)}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

/** Plain CSV with raw numbers and ISO dates, so spreadsheets can calculate with it. */
export function toCsv(report: ReportDefinition, data: ReportResult): string {
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const raw = (column: ReportColumn, value: unknown) =>
    column.kind === 'status' ? (STATUS_LABELS[String(value)] ?? value) : column.label && value !== null && value !== undefined ? column.label(value) : value;
  const lines = [report.columns.map((column) => escape(column.header)).join(',')];
  for (const row of data.rows) {
    lines.push(report.columns.map((column) => escape(column.kind === 'text' || column.kind === 'status' ? raw(column, row[column.key]) : row[column.key])).join(','));
  }
  if (data.rows.length > 0 && Object.keys(report.totals).length > 0) {
    lines.push(
      report.columns
        .map((column, index) => {
          const totalKey = report.totals[column.key];
          if (totalKey) return escape(data.totals[totalKey]);
          return index === 0 ? 'Total' : '';
        })
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}
