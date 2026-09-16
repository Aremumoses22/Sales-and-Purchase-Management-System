import { Injectable } from '@nestjs/common';
import {
  canPerformCreditNoteAction,
  CREDIT_NOTE_DISPLAY_STATUSES,
  getCreditNoteDisplayStatus,
  getInvoiceDisplayStatus,
  todayInTimeZone,
  toDecimal,
  type ApplyCreditNoteOutput,
  type AuditLogDto,
  type CreditNoteAction,
  type CreditNoteDisplayStatus,
  type CreditNoteDto,
  type CreditNoteListItemDto,
  type CreditNoteListQuery,
  type CreditNoteOutput,
  type CreditNoteStatusFacts,
  type Decimal,
  type NumericInput,
  type OpenInvoiceDto,
  type Paginated,
  type PaymentRefundOutput,
  type StatusCountsDto,
} from '@spms/shared';
import { AuditService } from '../../audit/audit.service.js';
import { diffRecords } from '../../audit/diff.js';
import { conflict, fieldError, notFound } from '../../common/app-exception.js';
import { pageArgs, paginated, parseSort } from '../../common/pagination.js';
import { getRequestContext } from '../../common/request-context.js';
import { fromDateOnly, money, quantity, toDateOnly, toIso, toIsoOrNull } from '../../common/serialize.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../prisma/prisma.service.js';
import {
  DocumentLinesService,
  taxBreakdownFromLines,
  toDocumentCustomer,
  toDocumentLineDto,
  type PreparedDocument,
} from '../documents/document-lines.service.js';
import { InvoicesService } from '../invoices/invoices.service.js';
import { StockService } from '../items/stock.service.js';
import { NumberSeriesService } from '../settings/number-series.service.js';
import { OrganizationService } from '../settings/organization.service.js';

const CREDIT_NOTE_INCLUDE = {
  lines: { orderBy: { position: 'asc' } },
  customer: { include: { addresses: true } },
  invoice: { select: { id: true, number: true } },
  applications: {
    include: { invoice: { select: { id: true, number: true, invoiceDate: true, total: true, balanceDue: true } } },
    orderBy: { createdAt: 'asc' },
  },
  refunds: { include: { paymentMode: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.CreditNoteInclude;

type CreditNoteDetail = Prisma.CreditNoteGetPayload<{ include: typeof CREDIT_NOTE_INCLUDE }>;

/** Filter matching exactly the credit notes shown with a given display status. */
function statusWhere(status: CreditNoteDisplayStatus): Prisma.CreditNoteWhereInput {
  switch (status) {
    case 'draft':
      return { status: 'draft' };
    case 'void':
      return { status: 'void' };
    case 'open':
      return { status: 'open', balance: { gt: 0 } };
    case 'closed':
      return { status: 'open', balance: { lte: 0 } };
  }
}

function toCreditNoteDto(creditNote: CreditNoteDetail): CreditNoteDto {
  return {
    id: creditNote.id,
    number: creditNote.number,
    creditNoteDate: toDateOnly(creditNote.creditNoteDate),
    referenceNumber: creditNote.referenceNumber,
    status: creditNote.status,
    displayStatus: getCreditNoteDisplayStatus(creditNote),
    reason: creditNote.reason,
    returnToStock: creditNote.returnToStock,
    subtotal: money(creditNote.subtotal),
    discountTotal: money(creditNote.discountTotal),
    taxTotal: money(creditNote.taxTotal),
    taxBreakdown: taxBreakdownFromLines(creditNote.lines),
    shippingCharge: money(creditNote.shippingCharge),
    adjustment: money(creditNote.adjustment),
    total: money(creditNote.total),
    amountApplied: money(creditNote.amountApplied),
    amountRefunded: money(creditNote.amountRefunded),
    balance: money(creditNote.balance),
    customerNotes: creditNote.customerNotes,
    terms: creditNote.terms,
    lines: creditNote.lines.map(toDocumentLineDto),
    customer: toDocumentCustomer(creditNote.customer),
    invoice: creditNote.invoice,
    applications: creditNote.applications.map((application) => ({
      id: application.id,
      amount: money(application.amount),
      appliedDate: toDateOnly(application.appliedDate),
      invoice: {
        id: application.invoice.id,
        number: application.invoice.number,
        invoiceDate: toDateOnly(application.invoice.invoiceDate),
        total: money(application.invoice.total),
        balanceDue: money(application.invoice.balanceDue),
      },
    })),
    refunds: creditNote.refunds.map((refund) => ({
      id: refund.id,
      refundDate: toDateOnly(refund.refundDate),
      amount: money(refund.amount),
      paymentMode: refund.paymentMode,
      referenceNumber: refund.referenceNumber,
      notes: refund.notes,
      createdAt: toIso(refund.createdAt),
    })),
    openedAt: toIsoOrNull(creditNote.openedAt),
    voidedAt: toIsoOrNull(creditNote.voidedAt),
    voidReason: creditNote.voidReason,
    createdBy: creditNote.createdBy,
    createdAt: toIso(creditNote.createdAt),
    updatedAt: toIso(creditNote.updatedAt),
  };
}

function auditSnapshot(creditNote: CreditNoteDetail): Record<string, unknown> {
  return {
    customer: creditNote.customer.displayName,
    creditNoteDate: toDateOnly(creditNote.creditNoteDate),
    invoice: creditNote.invoice?.number ?? null,
    referenceNumber: creditNote.referenceNumber,
    reason: creditNote.reason,
    returnToStock: creditNote.returnToStock,
    lines: creditNote.lines.map(
      (line) => `${quantity(line.quantity)} × ${line.name} @ ${money(line.rate)} = ${money(line.amount)}`,
    ),
    shippingCharge: money(creditNote.shippingCharge),
    adjustment: money(creditNote.adjustment),
    total: money(creditNote.total),
    customerNotes: creditNote.customerNotes,
    terms: creditNote.terms,
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

function usedOf(creditNote: { amountApplied: NumericInput; amountRefunded: NumericInput }): Decimal {
  return toDecimal(creditNote.amountApplied).plus(toDecimal(creditNote.amountRefunded));
}

@Injectable()
export class CreditNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numberSeries: NumberSeriesService,
    private readonly documentLines: DocumentLinesService,
    private readonly organization: OrganizationService,
    private readonly stock: StockService,
    private readonly invoices: InvoicesService,
  ) {}

  async list(query: CreditNoteListQuery): Promise<Paginated<CreditNoteListItemDto>> {
    const where = this.where(query);
    const orderBy = parseSort<Prisma.CreditNoteOrderByWithRelationInput>(
      query.sort,
      {
        date: (sort) => ({ creditNoteDate: sort }),
        number: (sort) => ({ number: sort }),
        customer: (sort) => ({ customer: { displayName: sort } }),
        total: (sort) => ({ total: sort }),
        balance: (sort) => ({ balance: sort }),
      },
      '-date',
    );

    const [rows, total] = await Promise.all([
      this.prisma.creditNote.findMany({
        where,
        include: {
          customer: { select: { id: true, displayName: true } },
          invoice: { select: { id: true, number: true } },
        },
        orderBy: [orderBy, { number: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.creditNote.count({ where }),
    ]);

    return paginated(
      rows.map((row) => ({
        id: row.id,
        number: row.number,
        creditNoteDate: toDateOnly(row.creditNoteDate),
        referenceNumber: row.referenceNumber,
        status: row.status,
        displayStatus: getCreditNoteDisplayStatus(row),
        total: money(row.total),
        balance: money(row.balance),
        customer: row.customer,
        invoice: row.invoice,
      })),
      total,
      query,
    );
  }

  /** Counts for the status tabs, using every filter except the status itself. */
  async statusCounts(query: CreditNoteListQuery): Promise<StatusCountsDto> {
    const where = this.where({ ...query, status: 'all' });
    const entries = await Promise.all(
      CREDIT_NOTE_DISPLAY_STATUSES.map(
        async (status) =>
          [status, await this.prisma.creditNote.count({ where: { AND: [where, statusWhere(status)] } })] as const,
      ),
    );
    const counts: StatusCountsDto = Object.fromEntries(entries);
    counts['all'] = entries.reduce((sum, [, count]) => sum + count, 0);
    return counts;
  }

  async get(id: string): Promise<CreditNoteDto> {
    return toCreditNoteDto(await this.find(id));
  }

  async create(input: CreditNoteOutput): Promise<CreditNoteDto> {
    const customer = await this.requireCustomer(input.customerId);
    await this.requireInvoice(input.invoiceId, input.customerId);
    const open = input.saveAs === 'open';

    const id = await this.prisma.$transaction(async (tx) => {
      const prepared = await this.documentLines.prepare(input, tx);
      const number = await this.numberSeries.next(tx, 'credit_note', async (candidate) =>
        (await tx.creditNote.findUnique({ where: { number: candidate }, select: { id: true } })) !== null,
      );
      const creditNote = await tx.creditNote.create({
        data: {
          number,
          ...this.headerData(input),
          ...totalsData(prepared),
          balance: prepared.totals.total,
          status: open ? 'open' : 'draft',
          openedAt: open ? new Date() : null,
          createdById: getRequestContext()?.userId ?? null,
          lines: { create: prepared.lines },
        },
      });
      await this.syncStock(tx, creditNote, prepared.lines);
      await this.audit.record(
        {
          action: 'created',
          entityType: 'credit_note',
          entityId: creditNote.id,
          summary: `Credit note ${number} for ${customer.displayName} created${open ? ' (opened)' : ''}`,
        },
        tx,
      );
      return creditNote.id;
    });
    return this.get(id);
  }

  async update(id: string, input: CreditNoteOutput): Promise<CreditNoteDto> {
    const before = await this.find(id);
    this.assertAllowed('edit', before);
    const used = usedOf(before);
    if (input.customerId !== before.customerId) {
      if (used.gt(0)) {
        throw fieldError('CUSTOMER_LOCKED', 'customerId', 'The customer cannot be changed after the credit has been used');
      }
      await this.requireCustomer(input.customerId);
    }
    await this.requireInvoice(input.invoiceId, input.customerId);

    await this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, id);
      this.assertAllowed('edit', current);

      const prepared = await this.documentLines.prepare(input, tx);
      const currentUsed = usedOf(current);
      if (toDecimal(prepared.totals.total).lt(currentUsed)) {
        throw fieldError(
          'TOTAL_BELOW_USED',
          'lines',
          `The total cannot be less than the ${currentUsed.toFixed(2)} already applied or refunded from this credit note`,
        );
      }

      const markOpen = input.saveAs === 'open' && current.status === 'draft';
      await tx.creditNoteLine.deleteMany({ where: { creditNoteId: id } });
      const updated = await tx.creditNote.update({
        where: { id },
        data: {
          ...this.headerData(input),
          ...totalsData(prepared),
          balance: toDecimal(prepared.totals.total).minus(currentUsed).toFixed(2),
          ...(markOpen ? { status: 'open' as const, openedAt: new Date() } : {}),
          lines: { create: prepared.lines },
        },
        include: CREDIT_NOTE_INCLUDE,
      });
      await this.syncStock(tx, updated, prepared.lines);

      const changes = diffRecords(auditSnapshot(before), auditSnapshot(updated)) ?? {};
      if (markOpen) changes['status'] = { from: 'draft', to: 'open' };
      if (Object.keys(changes).length > 0) {
        await this.audit.record(
          {
            action: 'updated',
            entityType: 'credit_note',
            entityId: id,
            summary: `Credit note ${updated.number} updated${markOpen ? ' and opened' : ''}`,
            changes,
          },
          tx,
        );
      }
    });
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const creditNote = await this.find(id);
    this.assertAllowed('delete', creditNote);

    await this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, id);
      this.assertAllowed('delete', current);
      await this.stock.syncDocumentMovements(tx, this.stockSource(current), []);
      await tx.creditNote.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'deleted',
          entityType: 'credit_note',
          entityId: id,
          summary: `Credit note ${creditNote.number} for ${creditNote.customer.displayName} deleted`,
        },
        tx,
      );
    });
  }

  async markOpen(id: string): Promise<CreditNoteDto> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, id);
      this.assertAllowed('markOpen', current);
      const updated = await tx.creditNote.update({
        where: { id },
        data: { status: 'open', openedAt: new Date() },
        include: { lines: true },
      });
      await this.syncStock(tx, updated, updated.lines);
      await this.audit.record(
        {
          action: 'status_changed',
          entityType: 'credit_note',
          entityId: id,
          summary: `Credit note ${updated.number} opened`,
          changes: { status: { from: 'draft', to: 'open' } },
        },
        tx,
      );
    });
    return this.get(id);
  }

  async void(id: string, reason: string | null): Promise<CreditNoteDto> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, id);
      this.assertAllowed('void', current);
      await tx.creditNote.update({
        where: { id },
        data: { status: 'void', voidedAt: new Date(), voidReason: reason, balance: 0 },
      });
      // Returned goods on a void credit note never came back.
      await this.stock.syncDocumentMovements(tx, this.stockSource(current), []);
      await this.audit.record(
        {
          action: 'status_changed',
          entityType: 'credit_note',
          entityId: id,
          summary: `Credit note ${current.number} voided${reason ? `: ${reason}` : ''}`,
          changes: { status: { from: 'open', to: 'void' } },
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** The customer's invoices this credit note can be applied to, oldest first. */
  async openInvoices(id: string): Promise<OpenInvoiceDto[]> {
    const creditNote = await this.prisma.creditNote.findUnique({ where: { id }, select: { customerId: true } });
    if (!creditNote) throw notFound('Credit note');
    const today = await this.today();
    const rows = await this.prisma.invoice.findMany({
      where: { customerId: creditNote.customerId, status: { in: ['draft', 'sent'] }, balanceDue: { gt: 0 } },
      orderBy: [{ invoiceDate: 'asc' }, { number: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      invoiceDate: toDateOnly(row.invoiceDate),
      dueDate: toDateOnly(row.dueDate),
      status: row.status,
      displayStatus: getInvoiceDisplayStatus(
        { status: row.status, amountPaid: row.amountPaid, balanceDue: row.balanceDue, dueDate: toDateOnly(row.dueDate) },
        today,
      ),
      total: money(row.total),
      balanceDue: money(row.balanceDue),
      allocated: '0.00',
    }));
  }

  /** Applies the credit note to one or more of the customer's invoices. */
  async apply(id: string, input: ApplyCreditNoteOutput): Promise<CreditNoteDto> {
    const appliedDate = fromDateOnly(await this.today());
    await this.prisma.$transaction(async (tx) => {
      // Lock the credit note before any invoice, the same order payments use.
      const creditNote = await this.lockForApplication(tx, id);
      const requested = input.applications.reduce<Decimal>((sum, entry) => sum.plus(toDecimal(entry.amount)), toDecimal(0));
      if (requested.gt(toDecimal(creditNote.balance))) {
        throw fieldError('EXCEEDS_BALANCE', 'applications', `Only ${money(creditNote.balance)} is left on this credit note`);
      }

      const ordered = input.applications
        .map((entry, index) => ({ ...entry, index }))
        .sort((a, b) => a.invoiceId.localeCompare(b.invoiceId));
      for (const entry of ordered) {
        const invoice = await this.invoices.lockForPayment(tx, entry.invoiceId);
        await this.addApplication(tx, creditNote, invoice, entry.amount, `applications.${entry.index}`, appliedDate);
      }
      await this.invoices.refreshBalances(tx, ordered.map((entry) => entry.invoiceId));
      await this.refresh(tx, id);
    });
    return this.get(id);
  }

  async removeApplication(id: string, applicationId: string): Promise<CreditNoteDto> {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const application = await tx.creditApplication.findFirst({
        where: { id: applicationId, creditNoteId: id },
        include: { creditNote: { select: { number: true } }, invoice: { select: { number: true } } },
      });
      if (!application) throw notFound('Credit application');
      await tx.creditApplication.delete({ where: { id: applicationId } });
      await this.invoices.refreshBalances(tx, [application.invoiceId]);
      await this.refresh(tx, id);
      const summary = `${money(application.amount)} of credit note ${application.creditNote.number} removed from invoice ${application.invoice.number}`;
      await this.audit.record({ action: 'unapplied', entityType: 'credit_note', entityId: id, summary }, tx);
      await this.audit.record({ action: 'credits_removed', entityType: 'invoice', entityId: application.invoiceId, summary }, tx);
    });
    return this.get(id);
  }

  async addRefund(id: string, input: PaymentRefundOutput): Promise<CreditNoteDto> {
    await this.requirePaymentMode(input.paymentModeId);
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, id);
      this.assertAllowed('refund', current);
      if (toDecimal(input.amount).gt(toDecimal(current.balance))) {
        throw fieldError('EXCEEDS_BALANCE', 'amount', `Only ${money(current.balance)} is left on this credit note`);
      }
      await tx.creditNoteRefund.create({
        data: {
          creditNoteId: id,
          refundDate: fromDateOnly(input.refundDate),
          amount: input.amount,
          paymentModeId: input.paymentModeId,
          referenceNumber: input.referenceNumber,
          notes: input.notes,
          createdById: getRequestContext()?.userId ?? null,
        },
      });
      await this.refresh(tx, id);
      await this.audit.record(
        {
          action: 'refunded',
          entityType: 'credit_note',
          entityId: id,
          summary: `${money(input.amount)} of credit note ${current.number} refunded`,
        },
        tx,
      );
    });
    return this.get(id);
  }

  async removeRefund(id: string, refundId: string): Promise<CreditNoteDto> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, id);
      const refund = await tx.creditNoteRefund.findFirst({ where: { id: refundId, creditNoteId: id } });
      if (!refund) throw notFound('Refund');
      await tx.creditNoteRefund.delete({ where: { id: refundId } });
      await this.refresh(tx, id);
      await this.audit.record(
        {
          action: 'updated',
          entityType: 'credit_note',
          entityId: id,
          summary: `Refund of ${money(refund.amount)} on credit note ${current.number} deleted`,
        },
        tx,
      );
    });
    return this.get(id);
  }

  async history(id: string): Promise<AuditLogDto[]> {
    await this.find(id);
    return this.audit.history('credit_note', id);
  }

  /** Open credit notes with something left, for the invoice's "Apply credits" dialog. */
  async availableFor(customerId: string) {
    return this.prisma.creditNote.findMany({
      where: { customerId, status: 'open', balance: { gt: 0 } },
      select: { id: true, number: true, creditNoteDate: true, balance: true },
      orderBy: [{ creditNoteDate: 'asc' }, { number: 'asc' }],
    });
  }

  /**
   * Locks a credit note that is about to be applied and checks it can be. Callers lock credit
   * notes before invoices so concurrent work always takes locks in the same order.
   */
  async lockForApplication(tx: Tx, id: string, path?: string) {
    const creditNote = await this.lock(tx, id).catch((error: unknown) => {
      if (path) throw fieldError('CREDIT_NOTE_NOT_AVAILABLE', path, 'This credit note could not be found');
      throw error;
    });
    if (!canPerformCreditNoteAction('apply', creditNote)) {
      const message =
        creditNote.status === 'open' ? `Nothing is left on credit note ${creditNote.number}` : `Credit note ${creditNote.number} is not open`;
      if (path) throw fieldError('CREDIT_NOTE_NOT_AVAILABLE', path, message);
      throw conflict('INVALID_CREDIT_NOTE_STATUS', message);
    }
    return creditNote;
  }

  /**
   * Records part of a locked credit note against a locked invoice. The caller then refreshes the
   * invoice balances and calls {@link refresh} for the credit note.
   */
  async addApplication(
    tx: Tx,
    creditNote: { id: string; number: string; customerId: string },
    invoice: Awaited<ReturnType<InvoicesService['lockForPayment']>>,
    amount: string,
    path: string,
    appliedDate: Date,
  ): Promise<void> {
    if (!invoice || invoice.customerId !== creditNote.customerId) {
      throw fieldError('INVOICE_NOT_AVAILABLE', `${path}.invoiceId`, "This invoice is not one of the customer's invoices");
    }
    if (invoice.status === 'void') {
      throw fieldError('INVOICE_VOID', `${path}.invoiceId`, `Invoice ${invoice.number} is void`);
    }

    const existing = await tx.creditApplication.findUnique({
      where: { creditNoteId_invoiceId: { creditNoteId: creditNote.id, invoiceId: invoice.id } },
    });
    // Earlier applications in this transaction may already have reduced the balance.
    const { balanceDue } = await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id }, select: { balanceDue: true } });
    if (toDecimal(amount).gt(toDecimal(balanceDue))) {
      throw fieldError('EXCEEDS_BALANCE', `${path}.amount`, `Only ${money(balanceDue)} is due on invoice ${invoice.number}`);
    }

    if (existing) {
      await tx.creditApplication.update({
        where: { id: existing.id },
        data: { amount: toDecimal(existing.amount).plus(toDecimal(amount)).toFixed(2), appliedDate },
      });
    } else {
      await tx.creditApplication.create({
        data: {
          creditNoteId: creditNote.id,
          invoiceId: invoice.id,
          amount,
          appliedDate,
          createdById: getRequestContext()?.userId ?? null,
        },
      });
    }
    // Keep the invoice balance current so a second application in the same request is checked correctly.
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { balanceDue: toDecimal(balanceDue).minus(toDecimal(amount)).toFixed(2) },
    });

    const summary = `${money(amount)} of credit note ${creditNote.number} applied to invoice ${invoice.number}`;
    await this.audit.record({ action: 'applied', entityType: 'credit_note', entityId: creditNote.id, summary }, tx);
    await this.audit.record({ action: 'credits_applied', entityType: 'invoice', entityId: invoice.id, summary }, tx);
  }

  /** Keeps a credit note's applied, refunded and balance figures in step with its applications and refunds. */
  async refresh(tx: Tx, id: string): Promise<void> {
    const [applied, refunded, creditNote] = await Promise.all([
      tx.creditApplication.aggregate({ where: { creditNoteId: id }, _sum: { amount: true } }),
      tx.creditNoteRefund.aggregate({ where: { creditNoteId: id }, _sum: { amount: true } }),
      tx.creditNote.findUniqueOrThrow({ where: { id }, select: { total: true, number: true, status: true } }),
    ]);
    const appliedTotal = toDecimal(applied._sum.amount);
    const refundedTotal = toDecimal(refunded._sum.amount);
    const balance = toDecimal(creditNote.total).minus(appliedTotal).minus(refundedTotal);
    if (balance.lt(0)) {
      throw conflict('CREDIT_EXCEEDED', `More than the total of credit note ${creditNote.number} would be used`);
    }
    await tx.creditNote.update({
      where: { id },
      data: {
        amountApplied: appliedTotal.toFixed(2),
        amountRefunded: refundedTotal.toFixed(2),
        balance: creditNote.status === 'void' ? '0' : balance.toFixed(2),
      },
    });
  }

  private syncStock(
    tx: Tx,
    creditNote: { id: string; number: string; creditNoteDate: Date; status: string; returnToStock: boolean },
    lines: { itemId: string | null; quantity: NumericInput }[],
  ): Promise<void> {
    // Only an open credit note marked as a return puts goods back on the shelf.
    const returning = creditNote.status === 'open' && creditNote.returnToStock;
    return this.stock.syncDocumentMovements(tx, this.stockSource(creditNote), returning ? lines : []);
  }

  private stockSource(creditNote: { id: string; number: string; creditNoteDate: Date }) {
    return {
      type: 'credit_note' as const,
      id: creditNote.id,
      date: creditNote.creditNoteDate,
      direction: 1 as const,
      reason: `Credit note ${creditNote.number}`,
    };
  }

  /** Locks the credit note row for the rest of the transaction and returns its current state. */
  private async lock(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM credit_notes WHERE id = ${id}::uuid FOR UPDATE`;
    const creditNote = await tx.creditNote.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        customerId: true,
        status: true,
        total: true,
        amountApplied: true,
        amountRefunded: true,
        balance: true,
        creditNoteDate: true,
        returnToStock: true,
      },
    });
    if (!creditNote) throw notFound('Credit note');
    return creditNote;
  }

  private assertAllowed(action: CreditNoteAction, creditNote: CreditNoteStatusFacts): void {
    if (canPerformCreditNoteAction(action, creditNote)) return;
    const reasons: Record<CreditNoteAction, string> = {
      edit: 'A void credit note cannot be edited',
      delete: 'Only draft credit notes can be deleted. Void the credit note instead.',
      markOpen: 'Only draft credit notes can be opened',
      void:
        creditNote.status === 'void'
          ? 'This credit note is already void'
          : creditNote.status === 'draft'
            ? 'Draft credit notes are deleted rather than voided'
            : 'Remove the applications and refunds on this credit note before voiding it',
      apply: creditNote.status === 'open' ? 'Nothing is left on this credit note' : 'Only open credit notes can be applied',
      refund: creditNote.status === 'open' ? 'Nothing is left on this credit note' : 'Only open credit notes can be refunded',
    };
    throw conflict('INVALID_CREDIT_NOTE_STATUS', reasons[action]);
  }

  private headerData(input: CreditNoteOutput) {
    return {
      customerId: input.customerId,
      invoiceId: input.invoiceId,
      creditNoteDate: fromDateOnly(input.creditNoteDate),
      referenceNumber: input.referenceNumber,
      reason: input.reason,
      returnToStock: input.returnToStock,
      customerNotes: input.customerNotes,
      terms: input.terms,
    };
  }

  private where(query: CreditNoteListQuery): Prisma.CreditNoteWhereInput {
    const and: Prisma.CreditNoteWhereInput[] = [];
    if (query.customerId) and.push({ customerId: query.customerId });
    if (query.invoiceId) and.push({ invoiceId: query.invoiceId });
    if (query.dateFrom) and.push({ creditNoteDate: { gte: fromDateOnly(query.dateFrom) } });
    if (query.dateTo) and.push({ creditNoteDate: { lte: fromDateOnly(query.dateTo) } });
    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' as const };
      and.push({
        OR: [
          { number: contains },
          { referenceNumber: contains },
          { reason: contains },
          { customer: { displayName: contains } },
          { invoice: { number: contains } },
        ],
      });
    }
    if (query.status !== 'all') and.push(statusWhere(query.status));
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

  private async requireInvoice(invoiceId: string | null, customerId: string): Promise<void> {
    if (!invoiceId) return;
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId }, select: { customerId: true } });
    if (!invoice || invoice.customerId !== customerId) {
      throw fieldError('INVOICE_NOT_AVAILABLE', 'invoiceId', "Select one of the customer's invoices");
    }
  }

  private async requirePaymentMode(id: string | null): Promise<void> {
    if (id && !(await this.prisma.paymentMode.findUnique({ where: { id }, select: { id: true } }))) {
      throw fieldError('PAYMENT_MODE_NOT_FOUND', 'paymentModeId', 'Select a valid payment mode');
    }
  }

  private async find(id: string): Promise<CreditNoteDetail> {
    const creditNote = await this.prisma.creditNote.findUnique({ where: { id }, include: CREDIT_NOTE_INCLUDE });
    if (!creditNote) throw notFound('Credit note');
    return creditNote;
  }

  private async today(): Promise<string> {
    return todayInTimeZone(await this.organization.timezone());
  }
}
