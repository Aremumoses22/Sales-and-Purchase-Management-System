import { Injectable } from '@nestjs/common';
import {
  BILL_DISPLAY_STATUSES,
  canPerformBillAction,
  getBillDisplayStatus,
  todayInTimeZone,
  toDecimal,
  type AuditLogDto,
  type BillAction,
  type BillDisplayStatus,
  type BillDto,
  type BillListItemDto,
  type BillListQuery,
  type BillOutput,
  type BillStatus,
  type NumericInput,
  type Paginated,
  type StatusCountsDto,
} from '@spms/shared';
import { AuditService } from '../../audit/audit.service.js';
import { diffRecords } from '../../audit/diff.js';
import { conflict, fieldError, notFound } from '../../common/app-exception.js';
import { pageArgs, paginated, parseSort } from '../../common/pagination.js';
import { getRequestContext } from '../../common/request-context.js';
import { fromDateOnly, money, quantity, toDateOnly, toIso, toIsoOrNull } from '../../common/serialize.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../prisma/prisma.service.js';
import {
  DocumentLinesService,
  taxBreakdownFromLines,
  toDocumentCustomer,
  toDocumentLineDto,
  type PreparedDocument,
} from '../documents/document-lines.service.js';
import { StockService } from '../items/stock.service.js';
import { OrganizationService } from '../settings/organization.service.js';

const BILL_INCLUDE = {
  lines: { orderBy: { position: 'asc' } },
  vendor: { include: { addresses: true } },
  paymentTerm: { select: { id: true, name: true, days: true } },
  createdBy: { select: { id: true, name: true } },
  allocations: {
    include: {
      payment: { select: { id: true, number: true, paymentDate: true, paymentMode: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.BillInclude;

type BillDetail = Prisma.BillGetPayload<{ include: typeof BILL_INCLUDE }>;

interface StatusFacts {
  status: BillStatus;
  amountPaid: NumericInput;
  balanceDue: NumericInput;
}

function displayStatus(bill: StatusFacts & { dueDate: Date }, today: string): BillDisplayStatus {
  return getBillDisplayStatus({ ...bill, dueDate: toDateOnly(bill.dueDate) }, today);
}

/** Filter matching exactly the bills shown with a given display status. */
function statusWhere(status: BillDisplayStatus, today: string): Prisma.BillWhereInput {
  const todayDate = fromDateOnly(today);
  switch (status) {
    case 'draft':
      return { status: 'draft' };
    case 'void':
      return { status: 'void' };
    case 'paid':
      return { status: 'open', balanceDue: { lte: 0 } };
    case 'overdue':
      return { status: 'open', balanceDue: { gt: 0 }, dueDate: { lt: todayDate } };
    case 'partially_paid':
      return { status: 'open', balanceDue: { gt: 0 }, amountPaid: { gt: 0 }, dueDate: { gte: todayDate } };
    case 'open':
      return { status: 'open', balanceDue: { gt: 0 }, amountPaid: { lte: 0 }, dueDate: { gte: todayDate } };
  }
}

function toBillDto(bill: BillDetail, today: string): BillDto {
  return {
    id: bill.id,
    billNumber: bill.billNumber,
    orderNumber: bill.orderNumber,
    billDate: toDateOnly(bill.billDate),
    dueDate: toDateOnly(bill.dueDate),
    status: bill.status,
    displayStatus: displayStatus(bill, today),
    paymentTerm: bill.paymentTerm,
    subtotal: money(bill.subtotal),
    discountTotal: money(bill.discountTotal),
    taxTotal: money(bill.taxTotal),
    taxBreakdown: taxBreakdownFromLines(bill.lines),
    shippingCharge: money(bill.shippingCharge),
    adjustment: money(bill.adjustment),
    total: money(bill.total),
    amountPaid: money(bill.amountPaid),
    balanceDue: money(bill.balanceDue),
    notes: bill.notes,
    terms: bill.terms,
    lines: bill.lines.map(toDocumentLineDto),
    vendor: toDocumentCustomer(bill.vendor),
    payments: bill.allocations.map((allocation) => ({
      paymentId: allocation.payment.id,
      number: allocation.payment.number,
      paymentDate: toDateOnly(allocation.payment.paymentDate),
      paymentMode: allocation.payment.paymentMode?.name ?? null,
      amount: money(allocation.amount),
    })),
    openedAt: toIsoOrNull(bill.openedAt),
    voidedAt: toIsoOrNull(bill.voidedAt),
    voidReason: bill.voidReason,
    createdBy: bill.createdBy,
    createdAt: toIso(bill.createdAt),
    updatedAt: toIso(bill.updatedAt),
  };
}

function auditSnapshot(bill: BillDetail): Record<string, unknown> {
  return {
    vendor: bill.vendor.displayName,
    billNumber: bill.billNumber,
    billDate: toDateOnly(bill.billDate),
    dueDate: toDateOnly(bill.dueDate),
    paymentTerm: bill.paymentTerm?.name ?? null,
    orderNumber: bill.orderNumber,
    lines: bill.lines.map((line) => `${quantity(line.quantity)} × ${line.name} @ ${money(line.rate)} = ${money(line.amount)}`),
    shippingCharge: money(bill.shippingCharge),
    adjustment: money(bill.adjustment),
    total: money(bill.total),
    notes: bill.notes,
    terms: bill.terms,
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

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class BillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly documentLines: DocumentLinesService,
    private readonly organization: OrganizationService,
    private readonly stock: StockService,
  ) {}

  async list(query: BillListQuery): Promise<Paginated<BillListItemDto>> {
    const today = await this.today();
    const where = this.where(query, today);
    const orderBy = parseSort<Prisma.BillOrderByWithRelationInput>(
      query.sort,
      {
        date: (sort) => ({ billDate: sort }),
        number: (sort) => ({ billNumber: sort }),
        vendor: (sort) => ({ vendor: { displayName: sort } }),
        dueDate: (sort) => ({ dueDate: sort }),
        total: (sort) => ({ total: sort }),
        balance: (sort) => ({ balanceDue: sort }),
      },
      '-date',
    );

    const [rows, total] = await Promise.all([
      this.prisma.bill.findMany({
        where,
        include: { vendor: { select: { id: true, displayName: true } } },
        orderBy: [orderBy, { createdAt: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.bill.count({ where }),
    ]);

    return paginated(
      rows.map((row) => ({
        id: row.id,
        billNumber: row.billNumber,
        orderNumber: row.orderNumber,
        billDate: toDateOnly(row.billDate),
        dueDate: toDateOnly(row.dueDate),
        status: row.status,
        displayStatus: displayStatus(row, today),
        total: money(row.total),
        balanceDue: money(row.balanceDue),
        vendor: row.vendor,
      })),
      total,
      query,
    );
  }

  async statusCounts(query: BillListQuery): Promise<StatusCountsDto> {
    const today = await this.today();
    const where = this.where({ ...query, status: 'all' }, today);
    const entries = await Promise.all(
      BILL_DISPLAY_STATUSES.map(
        async (status) => [status, await this.prisma.bill.count({ where: { AND: [where, statusWhere(status, today)] } })] as const,
      ),
    );
    const counts: StatusCountsDto = Object.fromEntries(entries);
    counts['all'] = entries.reduce((sum, [, count]) => sum + count, 0);
    return counts;
  }

  async get(id: string): Promise<BillDto> {
    return toBillDto(await this.find(id), await this.today());
  }

  async create(input: BillOutput): Promise<BillDto> {
    const vendor = await this.requireVendor(input.vendorId);
    await this.requirePaymentTerm(input.paymentTermId);
    const open = input.saveAs === 'open';

    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const prepared = await this.documentLines.prepare(input, tx);
        const bill = await tx.bill.create({
          data: {
            ...this.headerData(input),
            ...totalsData(prepared),
            amountPaid: '0',
            balanceDue: prepared.totals.total,
            status: open ? 'open' : 'draft',
            openedAt: open ? new Date() : null,
            createdById: getRequestContext()?.userId ?? null,
            lines: { create: prepared.lines },
          },
        });
        if (open) await this.syncStock(tx, bill, prepared.lines);
        await this.audit.record(
          {
            action: 'created',
            entityType: 'bill',
            entityId: bill.id,
            summary: `Bill ${bill.billNumber} from ${vendor.displayName} for ${prepared.totals.total} recorded${open ? '' : ' as a draft'}`,
          },
          tx,
        );
        return bill.id;
      });
      return this.get(id);
    } catch (error) {
      throw this.duplicateNumber(error);
    }
  }

  async update(id: string, input: BillOutput): Promise<BillDto> {
    const before = await this.find(id);
    this.assertAllowed('edit', before);
    if (input.vendorId !== before.vendorId) {
      if (toDecimal(before.amountPaid).gt(0)) {
        throw fieldError('VENDOR_LOCKED', 'vendorId', 'The vendor cannot be changed after payments have been recorded');
      }
      await this.requireVendor(input.vendorId);
    }
    await this.requirePaymentTerm(input.paymentTermId);

    try {
      await this.prisma.$transaction(async (tx) => {
        const current = await this.lockForPayment(tx, id);
        if (!current) throw notFound('Bill');
        this.assertAllowed('edit', current);

        const prepared = await this.documentLines.prepare(input, tx);
        const paid = toDecimal(current.amountPaid);
        if (toDecimal(prepared.totals.total).lt(paid)) {
          throw fieldError('TOTAL_BELOW_PAID', 'lines', `The total cannot be less than the ${paid.toFixed(2)} already paid on this bill`);
        }

        const markOpen = input.saveAs === 'open' && current.status === 'draft';
        await tx.billLine.deleteMany({ where: { billId: id } });
        const updated = await tx.bill.update({
          where: { id },
          data: {
            ...this.headerData(input),
            ...totalsData(prepared),
            balanceDue: toDecimal(prepared.totals.total).minus(paid).toFixed(2),
            ...(markOpen ? { status: 'open' as const, openedAt: new Date() } : {}),
            lines: { create: prepared.lines },
          },
          include: BILL_INCLUDE,
        });
        if (updated.status === 'open') await this.syncStock(tx, updated, prepared.lines);

        const changes = diffRecords(auditSnapshot(before), auditSnapshot(updated)) ?? {};
        if (markOpen) changes['status'] = { from: 'draft', to: 'open' };
        if (Object.keys(changes).length > 0) {
          await this.audit.record(
            { action: 'updated', entityType: 'bill', entityId: id, summary: `Bill ${updated.billNumber} updated${markOpen ? ' and opened' : ''}`, changes },
            tx,
          );
        }
      });
    } catch (error) {
      throw this.duplicateNumber(error);
    }
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const bill = await this.find(id);
    this.assertAllowed('delete', bill);
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockForPayment(tx, id);
      if (!current) throw notFound('Bill');
      this.assertAllowed('delete', current);
      await this.syncStock(tx, bill, []);
      await tx.bill.delete({ where: { id } });
      await this.audit.record(
        { action: 'deleted', entityType: 'bill', entityId: id, summary: `Bill ${bill.billNumber} from ${bill.vendor.displayName} deleted` },
        tx,
      );
    });
  }

  async markOpen(id: string): Promise<BillDto> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockForPayment(tx, id);
      if (!current) throw notFound('Bill');
      this.assertAllowed('markOpen', current);
      const updated = await tx.bill.update({ where: { id }, data: { status: 'open', openedAt: new Date() }, include: { lines: true } });
      await this.syncStock(tx, updated, updated.lines);
      await this.audit.record(
        {
          action: 'status_changed',
          entityType: 'bill',
          entityId: id,
          summary: `Bill ${updated.billNumber} opened`,
          changes: { status: { from: 'draft', to: 'open' } },
        },
        tx,
      );
    });
    return this.get(id);
  }

  async void(id: string, reason: string | null): Promise<BillDto> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockForPayment(tx, id);
      if (!current) throw notFound('Bill');
      this.assertAllowed('void', current);
      const updated = await tx.bill.update({
        where: { id },
        data: { status: 'void', voidedAt: new Date(), voidReason: reason, balanceDue: 0 },
      });
      // Goods on a void bill never arrived, so its stock movements go too.
      await this.syncStock(tx, updated, []);
      await this.audit.record(
        {
          action: 'status_changed',
          entityType: 'bill',
          entityId: id,
          summary: `Bill ${updated.billNumber} voided${reason ? `: ${reason}` : ''}`,
          changes: { status: { from: 'open', to: 'void' } },
        },
        tx,
      );
    });
    return this.get(id);
  }

  async history(id: string): Promise<AuditLogDto[]> {
    await this.find(id);
    return this.audit.history('bill', id);
  }

  /** Locks a bill for payment work and returns what payment rules need to check. */
  async lockForPayment(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM bills WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.bill.findUnique({
      where: { id },
      select: { id: true, billNumber: true, vendorId: true, status: true, total: true, amountPaid: true, balanceDue: true, billDate: true },
    });
  }

  /**
   * Recomputes amount paid and balance of each bill from its payment allocations. Called inside
   * the transaction that changed the payments. A draft bill that is paid is opened, taking its stock.
   */
  async refreshBalances(tx: Tx, billIds: string[]): Promise<void> {
    for (const id of [...new Set(billIds)].sort()) {
      await tx.$queryRaw`SELECT id FROM bills WHERE id = ${id}::uuid FOR UPDATE`;
      const bill = await tx.bill.findUnique({ where: { id }, include: { lines: true } });
      if (!bill) continue;
      const { _sum } = await tx.billPaymentAllocation.aggregate({ where: { billId: id }, _sum: { amount: true } });
      const paid = toDecimal(_sum.amount);
      const total = toDecimal(bill.total);
      if (paid.gt(total)) throw conflict('OVERPAID', `Payments applied to bill ${bill.billNumber} would exceed its total`);

      const becomesOpen = bill.status === 'draft' && paid.gt(0);
      await tx.bill.update({
        where: { id },
        data: {
          amountPaid: paid.toFixed(2),
          balanceDue: bill.status === 'void' ? '0' : total.minus(paid).toFixed(2),
          ...(becomesOpen ? { status: 'open' as const, openedAt: new Date() } : {}),
        },
      });
      if (becomesOpen) {
        await this.syncStock(tx, bill, bill.lines);
        await this.audit.record(
          {
            action: 'status_changed',
            entityType: 'bill',
            entityId: id,
            summary: `Bill ${bill.billNumber} opened when a payment was recorded`,
            changes: { status: { from: 'draft', to: 'open' } },
          },
          tx,
        );
      }
    }
  }

  private syncStock(
    tx: Tx,
    bill: { id: string; billNumber: string; billDate: Date },
    lines: { itemId: string | null; quantity: NumericInput }[],
  ): Promise<void> {
    return this.stock.syncDocumentMovements(
      tx,
      { type: 'bill', id: bill.id, date: bill.billDate, direction: 1, reason: `Bill ${bill.billNumber}` },
      lines,
    );
  }

  private duplicateNumber(error: unknown): unknown {
    return isUniqueViolation(error)
      ? fieldError('BILL_NUMBER_TAKEN', 'billNumber', 'This vendor already has a bill with this number')
      : error;
  }

  private assertAllowed(action: BillAction, bill: StatusFacts): void {
    if (canPerformBillAction(action, bill)) return;
    const hasPayments = toDecimal(bill.amountPaid).gt(0);
    const reasons: Record<BillAction, string> = {
      edit: 'A void bill cannot be edited',
      delete:
        bill.status === 'draft' && hasPayments
          ? 'Remove the payments on this bill before deleting it'
          : 'Only draft bills can be deleted. Void the bill instead.',
      markOpen: 'Only draft bills can be opened',
      void:
        bill.status === 'void'
          ? 'This bill is already void'
          : bill.status === 'draft'
            ? 'Draft bills are deleted rather than voided'
            : 'Remove the payments made on this bill before voiding it',
      recordPayment: 'This bill has nothing left to pay',
    };
    throw conflict('INVALID_BILL_STATUS', reasons[action]);
  }

  private headerData(input: BillOutput) {
    return {
      vendorId: input.vendorId,
      billNumber: input.billNumber,
      orderNumber: input.orderNumber,
      billDate: fromDateOnly(input.billDate),
      dueDate: fromDateOnly(input.dueDate),
      paymentTermId: input.paymentTermId,
      notes: input.customerNotes,
      terms: input.terms,
    };
  }

  private where(query: BillListQuery, today: string): Prisma.BillWhereInput {
    const and: Prisma.BillWhereInput[] = [];
    if (query.vendorId) and.push({ vendorId: query.vendorId });
    if (query.dateFrom) and.push({ billDate: { gte: fromDateOnly(query.dateFrom) } });
    if (query.dateTo) and.push({ billDate: { lte: fromDateOnly(query.dateTo) } });
    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' as const };
      and.push({ OR: [{ billNumber: contains }, { orderNumber: contains }, { vendor: { displayName: contains } }] });
    }
    if (query.status !== 'all') and.push(statusWhere(query.status, today));
    return { AND: and };
  }

  private async requireVendor(id: string) {
    const vendor = await this.prisma.contact.findFirst({
      where: { id, type: 'vendor', isActive: true },
      select: { id: true, displayName: true },
    });
    if (!vendor) throw fieldError('VENDOR_NOT_AVAILABLE', 'vendorId', 'Select an active vendor');
    return vendor;
  }

  private async requirePaymentTerm(id: string | null): Promise<void> {
    if (id && !(await this.prisma.paymentTerm.findUnique({ where: { id }, select: { id: true } }))) {
      throw fieldError('PAYMENT_TERM_NOT_FOUND', 'paymentTermId', 'Select a valid payment term');
    }
  }

  private async find(id: string): Promise<BillDetail> {
    const bill = await this.prisma.bill.findUnique({ where: { id }, include: BILL_INCLUDE });
    if (!bill) throw notFound('Bill');
    return bill;
  }

  private async today(): Promise<string> {
    return todayInTimeZone(await this.organization.timezone());
  }
}
