import { Injectable } from '@nestjs/common';
import {
  getBillDisplayStatus,
  todayInTimeZone,
  toDecimal,
  type AuditLogDto,
  type ApplyBillCreditsOutput,
  type BillAvailableCreditsDto,
  type BillDto,
  type Decimal,
  type NumericInput,
  type PaymentRefundOutput,
  type OpenBillDto,
  type OpenBillsQuery,
  type Paginated,
  type PaymentMadeDto,
  type PaymentMadeListItemDto,
  type PaymentMadeListQuery,
  type PaymentMadeOutput,
} from '@spms/shared';
import { AuditService } from '../../audit/audit.service.js';
import { diffRecords } from '../../audit/diff.js';
import { conflict, fieldError, notFound } from '../../common/app-exception.js';
import { pageArgs, paginated, parseSort } from '../../common/pagination.js';
import { getRequestContext } from '../../common/request-context.js';
import { fromDateOnly, money, toDateOnly, toIso } from '../../common/serialize.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../prisma/prisma.service.js';
import { toDocumentCustomer } from '../documents/document-lines.service.js';
import { NumberSeriesService } from '../settings/number-series.service.js';
import { OrganizationService } from '../settings/organization.service.js';
import { BillsService } from './bills.service.js';

const PAYMENT_INCLUDE = {
  vendor: { include: { addresses: true } },
  paymentMode: { select: { id: true, name: true } },
  allocations: {
    include: { bill: { select: { id: true, billNumber: true, billDate: true, total: true, balanceDue: true } } },
    orderBy: { createdAt: 'asc' },
  },
  refunds: { include: { paymentMode: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.PaymentMadeInclude;

type PaymentDetail = Prisma.PaymentMadeGetPayload<{ include: typeof PAYMENT_INCLUDE }>;

function unusedOf(payment: { amount: NumericInput; amountApplied: NumericInput; amountRefunded: NumericInput }): Decimal {
  return toDecimal(payment.amount).minus(toDecimal(payment.amountApplied)).minus(toDecimal(payment.amountRefunded));
}

function toPaymentDto(payment: PaymentDetail): PaymentMadeDto {
  return {
    id: payment.id,
    number: payment.number,
    paymentDate: toDateOnly(payment.paymentDate),
    referenceNumber: payment.referenceNumber,
    paymentMode: payment.paymentMode,
    amount: money(payment.amount),
    amountApplied: money(payment.amountApplied),
    amountRefunded: money(payment.amountRefunded),
    unusedAmount: money(unusedOf(payment)),
    notes: payment.notes,
    refunds: payment.refunds.map((refund) => ({
      id: refund.id,
      refundDate: toDateOnly(refund.refundDate),
      amount: money(refund.amount),
      paymentMode: refund.paymentMode,
      referenceNumber: refund.referenceNumber,
      notes: refund.notes,
      createdAt: toIso(refund.createdAt),
    })),
    allocations: payment.allocations.map((allocation) => ({
      id: allocation.id,
      amount: money(allocation.amount),
      bill: {
        id: allocation.bill.id,
        billNumber: allocation.bill.billNumber,
        billDate: toDateOnly(allocation.bill.billDate),
        total: money(allocation.bill.total),
        balanceDue: money(allocation.bill.balanceDue),
      },
    })),
    vendor: toDocumentCustomer(payment.vendor),
    createdBy: payment.createdBy,
    createdAt: toIso(payment.createdAt),
    updatedAt: toIso(payment.updatedAt),
  };
}

function auditSnapshot(payment: PaymentDetail): Record<string, unknown> {
  return {
    vendor: payment.vendor.displayName,
    paymentDate: toDateOnly(payment.paymentDate),
    amount: money(payment.amount),
    paymentMode: payment.paymentMode?.name ?? null,
    referenceNumber: payment.referenceNumber,
    notes: payment.notes,
    appliedTo: payment.allocations.map((allocation) => `${allocation.bill.billNumber}: ${money(allocation.amount)}`),
  };
}

@Injectable()
export class PaymentsMadeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numberSeries: NumberSeriesService,
    private readonly organization: OrganizationService,
    private readonly bills: BillsService,
  ) {}

  async list(query: PaymentMadeListQuery): Promise<Paginated<PaymentMadeListItemDto>> {
    const and: Prisma.PaymentMadeWhereInput[] = [];
    if (query.vendorId) and.push({ vendorId: query.vendorId });
    if (query.paymentModeId) and.push({ paymentModeId: query.paymentModeId });
    if (query.dateFrom) and.push({ paymentDate: { gte: fromDateOnly(query.dateFrom) } });
    if (query.dateTo) and.push({ paymentDate: { lte: fromDateOnly(query.dateTo) } });
    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' as const };
      and.push({ OR: [{ number: contains }, { referenceNumber: contains }, { vendor: { displayName: contains } }] });
    }
    const where = { AND: and };
    const orderBy = parseSort<Prisma.PaymentMadeOrderByWithRelationInput>(
      query.sort,
      {
        date: (sort) => ({ paymentDate: sort }),
        number: (sort) => ({ number: sort }),
        vendor: (sort) => ({ vendor: { displayName: sort } }),
        amount: (sort) => ({ amount: sort }),
      },
      '-date',
    );
    const [rows, total] = await Promise.all([
      this.prisma.paymentMade.findMany({
        where,
        include: { vendor: { select: { id: true, displayName: true } }, paymentMode: { select: { id: true, name: true } } },
        orderBy: [orderBy, { number: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.paymentMade.count({ where }),
    ]);
    return paginated(
      rows.map((row) => ({
        id: row.id,
        number: row.number,
        paymentDate: toDateOnly(row.paymentDate),
        referenceNumber: row.referenceNumber,
        paymentMode: row.paymentMode,
        amount: money(row.amount),
        unusedAmount: money(unusedOf(row)),
        vendor: row.vendor,
      })),
      total,
      query,
    );
  }

  async get(id: string): Promise<PaymentMadeDto> {
    return toPaymentDto(await this.find(id));
  }

  /** Bills a payment can go to, oldest first; when editing, the payment's own share counts as available. */
  async openBills(query: OpenBillsQuery): Promise<OpenBillDto[]> {
    const today = todayInTimeZone(await this.organization.timezone());
    const rows = await this.prisma.bill.findMany({
      where: {
        vendorId: query.vendorId,
        status: { in: ['draft', 'open'] },
        OR: [{ balanceDue: { gt: 0 } }, ...(query.paymentId ? [{ allocations: { some: { paymentId: query.paymentId } } }] : [])],
      },
      include: { allocations: { where: query.paymentId ? { paymentId: query.paymentId } : { id: { in: [] } } } },
      orderBy: [{ billDate: 'asc' }, { billNumber: 'asc' }],
    });
    return rows.map((row) => {
      const allocated = toDecimal(row.allocations[0]?.amount);
      return {
        id: row.id,
        billNumber: row.billNumber,
        billDate: toDateOnly(row.billDate),
        dueDate: toDateOnly(row.dueDate),
        status: row.status,
        displayStatus: getBillDisplayStatus(
          { status: row.status, amountPaid: row.amountPaid, balanceDue: row.balanceDue, dueDate: toDateOnly(row.dueDate) },
          today,
        ),
        total: money(row.total),
        balanceDue: money(toDecimal(row.balanceDue).plus(allocated)),
        allocated: money(allocated),
      };
    });
  }

  async create(input: PaymentMadeOutput): Promise<PaymentMadeDto> {
    const vendor = await this.requireVendor(input.vendorId);
    await this.requirePaymentMode(input.paymentModeId);
    const id = await this.prisma.$transaction(async (tx) => {
      const number = await this.numberSeries.next(tx, 'payment_made', async (candidate) =>
        (await tx.paymentMade.findUnique({ where: { number: candidate }, select: { id: true } })) !== null,
      );
      const payment = await tx.paymentMade.create({
        data: { number, ...this.paymentData(input), createdById: getRequestContext()?.userId ?? null },
      });
      await this.allocate(tx, payment, input.allocations);
      await this.audit.record(
        { action: 'created', entityType: 'payment_made', entityId: payment.id, summary: `Payment ${number} of ${money(input.amount)} made to ${vendor.displayName}` },
        tx,
      );
      return payment.id;
    });
    return this.get(id);
  }

  async update(id: string, input: PaymentMadeOutput): Promise<PaymentMadeDto> {
    const before = await this.find(id);
    if (input.vendorId !== before.vendorId) await this.requireVendor(input.vendorId);
    await this.requirePaymentMode(input.paymentModeId);
    const needed = input.allocations
      .reduce<Decimal>((total, allocation) => total.plus(toDecimal(allocation.amount)), toDecimal(0))
      .plus(toDecimal(before.amountRefunded));
    if (needed.gt(toDecimal(input.amount))) {
      throw fieldError('AMOUNT_TOO_LOW', 'amount', `The amount must cover the ${money(needed)} applied to bills and refunded`);
    }
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const previous = await tx.billPaymentAllocation.findMany({ where: { paymentId: id }, select: { billId: true } });
      await tx.billPaymentAllocation.deleteMany({ where: { paymentId: id } });
      // Release the old allocations first so the new ones are checked against the true balances.
      await this.bills.refreshBalances(tx, previous.map((allocation) => allocation.billId));
      const payment = await tx.paymentMade.update({ where: { id }, data: this.paymentData(input) });
      await this.allocate(tx, payment, input.allocations);

      const after = await tx.paymentMade.findUniqueOrThrow({ where: { id }, include: PAYMENT_INCLUDE });
      const changes = diffRecords(auditSnapshot(before), auditSnapshot(after));
      if (changes) {
        await this.audit.record(
          { action: 'updated', entityType: 'payment_made', entityId: id, summary: `Payment ${payment.number} updated`, changes },
          tx,
        );
      }
    });
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const payment = await this.find(id);
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const allocations = await tx.billPaymentAllocation.findMany({ where: { paymentId: id }, select: { billId: true } });
      await tx.paymentMade.delete({ where: { id } });
      await this.bills.refreshBalances(tx, allocations.map((allocation) => allocation.billId));
      await this.audit.record(
        {
          action: 'deleted',
          entityType: 'payment_made',
          entityId: id,
          summary: `Payment ${payment.number} of ${money(payment.amount)} to ${payment.vendor.displayName} deleted`,
        },
        tx,
      );
    });
  }

  /** Records money the vendor gave back from the unused part of a payment. */
  async addRefund(id: string, input: PaymentRefundOutput): Promise<PaymentMadeDto> {
    await this.requirePaymentMode(input.paymentModeId);
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const payment = await tx.paymentMade.findUniqueOrThrow({ where: { id } });
      const unused = unusedOf(payment);
      if (toDecimal(input.amount).gt(unused)) {
        throw fieldError('EXCEEDS_UNUSED', 'amount', `Only ${money(unused)} of this payment is unused`);
      }
      await tx.paymentMadeRefund.create({
        data: {
          paymentId: id,
          refundDate: fromDateOnly(input.refundDate),
          amount: input.amount,
          paymentModeId: input.paymentModeId,
          referenceNumber: input.referenceNumber,
          notes: input.notes,
          createdById: getRequestContext()?.userId ?? null,
        },
      });
      await this.refreshPayment(tx, id);
      await this.audit.record(
        { action: 'refunded', entityType: 'payment_made', entityId: id, summary: `${money(input.amount)} of payment ${payment.number} refunded by the vendor` },
        tx,
      );
    });
    return this.get(id);
  }

  async removeRefund(id: string, refundId: string): Promise<PaymentMadeDto> {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const refund = await tx.paymentMadeRefund.findFirst({ where: { id: refundId, paymentId: id }, include: { payment: true } });
      if (!refund) throw notFound('Refund');
      await tx.paymentMadeRefund.delete({ where: { id: refundId } });
      await this.refreshPayment(tx, id);
      await this.audit.record(
        { action: 'updated', entityType: 'payment_made', entityId: id, summary: `Refund of ${money(refund.amount)} on payment ${refund.payment.number} deleted` },
        tx,
      );
    });
    return this.get(id);
  }

  /** Unused payments made to the bill's vendor, oldest first. */
  async availableCredits(billId: string): Promise<BillAvailableCreditsDto> {
    const bill = await this.prisma.bill.findUnique({ where: { id: billId }, select: { vendorId: true } });
    if (!bill) throw notFound('Bill');
    const payments = await this.prisma.paymentMade.findMany({
      where: { vendorId: bill.vendorId },
      orderBy: [{ paymentDate: 'asc' }, { number: 'asc' }],
    });
    const available = payments.map((payment) => ({ payment, unused: unusedOf(payment) })).filter(({ unused }) => unused.gt(0));
    return {
      payments: available.map(({ payment, unused }) => ({
        id: payment.id,
        number: payment.number,
        paymentDate: toDateOnly(payment.paymentDate),
        unusedAmount: money(unused),
      })),
      total: money(available.reduce<Decimal>((total, { unused }) => total.plus(unused), toDecimal(0))),
    };
  }

  /** Uses unused payments made on a bill, without editing each payment. */
  async applyCredits(billId: string, input: ApplyBillCreditsOutput): Promise<BillDto> {
    const requested = input.payments.reduce<Decimal>((total, entry) => total.plus(toDecimal(entry.amount)), toDecimal(0));
    await this.prisma.$transaction(async (tx) => {
      // Lock payments before the bill, the same order payment edits use.
      const ordered = input.payments.map((entry, index) => ({ ...entry, index })).sort((a, b) => a.paymentId.localeCompare(b.paymentId));
      for (const entry of ordered) await this.lock(tx, entry.paymentId);

      const bill = await this.bills.lockForPayment(tx, billId);
      if (!bill) throw notFound('Bill');
      if (bill.status === 'void') throw conflict('BILL_VOID', 'Credits cannot be applied to a void bill');
      if (requested.gt(toDecimal(bill.balanceDue))) {
        throw fieldError('EXCEEDS_BALANCE', 'payments', `Only ${money(bill.balanceDue)} is due on bill ${bill.billNumber}`);
      }

      for (const entry of ordered) {
        const payment = await tx.paymentMade.findUniqueOrThrow({ where: { id: entry.paymentId } });
        if (payment.vendorId !== bill.vendorId) {
          throw fieldError('PAYMENT_NOT_AVAILABLE', `payments.${entry.index}.paymentId`, "This payment is not to the bill's vendor");
        }
        const unused = unusedOf(payment);
        if (toDecimal(entry.amount).gt(unused)) {
          throw fieldError('EXCEEDS_UNUSED', `payments.${entry.index}.amount`, `Only ${money(unused)} of payment ${payment.number} is unused`);
        }
        const existing = await tx.billPaymentAllocation.findUnique({ where: { paymentId_billId: { paymentId: payment.id, billId } } });
        if (existing) {
          await tx.billPaymentAllocation.update({
            where: { id: existing.id },
            data: { amount: toDecimal(existing.amount).plus(toDecimal(entry.amount)).toFixed(2) },
          });
        } else {
          await tx.billPaymentAllocation.create({ data: { paymentId: payment.id, billId, amount: entry.amount } });
        }
        await this.refreshPayment(tx, payment.id);
        await this.audit.record(
          { action: 'applied', entityType: 'payment_made', entityId: payment.id, summary: `${money(entry.amount)} of payment ${payment.number} applied to bill ${bill.billNumber}` },
          tx,
        );
      }
      await this.bills.refreshBalances(tx, [billId]);
      await this.audit.record(
        { action: 'credits_applied', entityType: 'bill', entityId: billId, summary: `${money(requested)} of earlier payments applied to bill ${bill.billNumber}` },
        tx,
      );
    });
    return this.bills.get(billId);
  }

  async history(id: string): Promise<AuditLogDto[]> {
    await this.find(id);
    return this.audit.history('payment_made', id);
  }

  private async allocate(tx: Tx, payment: { id: string; vendorId: string }, allocations: PaymentMadeOutput['allocations']): Promise<void> {
    const ordered = allocations.map((allocation, index) => ({ ...allocation, index })).sort((a, b) => a.billId.localeCompare(b.billId));
    for (const allocation of ordered) {
      const bill = await this.bills.lockForPayment(tx, allocation.billId);
      const path = `allocations.${allocation.index}`;
      if (!bill || bill.vendorId !== payment.vendorId) {
        throw fieldError('BILL_NOT_AVAILABLE', `${path}.billId`, "This bill is not one of the vendor's bills");
      }
      if (bill.status === 'void') throw fieldError('BILL_VOID', `${path}.billId`, `Bill ${bill.billNumber} is void`);
      if (toDecimal(allocation.amount).gt(toDecimal(bill.balanceDue))) {
        throw fieldError('EXCEEDS_BALANCE', `${path}.amount`, `Only ${money(bill.balanceDue)} is due on bill ${bill.billNumber}`);
      }
    }
    if (allocations.length > 0) {
      await tx.billPaymentAllocation.createMany({
        data: allocations.map((allocation) => ({ paymentId: payment.id, billId: allocation.billId, amount: allocation.amount })),
      });
      await this.bills.refreshBalances(tx, allocations.map((allocation) => allocation.billId));
    }
    await this.refreshPayment(tx, payment.id);
  }

  /** Keeps a payment's applied and refunded totals in step with its allocations and refunds. */
  private async refreshPayment(tx: Tx, id: string): Promise<void> {
    const [allocated, refunded, payment] = await Promise.all([
      tx.billPaymentAllocation.aggregate({ where: { paymentId: id }, _sum: { amount: true } }),
      tx.paymentMadeRefund.aggregate({ where: { paymentId: id }, _sum: { amount: true } }),
      tx.paymentMade.findUniqueOrThrow({ where: { id }, select: { amount: true } }),
    ]);
    const applied = toDecimal(allocated._sum.amount);
    const refundedTotal = toDecimal(refunded._sum.amount);
    if (applied.plus(refundedTotal).gt(toDecimal(payment.amount))) {
      throw fieldError('AMOUNT_TOO_LOW', 'amount', 'The payment is not large enough for what has been applied and refunded');
    }
    await tx.paymentMade.update({ where: { id }, data: { amountApplied: applied.toFixed(2), amountRefunded: refundedTotal.toFixed(2) } });
  }

  private async lock(tx: Tx, id: string): Promise<void> {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM payments_made WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) throw notFound('Payment');
  }

  private paymentData(input: PaymentMadeOutput) {
    return {
      vendorId: input.vendorId,
      paymentDate: fromDateOnly(input.paymentDate),
      amount: input.amount,
      paymentModeId: input.paymentModeId,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
    };
  }

  private async requireVendor(id: string) {
    const vendor = await this.prisma.contact.findFirst({ where: { id, type: 'vendor', isActive: true }, select: { id: true, displayName: true } });
    if (!vendor) throw fieldError('VENDOR_NOT_AVAILABLE', 'vendorId', 'Select an active vendor');
    return vendor;
  }

  private async requirePaymentMode(id: string | null): Promise<void> {
    if (id && !(await this.prisma.paymentMode.findUnique({ where: { id }, select: { id: true } }))) {
      throw fieldError('PAYMENT_MODE_NOT_FOUND', 'paymentModeId', 'Select a valid payment mode');
    }
  }

  private async find(id: string): Promise<PaymentDetail> {
    const payment = await this.prisma.paymentMade.findUnique({ where: { id }, include: PAYMENT_INCLUDE });
    if (!payment) throw notFound('Payment');
    return payment;
  }
}
