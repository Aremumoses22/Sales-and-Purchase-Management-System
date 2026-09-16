import { Injectable } from '@nestjs/common';
import {
  quantityString,
  todayInTimeZone,
  toDecimal,
  type AuditLogDto,
  type ItemDto,
  type ItemListItemDto,
  type ItemListQuery,
  type ItemOutput,
  type Paginated,
  type StockAdjustmentOutput,
  type StockMovementDto,
} from '@spms/shared';
import { AuditService } from '../../audit/audit.service.js';
import { diffRecords } from '../../audit/diff.js';
import { conflict, fieldError, notFound } from '../../common/app-exception.js';
import { pageArgs, paginated, parseSort } from '../../common/pagination.js';
import { getRequestContext } from '../../common/request-context.js';
import { fromDateOnly, moneyOrNull, quantity, quantityOrNull, toDateOnly, toIso } from '../../common/serialize.js';
import type { Item, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { OrganizationService } from '../settings/organization.service.js';

const ITEM_INCLUDE = { tax: { select: { id: true, name: true, rate: true } } } satisfies Prisma.ItemInclude;
type ItemWithTax = Prisma.ItemGetPayload<{ include: typeof ITEM_INCLUDE }>;

function toListItem(item: Item, stockOnHand: string | null): ItemListItemDto {
  return {
    id: item.id,
    type: item.type,
    name: item.name,
    sku: item.sku,
    unit: item.unit,
    sellingPrice: moneyOrNull(item.sellingPrice),
    salesDescription: item.salesDescription,
    costPrice: moneyOrNull(item.costPrice),
    taxId: item.taxId,
    trackInventory: item.trackInventory,
    stockOnHand,
    reorderLevel: quantityOrNull(item.reorderLevel),
    isActive: item.isActive,
  };
}

function toItemDto(item: ItemWithTax, stockOnHand: string | null): ItemDto {
  return {
    ...toListItem(item, stockOnHand),
    purchaseDescription: item.purchaseDescription,
    tax: item.tax ? { id: item.tax.id, name: item.tax.name, rate: quantity(item.tax.rate) } : null,
    createdAt: toIso(item.createdAt),
    updatedAt: toIso(item.updatedAt),
  };
}

function auditSnapshot(item: ItemWithTax): Record<string, unknown> {
  return {
    type: item.type,
    name: item.name,
    sku: item.sku,
    unit: item.unit,
    sellingPrice: moneyOrNull(item.sellingPrice),
    salesDescription: item.salesDescription,
    costPrice: moneyOrNull(item.costPrice),
    purchaseDescription: item.purchaseDescription,
    tax: item.tax?.name ?? null,
    trackInventory: item.trackInventory,
    reorderLevel: quantityOrNull(item.reorderLevel),
  };
}

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly organization: OrganizationService,
  ) {}

  async list(query: ItemListQuery): Promise<Paginated<ItemListItemDto>> {
    const where: Prisma.ItemWhereInput = {};
    if (query.type) where.type = query.type;
    if (query.status !== 'all') where.isActive = query.status === 'active';
    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' as const };
      where.OR = [{ name: contains }, { sku: contains }, { salesDescription: contains }];
    }
    const orderBy = parseSort<Prisma.ItemOrderByWithRelationInput>(
      query.sort,
      {
        name: (sort) => ({ name: sort }),
        sku: (sort) => ({ sku: { sort, nulls: 'last' } }),
        sellingPrice: (sort) => ({ sellingPrice: { sort, nulls: 'last' } }),
        costPrice: (sort) => ({ costPrice: { sort, nulls: 'last' } }),
        createdAt: (sort) => ({ createdAt: sort }),
      },
      'name',
    );

    const [rows, total] = await Promise.all([
      this.prisma.item.findMany({ where, orderBy: [orderBy, { id: 'asc' }], ...pageArgs(query) }),
      this.prisma.item.count({ where }),
    ]);
    const stock = await this.stockOnHand(rows.filter((row) => row.trackInventory).map((row) => row.id));
    return paginated(
      rows.map((row) => toListItem(row, stock.get(row.id) ?? null)),
      total,
      query,
    );
  }

  async get(id: string): Promise<ItemDto> {
    const item = await this.find(id);
    const stock = item.trackInventory ? await this.stockOnHand([id]) : new Map<string, string>();
    return toItemDto(item, stock.get(id) ?? null);
  }

  async create(input: ItemOutput): Promise<ItemDto> {
    await this.validate(input);
    const tracking = input.type === 'goods' && input.trackInventory;
    const today = todayInTimeZone(await this.organization.timezone());
    const userId = getRequestContext()?.userId ?? null;

    const id = await this.prisma.$transaction(async (tx) => {
      const item = await tx.item.create({ data: { ...this.itemData(input), createdById: userId } });
      if (tracking && input.openingStock && !toDecimal(input.openingStock).isZero()) {
        await tx.stockMovement.create({
          data: {
            itemId: item.id,
            date: fromDateOnly(today),
            type: 'opening',
            quantity: input.openingStock,
            reason: 'Opening stock',
            createdById: userId,
          },
        });
      }
      await this.audit.record(
        { action: 'created', entityType: 'item', entityId: item.id, summary: `Item ${item.name} created` },
        tx,
      );
      return item.id;
    });
    return this.get(id);
  }

  async update(id: string, input: ItemOutput): Promise<ItemDto> {
    const before = await this.find(id);
    await this.validate(input, id);
    const tracking = input.type === 'goods' && input.trackInventory;
    const movements = await this.prisma.stockMovement.count({ where: { itemId: id } });

    if (before.trackInventory && !tracking && movements > 0) {
      throw fieldError(
        'TRACKING_LOCKED',
        'trackInventory',
        'Inventory tracking cannot be turned off after stock has been recorded',
      );
    }

    const today = todayInTimeZone(await this.organization.timezone());
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.item.update({ where: { id }, data: this.itemData(input), include: ITEM_INCLUDE });
      const startsTracking = !before.trackInventory && tracking && movements === 0;
      if (startsTracking && input.openingStock && !toDecimal(input.openingStock).isZero()) {
        await tx.stockMovement.create({
          data: {
            itemId: id,
            date: fromDateOnly(today),
            type: 'opening',
            quantity: input.openingStock,
            reason: 'Opening stock',
            createdById: getRequestContext()?.userId ?? null,
          },
        });
      }
      const changes = diffRecords(auditSnapshot(before), auditSnapshot(updated));
      if (changes) {
        await this.audit.record(
          { action: 'updated', entityType: 'item', entityId: id, summary: `Item ${updated.name} updated`, changes },
          tx,
        );
      }
    });
    return this.get(id);
  }

  async setActive(id: string, isActive: boolean): Promise<ItemDto> {
    const item = await this.find(id);
    if (item.isActive !== isActive) {
      await this.prisma.item.update({ where: { id }, data: { isActive } });
      await this.audit.record({
        action: isActive ? 'activated' : 'deactivated',
        entityType: 'item',
        entityId: id,
        summary: `Item ${item.name} marked as ${isActive ? 'active' : 'inactive'}`,
      });
    }
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const item = await this.find(id);
    const [quoteLines, invoiceLines, creditNoteLines, movements] = await Promise.all([
      this.prisma.quoteLine.count({ where: { itemId: id } }),
      this.prisma.invoiceLine.count({ where: { itemId: id } }),
      this.prisma.creditNoteLine.count({ where: { itemId: id } }),
      this.prisma.stockMovement.count({ where: { itemId: id, type: { not: 'opening' } } }),
    ]);
    if (quoteLines + invoiceLines + creditNoteLines + movements > 0) {
      throw conflict(
        'ITEM_IN_USE',
        `${item.name} is used in transactions and cannot be deleted. Mark it as inactive instead.`,
      );
    }
    await this.prisma.item.delete({ where: { id } });
    await this.audit.record({ action: 'deleted', entityType: 'item', entityId: id, summary: `Item ${item.name} deleted` });
  }

  async stockMovements(id: string): Promise<StockMovementDto[]> {
    await this.find(id);
    const rows = await this.prisma.stockMovement.findMany({
      where: { itemId: id },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      date: toDateOnly(row.date),
      type: row.type,
      quantity: quantity(row.quantity),
      reason: row.reason,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      createdBy: row.createdBy,
      createdAt: toIso(row.createdAt),
    }));
  }

  async adjustStock(id: string, input: StockAdjustmentOutput): Promise<ItemDto> {
    const item = await this.find(id);
    if (!item.trackInventory) {
      throw conflict('INVENTORY_NOT_TRACKED', `Inventory is not tracked for ${item.name}`);
    }

    await this.prisma.$transaction(async (tx) => {
      // Serialise adjustments to the same item so two users cannot both push stock below zero.
      await tx.$queryRaw`SELECT id FROM items WHERE id = ${id}::uuid FOR UPDATE`;
      const { _sum } = await tx.stockMovement.aggregate({ where: { itemId: id }, _sum: { quantity: true } });
      const current = toDecimal(_sum.quantity);
      const next = current.plus(toDecimal(input.quantityChange));
      if (next.lt(0)) {
        throw fieldError(
          'NEGATIVE_STOCK',
          'quantityChange',
          `Stock on hand cannot go below zero (currently ${quantityString(current)})`,
        );
      }
      await tx.stockMovement.create({
        data: {
          itemId: id,
          date: fromDateOnly(input.date),
          type: 'adjustment',
          quantity: input.quantityChange,
          reason: input.reason,
          createdById: getRequestContext()?.userId ?? null,
        },
      });
      await this.audit.record(
        {
          action: 'stock_adjusted',
          entityType: 'item',
          entityId: id,
          summary: `Stock for ${item.name} adjusted by ${quantityString(input.quantityChange)}: ${input.reason}`,
          changes: { stockOnHand: { from: quantityString(current), to: quantityString(next) } },
        },
        tx,
      );
    });
    return this.get(id);
  }

  async history(id: string): Promise<AuditLogDto[]> {
    await this.find(id);
    return this.audit.history('item', id);
  }

  private itemData(input: ItemOutput) {
    const tracking = input.type === 'goods' && input.trackInventory;
    return {
      type: input.type,
      name: input.name,
      sku: input.sku,
      unit: input.unit,
      sellingPrice: input.sellingPrice,
      salesDescription: input.salesDescription,
      costPrice: input.costPrice,
      purchaseDescription: input.purchaseDescription,
      taxId: input.taxId,
      trackInventory: tracking,
      reorderLevel: tracking ? input.reorderLevel : null,
    };
  }

  private async stockOnHand(itemIds: string[]): Promise<Map<string, string>> {
    const result = new Map(itemIds.map((id) => [id, '0']));
    if (itemIds.length === 0) return result;
    const sums = await this.prisma.stockMovement.groupBy({
      by: ['itemId'],
      where: { itemId: { in: itemIds } },
      _sum: { quantity: true },
    });
    for (const row of sums) result.set(row.itemId, quantityOrNull(row._sum.quantity) ?? '0');
    return result;
  }

  private async find(id: string): Promise<ItemWithTax> {
    const item = await this.prisma.item.findUnique({ where: { id }, include: ITEM_INCLUDE });
    if (!item) throw notFound('Item');
    return item;
  }

  private async validate(input: ItemOutput, excludeId?: string): Promise<void> {
    const notSelf = excludeId ? { id: { not: excludeId } } : {};
    const [nameClash, skuClash, tax] = await Promise.all([
      this.prisma.item.findFirst({
        where: { name: { equals: input.name, mode: 'insensitive' }, ...notSelf },
        select: { id: true },
      }),
      input.sku
        ? this.prisma.item.findFirst({
            where: { sku: { equals: input.sku, mode: 'insensitive' }, ...notSelf },
            select: { id: true },
          })
        : null,
      input.taxId ? this.prisma.tax.findUnique({ where: { id: input.taxId }, select: { id: true } }) : null,
    ]);
    if (nameClash) throw fieldError('ITEM_NAME_TAKEN', 'name', 'An item with this name already exists');
    if (skuClash) throw fieldError('SKU_TAKEN', 'sku', 'Another item already uses this SKU');
    if (input.taxId && !tax) throw fieldError('TAX_NOT_FOUND', 'taxId', 'Select a valid tax');
  }
}
