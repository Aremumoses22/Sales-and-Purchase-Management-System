'use client';

import {
  DASHBOARD_PERIODS,
  DATE_RANGE_PRESET_LABELS,
  INVOICE_DISPLAY_STATUSES,
  type DashboardMonth,
  type DashboardPeriod,
  type DashboardSummaryDto,
  type RecentTransactionType,
} from '@spms/shared';
import { cn } from 'cn';
import { Loader2Icon } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { StatusBadge } from '@/components/status-badge';
import { NativeSelect } from '@/components/ui/native-select';
import { formatDate, formatMoney } from '@/lib/format';
import { useOrganization } from '@/lib/session';
import { useDashboard } from './api';

function Panel({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border bg-card p-5', className)}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A two-part bar: the share not yet due and the share overdue. */
function SplitBar({ current, overdue }: { current: string; overdue: string }) {
  const total = Number(current) + Number(overdue);
  const currentShare = total > 0 ? (Number(current) / total) * 100 : 0;
  return (
    <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label="Current and overdue amounts">
      <div className="bg-blue-500" style={{ width: `${currentShare}%` }} />
      <div className="bg-rose-500" style={{ width: `${total > 0 ? 100 - currentShare : 0}%` }} />
    </div>
  );
}

function OwedCard({
  title,
  href,
  total,
  current,
  overdue,
  children,
}: {
  title: string;
  href: string;
  total: string;
  current: string;
  overdue: string;
  children?: ReactNode;
}) {
  return (
    <Panel
      title={title}
      action={
        <Link href={href} className="text-xs text-primary hover:underline">
          View all
        </Link>
      }
    >
      <p className="text-3xl font-semibold">
        <Money value={total} />
      </p>
      <div className="mt-4 space-y-2">
        <SplitBar current={current} overdue={overdue} />
        <div className="flex justify-between text-sm">
          <span>
            <span className="mr-1.5 inline-block size-2 rounded-full bg-blue-500" />
            Current <Money value={current} className="font-medium" />
          </span>
          <span>
            <span className="mr-1.5 inline-block size-2 rounded-full bg-rose-500" />
            Overdue <Money value={overdue} className="font-medium text-rose-700" />
          </span>
        </div>
      </div>
      {children}
    </Panel>
  );
}

const SERIES = [
  { key: 'sales', label: 'Sales', color: 'fill-blue-500', swatch: 'bg-blue-500' },
  { key: 'receipts', label: 'Receipts', color: 'fill-emerald-500', swatch: 'bg-emerald-500' },
  { key: 'expenses', label: 'Expenses', color: 'fill-amber-500', swatch: 'bg-amber-500' },
] as const;

/** Grouped bars per month, drawn as plain SVG so no chart library is needed. */
function MonthlyChart({ months }: { months: DashboardMonth[] }) {
  const organization = useOrganization();
  const width = 720;
  const height = 200;
  const top = 10;
  const max = Math.max(1, ...months.flatMap((month) => SERIES.map((series) => Number(month[series.key]))));
  const slot = width / months.length;
  const bar = Math.min(16, (slot - 12) / SERIES.length);
  const scale = (value: string) => (Number(value) / max) * (height - top);
  const label = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleString('en-GB', { month: 'short' });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {SERIES.map((series) => (
          <span key={series.key} className="inline-flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-sm', series.swatch)} />
            {series.label}
          </span>
        ))}
        <span className="ml-auto">Highest month {formatMoney(max, organization)}</span>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          {/* Stretched to the card's width; labels sit in HTML below so text is never distorted. */}
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="h-52 w-full"
            role="img"
            aria-label="Sales, receipts and expenses by month"
          >
            {[0.25, 0.5, 0.75, 1].map((fraction) => (
              <line
                key={fraction}
                x1={0}
                x2={width}
                y1={height - fraction * (height - top)}
                y2={height - fraction * (height - top)}
                className="stroke-border"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {months.map((month, index) => {
              const groupStart = index * slot + (slot - bar * SERIES.length) / 2;
              return (
                <g key={month.month}>
                  {SERIES.map((series, seriesIndex) => {
                    const barHeight = scale(month[series.key]);
                    return (
                      <rect
                        key={series.key}
                        x={groupStart + seriesIndex * bar}
                        y={height - barHeight}
                        width={bar - 2}
                        height={Math.max(barHeight, 0)}
                        className={series.color}
                      >
                        <title>{`${series.label} ${label(month.month)} ${month.month.slice(0, 4)}: ${formatMoney(month[series.key], organization)}`}</title>
                      </rect>
                    );
                  })}
                </g>
              );
            })}
          </svg>
          <div className="mt-1 grid text-center text-[11px] text-muted-foreground" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
            {months.map((month) => (
              <span key={month.month}>{label(month.month)}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const TRANSACTION_LINKS: Record<RecentTransactionType, { label: string; href: string }> = {
  invoice: { label: 'Invoice', href: '/invoices' },
  payment_received: { label: 'Payment received', href: '/payments-received' },
  sales_receipt: { label: 'Sales receipt', href: '/sales-receipts' },
  expense: { label: 'Expense', href: '/expenses' },
  bill: { label: 'Bill', href: '/bills' },
  payment_made: { label: 'Payment made', href: '/payments-made' },
};

function Totals({ summary }: { summary: DashboardSummaryDto }) {
  const items = [
    { label: 'Sales', value: summary.totals.sales, className: 'text-blue-700' },
    { label: 'Receipts', value: summary.totals.receipts, className: 'text-emerald-700' },
    { label: 'Expenses', value: summary.totals.expenses, className: 'text-amber-700' },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg bg-muted/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">{item.label}</p>
          <p className={cn('text-xl font-semibold', item.className)}>
            <Money value={item.value} />
          </p>
        </div>
      ))}
    </div>
  );
}

export function Dashboard() {
  const organization = useOrganization();
  const [period, setPeriod] = useState<DashboardPeriod>('this_month');
  const { data, isPending, isError, isFetching } = useDashboard(period, true);

  if (isError) return <EmptyState title="The dashboard could not be loaded" description="Refresh the page to try again." />;
  if (isPending || !data) return <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;

  const buckets = [
    { key: 'days1to15', label: '1–15 days' },
    { key: 'days16to30', label: '16–30 days' },
    { key: 'days31to45', label: '31–45 days' },
    { key: 'over45', label: 'Above 45 days' },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <OwedCard
          title="Total receivables"
          href="/invoices"
          total={data.receivables.total}
          current={data.receivables.buckets.current}
          overdue={data.receivables.overdue}
        >
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t pt-3 text-sm sm:grid-cols-4">
            {buckets.map((bucket) => (
              <div key={bucket.key}>
                <dt className="text-xs text-muted-foreground">{bucket.label}</dt>
                <dd className="font-medium">
                  <Money value={data.receivables.buckets[bucket.key]} />
                </dd>
              </div>
            ))}
          </dl>
        </OwedCard>
        <OwedCard title="Total payables" href="/bills" total={data.payables.total} current={data.payables.current} overdue={data.payables.overdue} />
      </div>

      <Panel
        title="Sales, receipts and expenses"
        action={
          <div className="flex items-center gap-2">
            {isFetching ? <Loader2Icon className="size-4 animate-spin text-muted-foreground" /> : null}
            <NativeSelect aria-label="Dashboard period" value={period} onChange={(event) => setPeriod(event.target.value as DashboardPeriod)} className="w-40">
              {DASHBOARD_PERIODS.map((value) => (
                <option key={value} value={value}>
                  {DATE_RANGE_PRESET_LABELS[value]}
                </option>
              ))}
            </NativeSelect>
          </div>
        }
      >
        <p className="-mt-2 mb-3 text-xs text-muted-foreground">
          {formatDate(data.period.from, organization)} to {formatDate(data.period.to, organization)}
        </p>
        <Totals summary={data} />
        <div className="mt-5">
          <MonthlyChart months={data.months} />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Top expenses"
          action={
            <Link href="/reports/expenses-by-category" className="text-xs text-primary hover:underline">
              Report
            </Link>
          }
        >
          {data.topExpenseCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses in this period.</p>
          ) : (
            <ul className="space-y-3">
              {data.topExpenseCategories.map((category) => {
                const share = (Number(category.amount) / Number(data.topExpenseCategories[0]?.amount ?? 1)) * 100;
                return (
                  <li key={category.id} className="space-y-1 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="truncate">{category.name}</span>
                      <Money value={category.amount} className="font-medium" />
                    </div>
                    <div className="h-1.5 rounded-full bg-muted">
                      <div className="h-1.5 rounded-full bg-amber-500" style={{ width: `${share}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Invoices by status">
          <ul className="divide-y text-sm">
            {INVOICE_DISPLAY_STATUSES.map((status) => (
              <li key={status}>
                <Link href={`/invoices?status=${status}`} className="flex items-center justify-between py-2 hover:text-primary">
                  <StatusBadge status={status} />
                  <span className="font-medium tabular-nums">{data.invoiceCounts[status] ?? 0}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Recent transactions">
          {data.recentTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {data.recentTransactions.map((transaction) => {
                const kind = TRANSACTION_LINKS[transaction.type];
                return (
                  <li key={`${transaction.type}-${transaction.id}`}>
                    <Link href={`${kind.href}/${transaction.id}`} className="flex items-center justify-between gap-3 py-2 hover:bg-muted/30">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{transaction.reference}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {kind.label} · {formatDate(transaction.date, organization)}
                          {transaction.party ? ` · ${transaction.party}` : ''}
                        </span>
                      </span>
                      <Money value={transaction.amount} className="shrink-0" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
