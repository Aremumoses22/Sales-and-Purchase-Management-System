import { Injectable } from '@nestjs/common';
import {
  addDays,
  canPerformInvoiceAction,
  canPerformQuoteAction,
  daysBetween,
  getInvoiceDisplayStatus,
  INVOICE_DISPLAY_STATUSES,
  todayInTimeZone,
  toDecimal,
  type AuditLogDto,
  type InvoiceAction,
  type InvoiceDisplayStatus,
  type InvoiceDto,
  type InvoiceListItemDto,
  type InvoiceListQuery,
  type InvoiceOutput,
  type InvoiceStatus,
  type NumericInput,
  type Paginated,
  type StatusCountsDto,
} from '@spms/shared';
import { AuditService } from '../../audit/audit.service.js';
import { diffRecords } from '../../audit/diff.js';
import { conflict, fieldError, notFound } from '../../common/app-exception.js';
import { pageArgs, paginated, parseSort } from '../../common/pagination.js';
import { getRequestContext } from '../../common/request-context.js';
import {
  fromDateOnly,
  money,
  quantity,
  toDateOnly,
  toIso,
  toIsoOrNull,
} from '../../common/serialize.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../prisma/prisma.service.js';
import {
  DocumentLinesService,
  storedLinesToInput,
  taxBreakdownFromLines,
  toDocumentCustomer,
  toDocumentLineDto,
  type PreparedDocument,
} from '../documents/document-lines.service.js';
import { StockService } from '../items/stock.service.js';
import { NumberSeriesService } from '../settings/number-series.service.js';
import { OrganizationService } from '../settings/organization.service.js';

const INVOICE_INCLUDE = {
  lines: { orderBy: { position: 'asc' } },
  customer: { include: { addresses: true } },
  paymentTerm: { select: { id: true, name: true, days: true } },
  quote: { select: { id: true, number: true } },
  createdBy: { select: { id: true, name: true } },
  allocations: {
    include: {
      payment: { select: { id: true, number: true, paymentDate: true, paymentMode: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.InvoiceInclude;

type InvoiceDetail = Prisma.InvoiceGetPayload<{ include: typeof INVOICE_INCLUDE }>;

interface StatusFacts {
  status: InvoiceStatus;
  amountPaid: NumericInput;
  balanceDue: NumericInput;
}

function displayStatus(invoice: StatusFacts & { dueDate: Date }, today: string): InvoiceDisplayStatus {
  return getInvoiceDisplayStatus({ ...invoice, dueDate: toDateOnly(invoice.dueDate) }, today);
}

/** Filter matching exactly the invoices shown with a given display status. */
function statusWhere(status: InvoiceDisplayStatus, today: string): Prisma.InvoiceWhereInput {
  const todayDate = fromDateOnly(today);
  switch (status) {
    case 'draft':
      return { status: 'draft' };
    case 'void':
      return { status: 'void' };
    case 'paid':
      return { status: 'sent', balanceDue: { lte: 0 } };
    case 'overdue':
      return { status: 'sent', balanceDue: { gt: 0 }, dueDate: { lt: todayDate } };
    case 'partially_paid':
      return { status: 'sent', balanceDue: { gt: 0 }, amountPaid: { gt: 0 }, dueDate: { gte: todayDate } };
    case 'sent':
      return { status: 'sent', balanceDue: { gt: 0 }, amountPaid: { lte: 0 }, dueDate: { gte: todayDate } };
  }
}

function toInvoiceDto(invoice: InvoiceDetail, today: string): InvoiceDto {
  return {
    id: invoice.id,
    number: invoice.number,
    invoiceDate: toDateOnly(invoice.invoiceDate),
    dueDate: toDateOnly(invoice.dueDate),
    orderNumber: invoice.orderNumber,
    status: invoice.status,
    displayStatus: displayStatus(invoice, today),
    subject: invoice.subject,
    paymentTerm: invoice.paymentTerm,
    subtotal: money(invoice.subtotal),
    discountTotal: money(invoice.discountTotal),
    taxTotal: money(invoice.taxTotal),
    taxBreakdown: taxBreakdownFromLines(invoice.lines),
    shippingCharge: money(invoice.shippingCharge),
    adjustment: money(invoice.adjustment),
    total: money(invoice.total),
    amountPaid: money(invoice.amountPaid),
    balanceDue: money(invoice.balanceDue),
    customerNotes: invoice.customerNotes,
    terms: invoice.terms,
    lines: invoice.lines.map(toDocumentLineDto),
    customer: toDocumentCustomer(invoice.customer),
    quote: invoice.quote,
    payments: invoice.allocations.map((allocation) => ({
      paymentId: allocation.payment.id,
      number: allocation.payment.number,
      paymentDate: toDateOnly(allocation.payment.paymentDate),
      paymentMode: allocation.payment.paymentMode?.name ?? null,
      amount: money(allocation.amount),
    })),
    sentAt: toIsoOrNull(invoice.sentAt),
    voidedAt: toIsoOrNull(invoice.voidedAt),
    voidReason: invoice.voidReason,
    createdBy: invoice.createdBy,
    createdAt: toIso(invoice.createdAt),
    updatedAt: toIso(invoice.updatedAt),
  };
}

function auditSnapshot(invoice: InvoiceDetail): Record<string, unknown> {
  return {
    customer: invoice.customer.displayName,
    invoiceDate: toDateOnly(invoice.invoiceDate),
    dueDate: toDateOnly(invoice.dueDate),
    paymentTerm: invoice.paymentTerm?.name ?? null,
    orderNumber: invoice.orderNumber,
    subject: invoice.subject,
    lines: invoice.lines.map(
      (line) => `${quantity(line.quantity)} × ${line.name} @ ${money(line.rate)} = ${money(line.amount)}`,
    ),
    shippingCharge: money(invoice.shippingCharge),
    adjustment: money(invoice.adjustment),
    total: money(invoice.total),
    customerNotes: invoice.customerNotes,
    terms: invoice.terms,
  };
}

function totalsData({ totals }: PreparedDocument) {
  return {
    subtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    taxTotal: totals.taxTotal,
    shippingCharge: totals.shippingCharge,
    adjustment: totals.adjustment,
    total: totals.total,
  };
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numberSeries: NumberSeriesService,
    private readonly documentLines: DocumentLinesService,
    private readonly organization: OrganizationService,
    private readonly stock: StockService,
  ) {}

  async list(query: InvoiceListQuery): Promise<Paginated<InvoiceListItemDto>> {
    const today = await this.today();
    const where = this.where(query, today);
    const orderBy = parseSort<Prisma.InvoiceOrderByWithRelationInput>(
      query.sort,
      {
        date: (sort) => ({ invoiceDate: sort }),
        number: (sort) => ({ number: sort }),
        customer: (sort) => ({ customer: { displayName: sort } }),
        dueDate: (sort) => ({ dueDate: sort }),
        total: (sort) => ({ total: sort }),
        balance: (sort) => ({ balanceDue: sort }),
      },
      '-date',
    );

    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: { customer: { select: { id: true, displayName: true } } },
        orderBy: [orderBy, { number: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return paginated(
      rows.map((row) => ({
        id: row.id,
        number: row.number,
        invoiceDate: toDateOnly(row.invoiceDate),
        dueDate: toDateOnly(row.dueDate),
        orderNumber: row.orderNumber,
        status: row.status,
        displayStatus: displayStatus(row, today),
        total: money(row.total),
        balanceDue: money(row.balanceDue),
        customer: row.customer,
      })),
      total,
      query,
    );
  }

  /** Counts for the status tabs, using every filter except the status itself. */
  async statusCounts(query: InvoiceListQuery): Promise<StatusCountsDto> {
    const today = await this.today();
    const where = this.where({ ...query, status: 'all' }, today);
    const entries = await Promise.all(
      INVOICE_DISPLAY_STATUSES.map(
        async (status) =>
          [status, await this.prisma.invoice.count({ where: { AND: [where, statusWhere(status, today)] } })] as const,
      ),
    );
    const counts: StatusCountsDto = Object.fromEntries(entries);
    counts['all'] = entries.reduce((sum, [, count]) => sum + count, 0);
    return counts;
  }

  async get(id: string): Promise<InvoiceDto> {
    return toInvoiceDto(await this.find(id), await this.today());
  }

  create(input: InvoiceOutput): Promise<InvoiceDto> {
    return this.insert(input);
  }

  async update(id: string, input: InvoiceOutput): Promise<InvoiceDto> {
    const before = await this.find(id);
    this.assertAllowed('edit', before);
    if (input.customerId !== before.customerId) {
      if (toDecimal(before.amountPaid).gt(0)) {
        throw fieldError('CUSTOMER_LOCKED', 'customerId', 'The customer cannot be changed after payments have been recorded');
      }
      await this.requireCustomer(input.customerId);
    }
    await this.requirePaymentTerm(input.paymentTermId);

    await this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, id);
      this.assertAllowed('edit', current);

      const prepared = await this.documentLines.prepare(input, tx);
      const paid = toDecimal(current.amountPaid);
      if (toDecimal(prepared.totals.total).lt(paid)) {
        throw fieldError(
          'TOTAL_BELOW_PAID',
          'lines',
          `The total cannot be less than the ${paid.toFixed(2)} already paid on this invoice`,
        );
      }

      const markSent = input.saveAs === 'sent' && current.status === 'draft';
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
      const updated = await tx.invoice.update({
        where: { id },
        data: {
          ...this.headerData(input),
          ...totalsData(prepared),
          balanceDue: toDecimal(prepared.totals.total).minus(paid).toFixed(2),
          ...(markSent ? { status: 'sent' as const, sentAt: new Date() } : {}),
          lines: { create: prepared.lines },
        },
        include: INVOICE_INCLUDE,
      });
      if (updated.status === 'sent') await this.syncStock(tx, updated, prepared.lines);

      const changes = diffRecords(auditSnapshot(before), auditSnapshot(updated)) ?? {};
      if (markSent) changes['status'] = { from: 'draft', to: 'sent' };
      if (Object.keys(changes).length > 0) {
        await this.audit.record(
          {
            action: 'updated',
            entityType: 'invoice',
            entityId: id,
            summary: `Invoice ${updated.number} updated${markSent ? ' and marked as sent' : ''}`,
            changes,
          },
          tx,
        );
      }
    });
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const invoice = await this.find(id);
    this.assertAllowed('delete', invoice);

    await this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, id);
      this.assertAllowed('delete', current);
      await this.syncStock(tx, current, []);
      await tx.invoice.delete({ where: { id } });

      await this.audit.record(
        {
          action: 'deleted',
          entityType: 'invoice',
          entityId: id,
          summary: `Invoice ${invoice.number} for ${invoice.customer.displayName} deleted`,
        },
        tx,
      );
      // A deleted draft frees its quote to be converted again.
      if (invoice.quote) {
        await tx.quote.update({ where: { id: invoice.quote.id }, data: { status: 'accepted' } });
        await this.audit.record(
          {
            action: 'status_changed',
            entityType: 'quote',
            entityId: invoice.quote.id,
            summary: `Quote ${invoice.quote.number} returned to accepted after invoice ${invoice.number} was deleted`,
            changes: { status: { from: 'invoiced', to: 'accepted' } },
          },
          tx,
        );
      }
    });
  }

  async markSent(id: string): Promise<InvoiceDto> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, id);
      this.assertAllowed('markSent', current);
      const updated = await tx.invoice.update({
        where: { id },
        data: { status: 'sent', sentAt: new Date() },
        include: { lines: true },
      });
      await this.syncStock(tx, updated, updated.lines);
      await this.audit.record(
        {
          action: 'status_changed',
          entityType: 'invoice',
          entityId: id,
          summary: `Invoice ${updated.number} marked as sent`,
          changes: { status: { from: 'draft', to: 'sent' } },
        },
        tx,
      );
    });
    return this.get(id);
  }

  async void(id: string, reason: string | null): Promise<InvoiceDto> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, id);
      this.assertAllowed('void', current);
      await tx.invoice.update({
        where: { id },
        // Nothing is owed on a void invoice; its total stays on record.
        data: { status: 'void', voidedAt: new Date(), voidReason: reason, balanceDue: 0 },
      });
      // Goods on a void invoice never left, so its stock movements go too.
      await this.syncStock(tx, current, []);
      await this.audit.record(
        {
          action: 'status_changed',
          entityType: 'invoice',
          entityId: id,
          summary: `Invoice ${current.number} voided${reason ? `: ${reason}` : ''}`,
          changes: { status: { from: 'sent', to: 'void' } },
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** Copies an invoice into a new draft dated today, keeping the same payment period. */
  async clone(id: string): Promise<InvoiceDto> {
    const source = await this.find(id);
    const today = await this.today();
    const termDays = Math.max(0, daysBetween(toDateOnly(source.invoiceDate), toDateOnly(source.dueDate)));

    return this.insert(
      {
        customerId: source.customerId,
        invoiceDate: today,
        dueDate: addDays(today, termDays),
        paymentTermId: source.paymentTermId,
        orderNumber: source.orderNumber,
        subject: source.subject,
        customerNotes: source.customerNotes,
        terms: source.terms,
        shippingCharge: money(source.shippingCharge),
        adjustment: money(source.adjustment),
        saveAs: 'draft',
        lines: storedLinesToInput(source.lines),
      },
      { origin: `cloned from ${source.number}` },
    );
  }

  /** Creates a draft invoice from an accepted quote and marks the quote as invoiced. */
  async convertQuote(quoteId: string): Promise<InvoiceDto> {
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      include: { lines: { orderBy: { position: 'asc' } }, customer: { select: { paymentTermId: true } } },
    });
    if (!quote) throw notFound('Quote');
    if (!canPerformQuoteAction('convert', quote.status)) {
      throw conflict('INVALID_QUOTE_STATUS', 'Only accepted quotes can be converted to an invoice');
    }

    const term =
      (quote.customer.paymentTermId
        ? await this.prisma.paymentTerm.findUnique({ where: { id: quote.customer.paymentTermId } })
        : null) ?? (await this.prisma.paymentTerm.findFirst({ where: { isDefault: true, isActive: true } }));
    const today = await this.today();

    return this.insert(
      {
        customerId: quote.customerId,
        invoiceDate: today,
        dueDate: addDays(today, term?.days ?? 0),
        paymentTermId: term?.id ?? null,
        orderNumber: quote.referenceNumber,
        subject: quote.subject,
        customerNotes: quote.customerNotes,
        terms: quote.terms,
        shippingCharge: money(quote.shippingCharge),
        adjustment: money(quote.adjustment),
        saveAs: 'draft',
        lines: storedLinesToInput(quote.lines),
      },
      { quote: { id: quote.id, number: quote.number } },
    );
  }

  async history(id: string): Promise<AuditLogDto[]> {
    await this.find(id);
    return this.audit.history('invoice', id);
  }

  /** Locks an invoice for payment work and returns what payment rules need to check. */
  async lockForPayment(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.invoice.findUnique({
      where: { id },
      select: { id: true, number: true, customerId: true, status: true, total: true, balanceDue: true },
    });
  }

  /**
   * Recomputes the amount paid and balance of each invoice from what has been applied to it
   * (PLAN.md §4.4). Called inside the transaction that changed the payments. A draft invoice
   * that receives money is marked as sent, which also takes its stock.
   */
  async refreshBalances(tx: Tx, invoiceIds: string[]): Promise<void> {
    for (const id of [...new Set(invoiceIds)].sort()) {
      await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${id}::uuid FOR UPDATE`;
      const invoice = await tx.invoice.findUnique({ where: { id }, include: { lines: true } });
      if (!invoice) continue;

      const { _sum } = await tx.paymentAllocation.aggregate({ where: { invoiceId: id }, _sum: { amount: true } });
      const paid = toDecimal(_sum.amount);
      const total = toDecimal(invoice.total);
      if (paid.gt(total)) {
        throw conflict('OVERPAID', `Payments applied to invoice ${invoice.number} would exceed its total`);
      }

      const becomesSent = invoice.status === 'draft' && paid.gt(0);
      await tx.invoice.update({
        where: { id },
        data: {
          amountPaid: paid.toFixed(2),
          balanceDue: total.minus(paid).toFixed(2),
          ...(becomesSent ? { status: 'sent' as const, sentAt: new Date() } : {}),
        },
      });
      if (becomesSent) {
        await this.syncStock(tx, invoice, invoice.lines);
        await this.audit.record(
          {
            action: 'status_changed',
            entityType: 'invoice',
            entityId: id,
            summary: `Invoice ${invoice.number} marked as sent when a payment was recorded`,
            changes: { status: { from: 'draft', to: 'sent' } },
          },
          tx,
        );
      }
    }
  }

  private async insert(
    input: InvoiceOutput,
    options: { origin?: string; quote?: { id: string; number: string } } = {},
  ): Promise<InvoiceDto> {
    const customer = await this.requireCustomer(input.customerId);
    await this.requirePaymentTerm(input.paymentTermId);
    const markSent = input.saveAs === 'sent';

    const id = await this.prisma.$transaction(async (tx) => {
      if (options.quote) {
        const { count } = await tx.quote.updateMany({
          where: { id: options.quote.id, status: 'accepted' },
          data: { status: 'invoiced' },
        });
        if (count === 0) {
          throw conflict('QUOTE_CHANGED', 'This quote is no longer accepted. Refresh and try again.');
        }
      }

      const prepared = await this.documentLines.prepare(input, tx);
      const number = await this.numberSeries.next(tx, 'invoice', (candidate) => this.numberTaken(tx, candidate));
      const invoice = await tx.invoice.create({
        data: {
          number,
          ...this.headerData(input),
          ...totalsData(prepared),
          amountPaid: '0',
          balanceDue: prepared.totals.total,
          status: markSent ? 'sent' : 'draft',
          sentAt: markSent ? new Date() : null,
          quoteId: options.quote?.id ?? null,
          createdById: getRequestContext()?.userId ?? null,
          lines: { create: prepared.lines },
        },
      });
      if (markSent) await this.syncStock(tx, invoice, prepared.lines);

      const details = [
        options.quote ? `from quote ${options.quote.number}` : null,
        options.origin,
        markSent ? 'marked as sent' : null,
      ]
        .filter(Boolean)
        .join(', ');
      await this.audit.record(
        {
          action: 'created',
          entityType: 'invoice',
          entityId: invoice.id,
          summary: `Invoice ${number} for ${customer.displayName} created${details ? ` (${details})` : ''}`,
        },
        tx,
      );
      if (options.quote) {
        await this.audit.record(
          {
            action: 'status_changed',
            entityType: 'quote',
            entityId: options.quote.id,
            summary: `Quote ${options.quote.number} converted to invoice ${number}`,
            changes: { status: { from: 'accepted', to: 'invoiced' } },
          },
          tx,
        );
      }
      return invoice.id;
    });
    return this.get(id);
  }

  private syncStock(
    tx: Tx,
    invoice: { id: string; number: string; invoiceDate: Date },
    lines: { itemId: string | null; quantity: NumericInput }[],
  ): Promise<void> {
    return this.stock.syncDocumentMovements(
      tx,
      { type: 'invoice', id: invoice.id, date: invoice.invoiceDate, direction: -1, reason: `Invoice ${invoice.number}` },
      lines,
    );
  }

  /** Locks the invoice row for the rest of the transaction and returns its current state. */
  private async lock(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${id}::uuid FOR UPDATE`;
    const invoice = await tx.invoice.findUnique({
      where: { id },
      select: { id: true, number: true, status: true, amountPaid: true, balanceDue: true, invoiceDate: true },
    });
    if (!invoice) throw notFound('Invoice');
    return invoice;
  }

  private assertAllowed(action: InvoiceAction, invoice: StatusFacts): void {
    if (canPerformInvoiceAction(action, invoice)) return;
    const hasPayments = toDecimal(invoice.amountPaid).gt(0);
    const reasons: Record<InvoiceAction, string> = {
      edit: 'A void invoice cannot be edited',
      delete:
        invoice.status === 'draft' && hasPayments
          ? 'Remove the payments on this invoice before deleting it'
          : 'Only draft invoices can be deleted. Void the invoice instead.',
      markSent: 'Only draft invoices can be marked as sent',
      void:
        invoice.status === 'void'
          ? 'This invoice is already void'
          : invoice.status === 'draft'
            ? 'Draft invoices are deleted rather than voided'
            : 'Remove the payments and credits applied to this invoice before voiding it',
      recordPayment: 'This invoice has nothing left to pay',
    };
    throw conflict('INVALID_INVOICE_STATUS', reasons[action]);
  }

  private headerData(input: InvoiceOutput) {
    return {
      customerId: input.customerId,
      invoiceDate: fromDateOnly(input.invoiceDate),
      dueDate: fromDateOnly(input.dueDate),
      paymentTermId: input.paymentTermId,
      orderNumber: input.orderNumber,
      subject: input.subject,
      customerNotes: input.customerNotes,
      terms: input.terms,
    };
  }

  private where(query: InvoiceListQuery, today: string): Prisma.InvoiceWhereInput {
    const and: Prisma.InvoiceWhereInput[] = [];
    if (query.customerId) and.push({ customerId: query.customerId });
    if (query.dateFrom) and.push({ invoiceDate: { gte: fromDateOnly(query.dateFrom) } });
    if (query.dateTo) and.push({ invoiceDate: { lte: fromDateOnly(query.dateTo) } });
    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' as const };
      and.push({
        OR: [
          { number: contains },
          { orderNumber: contains },
          { subject: contains },
          { customer: { displayName: contains } },
        ],
      });
    }
    if (query.status !== 'all') and.push(statusWhere(query.status, today));
    return { AND: and };
  }

  private async requireCustomer(id: string) {
    const customer = await this.prisma.contact.findFirst({
      where: { id, type: 'customer', isActive: true },
      select: { id: true, displayName: true },
    });
    if (!customer) throw fieldError('CUSTOMER_NOT_AVAILABLE', 'customerId', 'Select an active customer');
    return customer;
  }

  private async requirePaymentTerm(id: string | null): Promise<void> {
    if (id && !(await this.prisma.paymentTerm.findUnique({ where: { id }, select: { id: true } }))) {
      throw fieldError('PAYMENT_TERM_NOT_FOUND', 'paymentTermId', 'Select a valid payment term');
    }
  }

  private async numberTaken(tx: Tx, number: string): Promise<boolean> {
    return (await tx.invoice.findUnique({ where: { number }, select: { id: true } })) !== null;
  }

  private async find(id: string): Promise<InvoiceDetail> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });
    if (!invoice) throw notFound('Invoice');
    return invoice;
  }

  private async today(): Promise<string> {
    return todayInTimeZone(await this.organization.timezone());
  }
}
