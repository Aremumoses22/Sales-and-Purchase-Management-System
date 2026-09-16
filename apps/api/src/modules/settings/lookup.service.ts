import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import { diffRecords } from '../../audit/diff.js';
import { conflict, fieldError, notFound } from '../../common/app-exception.js';
import { PrismaService, type Tx } from '../../prisma/prisma.service.js';

/* Prisma delegates for different models share this shape but not a common type. */
/* eslint-disable @typescript-eslint/no-explicit-any */
interface Delegate {
  findMany(args: any): Promise<any[]>;
  findUnique(args: any): Promise<any>;
  findFirst(args: any): Promise<any>;
  create(args: any): Promise<any>;
  update(args: any): Promise<any>;
  updateMany(args: any): Promise<any>;
  delete(args: any): Promise<any>;
}

interface LookupRow {
  id: string;
  name: string;
  isActive: boolean;
  isDefault?: boolean;
}

/** What a Settings list controller needs from its service. */
export interface LookupOperations<Input> {
  list(includeInactive: boolean): Promise<unknown[]>;
  create(input: Input): Promise<unknown>;
  update(id: string, input: Input): Promise<unknown>;
  remove(id: string): Promise<void>;
}

/**
 * Shared behaviour for the small Settings lists (payment terms, taxes, payment modes,
 * expense categories): unique names, a single default, and no deleting what is in use.
 *
 * `@Injectable()` here makes TypeScript record the constructor's parameter types, which the
 * subclasses inherit; without it Nest cannot inject PrismaService and AuditService.
 */
@Injectable()
export abstract class LookupService<Row extends LookupRow, Dto, Input extends { name: string; isActive: boolean; isDefault?: boolean }>
  implements LookupOperations<Input>
{
  protected abstract readonly entityType: string;
  protected abstract readonly label: string;
  protected abstract readonly orderBy: readonly object[];
  protected abstract delegate(db: PrismaService | Tx): Delegate;
  protected abstract toDto(row: Row): Dto;

  /** Number of records that reference this row. */
  protected usageCount(_id: string): Promise<number> {
    return Promise.resolve(0);
  }

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly audit: AuditService,
  ) {}

  async list(includeInactive: boolean): Promise<Dto[]> {
    const rows: Row[] = await this.delegate(this.prisma).findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: this.orderBy,
    });
    return rows.map((row) => this.toDto(row));
  }

  async create(input: Input): Promise<Dto> {
    await this.ensureNameAvailable(input.name);
    const row = await this.prisma.$transaction(async (tx) => {
      const data = this.normalize(input);
      if (data.isDefault) await this.delegate(tx).updateMany({ where: {}, data: { isDefault: false } });
      const created: Row = await this.delegate(tx).create({ data });
      await this.audit.record(
        { action: 'created', entityType: this.entityType, entityId: created.id, summary: `${this.label} "${created.name}" created` },
        tx,
      );
      return created;
    });
    return this.toDto(row);
  }

  async update(id: string, input: Input): Promise<Dto> {
    const before = await this.find(id);
    await this.ensureNameAvailable(input.name, id);
    const row = await this.prisma.$transaction(async (tx) => {
      const data = this.normalize(input);
      if (data.isDefault) {
        await this.delegate(tx).updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
      }
      const updated: Row = await this.delegate(tx).update({ where: { id }, data });
      const changes = diffRecords(before as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>);
      if (changes) {
        await this.audit.record(
          { action: 'updated', entityType: this.entityType, entityId: id, summary: `${this.label} "${updated.name}" updated`, changes },
          tx,
        );
      }
      return updated;
    });
    return this.toDto(row);
  }

  async remove(id: string): Promise<void> {
    const row = await this.find(id);
    const usage = await this.usageCount(id);
    if (usage > 0) {
      throw conflict(
        'IN_USE',
        `"${row.name}" is used by ${usage} record${usage === 1 ? '' : 's'}. Mark it inactive instead.`,
      );
    }
    await this.delegate(this.prisma).delete({ where: { id } });
    await this.audit.record({ action: 'deleted', entityType: this.entityType, entityId: id, summary: `${this.label} "${row.name}" deleted` });
  }

  private normalize(input: Input): Input {
    // An inactive entry cannot be the default.
    return input.isDefault !== undefined && !input.isActive ? { ...input, isDefault: false } : input;
  }

  private async find(id: string): Promise<Row> {
    const row: Row | null = await this.delegate(this.prisma).findUnique({ where: { id } });
    if (!row) throw notFound(this.label);
    return row;
  }

  private async ensureNameAvailable(name: string, excludeId?: string): Promise<void> {
    const clash = await this.delegate(this.prisma).findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (clash) throw fieldError('NAME_TAKEN', 'name', `A ${this.label.toLowerCase()} with this name already exists`);
  }
}
