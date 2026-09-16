import { Injectable } from '@nestjs/common';
import {
  canPerformSalesReceiptAction,
  SALES_RECEIPT_STATUSES,
  todayInTimeZone,
  type AuditLogDto,
  type NumericInput,
  type Paginated,
  type SalesReceiptAction,
  type SalesReceiptDto,
  type SalesReceiptListItemDto,
  type SalesReceiptListQuery,
  type SalesReceiptOutput,
  type SalesReceiptStatus,
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
  storedLinesToInput,
  taxBreakdownFromLines,
  toDocumentCustomer,
  toDocumentLineDto,
  type PreparedDocument,
} from '../documents/document-lines.service.js';
import { StockService } from '../items/stock.service.js';
import { NumberSeriesService } from '../settings/number-series.service.js';
import { OrganizationService } from '../settings/organization.service.js';

const SALES_RECEIPT_INCLUDE = {
  lines: { orderBy: { position: 'asc' } },
  customer: { include: { addresses: true } },
  paymentMode: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.SalesReceiptInclude;

type SalesReceiptDetail = Prisma.SalesReceiptGetPayload<{ include: typeof SALES_RECEIPT_INCLUDE }>;

function toSalesReceiptDto(receipt: SalesReceiptDetail): SalesReceiptDto {
  return {
    id: receipt.id,
    number: receipt.number,
    receiptDate: toDateOnly(receipt.receiptDate),
    referenceNumber: receipt.referenceNumber,
    paymentMode: receipt.paymentMode,
    status: receipt.status,
    subtotal: money(receipt.subtotal),
    discountTotal: money(receipt.discountTotal),
    taxTotal: money(receipt.taxTotal),
    taxBreakdown: taxBreakdownFromLines(receipt.lines),
    shippingCharge: money(receipt.shippingCharge),
    adjustment: money(receipt.adjustment),
    total: money(receipt.total),
    customerNotes: receipt.customerNotes,
    terms: receipt.terms,
    lines: receipt.lines.map(toDocumentLineDto),
    customer: toDocumentCustomer(receipt.customer),
    completedAt: toIsoOrNull(receipt.completedAt),
    voidedAt: toIsoOrNull(receipt.voidedAt),
    voidReason: receipt.voidReason,
    createdBy: receipt.createdBy,
    createdAt: toIso(receipt.createdAt),
    updatedAt: toIso(receipt.updatedAt),
  };
}

function auditSnapshot(receipt: SalesReceiptDetail): Record<string, unknown> {
  return {
    customer: receipt.customer.displayName,
    receiptDate: toDateOnly(receipt.receiptDate),
    paymentMode: receipt.paymentMode?.name ?? null,
    referenceNumber: receipt.referenceNumber,
    lines: receipt.lines.map(
      (line) => `${quantity(line.quantity)} × ${line.name} @ ${money(line.rate)} = ${money(line.amount)}`,
    ),
    shippingCharge: money(receipt.shippingCharge),
    adjustment: money(receipt.adjustment),
    total: money(receipt.total),
    customerNotes: receipt.customerNotes,
    terms: receipt.terms,
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
export class SalesReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numberSeries: NumberSeriesService,
    private readonly documentLines: DocumentLinesService,
    private readonly organization: OrganizationService,
    private readonly stock: StockService,
  ) {}

  async list(query: SalesReceiptListQuery): Promise<Paginated<SalesReceiptListItemDto>> {
    const where = this.where(query);
    const orderBy = parseSort<Prisma.SalesReceiptOrderByWithRelationInput>(
      query.sort,
      {
        date: (sort) => ({ receiptDate: sort }),
        number: (sort) => ({ number: sort }),
        customer: (sort) => ({ customer: { displayName: sort } }),
        total: (sort) => ({ total: sort }),
      },
      '-date',
    );

    const [rows, total] = await Promise.all([
      this.prisma.salesReceipt.findMany({
        where,
        include: {
          customer: { select: { id: true, displayName: true } },
          paymentMode: { select: { id: true, name: true } },
        },
        orderBy: [orderBy, { number: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.salesReceipt.count({ where }),
    ]);

    return paginated(
      rows.map((row) => ({
        id: row.id,
        number: row.number,
        receiptDate: toDateOnly(row.receiptDate),
        referenceNumber: row.referenceNumber,
        paymentMode: row.paymentMode,
        status: row.status,
        total: money(row.total),
        customer: row.customer,
      })),
      total,
      query,
    );
  }

  /** Counts for the status tabs, using every filter except the status itself. */
  async statusCounts(query: SalesReceiptListQuery): Promise<StatusCountsDto> {
    const where = this.where({ ...query, status: 'all' });
    const rows = await this.prisma.salesReceipt.groupBy({ by: ['status'], where, _count: { _all: true } });
    const counts: StatusCountsDto = Object.fromEntries(SALES_RECEIPT_STATUSES.map((status) => [status, 0]));
    for (const row of rows) counts[row.status] = row._count._all;
    counts['all'] = rows.reduce((sum, row) => sum + row._count._all, 0);
    return counts;
  }

  async get(id: string): Promise<SalesReceiptDto> {
    return toSalesReceiptDto(await this.find(id));
  }

  create(input: SalesReceiptOutput): Promise<SalesReceiptDto> {
    return this.insert(input);
  }

  async update(id: string, input: SalesReceiptOutput): Promise<SalesReceiptDto> {
    const before = await this.find(id);
    this.assertAllowed('edit', before.status);
    if (input.customerId !== before.customerId) await this.requireCustomer(input.customerId);
    await this.requirePaymentMode(input.paymentModeId);

    await this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, id);
      this.assertAllowed('edit', current.status);

      const prepared = await this.documentLines.prepare(input, tx);
      const complete = input.saveAs === 'completed' && current.status === 'draft';
      await tx.salesReceiptLine.deleteMany({ where: { salesReceiptId: id } });
      const updated = await tx.salesReceipt.update({
        where: { id },
        data: {
          ...this.headerData(input),
          ...totalsData(prepared),
          ...(complete ? { status: 'completed' as const, completedAt: new Date() } : {}),
          lines: { create: prepared.lines },
        },
        include: SALES_RECEIPT_INCLUDE,
      });
      if (updated.status === 'completed') await this.syncStock(tx, updated, prepared.lines);

      const changes = diffRecords(auditSnapshot(before), auditSnapshot(updated)) ?? {};
      if (complete) changes['status'] = { from: 'draft', to: 'completed' };
      if (Object.keys(changes).length > 0) {
        await this.audit.record(
          {
            action: 'updated',
            entityType: 'sales_receipt',
            entityId: id,
            summary: `Sales receipt ${updated.number} updated${complete ? ' and completed' : ''}`,
            changes,
          },
          tx,
        );
      }
    });
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const receipt = await this.find(id);
    this.assertAllowed('delete', receipt.status);

    await this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, id);
      this.assertAllowed('delete', current.status);
      await tx.salesReceipt.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'deleted',
          entityType: 'sales_receipt',
          entityId: id,
          summary: `Sales receipt ${receipt.number} for ${receipt.customer.displayName} deleted`,
        },
        tx,
      );
    });
  }

  async complete(id: string): Promise<SalesReceiptDto> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, id);
      this.assertAllowed('complete', current.status);
      const updated = await tx.salesReceipt.update({
        where: { id },
        data: { status: 'completed', completedAt: new Date() },
        include: { lines: true },
      });
      await this.syncStock(tx, updated, updated.lines);
      await this.audit.record(
        {
          action: 'status_changed',
          entityType: 'sales_receipt',
          entityId: id,
          summary: `Sales receipt ${updated.number} completed`,
          changes: { status: { from: 'draft', to: 'completed' } },
        },
        tx,
      );
    });
    return this.get(id);
  }

  async void(id: string, reason: string | null): Promise<SalesReceiptDto> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, id);
      this.assertAllowed('void', current.status);
      await tx.salesReceipt.update({ where: { id }, data: { status: 'void', voidedAt: new Date(), voidReason: reason } });
      // Goods on a void receipt never left, so its stock movements go too.
      await this.syncStock(tx, current, []);
      await this.audit.record(
        {
          action: 'status_changed',
          entityType: 'sales_receipt',
          entityId: id,
          summary: `Sales receipt ${current.number} voided${reason ? `: ${reason}` : ''}`,
          changes: { status: { from: 'completed', to: 'void' } },
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** Copies a receipt into a new draft dated today. */
  async clone(id: string): Promise<SalesReceiptDto> {
    const source = await this.find(id);
    return this.insert(
      {
        customerId: source.customerId,
        receiptDate: await this.today(),
        paymentModeId: source.paymentModeId,
        referenceNumber: null,
        customerNotes: source.customerNotes,
        terms: source.terms,
        shippingCharge: money(source.shippingCharge),
        adjustment: money(source.adjustment),
        saveAs: 'draft',
        lines: storedLinesToInput(source.lines),
      },
      `cloned from ${source.number}`,
    );
  }

  async history(id: string): Promise<AuditLogDto[]> {
    await this.find(id);
    return this.audit.history('sales_receipt', id);
  }

  private async insert(input: SalesReceiptOutput, origin?: string): Promise<SalesReceiptDto> {
    const customer = await this.requireCustomer(input.customerId);
    await this.requirePaymentMode(input.paymentModeId);
    const complete = input.saveAs === 'completed';

    const id = await this.prisma.$transaction(async (tx) => {
      const prepared = await this.documentLines.prepare(input, tx);
      const number = await this.numberSeries.next(tx, 'sales_receipt', async (candidate) =>
        (await tx.salesReceipt.findUnique({ where: { number: candidate }, select: { id: true } })) !== null,
      );
      const receipt = await tx.salesReceipt.create({
        data: {
          number,
          ...this.headerData(input),
          ...totalsData(prepared),
          status: complete ? 'completed' : 'draft',
          completedAt: complete ? new Date() : null,
          createdById: getRequestContext()?.userId ?? null,
          lines: { create: prepared.lines },
        },
      });
      if (complete) await this.syncStock(tx, receipt, prepared.lines);

      const details = [origin, complete ? null : 'draft'].filter(Boolean).join(', ');
      await this.audit.record(
        {
          action: 'created',
          entityType: 'sales_receipt',
          entityId: receipt.id,
          summary: `Sales receipt ${number} of ${prepared.totals.total} for ${customer.displayName} created${details ? ` (${details})` : ''}`,
        },
        tx,
      );
      return receipt.id;
    });
    return this.get(id);
  }

  private syncStock(
    tx: Tx,
    receipt: { id: string; number: string; receiptDate: Date },
    lines: { itemId: string | null; quantity: NumericInput }[],
  ): Promise<void> {
    return this.stock.syncDocumentMovements(
      tx,
      { type: 'sales_receipt', id: receipt.id, date: receipt.receiptDate, direction: -1, reason: `Sales receipt ${receipt.number}` },
      lines,
    );
  }

  /** Locks the receipt row for the rest of the transaction and returns its current state. */
  private async lock(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM sales_receipts WHERE id = ${id}::uuid FOR UPDATE`;
    const receipt = await tx.salesReceipt.findUnique({
      where: { id },
      select: { id: true, number: true, status: true, receiptDate: true },
    });
    if (!receipt) throw notFound('Sales receipt');
    return receipt;
  }

  private assertAllowed(action: SalesReceiptAction, status: SalesReceiptStatus): void {
    if (canPerformSalesReceiptAction(action, status)) return;
    const reasons: Record<SalesReceiptAction, string> = {
      edit: 'A void sales receipt cannot be edited',
      delete: 'Only draft sales receipts can be deleted. Void the receipt instead.',
      complete: 'Only draft sales receipts can be completed',
      void:
        status === 'void' ? 'This sales receipt is already void' : 'Draft sales receipts are deleted rather than voided',
    };
    throw conflict('INVALID_SALES_RECEIPT_STATUS', reasons[action]);
  }

  private headerData(input: SalesReceiptOutput) {
    return {
      customerId: input.customerId,
      receiptDate: fromDateOnly(input.receiptDate),
      paymentModeId: input.paymentModeId,
      referenceNumber: input.referenceNumber,
      customerNotes: input.customerNotes,
      terms: input.terms,
    };
  }

  private where(query: SalesReceiptListQuery): Prisma.SalesReceiptWhereInput {
    const and: Prisma.SalesReceiptWhereInput[] = [];
    if (query.customerId) and.push({ customerId: query.customerId });
    if (query.paymentModeId) and.push({ paymentModeId: query.paymentModeId });
    if (query.dateFrom) and.push({ receiptDate: { gte: fromDateOnly(query.dateFrom) } });
    if (query.dateTo) and.push({ receiptDate: { lte: fromDateOnly(query.dateTo) } });
    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' as const };
      and.push({ OR: [{ number: contains }, { referenceNumber: contains }, { customer: { displayName: contains } }] });
    }
    if (query.status !== 'all') and.push({ status: query.status });
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

  private async requirePaymentMode(id: string | null): Promise<void> {
    if (id && !(await this.prisma.paymentMode.findUnique({ where: { id }, select: { id: true } }))) {
      throw fieldError('PAYMENT_MODE_NOT_FOUND', 'paymentModeId', 'Select a valid payment mode');
    }
  }

  private async find(id: string): Promise<SalesReceiptDetail> {
    const receipt = await this.prisma.salesReceipt.findUnique({ where: { id }, include: SALES_RECEIPT_INCLUDE });
    if (!receipt) throw notFound('Sales receipt');
    return receipt;
  }

  private async today(): Promise<string> {
    return todayInTimeZone(await this.organization.timezone());
  }
}
