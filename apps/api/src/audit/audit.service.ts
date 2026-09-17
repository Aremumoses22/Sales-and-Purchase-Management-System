import { Injectable } from '@nestjs/common';
import type { AuditLogDto, AuditLogEntryDto, AuditLogFiltersDto, AuditLogQuery, Paginated } from '@spms/shared';
import { pageArgs, paginated } from '../common/pagination.js';
import { getRequestContext } from '../common/request-context.js';
import { fromDateOnly, toIso } from '../common/serialize.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService, type Tx } from '../prisma/prisma.service.js';
import type { AuditChanges } from './diff.js';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  changes?: AuditChanges | null;
  /** Defaults to the signed-in user of the current request. */
  userId?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx?: Tx): Promise<void> {
    const context = getRequestContext();
    await (tx ?? this.prisma).auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        summary: entry.summary,
        changes: entry.changes ? (entry.changes as Prisma.InputJsonValue) : undefined,
        userId: entry.userId ?? context?.userId ?? null,
        ipAddress: context?.ipAddress ?? null,
      },
    });
  }

  async history(entityType: string, entityId: string): Promise<AuditLogDto[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      summary: row.summary,
      changes: (row.changes as AuditLogDto['changes']) ?? null,
      user: row.user,
      createdAt: toIso(row.createdAt),
    }));
  }

  /** The organization-wide audit log, newest first. */
  async list(query: AuditLogQuery): Promise<Paginated<AuditLogEntryDto>> {
    const and: Prisma.AuditLogWhereInput[] = [];
    if (query.entityType) and.push({ entityType: query.entityType });
    if (query.action) and.push({ action: query.action });
    if (query.userId) and.push({ userId: query.userId });
    if (query.dateFrom) and.push({ createdAt: { gte: fromDateOnly(query.dateFrom) } });
    // The end date is inclusive: everything before the start of the next day.
    if (query.dateTo) and.push({ createdAt: { lt: new Date(fromDateOnly(query.dateTo).getTime() + 86_400_000) } });
    if (query.q) and.push({ summary: { contains: query.q, mode: 'insensitive' } });
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginated(
      rows.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        summary: row.summary,
        changes: (row.changes as AuditLogDto['changes']) ?? null,
        user: row.user,
        ipAddress: row.ipAddress,
        createdAt: toIso(row.createdAt),
      })),
      total,
      query,
    );
  }

  /** Values for the audit log's filter menus. */
  async filters(): Promise<AuditLogFiltersDto> {
    const [entityTypes, actions, users] = await Promise.all([
      this.prisma.auditLog.findMany({ distinct: ['entityType'], select: { entityType: true }, orderBy: { entityType: 'asc' } }),
      this.prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
      this.prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    return {
      entityTypes: entityTypes.map((row) => row.entityType),
      actions: actions.map((row) => row.action),
      users,
    };
  }
}
