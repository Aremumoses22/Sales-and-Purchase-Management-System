import { Injectable } from '@nestjs/common';
import {
  Dec,
  daysBetween,
  getCreditNoteDisplayStatus,
  getInvoiceDisplayStatus,
  todayInTimeZone,
  toDecimal,
  type AgingRow,
  type ArAgingSummaryReport,
  type CreditNoteDetailsReport,
  type CustomerBalancesReport,
  type CustomerStatementQuery,
  type CustomerStatementReport,
  type Decimal,
  type ExpenseGroupReport,
  type InvoiceDetailsQuery,
  type InvoiceDetailsReport,
  type NumericInput,
  type PaymentsReceivedReport,
  type ReportAsOfQuery,
  type ReportRangeQuery,
  type SalesByCustomerReport,
  type SalesByItemReport,
  type StatementEntry,
  type VendorBalancesReport,
} from '@spms/shared';
import { notFound } from '../../common/app-exception.js';
import { fromDateOnly, money, quantity, toDateOnly } from '../../common/serialize.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { OrganizationService } from '../settings/organization.service.js';

const zero = () => new Dec(0);
const sum = (values: NumericInput[]): Decimal => values.reduce<Decimal>((total, value) => total.plus(toDecimal(value)), zero());
const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

function range(query: ReportRangeQuery) {
  return { gte: fromDateOnly(query.from), lte: fromDateOnly(query.to) };
}

/**
 * Read-only reports (PLAN.md module 13). Each figure is computed from stored documents the same
 * way the rest of the app does, so reports agree with customer, vendor and invoice screens:
 * drafts and void documents never count, and sales receipts count as sales but are never owed.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationService,
  ) {}

  async salesByCustomer(query: ReportRangeQuery): Promise<SalesByCustomerReport> {
    const [invoices, receipts] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { status: 'sent', invoiceDate: range(query) },
        select: { total: true, taxTotal: true, customer: { select: { id: true, displayName: true } } },
      }),
      this.prisma.salesReceipt.findMany({
        where: { status: 'completed', receiptDate: range(query) },
        select: { total: true, taxTotal: true, customer: { select: { id: true, displayName: true } } },
      }),
    ]);
    const groups = new Map<string, { name: string; count: number; sales: Decimal; withTax: Decimal }>();
    for (const document of [...invoices, ...receipts]) {
      const group = groups.get(document.customer.id) ?? { name: document.customer.displayName, count: 0, sales: zero(), withTax: zero() };
      group.count += 1;
      group.sales = group.sales.plus(toDecimal(document.total).minus(toDecimal(document.taxTotal)));
      group.withTax = group.withTax.plus(toDecimal(document.total));
      groups.set(document.customer.id, group);
    }
    const rows = [...groups.entries()]
      .map(([customerId, group]) => ({
        customerId,
        customerName: group.name,
        documentCount: group.count,
        sales: money(group.sales),
        salesWithTax: money(group.withTax),
      }))
      .sort((a, b) => toDecimal(b.salesWithTax).cmp(toDecimal(a.salesWithTax)) || a.customerName.localeCompare(b.customerName));
    return {
      rows,
      totals: {
        documentCount: rows.reduce((total, row) => total + row.documentCount, 0),
        sales: money(sum(rows.map((row) => row.sales))),
        salesWithTax: money(sum(rows.map((row) => row.salesWithTax))),
      },
    };
  }

  async salesByItem(query: ReportRangeQuery): Promise<SalesByItemReport> {
    const select = { itemId: true, name: true, quantity: true, amount: true, item: { select: { name: true } } } as const;
    const [invoiceLines, receiptLines] = await Promise.all([
      this.prisma.invoiceLine.findMany({ where: { invoice: { status: 'sent', invoiceDate: range(query) } }, select }),
      this.prisma.salesReceiptLine.findMany({ where: { salesReceipt: { status: 'completed', receiptDate: range(query) } }, select }),
    ]);
    // Saved items group by id (under their current name); one-off lines group by the text typed.
    const groups = new Map<string, { itemId: string | null; name: string; quantity: Decimal; amount: Decimal }>();
    for (const line of [...invoiceLines, ...receiptLines]) {
      const key = line.itemId ?? `text:${line.name.trim().toLowerCase()}`;
      const group = groups.get(key) ?? { itemId: line.itemId, name: line.item?.name ?? line.name, quantity: zero(), amount: zero() };
      group.quantity = group.quantity.plus(toDecimal(line.quantity));
      group.amount = group.amount.plus(toDecimal(line.amount));
      groups.set(key, group);
    }
    const rows = [...groups.values()]
      .sort((a, b) => b.amount.cmp(a.amount) || byName(a, b))
      .map((group) => ({
        itemId: group.itemId,
        itemName: group.name,
        quantitySold: quantity(group.quantity),
        amount: money(group.amount),
        averagePrice: money(group.quantity.gt(0) ? group.amount.div(group.quantity) : 0),
      }));
    return {
      rows,
      totals: { quantitySold: quantity(sum(rows.map((row) => row.quantitySold))), amount: money(sum(rows.map((row) => row.amount))) },
    };
  }

  async invoiceDetails(query: InvoiceDetailsQuery): Promise<InvoiceDetailsReport> {
    const today = await this.today();
    const invoices = await this.prisma.invoice.findMany({
      where: { status: { not: 'draft' }, invoiceDate: range(query) },
      include: { customer: { select: { displayName: true } } },
      orderBy: [{ invoiceDate: 'asc' }, { number: 'asc' }],
    });
    const rows = invoices
      .map((invoice) => ({
        id: invoice.id,
        invoiceDate: toDateOnly(invoice.invoiceDate),
        number: invoice.number,
        customerName: invoice.customer.displayName,
        status: getInvoiceDisplayStatus(
          { status: invoice.status, amountPaid: invoice.amountPaid, balanceDue: invoice.balanceDue, dueDate: toDateOnly(invoice.dueDate) },
          today,
        ),
        dueDate: toDateOnly(invoice.dueDate),
        total: money(invoice.total),
        balanceDue: money(invoice.balanceDue),
      }))
      .filter((row) => query.status === 'all' || row.status === query.status);
    // Void invoices are listed for completeness but add nothing to the totals.
    const counted = rows.filter((row) => row.status !== 'void');
    return {
      rows,
      totals: {
        count: counted.length,
        total: money(sum(counted.map((row) => row.total))),
        balanceDue: money(sum(counted.map((row) => row.balanceDue))),
      },
    };
  }

  async paymentsReceived(query: ReportRangeQuery): Promise<PaymentsReceivedReport> {
    const payments = await this.prisma.paymentReceived.findMany({
      where: { paymentDate: range(query) },
      include: {
        customer: { select: { displayName: true } },
        paymentMode: { select: { name: true } },
        allocations: { include: { invoice: { select: { number: true } } }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: [{ paymentDate: 'asc' }, { number: 'asc' }],
    });
    const rows = payments.map((payment) => ({
      id: payment.id,
      paymentDate: toDateOnly(payment.paymentDate),
      number: payment.number,
      customerName: payment.customer.displayName,
      paymentMode: payment.paymentMode?.name ?? null,
      referenceNumber: payment.referenceNumber,
      invoiceNumbers: payment.allocations.map((allocation) => allocation.invoice.number).join(', '),
      amount: money(payment.amount),
      unusedAmount: money(toDecimal(payment.amount).minus(toDecimal(payment.amountApplied)).minus(toDecimal(payment.amountRefunded))),
    }));
    return {
      rows,
      totals: {
        count: rows.length,
        amount: money(sum(rows.map((row) => row.amount))),
        unusedAmount: money(sum(rows.map((row) => row.unusedAmount))),
      },
    };
  }

  async creditNoteDetails(query: ReportRangeQuery): Promise<CreditNoteDetailsReport> {
    const creditNotes = await this.prisma.creditNote.findMany({
      where: { status: { not: 'draft' }, creditNoteDate: range(query) },
      include: { customer: { select: { displayName: true } }, invoice: { select: { number: true } } },
      orderBy: [{ creditNoteDate: 'asc' }, { number: 'asc' }],
    });
    const rows = creditNotes.map((creditNote) => ({
      id: creditNote.id,
      creditNoteDate: toDateOnly(creditNote.creditNoteDate),
      number: creditNote.number,
      customerName: creditNote.customer.displayName,
      status: getCreditNoteDisplayStatus(creditNote),
      invoiceNumber: creditNote.invoice?.number ?? null,
      total: money(creditNote.total),
      balance: money(creditNote.balance),
    }));
    // Void credit notes are listed for completeness but add nothing to the totals.
    const counted = rows.filter((row) => row.status !== 'void');
    return {
      rows,
      totals: {
        count: counted.length,
        total: money(sum(counted.map((row) => row.total))),
        balance: money(sum(counted.map((row) => row.balance))),
      },
    };
  }

  async expensesByCategory(query: ReportRangeQuery): Promise<ExpenseGroupReport> {
    const groups = await this.prisma.expense.groupBy({
      by: ['categoryId'],
      where: { expenseDate: range(query) },
      _count: { _all: true },
      _sum: { subtotal: true, total: true },
    });
    const categories = await this.prisma.expenseCategory.findMany({
      where: { id: { in: groups.map((group) => group.categoryId) } },
      select: { id: true, name: true },
    });
    const names = new Map(categories.map((category) => [category.id, category.name]));
    return this.expenseGroups(
      groups.map((group) => ({
        id: group.categoryId,
        name: names.get(group.categoryId) ?? 'Unknown category',
        count: group._count._all,
        subtotal: group._sum.subtotal,
        total: group._sum.total,
      })),
    );
  }

  async expensesByVendor(query: ReportRangeQuery): Promise<ExpenseGroupReport> {
    const groups = await this.prisma.expense.groupBy({
      by: ['vendorId'],
      where: { expenseDate: range(query) },
      _count: { _all: true },
      _sum: { subtotal: true, total: true },
    });
    const vendorIds = groups.flatMap((group) => (group.vendorId ? [group.vendorId] : []));
    const vendors = await this.prisma.contact.findMany({ where: { id: { in: vendorIds } }, select: { id: true, displayName: true } });
    const names = new Map(vendors.map((vendor) => [vendor.id, vendor.displayName]));
    return this.expenseGroups(
      groups.map((group) => ({
        id: group.vendorId,
        name: group.vendorId ? (names.get(group.vendorId) ?? 'Unknown vendor') : 'No vendor',
        count: group._count._all,
        subtotal: group._sum.subtotal,
        total: group._sum.total,
      })),
    );
  }

  /**
   * What each customer owed at the end of `asOf`, built from the same entries as the customer
   * statement, so a customer's balance here equals their statement's closing balance.
   */
  async customerBalances(query: ReportAsOfQuery): Promise<CustomerBalancesReport> {
    const end = fromDateOnly(query.asOf);
    const [customers, invoices, payments, paymentRefunds, creditNotes, creditRefunds] = await Promise.all([
      this.prisma.contact.findMany({ where: { type: 'customer' }, select: { id: true, displayName: true, openingBalance: true } }),
      this.prisma.invoice.groupBy({ by: ['customerId'], where: { status: 'sent', invoiceDate: { lte: end } }, _sum: { total: true } }),
      this.prisma.paymentReceived.groupBy({ by: ['customerId'], where: { paymentDate: { lte: end } }, _sum: { amount: true } }),
      this.prisma.paymentRefund.findMany({ where: { refundDate: { lte: end } }, select: { amount: true, payment: { select: { customerId: true } } } }),
      this.prisma.creditNote.groupBy({ by: ['customerId'], where: { status: 'open', creditNoteDate: { lte: end } }, _sum: { total: true } }),
      this.prisma.creditNoteRefund.findMany({
        where: { refundDate: { lte: end }, creditNote: { status: 'open' } },
        select: { amount: true, creditNote: { select: { customerId: true } } },
      }),
    ]);
    const invoiced = new Map(invoices.map((row) => [row.customerId, toDecimal(row._sum.total)]));
    const received = new Map<string, Decimal>();
    const add = (id: string, value: NumericInput, sign: 1 | -1) => received.set(id, (received.get(id) ?? zero()).plus(toDecimal(value).times(sign)));
    for (const row of payments) add(row.customerId, row._sum.amount, 1);
    for (const row of creditNotes) add(row.customerId, row._sum.total, 1);
    for (const row of paymentRefunds) add(row.payment.customerId, row.amount, -1);
    for (const row of creditRefunds) add(row.creditNote.customerId, row.amount, -1);

    const rows = customers
      .map((customer) => {
        const opening = toDecimal(customer.openingBalance);
        const billed = invoiced.get(customer.id) ?? zero();
        const paid = received.get(customer.id) ?? zero();
        return {
          customerId: customer.id,
          customerName: customer.displayName,
          openingBalance: money(opening),
          invoiced: money(billed),
          received: money(paid),
          balance: money(opening.plus(billed).minus(paid)),
          active: !opening.isZero() || !billed.isZero() || !paid.isZero(),
        };
      })
      .filter((row) => row.active)
      .sort((a, b) => a.customerName.localeCompare(b.customerName))
      .map(({ active: _active, ...row }) => row);
    return {
      rows,
      totals: {
        openingBalance: money(sum(rows.map((row) => row.openingBalance))),
        invoiced: money(sum(rows.map((row) => row.invoiced))),
        received: money(sum(rows.map((row) => row.received))),
        balance: money(sum(rows.map((row) => row.balance))),
      },
    };
  }

  /**
   * Unpaid invoice balances grouped by how many days past due they are on `asOf`. Balances are the
   * invoices' current balances, so payments recorded after `asOf` are already taken off.
   */
  async arAgingSummary(query: ReportAsOfQuery): Promise<ArAgingSummaryReport> {
    const invoices = await this.prisma.invoice.findMany({
      where: { status: 'sent', balanceDue: { gt: 0 }, invoiceDate: { lte: fromDateOnly(query.asOf) } },
      select: { balanceDue: true, dueDate: true, customer: { select: { id: true, displayName: true } } },
    });
    const buckets = ['current', 'days1to15', 'days16to30', 'days31to45', 'over45'] as const;
    type Bucket = (typeof buckets)[number];
    const groups = new Map<string, { name: string; amounts: Record<Bucket, Decimal> }>();
    for (const invoice of invoices) {
      const overdue = daysBetween(toDateOnly(invoice.dueDate), query.asOf);
      const bucket: Bucket = overdue <= 0 ? 'current' : overdue <= 15 ? 'days1to15' : overdue <= 30 ? 'days16to30' : overdue <= 45 ? 'days31to45' : 'over45';
      const group = groups.get(invoice.customer.id) ?? {
        name: invoice.customer.displayName,
        amounts: Object.fromEntries(buckets.map((key) => [key, zero()])) as Record<Bucket, Decimal>,
      };
      group.amounts[bucket] = group.amounts[bucket].plus(toDecimal(invoice.balanceDue));
      groups.set(invoice.customer.id, group);
    }
    const rows: AgingRow[] = [...groups.entries()]
      .map(([customerId, group]) => ({
        customerId,
        customerName: group.name,
        current: money(group.amounts.current),
        days1to15: money(group.amounts.days1to15),
        days16to30: money(group.amounts.days16to30),
        days31to45: money(group.amounts.days31to45),
        over45: money(group.amounts.over45),
        total: money(sum(buckets.map((key) => group.amounts[key]))),
      }))
      .sort((a, b) => a.customerName.localeCompare(b.customerName));
    const column = (key: Bucket | 'total') => money(sum(rows.map((row) => row[key])));
    return {
      rows,
      totals: {
        current: column('current'),
        days1to15: column('days1to15'),
        days16to30: column('days16to30'),
        days31to45: column('days31to45'),
        over45: column('over45'),
        total: column('total'),
      },
    };
  }

  /** What the business owed each vendor at the end of `asOf`: opening balance plus open bills less payments made. */
  async vendorBalances(query: ReportAsOfQuery): Promise<VendorBalancesReport> {
    const end = fromDateOnly(query.asOf);
    const [vendors, bills, payments] = await Promise.all([
      this.prisma.contact.findMany({ where: { type: 'vendor' }, select: { id: true, displayName: true, openingBalance: true } }),
      this.prisma.bill.groupBy({ by: ['vendorId'], where: { status: 'open', billDate: { lte: end } }, _sum: { total: true } }),
      this.prisma.paymentMade.groupBy({ by: ['vendorId'], where: { paymentDate: { lte: end } }, _sum: { amount: true } }),
    ]);
    const billed = new Map(bills.map((row) => [row.vendorId, toDecimal(row._sum.total)]));
    const paid = new Map(payments.map((row) => [row.vendorId, toDecimal(row._sum.amount)]));
    const rows = vendors
      .map((vendor) => {
        const opening = toDecimal(vendor.openingBalance);
        const vendorBilled = billed.get(vendor.id) ?? zero();
        const vendorPaid = paid.get(vendor.id) ?? zero();
        return {
          vendorId: vendor.id,
          vendorName: vendor.displayName,
          openingBalance: money(opening),
          billed: money(vendorBilled),
          paid: money(vendorPaid),
          balance: money(opening.plus(vendorBilled).minus(vendorPaid)),
          active: !opening.isZero() || !vendorBilled.isZero() || !vendorPaid.isZero(),
        };
      })
      .filter((row) => row.active)
      .sort((a, b) => a.vendorName.localeCompare(b.vendorName))
      .map(({ active: _active, ...row }) => row);
    return {
      rows,
      totals: {
        openingBalance: money(sum(rows.map((row) => row.openingBalance))),
        billed: money(sum(rows.map((row) => row.billed))),
        paid: money(sum(rows.map((row) => row.paid))),
        balance: money(sum(rows.map((row) => row.balance))),
      },
    };
  }

  /**
   * A customer's account over a period: the balance brought forward, then every invoice, payment,
   * credit note and refund in date order with a running balance.
   */
  async customerStatement(query: CustomerStatementQuery): Promise<CustomerStatementReport> {
    const customer = await this.prisma.contact.findFirst({
      where: { id: query.customerId, type: 'customer' },
      select: { id: true, displayName: true, email: true, openingBalance: true },
    });
    if (!customer) throw notFound('Customer');
    const to = fromDateOnly(query.to);

    const [invoices, payments, paymentRefunds, creditNotes, creditRefunds] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { customerId: customer.id, status: 'sent', invoiceDate: { lte: to } },
        select: { id: true, number: true, invoiceDate: true, dueDate: true, total: true, createdAt: true },
      }),
      this.prisma.paymentReceived.findMany({
        where: { customerId: customer.id, paymentDate: { lte: to } },
        select: {
          id: true,
          number: true,
          paymentDate: true,
          amount: true,
          createdAt: true,
          allocations: { select: { invoice: { select: { number: true } } } },
        },
      }),
      this.prisma.paymentRefund.findMany({
        where: { payment: { customerId: customer.id }, refundDate: { lte: to } },
        select: { amount: true, refundDate: true, createdAt: true, payment: { select: { id: true, number: true } } },
      }),
      this.prisma.creditNote.findMany({
        where: { customerId: customer.id, status: 'open', creditNoteDate: { lte: to } },
        select: { id: true, number: true, creditNoteDate: true, total: true, createdAt: true },
      }),
      this.prisma.creditNoteRefund.findMany({
        where: { creditNote: { customerId: customer.id, status: 'open' }, refundDate: { lte: to } },
        select: { amount: true, refundDate: true, createdAt: true, creditNote: { select: { id: true, number: true } } },
      }),
    ]);

    type Entry = Omit<StatementEntry, 'balance' | 'debit' | 'credit'> & { debit: Decimal; credit: Decimal; createdAt: Date };
    const entries: Entry[] = [
      ...invoices.map((row) => ({
        date: toDateOnly(row.invoiceDate),
        type: 'invoice' as const,
        documentId: row.id,
        number: row.number,
        details: 'Invoice',
        dueDate: toDateOnly(row.dueDate),
        debit: toDecimal(row.total),
        credit: zero(),
        createdAt: row.createdAt,
      })),
      ...payments.map((row) => ({
        date: toDateOnly(row.paymentDate),
        type: 'payment' as const,
        documentId: row.id,
        number: row.number,
        details: row.allocations.length ? `For ${row.allocations.map((allocation) => allocation.invoice.number).join(', ')}` : 'Payment received',
        dueDate: null,
        debit: zero(),
        credit: toDecimal(row.amount),
        createdAt: row.createdAt,
      })),
      ...paymentRefunds.map((row) => ({
        date: toDateOnly(row.refundDate),
        type: 'payment_refund' as const,
        documentId: row.payment.id,
        number: row.payment.number,
        details: 'Refund of payment',
        dueDate: null,
        debit: toDecimal(row.amount),
        credit: zero(),
        createdAt: row.createdAt,
      })),
      ...creditNotes.map((row) => ({
        date: toDateOnly(row.creditNoteDate),
        type: 'credit_note' as const,
        documentId: row.id,
        number: row.number,
        details: 'Credit note',
        dueDate: null,
        debit: zero(),
        credit: toDecimal(row.total),
        createdAt: row.createdAt,
      })),
      ...creditRefunds.map((row) => ({
        date: toDateOnly(row.refundDate),
        type: 'credit_refund' as const,
        documentId: row.creditNote.id,
        number: row.creditNote.number,
        details: 'Refund of credit note',
        dueDate: null,
        debit: toDecimal(row.amount),
        credit: zero(),
        createdAt: row.createdAt,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.getTime() - b.createdAt.getTime());

    const before = entries.filter((entry) => entry.date < query.from);
    const opening = toDecimal(customer.openingBalance).plus(sum(before.map((entry) => entry.debit))).minus(sum(before.map((entry) => entry.credit)));
    let running = opening;
    const inPeriod = entries.filter((entry) => entry.date >= query.from);
    const rows: StatementEntry[] = [
      {
        date: query.from,
        type: 'opening_balance',
        documentId: null,
        number: null,
        details: 'Balance brought forward',
        dueDate: null,
        debit: '0.00',
        credit: '0.00',
        balance: money(opening),
      },
      ...inPeriod.map((entry) => {
        running = running.plus(entry.debit).minus(entry.credit);
        return {
          date: entry.date,
          type: entry.type,
          documentId: entry.documentId,
          number: entry.number,
          details: entry.details,
          dueDate: entry.dueDate,
          debit: money(entry.debit),
          credit: money(entry.credit),
          balance: money(running),
        };
      }),
    ];
    return {
      customer: { id: customer.id, displayName: customer.displayName, email: customer.email },
      openingBalance: money(opening),
      rows,
      totals: {
        debit: money(sum(inPeriod.map((entry) => entry.debit))),
        credit: money(sum(inPeriod.map((entry) => entry.credit))),
        closingBalance: money(running),
      },
    };
  }

  private expenseGroups(
    groups: { id: string | null; name: string; count: number; subtotal: NumericInput; total: NumericInput }[],
  ): ExpenseGroupReport {
    const rows = groups
      .map((group) => ({
        id: group.id,
        name: group.name,
        expenseCount: group.count,
        amount: money(toDecimal(group.subtotal)),
        amountWithTax: money(toDecimal(group.total)),
      }))
      .sort((a, b) => toDecimal(b.amountWithTax).cmp(toDecimal(a.amountWithTax)) || a.name.localeCompare(b.name));
    return {
      rows,
      totals: {
        expenseCount: rows.reduce((total, row) => total + row.expenseCount, 0),
        amount: money(sum(rows.map((row) => row.amount))),
        amountWithTax: money(sum(rows.map((row) => row.amountWithTax))),
      },
    };
  }

  private async today(): Promise<string> {
    return todayInTimeZone(await this.organization.timezone());
  }
}
