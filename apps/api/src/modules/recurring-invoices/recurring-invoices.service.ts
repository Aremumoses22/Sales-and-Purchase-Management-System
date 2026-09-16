import { Injectable, Logger } from '@nestjs/common';
import {
  addDays,
  firstOccurrenceOnOrAfter,
  getRecurringProfileDisplayStatus,
  occurrenceDate,
  RECURRING_PROFILE_DISPLAY_STATUSES,
  todayInTimeZone,
  type AuditLogDto,
  type InvoiceDto,
  type InvoiceOutput,
  type Paginated,
  type RecurringInvoiceDto,
  type RecurringInvoiceListItemDto,
  type RecurringInvoiceListQuery,
  type RecurringInvoiceOutput,
  type RecurringProfileDisplayStatus,
  type RecurringRunResultDto,
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
import { InvoicesService } from '../invoices/invoices.service.js';
import { OrganizationService } from '../settings/organization.service.js';

const PROFILE_INCLUDE = {
  lines: { orderBy: { position: 'asc' } },
  customer: { include: { addresses: true } },
  paymentTerm: { select: { id: true, name: true, days: true } },
  createdBy: { select: { id: true, name: true } },
  _count: { select: { invoices: true } },
} satisfies Prisma.RecurringInvoiceProfileInclude;

type ProfileDetail = Prisma.RecurringInvoiceProfileGetPayload<{ include: typeof PROFILE_INCLUDE }>;

interface ScheduleFacts {
  status: 'active' | 'stopped';
  endDate: Date | null;
  nextRunDate: Date;
}

function displayStatus(profile: ScheduleFacts): RecurringProfileDisplayStatus {
  return getRecurringProfileDisplayStatus({
    status: profile.status,
    endDate: profile.endDate ? toDateOnly(profile.endDate) : null,
    nextRunDate: toDateOnly(profile.nextRunDate),
  });
}

/** The next invoice date shown to users; none once the profile is stopped or expired. */
function upcomingRun(profile: ScheduleFacts): string | null {
  return displayStatus(profile) === 'active' ? toDateOnly(profile.nextRunDate) : null;
}

function toProfileDto(profile: ProfileDetail): RecurringInvoiceDto {
  return {
    id: profile.id,
    name: profile.name,
    repeatEvery: profile.repeatEvery,
    repeatUnit: profile.repeatUnit,
    startDate: toDateOnly(profile.startDate),
    endDate: profile.endDate ? toDateOnly(profile.endDate) : null,
    nextRunDate: upcomingRun(profile),
    lastRunAt: toIsoOrNull(profile.lastRunAt),
    status: profile.status,
    displayStatus: displayStatus(profile),
    paymentTerm: profile.paymentTerm,
    createAs: profile.createAs,
    orderNumber: profile.orderNumber,
    subject: profile.subject,
    subtotal: money(profile.subtotal),
    discountTotal: money(profile.discountTotal),
    taxTotal: money(profile.taxTotal),
    taxBreakdown: taxBreakdownFromLines(profile.lines),
    shippingCharge: money(profile.shippingCharge),
    adjustment: money(profile.adjustment),
    total: money(profile.total),
    customerNotes: profile.customerNotes,
    terms: profile.terms,
    lines: profile.lines.map(toDocumentLineDto),
    customer: toDocumentCustomer(profile.customer),
    invoiceCount: profile._count.invoices,
    lastError: profile.lastError,
    createdBy: profile.createdBy,
    createdAt: toIso(profile.createdAt),
    updatedAt: toIso(profile.updatedAt),
  };
}

function auditSnapshot(profile: ProfileDetail): Record<string, unknown> {
  return {
    name: profile.name,
    customer: profile.customer.displayName,
    schedule: `every ${profile.repeatEvery} ${profile.repeatUnit}`,
    startDate: toDateOnly(profile.startDate),
    endDate: profile.endDate ? toDateOnly(profile.endDate) : null,
    paymentTerm: profile.paymentTerm?.name ?? null,
    createAs: profile.createAs,
    orderNumber: profile.orderNumber,
    subject: profile.subject,
    lines: profile.lines.map(
      (line) => `${quantity(line.quantity)} × ${line.name} @ ${money(line.rate)} = ${money(line.amount)}`,
    ),
    total: money(profile.total),
    customerNotes: profile.customerNotes,
    terms: profile.terms,
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
export class RecurringInvoicesService {
  private readonly logger = new Logger(RecurringInvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly documentLines: DocumentLinesService,
    private readonly organization: OrganizationService,
    private readonly invoices: InvoicesService,
  ) {}

  async list(query: RecurringInvoiceListQuery): Promise<Paginated<RecurringInvoiceListItemDto>> {
    const where = this.where(query);
    const orderBy = parseSort<Prisma.RecurringInvoiceProfileOrderByWithRelationInput>(
      query.sort,
      {
        name: (sort) => ({ name: sort }),
        customer: (sort) => ({ customer: { displayName: sort } }),
        nextRunDate: (sort) => ({ nextRunDate: sort }),
        total: (sort) => ({ total: sort }),
      },
      'name',
    );

    const [rows, total] = await Promise.all([
      this.prisma.recurringInvoiceProfile.findMany({
        where,
        include: { customer: { select: { id: true, displayName: true } } },
        orderBy: [orderBy, { createdAt: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.recurringInvoiceProfile.count({ where }),
    ]);

    return paginated(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        repeatEvery: row.repeatEvery,
        repeatUnit: row.repeatUnit,
        startDate: toDateOnly(row.startDate),
        endDate: row.endDate ? toDateOnly(row.endDate) : null,
        nextRunDate: upcomingRun(row),
        lastRunAt: toIsoOrNull(row.lastRunAt),
        status: row.status,
        displayStatus: displayStatus(row),
        total: money(row.total),
        customer: row.customer,
      })),
      total,
      query,
    );
  }

  async statusCounts(query: RecurringInvoiceListQuery): Promise<StatusCountsDto> {
    const where = this.where({ ...query, status: 'all' });
    const entries = await Promise.all(
      RECURRING_PROFILE_DISPLAY_STATUSES.map(
        async (status) =>
          [status, await this.prisma.recurringInvoiceProfile.count({ where: { AND: [where, this.statusWhere(status)] } })] as const,
      ),
    );
    const counts: StatusCountsDto = Object.fromEntries(entries);
    counts['all'] = entries.reduce((sum, [, count]) => sum + count, 0);
    return counts;
  }

  async get(id: string): Promise<RecurringInvoiceDto> {
    return toProfileDto(await this.find(id));
  }

  async create(input: RecurringInvoiceOutput): Promise<RecurringInvoiceDto> {
    const customer = await this.requireCustomer(input.customerId);
    await this.requirePaymentTerm(input.paymentTermId);
    const today = await this.today();
    if (input.startDate < today) {
      throw fieldError('START_IN_PAST', 'startDate', 'The start date cannot be earlier than today');
    }

    const id = await this.prisma.$transaction(async (tx) => {
      const prepared = await this.documentLines.prepare(input, tx);
      const profile = await tx.recurringInvoiceProfile.create({
        data: {
          ...this.headerData(input),
          ...totalsData(prepared),
          nextIndex: 0,
          nextRunDate: fromDateOnly(input.startDate),
          createdById: getRequestContext()?.userId ?? null,
          lines: { create: prepared.lines },
        },
      });
      await this.audit.record(
        {
          action: 'created',
          entityType: 'recurring_invoice',
          entityId: profile.id,
          summary: `Recurring invoice profile ${input.name} for ${customer.displayName} created`,
        },
        tx,
      );
      return profile.id;
    });
    return this.get(id);
  }

  async update(id: string, input: RecurringInvoiceOutput): Promise<RecurringInvoiceDto> {
    const before = await this.find(id);
    if (input.customerId !== before.customerId) await this.requireCustomer(input.customerId);
    await this.requirePaymentTerm(input.paymentTermId);
    const today = await this.today();

    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const prepared = await this.documentLines.prepare(input, tx);

      // Keep periods already invoiced; the schedule continues from the first period after the
      // latest one, and never from a date before today.
      const latest = await tx.invoice.findFirst({
        where: { recurringProfileId: id, recurringPeriodDate: { not: null } },
        orderBy: { recurringPeriodDate: 'desc' },
        select: { recurringPeriodDate: true },
      });
      const afterLatest = latest?.recurringPeriodDate ? addDays(toDateOnly(latest.recurringPeriodDate), 1) : input.startDate;
      const from = [afterLatest, today, input.startDate].sort().at(-1) as string;
      const scheduleChanged =
        input.startDate !== toDateOnly(before.startDate) ||
        input.repeatEvery !== before.repeatEvery ||
        input.repeatUnit !== before.repeatUnit;
      const nextIndex = scheduleChanged
        ? firstOccurrenceOnOrAfter(input.startDate, input.repeatUnit, input.repeatEvery, from)
        : before.nextIndex;
      const nextRunDate = scheduleChanged
        ? occurrenceDate(input.startDate, input.repeatUnit, input.repeatEvery, nextIndex)
        : toDateOnly(before.nextRunDate);

      await tx.recurringInvoiceLine.deleteMany({ where: { profileId: id } });
      const updated = await tx.recurringInvoiceProfile.update({
        where: { id },
        data: {
          ...this.headerData(input),
          ...totalsData(prepared),
          nextIndex,
          nextRunDate: fromDateOnly(nextRunDate),
          lines: { create: prepared.lines },
        },
        include: PROFILE_INCLUDE,
      });

      const changes = diffRecords(auditSnapshot(before), auditSnapshot(updated));
      if (changes) {
        await this.audit.record(
          { action: 'updated', entityType: 'recurring_invoice', entityId: id, summary: `Recurring invoice profile ${updated.name} updated`, changes },
          tx,
        );
      }
    });
    return this.get(id);
  }

  /** Deletes the profile; invoices it already created stay, without the link. */
  async remove(id: string): Promise<void> {
    const profile = await this.find(id);
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      await tx.recurringInvoiceProfile.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'deleted',
          entityType: 'recurring_invoice',
          entityId: id,
          summary: `Recurring invoice profile ${profile.name} deleted`,
        },
        tx,
      );
    });
  }

  async stop(id: string): Promise<RecurringInvoiceDto> {
    await this.prisma.$transaction(async (tx) => {
      const profile = await this.lock(tx, id);
      if (profile.status === 'stopped') throw conflict('INVALID_RECURRING_STATUS', 'This profile is already stopped');
      await tx.recurringInvoiceProfile.update({ where: { id }, data: { status: 'stopped' } });
      await this.audit.record(
        {
          action: 'status_changed',
          entityType: 'recurring_invoice',
          entityId: id,
          summary: `Recurring invoice profile ${profile.name} stopped`,
          changes: { status: { from: 'active', to: 'stopped' } },
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** Resumes a stopped profile. Periods missed while it was stopped are skipped, not back-billed. */
  async resume(id: string): Promise<RecurringInvoiceDto> {
    const today = await this.today();
    await this.prisma.$transaction(async (tx) => {
      const profile = await this.lock(tx, id);
      if (profile.status === 'active') throw conflict('INVALID_RECURRING_STATUS', 'This profile is already active');
      const start = toDateOnly(profile.startDate);
      const nextIndex = Math.max(profile.nextIndex, firstOccurrenceOnOrAfter(start, profile.repeatUnit, profile.repeatEvery, today));
      const nextRunDate = occurrenceDate(start, profile.repeatUnit, profile.repeatEvery, nextIndex);
      await tx.recurringInvoiceProfile.update({
        where: { id },
        data: { status: 'active', nextIndex, nextRunDate: fromDateOnly(nextRunDate), lastError: null },
      });
      await this.audit.record(
        {
          action: 'status_changed',
          entityType: 'recurring_invoice',
          entityId: id,
          summary: `Recurring invoice profile ${profile.name} resumed; next invoice on ${nextRunDate}`,
          changes: { status: { from: 'stopped', to: 'active' } },
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** "Create invoice now": an extra invoice dated today that does not move the schedule. */
  async createNow(id: string): Promise<InvoiceDto> {
    const today = await this.today();
    const profile = await this.find(id);
    const created = await this.prisma.$transaction((tx) =>
      this.invoices.createForRecurringProfile(tx, this.invoiceInput(profile, today), {
        profileId: profile.id,
        profileName: profile.name,
        periodDate: null,
      }),
    );
    return this.invoices.get(created.id);
  }

  /**
   * Creates every invoice that is due up to `today`, one period at a time. Safe to run as often as
   * needed and from several processes: each period is claimed under a row lock, and the unique
   * profile + period key on invoices rejects a second copy.
   */
  async runDue(today?: string): Promise<RecurringRunResultDto> {
    const runDate = today ?? (await this.today());
    const result: RecurringRunResultDto = { created: [], failed: [] };
    const due = await this.prisma.recurringInvoiceProfile.findMany({
      where: { status: 'active', nextRunDate: { lte: fromDateOnly(runDate) } },
      select: { id: true },
      orderBy: { nextRunDate: 'asc' },
    });

    for (const { id } of due) {
      // Catch up one period per transaction, so a failure keeps the invoices already created.
      for (let guard = 0; guard < 1000; guard += 1) {
        try {
          const outcome = await this.prisma.$transaction((tx) => this.runNextPeriod(tx, id, runDate));
          if (outcome === 'nothing_due') break;
          if (outcome !== 'already_invoiced') result.created.push({ profileId: id, ...outcome });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Recurring profile ${id} failed: ${message}`);
          await this.prisma.recurringInvoiceProfile.update({ where: { id }, data: { lastError: message.slice(0, 500) } });
          result.failed.push({ profileId: id, error: message });
          break;
        }
      }
    }
    return result;
  }

  async history(id: string): Promise<AuditLogDto[]> {
    await this.find(id);
    return this.audit.history('recurring_invoice', id);
  }

  /** Invoices the profile's next period if it is due, then moves the schedule on. */
  private async runNextPeriod(
    tx: Tx,
    id: string,
    runDate: string,
  ): Promise<'nothing_due' | 'already_invoiced' | { invoiceId: string; number: string; periodDate: string }> {
    const locked = await this.lock(tx, id);
    const periodDate = toDateOnly(locked.nextRunDate);
    const endDate = locked.endDate ? toDateOnly(locked.endDate) : null;
    if (locked.status !== 'active' || periodDate > runDate || (endDate !== null && periodDate > endDate)) return 'nothing_due';

    const profile = await tx.recurringInvoiceProfile.findUniqueOrThrow({ where: { id }, include: PROFILE_INCLUDE });
    const alreadyInvoiced = await tx.invoice.findUnique({
      where: { recurringProfileId_recurringPeriodDate: { recurringProfileId: id, recurringPeriodDate: locked.nextRunDate } },
      select: { id: true, number: true },
    });
    const invoice =
      alreadyInvoiced ??
      (await this.invoices.createForRecurringProfile(tx, this.invoiceInput(profile, periodDate), {
        profileId: id,
        profileName: profile.name,
        periodDate,
      }));

    const nextIndex = locked.nextIndex + 1;
    const nextRunDate = occurrenceDate(toDateOnly(locked.startDate), locked.repeatUnit, locked.repeatEvery, nextIndex);
    await tx.recurringInvoiceProfile.update({
      where: { id },
      data: { nextIndex, nextRunDate: fromDateOnly(nextRunDate), lastRunAt: new Date(), lastError: null },
    });
    return alreadyInvoiced ? 'already_invoiced' : { invoiceId: invoice.id, number: invoice.number, periodDate };
  }

  private invoiceInput(profile: ProfileDetail, invoiceDate: string): InvoiceOutput {
    return {
      customerId: profile.customerId,
      invoiceDate,
      dueDate: addDays(invoiceDate, profile.paymentTerm?.days ?? 0),
      paymentTermId: profile.paymentTermId,
      orderNumber: profile.orderNumber,
      subject: profile.subject,
      customerNotes: profile.customerNotes,
      terms: profile.terms,
      shippingCharge: money(profile.shippingCharge),
      adjustment: money(profile.adjustment),
      saveAs: profile.createAs,
      lines: storedLinesToInput(profile.lines),
    };
  }

  private headerData(input: RecurringInvoiceOutput) {
    return {
      name: input.name,
      customerId: input.customerId,
      repeatEvery: input.repeatEvery,
      repeatUnit: input.repeatUnit,
      startDate: fromDateOnly(input.startDate),
      endDate: input.endDate ? fromDateOnly(input.endDate) : null,
      paymentTermId: input.paymentTermId,
      createAs: input.createAs,
      orderNumber: input.orderNumber,
      subject: input.subject,
      customerNotes: input.customerNotes,
      terms: input.terms,
    };
  }

  private async lock(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM recurring_invoice_profiles WHERE id = ${id}::uuid FOR UPDATE`;
    const profile = await tx.recurringInvoiceProfile.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
        repeatEvery: true,
        repeatUnit: true,
        nextIndex: true,
        nextRunDate: true,
      },
    });
    if (!profile) throw notFound('Recurring invoice profile');
    return profile;
  }

  /** Filter matching exactly the profiles shown with a given display status. */
  private statusWhere(status: RecurringProfileDisplayStatus): Prisma.RecurringInvoiceProfileWhereInput {
    const endDate = this.prisma.recurringInvoiceProfile.fields.endDate;
    switch (status) {
      case 'stopped':
        return { status: 'stopped' };
      case 'active':
        return { status: 'active', OR: [{ endDate: null }, { nextRunDate: { lte: endDate } }] };
      case 'expired':
        return { status: 'active', endDate: { not: null }, nextRunDate: { gt: endDate } };
    }
  }

  private where(query: RecurringInvoiceListQuery): Prisma.RecurringInvoiceProfileWhereInput {
    const and: Prisma.RecurringInvoiceProfileWhereInput[] = [];
    if (query.customerId) and.push({ customerId: query.customerId });
    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' as const };
      and.push({ OR: [{ name: contains }, { customer: { displayName: contains } }] });
    }
    if (query.status !== 'all') and.push(this.statusWhere(query.status));
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

  private async find(id: string): Promise<ProfileDetail> {
    const profile = await this.prisma.recurringInvoiceProfile.findUnique({ where: { id }, include: PROFILE_INCLUDE });
    if (!profile) throw notFound('Recurring invoice profile');
    return profile;
  }

  private async today(): Promise<string> {
    return todayInTimeZone(await this.organization.timezone());
  }
}
