import { Injectable } from '@nestjs/common';
import {
  toDecimal,
  type ActiveListQuery,
  type AddressDto,
  type AuditLogDto,
  type ContactDto,
  type ContactListItemDto,
  type ContactOutput,
  type ContactSummaryDto,
  type VendorSummaryDto,
  type ContactType,
  type Decimal,
  type Paginated,
} from '@spms/shared';
import { AuditService } from '../../audit/audit.service.js';
import { diffRecords } from '../../audit/diff.js';
import { conflict, fieldError, notFound } from '../../common/app-exception.js';
import { pageArgs, paginated, parseSort } from '../../common/pagination.js';
import { getRequestContext } from '../../common/request-context.js';
import { money, toIso } from '../../common/serialize.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export const CONTACT_LABELS: Record<ContactType, string> = { customer: 'Customer', vendor: 'Vendor' };

const CONTACT_INCLUDE = {
  addresses: true,
  contactPersons: { orderBy: { position: 'asc' } },
  paymentTerm: { select: { id: true, name: true, days: true } },
} satisfies Prisma.ContactInclude;

type ContactWithRelations = Prisma.ContactGetPayload<{ include: typeof CONTACT_INCLUDE }>;
type AddressRow = ContactWithRelations['addresses'][number];
type AddressOutput = NonNullable<ContactOutput['billingAddress']>;

const ADDRESS_FIELDS = ['attention', 'line1', 'line2', 'city', 'state', 'postalCode', 'country', 'phone'] as const;

export function toAddressDto(address: AddressRow | undefined): AddressDto | null {
  if (!address) return null;
  const { attention, line1, line2, city, state, postalCode, country, phone } = address;
  return { attention, line1, line2, city, state, postalCode, country, phone };
}

function toContactDto(contact: ContactWithRelations): ContactDto {
  return {
    id: contact.id,
    kind: contact.kind,
    salutation: contact.salutation,
    firstName: contact.firstName,
    lastName: contact.lastName,
    companyName: contact.companyName,
    displayName: contact.displayName,
    email: contact.email,
    workPhone: contact.workPhone,
    mobile: contact.mobile,
    website: contact.website,
    taxNumber: contact.taxNumber,
    paymentTerm: contact.paymentTerm,
    openingBalance: money(contact.openingBalance),
    notes: contact.notes,
    isActive: contact.isActive,
    billingAddress: toAddressDto(contact.addresses.find((a) => a.kind === 'billing')),
    shippingAddress: toAddressDto(contact.addresses.find((a) => a.kind === 'shipping')),
    contactPersons: contact.contactPersons.map((person) => ({
      id: person.id,
      salutation: person.salutation,
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.email,
      workPhone: person.workPhone,
      mobile: person.mobile,
      designation: person.designation,
      isPrimary: person.isPrimary,
    })),
    createdAt: toIso(contact.createdAt),
    updatedAt: toIso(contact.updatedAt),
  };
}

function hasContent(address: AddressOutput | null): address is AddressOutput {
  return address !== null && ADDRESS_FIELDS.some((field) => address[field]);
}

function formatAddress(address: AddressDto | null): string | null {
  return address ? ADDRESS_FIELDS.map((field) => address[field]).filter(Boolean).join(', ') || null : null;
}

function contactData(input: ContactOutput) {
  return {
    kind: input.kind,
    salutation: input.salutation,
    firstName: input.firstName,
    lastName: input.lastName,
    companyName: input.companyName,
    displayName: input.displayName,
    email: input.email,
    workPhone: input.workPhone,
    mobile: input.mobile,
    website: input.website,
    taxNumber: input.taxNumber,
    paymentTermId: input.paymentTermId,
    openingBalance: input.openingBalance,
    notes: input.notes,
  };
}

function nestedRows(input: ContactOutput) {
  const addresses: (AddressOutput & { kind: 'billing' | 'shipping' })[] = [];
  if (hasContent(input.billingAddress)) addresses.push({ kind: 'billing', ...input.billingAddress });
  if (hasContent(input.shippingAddress)) addresses.push({ kind: 'shipping', ...input.shippingAddress });
  return {
    addresses: { create: addresses },
    contactPersons: { create: input.contactPersons.map((person, position) => ({ ...person, position })) },
  };
}

/** Human-readable snapshot, so audit entries say "Net 30" rather than a term id. */
function auditSnapshot(contact: ContactWithRelations): Record<string, unknown> {
  const dto = toContactDto(contact);
  return {
    kind: dto.kind,
    salutation: dto.salutation,
    firstName: dto.firstName,
    lastName: dto.lastName,
    companyName: dto.companyName,
    displayName: dto.displayName,
    email: dto.email,
    workPhone: dto.workPhone,
    mobile: dto.mobile,
    website: dto.website,
    taxNumber: dto.taxNumber,
    paymentTerm: dto.paymentTerm?.name ?? null,
    openingBalance: dto.openingBalance,
    notes: dto.notes,
    billingAddress: formatAddress(dto.billingAddress),
    shippingAddress: formatAddress(dto.shippingAddress),
    contactPersons: dto.contactPersons.map(
      (p) => [p.firstName, p.lastName].filter(Boolean).join(' ') + (p.email ? ` <${p.email}>` : ''),
    ),
  };
}

/** Customers and vendors share one table and one service; `type` keeps them apart. */
@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(type: ContactType, query: ActiveListQuery): Promise<Paginated<ContactListItemDto>> {
    const where: Prisma.ContactWhereInput = { type };
    if (query.status !== 'all') where.isActive = query.status === 'active';
    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' as const };
      where.OR = [
        { displayName: contains },
        { companyName: contains },
        { email: contains },
        { workPhone: contains },
        { mobile: contains },
      ];
    }
    const orderBy = parseSort<Prisma.ContactOrderByWithRelationInput>(
      query.sort,
      {
        name: (sort) => ({ displayName: sort }),
        company: (sort) => ({ companyName: { sort, nulls: 'last' } }),
        email: (sort) => ({ email: { sort, nulls: 'last' } }),
        createdAt: (sort) => ({ createdAt: sort }),
      },
      'name',
    );

    const [rows, total] = await Promise.all([
      this.prisma.contact.findMany({ where, orderBy: [orderBy, { id: 'asc' }], ...pageArgs(query) }),
      this.prisma.contact.count({ where }),
    ]);

    const ids = rows.map((row) => row.id);
    const balances = type === 'customer' ? await this.invoiceBalances(ids) : await this.vendorBalances(ids);

    return paginated(
      rows.map((row) => ({
        id: row.id,
        displayName: row.displayName,
        companyName: row.companyName,
        email: row.email,
        workPhone: row.workPhone,
        isActive: row.isActive,
        balance: money(toDecimal(row.openingBalance).plus(balances.get(row.id) ?? 0)),
        createdAt: toIso(row.createdAt),
      })),
      total,
      query,
    );
  }

  async get(type: ContactType, id: string): Promise<ContactDto> {
    return toContactDto(await this.find(type, id));
  }

  async create(type: ContactType, input: ContactOutput): Promise<ContactDto> {
    await this.validate(type, input);
    const contact = await this.prisma.$transaction(async (tx) => {
      const created = await tx.contact.create({
        data: {
          ...contactData(input),
          ...nestedRows(input),
          type,
          createdById: getRequestContext()?.userId ?? null,
        },
        include: CONTACT_INCLUDE,
      });
      await this.audit.record(
        {
          action: 'created',
          entityType: type,
          entityId: created.id,
          summary: `${CONTACT_LABELS[type]} ${created.displayName} created`,
        },
        tx,
      );
      return created;
    });
    return toContactDto(contact);
  }

  async update(type: ContactType, id: string, input: ContactOutput): Promise<ContactDto> {
    const before = await this.find(type, id);
    await this.validate(type, input, id);

    const contact = await this.prisma.$transaction(async (tx) => {
      await tx.contactAddress.deleteMany({ where: { contactId: id } });
      await tx.contactPerson.deleteMany({ where: { contactId: id } });
      const updated = await tx.contact.update({
        where: { id },
        data: { ...contactData(input), ...nestedRows(input) },
        include: CONTACT_INCLUDE,
      });
      const changes = diffRecords(auditSnapshot(before), auditSnapshot(updated));
      if (changes) {
        await this.audit.record(
          {
            action: 'updated',
            entityType: type,
            entityId: id,
            summary: `${CONTACT_LABELS[type]} ${updated.displayName} updated`,
            changes,
          },
          tx,
        );
      }
      return updated;
    });
    return toContactDto(contact);
  }

  async setActive(type: ContactType, id: string, isActive: boolean): Promise<ContactDto> {
    const before = await this.find(type, id);
    if (before.isActive === isActive) return toContactDto(before);

    const updated = await this.prisma.contact.update({ where: { id }, data: { isActive }, include: CONTACT_INCLUDE });
    await this.audit.record({
      action: isActive ? 'activated' : 'deactivated',
      entityType: type,
      entityId: id,
      summary: `${CONTACT_LABELS[type]} ${updated.displayName} marked as ${isActive ? 'active' : 'inactive'}`,
    });
    return toContactDto(updated);
  }

  async remove(type: ContactType, id: string): Promise<void> {
    const contact = await this.find(type, id);
    if ((await this.transactionCount(type, id)) > 0) {
      throw conflict(
        'CONTACT_HAS_TRANSACTIONS',
        `${contact.displayName} has transactions and cannot be deleted. Mark it as inactive instead.`,
      );
    }
    await this.prisma.contact.delete({ where: { id } });
    await this.audit.record({
      action: 'deleted',
      entityType: type,
      entityId: id,
      summary: `${CONTACT_LABELS[type]} ${contact.displayName} deleted`,
    });
  }

  async summary(type: ContactType, id: string): Promise<ContactSummaryDto | VendorSummaryDto> {
    const contact = await this.find(type, id);
    if (type === 'vendor') {
      const payables = await this.vendorBalances([id]);
      return {
        outstandingPayables: money(toDecimal(contact.openingBalance).plus(payables.get(id) ?? 0)),
        unusedCredits: money(await this.unusedVendorCredits(id)),
      };
    }
    const balances = await this.invoiceBalances([id]);
    return {
      outstandingReceivables: money(toDecimal(contact.openingBalance).plus(balances.get(id) ?? 0)),
      unusedCredits: money(await this.unusedCredits(id)),
    };
  }

  async history(type: ContactType, id: string): Promise<AuditLogDto[]> {
    await this.find(type, id);
    return this.audit.history(type, id);
  }

  private async transactionCount(type: ContactType, id: string): Promise<number> {
    const counts =
      type === 'customer'
        ? await Promise.all([
            this.prisma.quote.count({ where: { customerId: id } }),
            this.prisma.invoice.count({ where: { customerId: id } }),
            this.prisma.paymentReceived.count({ where: { customerId: id } }),
            this.prisma.creditNote.count({ where: { customerId: id } }),
            this.prisma.salesReceipt.count({ where: { customerId: id } }),
            this.prisma.recurringInvoiceProfile.count({ where: { customerId: id } }),
          ])
        : await Promise.all([Promise.resolve(0)]);
    return counts.reduce((sum, count) => sum + count, 0);
  }

  /** What is owed to each vendor on open bills (arrives with bills). */
  private async vendorBalances(_vendorIds: string[]): Promise<Map<string, Decimal>> {
    return new Map();
  }

  /** Payments made to a vendor that are not yet used on a bill (arrives with payments made). */
  private async unusedVendorCredits(_vendorId: string): Promise<Decimal> {
    return toDecimal(0);
  }

  /** What each customer still owes on sent invoices (drafts and void invoices are not owed). */
  private async invoiceBalances(customerIds: string[]): Promise<Map<string, Decimal>> {
    if (customerIds.length === 0) return new Map();
    const rows = await this.prisma.invoice.groupBy({
      by: ['customerId'],
      where: { customerId: { in: customerIds }, status: 'sent' },
      _sum: { balanceDue: true },
    });
    return new Map(rows.map((row) => [row.customerId, toDecimal(row._sum.balanceDue)]));
  }

  /** Payments not yet applied or refunded, plus what is left on open credit notes (PLAN.md §4.4). */
  private async unusedCredits(customerId: string): Promise<Decimal> {
    const [payments, creditNotes] = await Promise.all([
      this.prisma.paymentReceived.aggregate({
        where: { customerId },
        _sum: { amount: true, amountApplied: true, amountRefunded: true },
      }),
      this.prisma.creditNote.aggregate({ where: { customerId, status: 'open' }, _sum: { balance: true } }),
    ]);
    return toDecimal(payments._sum.amount)
      .minus(toDecimal(payments._sum.amountApplied))
      .minus(toDecimal(payments._sum.amountRefunded))
      .plus(toDecimal(creditNotes._sum.balance));
  }

  private async find(type: ContactType, id: string): Promise<ContactWithRelations> {
    const contact = await this.prisma.contact.findFirst({ where: { id, type }, include: CONTACT_INCLUDE });
    if (!contact) throw notFound(CONTACT_LABELS[type]);
    return contact;
  }

  private async validate(type: ContactType, input: ContactOutput, excludeId?: string): Promise<void> {
    const clash = await this.prisma.contact.findFirst({
      where: {
        type,
        displayName: { equals: input.displayName, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (clash) {
      throw fieldError(
        'DISPLAY_NAME_TAKEN',
        'displayName',
        `A ${CONTACT_LABELS[type].toLowerCase()} with this display name already exists`,
      );
    }
    if (
      input.paymentTermId &&
      !(await this.prisma.paymentTerm.findUnique({ where: { id: input.paymentTermId }, select: { id: true } }))
    ) {
      throw fieldError('PAYMENT_TERM_NOT_FOUND', 'paymentTermId', 'Select a valid payment term');
    }
  }
}
