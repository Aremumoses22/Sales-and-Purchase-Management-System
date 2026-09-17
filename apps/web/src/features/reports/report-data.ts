'use client';

import { dateRangeForPreset, DATE_RANGE_PRESETS, isDateOnly, todayInTimeZone, type DateRangePreset } from '@spms/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { ReportDefinition } from './definitions';

export interface ReportResult {
  rows: Record<string, unknown>[];
  totals: Record<string, unknown>;
  customer?: { id: string; displayName: string; email: string | null };
  openingBalance?: string;
}

export interface ReportParams {
  preset: DateRangePreset;
  from: string;
  to: string;
  asOf: string;
  customerId: string;
  status: string;
}

/** Report filters live in the URL, so a report can be bookmarked, shared and printed as shown. */
export function useReportParams(timezone: string): ReportParams {
  const searchParams = useSearchParams();
  const today = todayInTimeZone(timezone);
  const requested = searchParams.get('preset') as DateRangePreset | null;
  const preset = requested && DATE_RANGE_PRESETS.includes(requested) ? requested : 'this_month';
  const fallback = dateRangeForPreset(preset, today);
  const date = (key: string, value: string) => {
    const candidate = searchParams.get(key);
    return candidate && isDateOnly(candidate) ? candidate : value;
  };
  return {
    preset,
    from: preset === 'custom' ? date('from', fallback.from) : fallback.from,
    to: preset === 'custom' ? date('to', fallback.to) : fallback.to,
    asOf: date('asOf', today),
    customerId: searchParams.get('customerId') ?? '',
    status: searchParams.get('status') ?? 'all',
  };
}

export function reportQuery(report: ReportDefinition, params: ReportParams): Record<string, string> | null {
  if (report.filter === 'asOf') return { asOf: params.asOf };
  const query: Record<string, string> = { from: params.from, to: params.to };
  if (report.extra === 'customer') {
    if (!params.customerId) return null;
    query['customerId'] = params.customerId;
  }
  if (report.extra === 'invoiceStatus') query['status'] = params.status;
  return query;
}

export function useReport(report: ReportDefinition, params: ReportParams) {
  const query = reportQuery(report, params);
  return useQuery({
    queryKey: ['reports', report.slug, query],
    queryFn: () => api.get<ReportResult>(`/reports/${report.slug}`, query ?? undefined),
    enabled: query !== null,
    placeholderData: keepPreviousData,
  });
}
