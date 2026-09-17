import { INVOICE_DISPLAY_STATUSES, STATUS_LABELS, type OrganizationDto, type StatementEntryType } from '@spms/shared';
import { formatDate } from '@/lib/format';

export type ReportFilterKind = 'range' | 'asOf';
export type ColumnKind = 'text' | 'money' | 'date' | 'count' | 'quantity' | 'status';

type FormatOrganization = Pick<OrganizationDto, 'dateFormat' | 'currencySymbol'>;

export interface ReportColumn {
  key: string;
  header: string;
  kind: ColumnKind;
  /** Where the cell links to, if anywhere. */
  href?: (row: Record<string, unknown>) => string | null;
  /** Turns a raw value into display text (text columns only). */
  label?: (value: unknown) => string;
  /** Replaces the cell text entirely; return null to fall back to the normal formatting. */
  format?: (row: Record<string, unknown>, organization: FormatOrganization) => string | null;
}

export interface ReportDefinition {
  slug: string;
  title: string;
  description: string;
  group: 'Sales' | 'Receivables' | 'Payments and credits' | 'Purchases and expenses';
  filter: ReportFilterKind;
  /** Extra filter shown next to the dates. */
  extra?: 'customer' | 'invoiceStatus';
  columns: ReportColumn[];
  /** Maps a column key to the key in `totals` holding its total. */
  totals: Record<string, string>;
  /** Shown above the table, e.g. how the figures are worked out. */
  note?: string;
}

const link = (base: string, idKey: string) => (row: Record<string, unknown>) =>
  typeof row[idKey] === 'string' ? `${base}/${row[idKey] as string}` : null;

const STATEMENT_LABELS: Record<StatementEntryType, string> = {
  opening_balance: 'Opening balance',
  invoice: 'Invoice',
  payment: 'Payment received',
  payment_refund: 'Payment refund',
  credit_note: 'Credit note',
  credit_refund: 'Credit note refund',
};

const STATEMENT_LINKS: Partial<Record<StatementEntryType, string>> = {
  invoice: '/invoices',
  payment: '/payments-received',
  payment_refund: '/payments-received',
  credit_note: '/credit-notes',
  credit_refund: '/credit-notes',
};

export const INVOICE_STATUS_OPTIONS = INVOICE_DISPLAY_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] ?? status }));

export const REPORTS: ReportDefinition[] = [
  {
    slug: 'sales-by-customer',
    title: 'Sales by Customer',
    description: 'Sales to each customer from sent invoices and completed sales receipts.',
    group: 'Sales',
    filter: 'range',
    columns: [
      { key: 'customerName', header: 'Customer', kind: 'text', href: link('/customers', 'customerId') },
      { key: 'documentCount', header: 'Invoices and receipts', kind: 'count' },
      { key: 'sales', header: 'Sales', kind: 'money' },
      { key: 'salesWithTax', header: 'Sales with tax', kind: 'money' },
    ],
    totals: { documentCount: 'documentCount', sales: 'sales', salesWithTax: 'salesWithTax' },
    note: 'Sales exclude tax; shipping and adjustments are included. Draft and void documents are left out.',
  },
  {
    slug: 'sales-by-item',
    title: 'Sales by Item',
    description: 'Quantity sold and sales amount for each item.',
    group: 'Sales',
    filter: 'range',
    columns: [
      { key: 'itemName', header: 'Item', kind: 'text', href: link('/items', 'itemId') },
      { key: 'quantitySold', header: 'Quantity sold', kind: 'quantity' },
      { key: 'amount', header: 'Amount', kind: 'money' },
      { key: 'averagePrice', header: 'Average price', kind: 'money' },
    ],
    totals: { quantitySold: 'quantitySold', amount: 'amount' },
    note: 'Amounts are after line discounts and before tax. Lines typed without a saved item are grouped by their text.',
  },
  {
    slug: 'customer-statement',
    title: 'Customer Statement',
    description: "A customer's invoices, payments, credits and refunds with a running balance.",
    group: 'Receivables',
    filter: 'range',
    extra: 'customer',
    columns: [
      { key: 'date', header: 'Date', kind: 'date' },
      { key: 'type', header: 'Transaction', kind: 'text', label: (value) => STATEMENT_LABELS[value as StatementEntryType] ?? String(value) },
      {
        key: 'number',
        header: 'Number',
        kind: 'text',
        href: (row) => {
          const base = STATEMENT_LINKS[row['type'] as StatementEntryType];
          return base && typeof row['documentId'] === 'string' ? `${base}/${row['documentId']}` : null;
        },
      },
      {
        key: 'details',
        header: 'Details',
        kind: 'text',
        format: (row, organization) =>
          typeof row['dueDate'] === 'string' ? `Due on ${formatDate(row['dueDate'], organization)}` : null,
      },
      { key: 'debit', header: 'Amount', kind: 'money', format: (row) => (row['type'] === 'opening_balance' ? '' : null) },
      { key: 'credit', header: 'Payments and credits', kind: 'money', format: (row) => (row['type'] === 'opening_balance' ? '' : null) },
      { key: 'balance', header: 'Balance', kind: 'money' },
    ],
    totals: { debit: 'debit', credit: 'credit', balance: 'closingBalance' },
  },
  {
    slug: 'customer-balances',
    title: 'Customer Balances',
    description: 'What each customer owed at the end of a date.',
    group: 'Receivables',
    filter: 'asOf',
    columns: [
      { key: 'customerName', header: 'Customer', kind: 'text', href: link('/customers', 'customerId') },
      { key: 'openingBalance', header: 'Opening balance', kind: 'money' },
      { key: 'invoiced', header: 'Invoiced', kind: 'money' },
      { key: 'received', header: 'Payments and credits', kind: 'money' },
      { key: 'balance', header: 'Balance', kind: 'money' },
    ],
    totals: { openingBalance: 'openingBalance', invoiced: 'invoiced', received: 'received', balance: 'balance' },
    note: 'Payments and credits are net of refunds. A negative balance is credit the customer has with you.',
  },
  {
    slug: 'ar-aging-summary',
    title: 'AR Aging Summary',
    description: 'Unpaid invoice balances grouped by how long they are overdue.',
    group: 'Receivables',
    filter: 'asOf',
    columns: [
      { key: 'customerName', header: 'Customer', kind: 'text', href: link('/customers', 'customerId') },
      { key: 'current', header: 'Current', kind: 'money' },
      { key: 'days1to15', header: '1–15 days', kind: 'money' },
      { key: 'days16to30', header: '16–30 days', kind: 'money' },
      { key: 'days31to45', header: '31–45 days', kind: 'money' },
      { key: 'over45', header: '> 45 days', kind: 'money' },
      { key: 'total', header: 'Total', kind: 'money' },
    ],
    totals: { current: 'current', days1to15: 'days1to15', days16to30: 'days16to30', days31to45: 'days31to45', over45: 'over45', total: 'total' },
    note: 'Days overdue are counted to the chosen date, using each invoice’s balance as it stands today.',
  },
  {
    slug: 'invoice-details',
    title: 'Invoice Details',
    description: 'Every invoice in a period with its status, due date and balance.',
    group: 'Sales',
    filter: 'range',
    extra: 'invoiceStatus',
    columns: [
      { key: 'invoiceDate', header: 'Date', kind: 'date' },
      { key: 'number', header: 'Invoice#', kind: 'text', href: link('/invoices', 'id') },
      { key: 'customerName', header: 'Customer', kind: 'text' },
      { key: 'status', header: 'Status', kind: 'status' },
      { key: 'dueDate', header: 'Due date', kind: 'date' },
      { key: 'total', header: 'Amount', kind: 'money' },
      { key: 'balanceDue', header: 'Balance due', kind: 'money' },
    ],
    totals: { number: 'count', total: 'total', balanceDue: 'balanceDue' },
    note: 'Drafts are left out. Void invoices are listed but not added to the totals.',
  },
  {
    slug: 'payments-received',
    title: 'Payments Received',
    description: 'Payments received from customers and the invoices they paid.',
    group: 'Payments and credits',
    filter: 'range',
    columns: [
      { key: 'paymentDate', header: 'Date', kind: 'date' },
      { key: 'number', header: 'Payment#', kind: 'text', href: link('/payments-received', 'id') },
      { key: 'customerName', header: 'Customer', kind: 'text' },
      { key: 'paymentMode', header: 'Mode', kind: 'text' },
      { key: 'referenceNumber', header: 'Reference#', kind: 'text' },
      { key: 'invoiceNumbers', header: 'Invoices', kind: 'text' },
      { key: 'amount', header: 'Amount', kind: 'money' },
      { key: 'unusedAmount', header: 'Unused', kind: 'money' },
    ],
    totals: { number: 'count', amount: 'amount', unusedAmount: 'unusedAmount' },
  },
  {
    slug: 'credit-note-details',
    title: 'Credit Note Details',
    description: 'Credit notes issued in a period and what is left of each.',
    group: 'Payments and credits',
    filter: 'range',
    columns: [
      { key: 'creditNoteDate', header: 'Date', kind: 'date' },
      { key: 'number', header: 'Credit note#', kind: 'text', href: link('/credit-notes', 'id') },
      { key: 'customerName', header: 'Customer', kind: 'text' },
      { key: 'status', header: 'Status', kind: 'status' },
      { key: 'invoiceNumber', header: 'Invoice#', kind: 'text' },
      { key: 'total', header: 'Amount', kind: 'money' },
      { key: 'balance', header: 'Balance', kind: 'money' },
    ],
    totals: { number: 'count', total: 'total', balance: 'balance' },
    note: 'Drafts are left out. Void credit notes are listed but not added to the totals.',
  },
  {
    slug: 'expenses-by-category',
    title: 'Expenses by Category',
    description: 'Money spent in each expense category.',
    group: 'Purchases and expenses',
    filter: 'range',
    columns: [
      { key: 'name', header: 'Category', kind: 'text' },
      { key: 'expenseCount', header: 'Expenses', kind: 'count' },
      { key: 'amount', header: 'Amount', kind: 'money' },
      { key: 'amountWithTax', header: 'Amount with tax', kind: 'money' },
    ],
    totals: { expenseCount: 'expenseCount', amount: 'amount', amountWithTax: 'amountWithTax' },
  },
  {
    slug: 'expenses-by-vendor',
    title: 'Expenses by Vendor',
    description: 'Money spent with each vendor.',
    group: 'Purchases and expenses',
    filter: 'range',
    columns: [
      { key: 'name', header: 'Vendor', kind: 'text', href: link('/vendors', 'id') },
      { key: 'expenseCount', header: 'Expenses', kind: 'count' },
      { key: 'amount', header: 'Amount', kind: 'money' },
      { key: 'amountWithTax', header: 'Amount with tax', kind: 'money' },
    ],
    totals: { expenseCount: 'expenseCount', amount: 'amount', amountWithTax: 'amountWithTax' },
  },
  {
    slug: 'vendor-balances',
    title: 'Vendor Balances',
    description: 'What you owed each vendor at the end of a date.',
    group: 'Purchases and expenses',
    filter: 'asOf',
    columns: [
      { key: 'vendorName', header: 'Vendor', kind: 'text', href: link('/vendors', 'vendorId') },
      { key: 'openingBalance', header: 'Opening balance', kind: 'money' },
      { key: 'billed', header: 'Billed', kind: 'money' },
      { key: 'paid', header: 'Paid', kind: 'money' },
      { key: 'balance', header: 'Balance', kind: 'money' },
    ],
    totals: { openingBalance: 'openingBalance', billed: 'billed', paid: 'paid', balance: 'balance' },
    note: 'Billed counts open bills; paid counts every payment made, including any not yet used on a bill, less refunds from the vendor.',
  },
];

export const REPORT_GROUPS = ['Sales', 'Receivables', 'Payments and credits', 'Purchases and expenses'] as const;

export function findReport(slug: string): ReportDefinition | undefined {
  return REPORTS.find((report) => report.slug === slug);
}
