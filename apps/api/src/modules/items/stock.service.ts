import { Injectable } from '@nestjs/common';
import { Dec, toDecimal, type Decimal, type NumericInput } from '@spms/shared';
import { getRequestContext } from '../../common/request-context.js';
import type { Tx } from '../../prisma/prisma.service.js';

export interface StockSource {
  type: 'invoice' | 'sales_receipt' | 'credit_note';
  id: string;
  date: Date;
  /** -1 when goods leave (sales), +1 when they come back (returns). */
  direction: 1 | -1;
  reason: string;
}

@Injectable()
export class StockService {
  /**
   * Makes a document's stock movements match its current lines. Earlier movements from the same
   * document are replaced, so editing or re-sending never double counts; pass no lines to remove
   * them (e.g. when voiding).
   */
  async syncDocumentMovements(
    tx: Tx,
    source: StockSource,
    lines: { itemId: string | null; quantity: NumericInput }[],
  ): Promise<void> {
    await tx.stockMovement.deleteMany({ where: { sourceType: source.type, sourceId: source.id } });

    const quantities = new Map<string, Decimal>();
    for (const line of lines) {
      if (!line.itemId) continue;
      quantities.set(line.itemId, (quantities.get(line.itemId) ?? new Dec(0)).plus(toDecimal(line.quantity)));
    }
    if (quantities.size === 0) return;

    const tracked = await tx.item.findMany({
      where: { id: { in: [...quantities.keys()] }, trackInventory: true },
      select: { id: true },
    });
    if (tracked.length === 0) return;

    const createdById = getRequestContext()?.userId ?? null;
    await tx.stockMovement.createMany({
      data: tracked.map(({ id }) => ({
        itemId: id,
        date: source.date,
        type: source.type,
        quantity: (quantities.get(id) ?? new Dec(0)).times(source.direction).toString(),
        reason: source.reason,
        sourceType: source.type,
        sourceId: source.id,
        createdById,
      })),
    });
  }
}
