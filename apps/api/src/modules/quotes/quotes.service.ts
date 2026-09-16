import { Injectable } from '@nestjs/common';
import {
  addDays,
  canPerformQuoteAction,
  getQuoteDisplayStatus,
  STATUS_LABELS,
  todayInTimeZone,
  type AuditLogDto,
  type Paginated,
  type QuoteAction,
  type QuoteDto,
  type QuoteListItemDto,
  type QuoteListQuery,
  type QuoteOutput,
  type QuoteStatus,
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
  toDateOnlyOrNull,
  toIso,
  toIsoOrNull,
} from '../../common/serialize.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../prisma/prisma.service.js';
import {
  DocumentLinesService,
  taxBreakdownFromLines,
  toDocumentCustomer,
  toDocumentLineDto,
  type PreparedDocument,
} from '../documents/document-lines.service.js';
import { NumberSeriesService } from '../settings/number-series.service.js';
import { OrganizationService } from '../settings/organization.service.js';

const QUOTE_INCLUDE = {
  lines: { orderBy: { position: 'asc' } },
  customer: { include: { addresses: true } },
  createdBy: { select: { id: true, name: true } },
  invoice: { select: { id: true, number: true } },
} satisfies Prisma.QuoteInclude;

type QuoteDetail = Prisma.QuoteGetPayload<{ include: typeof QUOTE_INCLUDE }>;

const TRANSITIONS: Record<
  'markSent' | 'accept' | 'decline',
  { to: QuoteStatus; stamp: 'sentAt' | 'acceptedAt' | 'declinedAt'; verb: string }
> = {
  markSent: { to: 'sent', stamp: 'sentAt', verb: 'marked as sent' },
  accept: { to: 'accepted', stamp: 'acceptedAt', verb: 'marked as accepted' },
  decline: { to: 'declined', stamp: 'declinedAt', verb: 'marked as declined' },
};

function toQuoteDto(quote: QuoteDetail, today: string): QuoteDto {
  const expiryDate = toDateOnlyOrNull(quote.expiryDate);
  return {
    id: quote.id,
    number: quote.number,
    quoteDate: toDateOnly(quote.quoteDate),
    expiryDate,
    referenceNumber: quote.referenceNumber,
    status: quote.status,
    displayStatus: getQuoteDisplayStatus(quote.status, expiryDate, today),
    subject: quote.subject,
    subtotal: money(quote.subtotal),
    discountTotal: money(quote.discountTotal),
    taxTotal: money(quote.taxTotal),
    taxBreakdown: taxBreakdownFromLines(quote.lines),
    shippingCharge: money(quote.shippingCharge),
    adjustment: money(quote.adjustment),
    total: money(quote.total),
    customerNotes: quote.customerNotes,
    terms: quote.terms,
    lines: quote.lines.map(toDocumentLineDto),
    customer: toDocumentCustomer(quote.customer),
    sentAt: toIsoOrNull(quote.sentAt),
    acceptedAt: toIsoOrNull(quote.acceptedAt),
    declinedAt: toIsoOrNull(quote.declinedAt),
    invoice: quote.invoice,
    createdBy: quote.createdBy,
    createdAt: toIso(quote.createdAt),
    updatedAt: toIso(quote.updatedAt),
  };
}

function auditSnapshot(quote: QuoteDetail): Record<string, unknown> {
  return {
    customer: quote.customer.displayName,
    quoteDate: toDateOnly(quote.quoteDate),
    expiryDate: toDateOnlyOrNull(quote.expiryDate),
    referenceNumber: quote.referenceNumber,
    subject: quote.subject,
    lines: quote.lines.map((line) => `${quantity(line.quantity)} × ${line.name} @ ${money(line.rate)} = ${money(line.amount)}`),
    shippingCharge: money(quote.shippingCharge),
    adjustment: money(quote.adjustment),
    total: money(quote.total),
    customerNotes: quote.customerNotes,
    terms: quote.terms,
  };
}

function totalsData(prepared: PreparedDocument) {
  const { totals } = prepared;
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
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numberSeries: NumberSeriesService,
    private readonly documentLines: DocumentLinesService,
    private readonly organization: OrganizationService,
  ) {}

  async list(query: QuoteListQuery): Promise<Paginated<QuoteListItemDto>> {
    const today = await this.today();
    const where = this.where(query, today);
    const orderBy = parseSort<Prisma.QuoteOrderByWithRelationInput>(
      query.sort,
      {
        date: (sort) => ({ quoteDate: sort }),
        number: (sort) => ({ number: sort }),
        customer: (sort) => ({ customer: { displayName: sort } }),
        expiryDate: (sort) => ({ expiryDate: { sort, nulls: 'last' } }),
        total: (sort) => ({ total: sort }),
        status: (sort) => ({ status: sort }),
      },
      '-date',
    );

    const [rows, total] = await Promise.all([
      this.prisma.quote.findMany({
        where,
        include: { customer: { select: { id: true, displayName: true } } },
        orderBy: [orderBy, { number: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.quote.count({ where }),
    ]);

    return paginated(
      rows.map((row) => {
        const expiryDate = toDateOnlyOrNull(row.expiryDate);
        return {
          id: row.id,
          number: row.number,
          quoteDate: toDateOnly(row.quoteDate),
          expiryDate,
          referenceNumber: row.referenceNumber,
          status: row.status,
          displayStatus: getQuoteDisplayStatus(row.status, expiryDate, today),
          total: money(row.total),
          customer: row.customer,
        };
      }),
      total,
      query,
    );
  }

  /** Counts for the status tabs, using every filter except the status itself. */
  async statusCounts(query: QuoteListQuery): Promise<StatusCountsDto> {
    const today = await this.today();
    const where = this.where({ ...query, status: 'all' }, today);
    const [grouped, expired] = await Promise.all([
      this.prisma.quote.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.quote.count({ where: { AND: [where, this.statusWhere('expired', today)] } }),
    ]);

    const counts: StatusCountsDto = { all: 0, draft: 0, sent: 0, expired, accepted: 0, declined: 0, invoiced: 0 };
    for (const row of grouped) {
      counts[row.status] = row._count._all;
      counts['all'] = (counts['all'] ?? 0) + row._count._all;
    }
    counts['sent'] = (counts['sent'] ?? 0) - expired;
    return counts;
  }

  async get(id: string): Promise<QuoteDto> {
    return toQuoteDto(await this.find(id), await this.today());
  }

  create(input: QuoteOutput): Promise<QuoteDto> {
    return this.insert(input);
  }

  async update(id: string, input: QuoteOutput): Promise<QuoteDto> {
    const before = await this.find(id);
    this.assertAllowed('edit', before.status);
    if (input.customerId !== before.customerId) await this.requireCustomer(input.customerId);

    await this.prisma.$transaction(async (tx) => {
      const prepared = await this.documentLines.prepare(input, tx);
      const markSent = input.saveAs === 'sent' && before.status === 'draft';
      await tx.quoteLine.deleteMany({ where: { quoteId: id } });
      const updated = await tx.quote.update({
        where: { id },
        data: {
          ...this.headerData(input),
          ...totalsData(prepared),
          ...(markSent ? { status: 'sent', sentAt: new Date() } : {}),
          lines: { create: prepared.lines },
        },
        include: QUOTE_INCLUDE,
      });

      const changes = diffRecords(auditSnapshot(before), auditSnapshot(updated));
      if (markSent) Object.assign(changes ?? {}, { status: { from: 'draft', to: 'sent' } });
      if (changes || markSent) {
        await this.audit.record(
          {
            action: 'updated',
            entityType: 'quote',
            entityId: id,
            summary: `Quote ${updated.number} updated${markSent ? ' and marked as sent' : ''}`,
            changes: changes ?? { status: { from: 'draft', to: 'sent' } },
          },
          tx,
        );
      }
    });
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const quote = await this.find(id);
    this.assertAllowed('delete', quote.status);
    await this.prisma.quote.delete({ where: { id } });
    await this.audit.record({
      action: 'deleted',
      entityType: 'quote',
      entityId: id,
      summary: `Quote ${quote.number} for ${quote.customer.displayName} deleted`,
    });
  }

  markSent(id: string): Promise<QuoteDto> {
    return this.transition(id, 'markSent');
  }

  accept(id: string): Promise<QuoteDto> {
    return this.transition(id, 'accept');
  }

  decline(id: string): Promise<QuoteDto> {
    return this.transition(id, 'decline');
  }

  /** Copies a quote into a new draft dated today, keeping the same validity period. */
  async clone(id: string): Promise<QuoteDto> {
    const source = await this.find(id);
    const today = await this.today();
    const validityDays = source.expiryDate
      ? Math.round((source.expiryDate.getTime() - source.quoteDate.getTime()) / 86_400_000)
      : null;

    return this.insert(
      {
        customerId: source.customerId,
        quoteDate: today,
        expiryDate: validityDays === null ? null : addDays(today, validityDays),
        referenceNumber: source.referenceNumber,
        subject: source.subject,
        customerNotes: source.customerNotes,
        terms: source.terms,
        shippingCharge: money(source.shippingCharge),
        adjustment: money(source.adjustment),
        saveAs: 'draft',
        lines: source.lines.map((line) => ({
          itemId: line.itemId,
          name: line.name,
          description: line.description,
          quantity: quantity(line.quantity),
          unit: line.unit,
          rate: money(line.rate),
          discountType: line.discountType,
          discountValue: money(line.discountValue),
          taxId: line.taxId,
        })),
      },
      `cloned from ${source.number}`,
    );
  }

  async history(id: string): Promise<AuditLogDto[]> {
    await this.find(id);
    return this.audit.history('quote', id);
  }

  private async insert(input: QuoteOutput, origin?: string): Promise<QuoteDto> {
    const customer = await this.requireCustomer(input.customerId);
    const markSent = input.saveAs === 'sent';

    const id = await this.prisma.$transaction(async (tx) => {
      const prepared = await this.documentLines.prepare(input, tx);
      const number = await this.numberSeries.next(tx, 'quote', (candidate) => this.numberTaken(tx, candidate));
      const quote = await tx.quote.create({
        data: {
          number,
          ...this.headerData(input),
          ...totalsData(prepared),
          status: markSent ? 'sent' : 'draft',
          sentAt: markSent ? new Date() : null,
          createdById: getRequestContext()?.userId ?? null,
          lines: { create: prepared.lines },
        },
      });
      const details = [origin, markSent ? 'marked as sent' : null].filter(Boolean).join(', ');
      await this.audit.record(
        {
          action: 'created',
          entityType: 'quote',
          entityId: quote.id,
          summary: `Quote ${number} for ${customer.displayName} created${details ? ` (${details})` : ''}`,
        },
        tx,
      );
      return quote.id;
    });
    return this.get(id);
  }

  private async transition(id: string, action: keyof typeof TRANSITIONS): Promise<QuoteDto> {
    const quote = await this.find(id);
    this.assertAllowed(action, quote.status);
    const { to, stamp, verb } = TRANSITIONS[action];

    // Guard against a concurrent change between reading and writing.
    const { count } = await this.prisma.quote.updateMany({
      where: { id, status: quote.status },
      data: { status: to, [stamp]: new Date() },
    });
    if (count === 0) {
      throw conflict('QUOTE_CHANGED', 'This quote was changed by someone else. Refresh and try again.');
    }
    await this.audit.record({
      action: 'status_changed',
      entityType: 'quote',
      entityId: id,
      summary: `Quote ${quote.number} ${verb}`,
      changes: { status: { from: quote.status, to } },
    });
    return this.get(id);
  }

  private assertAllowed(action: QuoteAction, status: QuoteStatus): void {
    if (!canPerformQuoteAction(action, status)) {
      const verbs: Record<QuoteAction, string> = {
        edit: 'edited',
        delete: 'deleted',
        markSent: 'marked as sent',
        accept: 'accepted',
        decline: 'declined',
        convert: 'converted to an invoice',
      };
      throw conflict(
        'INVALID_QUOTE_STATUS',
        `A quote that is ${STATUS_LABELS[status]?.toLowerCase() ?? status} cannot be ${verbs[action]}`,
      );
    }
  }

  private headerData(input: QuoteOutput) {
    return {
      customerId: input.customerId,
      quoteDate: fromDateOnly(input.quoteDate),
      expiryDate: input.expiryDate ? fromDateOnly(input.expiryDate) : null,
      referenceNumber: input.referenceNumber,
      subject: input.subject,
      customerNotes: input.customerNotes,
      terms: input.terms,
    };
  }

  private where(query: QuoteListQuery, today: string): Prisma.QuoteWhereInput {
    const and: Prisma.QuoteWhereInput[] = [];
    if (query.customerId) and.push({ customerId: query.customerId });
    if (query.dateFrom) and.push({ quoteDate: { gte: fromDateOnly(query.dateFrom) } });
    if (query.dateTo) and.push({ quoteDate: { lte: fromDateOnly(query.dateTo) } });
    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' as const };
      and.push({
        OR: [
          { number: contains },
          { referenceNumber: contains },
          { subject: contains },
          { customer: { displayName: contains } },
        ],
      });
    }
    if (query.status !== 'all') and.push(this.statusWhere(query.status, today));
    return { AND: and };
  }

  private statusWhere(status: string, today: string): Prisma.QuoteWhereInput {
    const todayDate = fromDateOnly(today);
    if (status === 'expired') return { status: 'sent', expiryDate: { lt: todayDate } };
    if (status === 'sent') return { status: 'sent', OR: [{ expiryDate: null }, { expiryDate: { gte: todayDate } }] };
    return { status: status as QuoteStatus };
  }

  private async requireCustomer(id: string) {
    const customer = await this.prisma.contact.findFirst({
      where: { id, type: 'customer', isActive: true },
      select: { id: true, displayName: true },
    });
    if (!customer) throw fieldError('CUSTOMER_NOT_AVAILABLE', 'customerId', 'Select an active customer');
    return customer;
  }

  private async numberTaken(tx: Tx, number: string): Promise<boolean> {
    return (await tx.quote.findUnique({ where: { number }, select: { id: true } })) !== null;
  }

  private async find(id: string): Promise<QuoteDetail> {
    const quote = await this.prisma.quote.findUnique({ where: { id }, include: QUOTE_INCLUDE });
    if (!quote) throw notFound('Quote');
    return quote;
  }

  private async today(): Promise<string> {
    return todayInTimeZone(await this.organization.timezone());
  }
}
