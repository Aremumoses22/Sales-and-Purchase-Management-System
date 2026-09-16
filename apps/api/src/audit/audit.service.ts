import { Injectable } from '@nestjs/common';
import type { AuditLogDto } from '@spms/shared';
import { getRequestContext } from '../common/request-context.js';
import { toIso } from '../common/serialize.js';
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
}
