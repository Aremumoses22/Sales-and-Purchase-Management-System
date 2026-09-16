import { Injectable } from '@nestjs/common';
import {
  getInvoiceDisplayStatus,
  todayInTimeZone,
  toDecimal,
  type ApplyCreditsOutput,
  type AuditLogDto,
  type AvailableCreditsDto,
  type Decimal,
  type InvoiceDto,
  type NumericInput,
  type OpenInvoiceDto,
  type OpenInvoicesQuery,
  type Paginated,
  type PaymentListQuery,
  type PaymentReceivedDto,
  type PaymentReceivedListItemDto,
  type PaymentReceivedOutput,
  type PaymentRefundOutput,
} from '@spms/shared';
import { AuditService } from '../../audit/audit.service.js';
import { diffRecords } from '../../audit/diff.js';
import { conflict, fieldError, notFound } from '../../common/app-exception.js';
import { pageArgs, paginated, parseSort } from '../../common/pagination.js';
import { getRequestContext } from '../../common/request-context.js';
import { fromDateOnly, money, toDateOnly, toIso } from '../../common/serialize.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../prisma/prisma.service.js';
import { CreditNotesService } from '../credit-notes/credit-notes.service.js';
import { toDocumentCustomer } from '../documents/document-lines.service.js';
import { InvoicesService } from '../invoices/invoices.service.js';
import { NumberSeriesService } from '../settings/number-series.service.js';
import { OrganizationService } from '../settings/organization.service.js';

const PAYMENT_INCLUDE = {
  customer: { include: { addresses: true } },
  paymentMode: { select: { id: true, name: true } },
  allocations: {
    include: { invoice: { select: { id: true, number: true, invoiceDate: true, total: true, balanceDue: true } } },
    orderBy: { createdAt: 'asc' },
  },
  refunds: { include: { paymentMode: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.PaymentReceivedInclude;

type PaymentDetail = Prisma.PaymentReceivedGetPayload<{ include: typeof PAYMENT_INCLUDE }>;

interface PaymentAmounts {
  amount: NumericInput;
  amountApplied: NumericInput;
  amountRefunded: NumericInput;
}

function unusedOf(payment: PaymentAmounts): Decimal {
  return toDecimal(payment.amount).minus(toDecimal(payment.amountApplied)).minus(toDecimal(payment.amountRefunded));
}

function toPaymentDto(payment: PaymentDetail): PaymentReceivedDto {
  return {
    id: payment.id,
    number: payment.number,
    paymentDate: toDateOnly(payment.paymentDate),
    referenceNumber: payment.referenceNumber,
    paymentMode: payment.paymentMode,
    amount: money(payment.amount),
    bankCharges: money(payment.bankCharges),
    notes: payment.notes,
    amountApplied: money(payment.amountApplied),
    amountRefunded: money(payment.amountRefunded),
    unusedAmount: money(unusedOf(payment)),
    allocations: payment.allocations.map((allocation) => ({
      id: allocation.id,
      amount: money(allocation.amount),
      invoice: {
        id: allocation.invoice.id,
        number: allocation.invoice.number,
        invoiceDate: toDateOnly(allocation.invoice.invoiceDate),
        total: money(allocation.invoice.total),
        balanceDue: money(allocation.invoice.balanceDue),
      },
    })),
    refunds: payment.refunds.map((refund) => ({
      id: refund.id,
      refundDate: toDateOnly(refund.refundDate),
      amount: money(refund.amount),
      paymentMode: refund.paymentMode,
      referenceNumber: refund.referenceNumber,
      notes: refund.notes,
      createdAt: toIso(refund.createdAt),
    })),
    customer: toDocumentCustomer(payment.customer),
    createdBy: payment.createdBy,
    createdAt: toIso(payment.createdAt),
    updatedAt: toIso(payment.updatedAt),
  };
}

function auditSnapshot(payment: PaymentDetail): Record<string, unknown> {
  return {
    customer: payment.customer.displayName,
    paymentDate: toDateOnly(payment.paymentDate),
    amount: money(payment.amount),
    bankCharges: money(payment.bankCharges),
    paymentMode: payment.paymentMode?.name ?? null,
    referenceNumber: payment.referenceNumber,
    notes: payment.notes,
    appliedTo: payment.allocations.map((allocation) => `${allocation.invoice.number}: ${money(allocation.amount)}`),
  };
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numberSeries: NumberSeriesService,
    private readonly organization: OrganizationService,
    private readonly invoices: InvoicesService,
    private readonly creditNotes: CreditNotesService,
  ) {}

  async list(query: PaymentListQuery): Promise<Paginated<PaymentReceivedListItemDto>> {
    const and: Prisma.PaymentReceivedWhereInput[] = [];
    if (query.customerId) and.push({ customerId: query.customerId });
    if (query.paymentModeId) and.push({ paymentModeId: query.paymentModeId });
    if (query.dateFrom) and.push({ paymentDate: { gte: fromDateOnly(query.dateFrom) } });
    if (query.dateTo) and.push({ paymentDate: { lte: fromDateOnly(query.dateTo) } });
    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' as const };
      and.push({ OR: [{ number: contains }, { referenceNumber: contains }, { customer: { displayName: contains } }] });
    }
    const where = { AND: and };
    const orderBy = parseSort<Prisma.PaymentReceivedOrderByWithRelationInput>(
      query.sort,
      {
        date: (sort) => ({ paymentDate: sort }),
        number: (sort) => ({ number: sort }),
        customer: (sort) => ({ customer: { displayName: sort } }),
        amount: (sort) => ({ amount: sort }),
      },
      '-date',
    );

    const [rows, total] = await Promise.all([
      this.prisma.paymentReceived.findMany({
        where,
        include: {
          customer: { select: { id: true, displayName: true } },
          paymentMode: { select: { id: true, name: true } },
        },
        orderBy: [orderBy, { number: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.paymentReceived.count({ where }),
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
        customer: row.customer,
      })),
      total,
      query,
    );
  }

  async get(id: string): Promise<PaymentReceivedDto> {
    return toPaymentDto(await this.find(id));
  }

  /** Invoices a payment can go to, oldest first; when editing, the payment's own share counts as available. */
  async openInvoices(query: OpenInvoicesQuery): Promise<OpenInvoiceDto[]> {
    const today = todayInTimeZone(await this.organization.timezone());
    const rows = await this.prisma.invoice.findMany({
      where: {
        customerId: query.customerId,
        status: { in: ['draft', 'sent'] },
        OR: [
          { balanceDue: { gt: 0 } },
          ...(query.paymentId ? [{ allocations: { some: { paymentId: query.paymentId } } }] : []),
        ],
      },
      include: {
        allocations: { where: query.paymentId ? { paymentId: query.paymentId } : { id: { in: [] } } },
      },
      orderBy: [{ invoiceDate: 'asc' }, { number: 'asc' }],
    });

    return rows.map((row) => {
      const allocated = toDecimal(row.allocations[0]?.amount);
      return {
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
        balanceDue: money(toDecimal(row.balanceDue).plus(allocated)),
        allocated: money(allocated),
      };
    });
  }

  async create(input: PaymentReceivedOutput): Promise<PaymentReceivedDto> {
    const customer = await this.requireCustomer(input.customerId);
    await this.requirePaymentMode(input.paymentModeId);

    const id = await this.prisma.$transaction(async (tx) => {
      const number = await this.numberSeries.next(tx, 'payment_received', async (candidate) =>
        (await tx.paymentReceived.findUnique({ where: { number: candidate }, select: { id: true } })) !== null,
      );
      const payment = await tx.paymentReceived.create({
        data: { number, ...this.paymentData(input), createdById: getRequestContext()?.userId ?? null },
      });
      await this.allocate(tx, payment, input.allocations);
      await this.audit.record(
        {
          action: 'created',
          entityType: 'payment_received',
          entityId: payment.id,
          summary: `Payment ${number} of ${money(input.amount)} received from ${customer.displayName}`,
        },
        tx,
      );
      return payment.id;
    });
    return this.get(id);
  }

  async update(id: string, input: PaymentReceivedOutput): Promise<PaymentReceivedDto> {
    const before = await this.find(id);
    if (input.customerId !== before.customerId) await this.requireCustomer(input.customerId);
    await this.requirePaymentMode(input.paymentModeId);

    const applied = input.allocations.reduce<Decimal>((sum, allocation) => sum.plus(toDecimal(allocation.amount)), toDecimal(0));
    const needed = applied.plus(toDecimal(before.amountRefunded));
    if (needed.gt(toDecimal(input.amount))) {
      throw fieldError(
        'AMOUNT_TOO_LOW',
        'amount',
        `The amount must cover the ${money(needed)} applied to invoices and refunded`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.lockPayment(tx, id);
      const previous = await tx.paymentAllocation.findMany({ where: { paymentId: id }, select: { invoiceId: true } });
      await tx.paymentAllocation.deleteMany({ where: { paymentId: id } });
      // Release the old allocations first so the new ones are checked against the true balances.
      await this.invoices.refreshBalances(tx, previous.map((allocation) => allocation.invoiceId));

      const payment = await tx.paymentReceived.update({ where: { id }, data: this.paymentData(input) });
      await this.allocate(tx, payment, input.allocations);

      const after = await tx.paymentReceived.findUniqueOrThrow({ where: { id }, include: PAYMENT_INCLUDE });
      const changes = diffRecords(auditSnapshot(before), auditSnapshot(after));
      if (changes) {
        await this.audit.record(
          { action: 'updated', entityType: 'payment_received', entityId: id, summary: `Payment ${payment.number} updated`, changes },
          tx,
        );
      }
    });
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const payment = await this.find(id);
    await this.prisma.$transaction(async (tx) => {
      await this.lockPayment(tx, id);
      const allocations = await tx.paymentAllocation.findMany({ where: { paymentId: id }, select: { invoiceId: true } });
      await tx.paymentReceived.delete({ where: { id } });
      await this.invoices.refreshBalances(tx, allocations.map((allocation) => allocation.invoiceId));
      await this.audit.record(
        {
          action: 'deleted',
          entityType: 'payment_received',
          entityId: id,
          summary: `Payment ${payment.number} of ${money(payment.amount)} from ${payment.customer.displayName} deleted`,
        },
        tx,
      );
    });
  }

  async addRefund(id: string, input: PaymentRefundOutput): Promise<PaymentReceivedDto> {
    await this.requirePaymentMode(input.paymentModeId);
    await this.prisma.$transaction(async (tx) => {
      await this.lockPayment(tx, id);
      const payment = await tx.paymentReceived.findUniqueOrThrow({ where: { id } });
      const unused = unusedOf(payment);
      if (toDecimal(input.amount).gt(unused)) {
        throw fieldError('EXCEEDS_UNUSED', 'amount', `Only ${money(unused)} of this payment is unused`);
      }
      await tx.paymentRefund.create({
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
        {
          action: 'refunded',
          entityType: 'payment_received',
          entityId: id,
          summary: `${money(input.amount)} of payment ${payment.number} refunded`,
        },
        tx,
      );
    });
    return this.get(id);
  }

  async removeRefund(id: string, refundId: string): Promise<PaymentReceivedDto> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockPayment(tx, id);
      const refund = await tx.paymentRefund.findFirst({ where: { id: refundId, paymentId: id }, include: { payment: true } });
      if (!refund) throw notFound('Refund');
      await tx.paymentRefund.delete({ where: { id: refundId } });
      await this.refreshPayment(tx, id);
      await this.audit.record(
        {
          action: 'updated',
          entityType: 'payment_received',
          entityId: id,
          summary: `Refund of ${money(refund.amount)} on payment ${refund.payment.number} deleted`,
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** Unused payments and open credit notes of the invoice's customer, ready to apply to this invoice. */
  async availableCredits(invoiceId: string): Promise<AvailableCreditsDto> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId }, select: { customerId: true } });
    if (!invoice) throw notFound('Invoice');
    const [payments, creditNotes] = await Promise.all([
      this.prisma.paymentReceived.findMany({
        where: { customerId: invoice.customerId },
        orderBy: [{ paymentDate: 'asc' }, { number: 'asc' }],
      }),
      this.creditNotes.availableFor(invoice.customerId),
    ]);
    const available = payments
      .map((payment) => ({ payment, unused: unusedOf(payment) }))
      .filter(({ unused }) => unused.gt(0));
    const total = available
      .reduce<Decimal>((sum, { unused }) => sum.plus(unused), toDecimal(0))
      .plus(creditNotes.reduce<Decimal>((sum, creditNote) => sum.plus(toDecimal(creditNote.balance)), toDecimal(0)));
    return {
      payments: available.map(({ payment, unused }) => ({
        id: payment.id,
        number: payment.number,
        paymentDate: toDateOnly(payment.paymentDate),
        unusedAmount: money(unused),
      })),
      creditNotes: creditNotes.map((creditNote) => ({
        id: creditNote.id,
        number: creditNote.number,
        creditNoteDate: toDateOnly(creditNote.creditNoteDate),
        balance: money(creditNote.balance),
      })),
      total: money(total),
    };
  }

  async applyCredits(invoiceId: string, input: ApplyCreditsOutput): Promise<InvoiceDto> {
    const requested = [...input.payments, ...input.creditNotes].reduce<Decimal>(
      (sum, entry) => sum.plus(toDecimal(entry.amount)),
      toDecimal(0),
    );
    const appliedDate = fromDateOnly(todayInTimeZone(await this.organization.timezone()));

    await this.prisma.$transaction(async (tx) => {
      // Lock payments and credit notes before the invoice, the same order payment edits use.
      const ordered = input.payments.map((entry, index) => ({ ...entry, index })).sort((a, b) => a.paymentId.localeCompare(b.paymentId));
      for (const entry of ordered) await this.lockPayment(tx, entry.paymentId);
      const orderedCredits = input.creditNotes
        .map((entry, index) => ({ ...entry, index }))
        .sort((a, b) => a.creditNoteId.localeCompare(b.creditNoteId));
      const lockedCredits = [];
      for (const entry of orderedCredits) {
        const creditNote = await this.creditNotes.lockForApplication(tx, entry.creditNoteId, `creditNotes.${entry.index}.creditNoteId`);
        if (toDecimal(entry.amount).gt(toDecimal(creditNote.balance))) {
          throw fieldError(
            'EXCEEDS_BALANCE',
            `creditNotes.${entry.index}.amount`,
            `Only ${money(creditNote.balance)} is left on credit note ${creditNote.number}`,
          );
        }
        lockedCredits.push({ entry, creditNote });
      }

      const invoice = await this.invoices.lockForPayment(tx, invoiceId);
      if (!invoice) throw notFound('Invoice');
      if (invoice.status === 'void') throw conflict('INVOICE_VOID', 'Credits cannot be applied to a void invoice');
      if (requested.gt(toDecimal(invoice.balanceDue))) {
        throw fieldError('EXCEEDS_BALANCE', 'payments', `Only ${money(invoice.balanceDue)} is due on invoice ${invoice.number}`);
      }

      for (const entry of ordered) {
        const payment = await tx.paymentReceived.findUnique({ where: { id: entry.paymentId } });
        if (!payment || payment.customerId !== invoice.customerId) {
          throw fieldError('PAYMENT_NOT_AVAILABLE', `payments.${entry.index}.paymentId`, "This payment is not from the invoice's customer");
        }
        const unused = unusedOf(payment);
        if (toDecimal(entry.amount).gt(unused)) {
          throw fieldError('EXCEEDS_UNUSED', `payments.${entry.index}.amount`, `Only ${money(unused)} of payment ${payment.number} is unused`);
        }

        const existing = await tx.paymentAllocation.findUnique({
          where: { paymentId_invoiceId: { paymentId: payment.id, invoiceId } },
        });
        if (existing) {
          await tx.paymentAllocation.update({
            where: { id: existing.id },
            data: { amount: toDecimal(existing.amount).plus(toDecimal(entry.amount)).toFixed(2) },
          });
        } else {
          await tx.paymentAllocation.create({ data: { paymentId: payment.id, invoiceId, amount: entry.amount } });
        }
        await this.refreshPayment(tx, payment.id);
        await this.audit.record(
          {
            action: 'applied',
            entityType: 'payment_received',
            entityId: payment.id,
            summary: `${money(entry.amount)} of payment ${payment.number} applied to invoice ${invoice.number}`,
          },
          tx,
        );
      }

      for (const { entry, creditNote } of lockedCredits) {
        await this.creditNotes.addApplication(tx, creditNote, invoice, entry.amount, `creditNotes.${entry.index}`, appliedDate);
      }

      await this.invoices.refreshBalances(tx, [invoiceId]);
      for (const { creditNote } of lockedCredits) await this.creditNotes.refresh(tx, creditNote.id);
      if (ordered.length > 0) {
        const fromPayments = ordered.reduce<Decimal>((sum, entry) => sum.plus(toDecimal(entry.amount)), toDecimal(0));
        await this.audit.record(
          {
            action: 'credits_applied',
            entityType: 'invoice',
            entityId: invoiceId,
            summary: `${money(fromPayments)} of earlier payments applied to invoice ${invoice.number}`,
          },
          tx,
        );
      }
    });
    return this.invoices.get(invoiceId);
  }

  async history(id: string): Promise<AuditLogDto[]> {
    await this.find(id);
    return this.audit.history('payment_received', id);
  }

  /** Applies a payment to invoices after checking each one belongs to the customer and has enough due. */
  private async allocate(
    tx: Tx,
    payment: { id: string; customerId: string },
    allocations: PaymentReceivedOutput['allocations'],
  ): Promise<void> {
    const ordered = allocations.map((allocation, index) => ({ ...allocation, index })).sort((a, b) => a.invoiceId.localeCompare(b.invoiceId));

    for (const allocation of ordered) {
      const invoice = await this.invoices.lockForPayment(tx, allocation.invoiceId);
      const path = `allocations.${allocation.index}`;
      if (!invoice || invoice.customerId !== payment.customerId) {
        throw fieldError('INVOICE_NOT_AVAILABLE', `${path}.invoiceId`, "This invoice is not one of the customer's invoices");
      }
      if (invoice.status === 'void') {
        throw fieldError('INVOICE_VOID', `${path}.invoiceId`, `Invoice ${invoice.number} is void`);
      }
      if (toDecimal(allocation.amount).gt(toDecimal(invoice.balanceDue))) {
        throw fieldError('EXCEEDS_BALANCE', `${path}.amount`, `Only ${money(invoice.balanceDue)} is due on invoice ${invoice.number}`);
      }
    }

    if (allocations.length > 0) {
      await tx.paymentAllocation.createMany({
        data: allocations.map((allocation) => ({
          paymentId: payment.id,
          invoiceId: allocation.invoiceId,
          amount: allocation.amount,
        })),
      });
      await this.invoices.refreshBalances(tx, allocations.map((allocation) => allocation.invoiceId));
    }
    await this.refreshPayment(tx, payment.id);
  }

  /** Keeps a payment's applied and refunded totals in step with its allocations and refunds. */
  private async refreshPayment(tx: Tx, id: string): Promise<void> {
    const [allocated, refunded, payment] = await Promise.all([
      tx.paymentAllocation.aggregate({ where: { paymentId: id }, _sum: { amount: true } }),
      tx.paymentRefund.aggregate({ where: { paymentId: id }, _sum: { amount: true } }),
      tx.paymentReceived.findUniqueOrThrow({ where: { id }, select: { amount: true } }),
    ]);
    const applied = toDecimal(allocated._sum.amount);
    const refundedTotal = toDecimal(refunded._sum.amount);
    if (applied.plus(refundedTotal).gt(toDecimal(payment.amount))) {
      throw fieldError('AMOUNT_TOO_LOW', 'amount', 'The payment is not large enough for what has been applied and refunded');
    }
    await tx.paymentReceived.update({
      where: { id },
      data: { amountApplied: applied.toFixed(2), amountRefunded: refundedTotal.toFixed(2) },
    });
  }

  private async lockPayment(tx: Tx, id: string): Promise<void> {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM payments_received WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) throw notFound('Payment');
  }

  private paymentData(input: PaymentReceivedOutput) {
    return {
      customerId: input.customerId,
      paymentDate: fromDateOnly(input.paymentDate),
      amount: input.amount,
      bankCharges: input.bankCharges,
      paymentModeId: input.paymentModeId,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
    };
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

  private async find(id: string): Promise<PaymentDetail> {
    const payment = await this.prisma.paymentReceived.findUnique({ where: { id }, include: PAYMENT_INCLUDE });
    if (!payment) throw notFound('Payment');
    return payment;
  }
}
