'use client';

import { DATE_RANGE_PRESET_LABELS, DATE_RANGE_PRESETS, todayInTimeZone, type DateRangePreset } from '@spms/shared';
import { ArrowLeftIcon, DownloadIcon, Loader2Icon, PrinterIcon, UsersIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { CustomerCombobox } from '@/components/contact-combobox';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { findReport, INVOICE_STATUS_OPTIONS, type ReportDefinition } from '@/features/reports/definitions';
import { reportQuery, useReport, useReportParams } from '@/features/reports/report-data';
import { ReportTable, toCsv } from '@/features/reports/report-table';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useOrganization } from '@/lib/session';

function ReportScreen({ report }: { report: ReportDefinition }) {
  const organization = useOrganization();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useReportParams(organization.timezone);
  const query = reportQuery(report, params);
  const { data, isPending, isFetching, isPlaceholderData, isError, error } = useReport(report, params);
  // Never export or print figures still showing from the previous filters.
  const ready = Boolean(data) && !isPlaceholderData;

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(`${pathname}?${next.toString()}`);
  };

  const choosePreset = (preset: DateRangePreset) => {
    if (preset === 'custom') update({ preset, from: params.from, to: params.to });
    else update({ preset, from: '', to: '' });
  };

  const period =
    report.filter === 'asOf'
      ? `As of ${formatDate(params.asOf, organization)}`
      : `From ${formatDate(params.from, organization)} to ${formatDate(params.to, organization)}`;

  const exportCsv = () => {
    if (!data) return;
    const blob = new Blob([toCsv(report, data)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    const suffix = report.filter === 'asOf' ? params.asOf : `${params.from}_to_${params.to}`;
    anchor.download = `${report.slug}_${suffix}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const printUrl = `/print/reports/${report.slug}?${new URLSearchParams(query ?? {}).toString()}`;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link href="/reports" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-3" />
          Reports
        </Link>
        <PageHeader
          title={report.title}
          description={data?.customer ? `${data.customer.displayName} · ${period}` : period}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={exportCsv} disabled={!ready}>
                <DownloadIcon />
                Export CSV
              </Button>
              <Button variant="outline" disabled={!ready} onClick={() => window.open(`${printUrl}&autoprint=1`, '_blank', 'noopener')}>
                <PrinterIcon />
                Print
              </Button>
            </div>
          }
        />
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        {report.filter === 'range' ? (
          <>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span className="block">Period</span>
              <NativeSelect aria-label="Period" value={params.preset} onChange={(event) => choosePreset(event.target.value as DateRangePreset)} className="w-40">
                {DATE_RANGE_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {DATE_RANGE_PRESET_LABELS[preset]}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span className="block">From</span>
              <Input
                type="date"
                aria-label="From date"
                value={params.from}
                onChange={(event) => update({ preset: 'custom', from: event.target.value, to: params.to })}
                className="w-40"
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span className="block">To</span>
              <Input
                type="date"
                aria-label="To date"
                value={params.to}
                onChange={(event) => update({ preset: 'custom', from: params.from, to: event.target.value })}
                className="w-40"
              />
            </label>
          </>
        ) : (
          <label className="space-y-1 text-xs text-muted-foreground">
            <span className="block">As of</span>
            <Input type="date" aria-label="As of date" value={params.asOf} onChange={(event) => update({ asOf: event.target.value })} className="w-40" />
          </label>
        )}
        {report.extra === 'customer' ? (
          <label className="w-72 space-y-1 text-xs text-muted-foreground">
            <span className="block">Customer</span>
            <CustomerCombobox value={params.customerId} onChange={(customerId) => update({ customerId })} />
          </label>
        ) : null}
        {report.extra === 'invoiceStatus' ? (
          <label className="space-y-1 text-xs text-muted-foreground">
            <span className="block">Status</span>
            <NativeSelect aria-label="Status" value={params.status} onChange={(event) => update({ status: event.target.value })} className="w-40">
              <option value="all">All statuses</option>
              {INVOICE_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </label>
        ) : null}
        {isFetching ? <Loader2Icon className="mb-2 size-4 animate-spin text-muted-foreground" /> : null}
        {report.filter === 'asOf' ? (
          <Button variant="ghost" size="sm" className="mb-0.5" onClick={() => update({ asOf: todayInTimeZone(organization.timezone) })}>
            Today
          </Button>
        ) : params.preset !== 'this_month' ? (
          <Button variant="ghost" size="sm" className="mb-0.5" onClick={() => choosePreset('this_month')}>
            Reset
          </Button>
        ) : null}
      </div>

      {report.note ? <p className="text-xs text-muted-foreground">{report.note}</p> : null}

      {report.extra === 'customer' && !params.customerId ? (
        <EmptyState icon={<UsersIcon className="size-8" />} title="Choose a customer" description="The statement lists one customer's transactions." />
      ) : isError ? (
        <EmptyState title="This report could not be loaded" description={error instanceof ApiError ? error.message : undefined} />
      ) : isPending || !data ? (
        <Loader2Icon className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" />
      ) : (
        <ReportTable report={report} data={data} />
      )}
    </div>
  );
}

export default function ReportPage() {
  const { slug } = useParams<{ slug: string }>();
  const report = findReport(slug);
  if (!report) return <EmptyState title="Report not found" description="Choose a report from the list." />;
  return (
    <Suspense>
      <ReportScreen key={report.slug} report={report} />
    </Suspense>
  );
}
