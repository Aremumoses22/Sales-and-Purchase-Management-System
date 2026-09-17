'use client';

import { ChartColumnIcon, ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { REPORT_GROUPS, REPORTS } from '@/features/reports/definitions';

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Pick a report, choose the period, then export it to CSV or print it." />
      <div className="grid gap-4 lg:grid-cols-2">
        {REPORT_GROUPS.map((group) => (
          <section key={group} className="rounded-xl border bg-card">
            <h2 className="flex items-center gap-2 border-b px-5 py-3 text-sm font-semibold">
              <ChartColumnIcon className="size-4 text-muted-foreground" />
              {group}
            </h2>
            <ul className="divide-y">
              {REPORTS.filter((report) => report.group === group).map((report) => (
                <li key={report.slug}>
                  <Link href={`/reports/${report.slug}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/40">
                    <span>
                      <span className="block text-sm font-medium text-primary">{report.title}</span>
                      <span className="block text-xs text-muted-foreground">{report.description}</span>
                    </span>
                    <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
