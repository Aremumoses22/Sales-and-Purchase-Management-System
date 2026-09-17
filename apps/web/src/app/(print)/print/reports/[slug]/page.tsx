'use client';

import { Loader2Icon, PrinterIcon } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { findReport, type ReportDefinition } from '@/features/reports/definitions';
import { useReport, useReportParams } from '@/features/reports/report-data';
import { ReportTable } from '@/features/reports/report-table';
import { formatDate, formatMoney } from '@/lib/format';
import { useOrganization } from '@/lib/session';

function PrintReport({ report }: { report: ReportDefinition }) {
  const organization = useOrganization();
  const searchParams = useSearchParams();
  // The print link always passes explicit dates, so read them as a custom range.
  const base = useReportParams(organization.timezone);
  const params = {
    ...base,
    from: searchParams.get('from') ?? base.from,
    to: searchParams.get('to') ?? base.to,
  };
  const { data, isError } = useReport(report, params);
  const printed = useRef(false);

  useEffect(() => {
    if (data && searchParams.get('autoprint') === '1' && !printed.current) {
      printed.current = true;
      setTimeout(() => window.print(), 300);
    }
  }, [data, searchParams]);

  if (isError) return <p className="p-8 text-center text-sm text-muted-foreground">This report could not be loaded.</p>;
  if (!data) return <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;

  const period =
    report.filter === 'asOf'
      ? `As of ${formatDate(params.asOf, organization)}`
      : `From ${formatDate(params.from, organization)} to ${formatDate(params.to, organization)}`;

  return (
    <div className="space-y-4">
      <div className="no-print mx-auto flex max-w-[210mm] items-center justify-between px-2">
        <p className="text-sm text-muted-foreground">Use your browser&apos;s print dialog to print or save as PDF.</p>
        <Button onClick={() => window.print()}>
          <PrinterIcon />
          Print
        </Button>
      </div>
      <article className="print-sheet mx-auto max-w-[210mm] bg-white p-10 text-neutral-900 shadow-sm">
        <header className="mb-6 text-center">
          <p className="text-sm text-neutral-600">{organization.name}</p>
          <h1 className="text-2xl font-semibold">{report.title}</h1>
          {data.customer ? <p className="mt-1 font-medium">{data.customer.displayName}</p> : null}
          <p className="text-sm text-neutral-600">{period}</p>
          {data.openingBalance !== undefined ? (
            <p className="mt-1 text-sm text-neutral-600">Opening balance {formatMoney(data.openingBalance, organization)}</p>
          ) : null}
        </header>
        <ReportTable report={report} data={data} printable />
        {report.note ? <p className="mt-4 text-xs text-neutral-500">{report.note}</p> : null}
      </article>
    </div>
  );
}

export default function PrintReportPage() {
  const { slug } = useParams<{ slug: string }>();
  const report = findReport(slug);
  if (!report) return <p className="p-8 text-center text-sm text-muted-foreground">Report not found.</p>;
  return (
    <Suspense>
      <PrintReport report={report} />
    </Suspense>
  );
}
