import { Injectable } from '@nestjs/common';
import {
  calculateDocumentTotals,
  toDecimal,
  type AddressDto,
  type DiscountType,
  type DocumentCustomerDto,
  type DocumentLineDto,
  type DocumentLineOutput,
  type DocumentTotals,
  type TaxBreakdownEntry,
} from '@spms/shared';
import { fieldError } from '../../common/app-exception.js';
import { money, quantity, quantityOrNull } from '../../common/serialize.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../prisma/prisma.service.js';
import { toAddressDto } from '../contacts/contacts.service.js';

export interface DocumentBodyInput {
  lines: DocumentLineOutput[];
  shippingCharge: string;
  adjustment: string;
}

/** A line ready to insert into any *_lines table (quotes now; invoices, receipts and credit notes later). */
export interface PreparedLine {
  position: number;
  itemId: string | null;
  name: string;
  description: string | null;
  quantity: string;
  unit: string | null;
  rate: string;
  discountType: DiscountType;
  discountValue: string;
  taxId: string | null;
  taxName: string | null;
  taxRate: string | null;
  amount: string;
  taxAmount: string;
}

export interface PreparedDocument {
  lines: PreparedLine[];
  totals: DocumentTotals;
}

/** Shape shared by every stored line table. */
export interface StoredLine {
  id: string;
  position: number;
  itemId: string | null;
  name: string;
  description: string | null;
  quantity: Prisma.Decimal;
  unit: string | null;
  rate: Prisma.Decimal;
  discountType: DiscountType;
  discountValue: Prisma.Decimal;
  taxId: string | null;
  taxName: string | null;
  taxRate: Prisma.Decimal | null;
  amount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
}

/** The document engine (PLAN.md §4.3): validates line references and computes totals once, on the server. */
@Injectable()
export class DocumentLinesService {
  constructor(private readonly prisma: PrismaService) {}

  async prepare(input: DocumentBodyInput, db: Tx | PrismaService = this.prisma): Promise<PreparedDocument> {
    const itemIds = [...new Set(input.lines.flatMap((line) => (line.itemId ? [line.itemId] : [])))];
    const taxIds = [...new Set(input.lines.flatMap((line) => (line.taxId ? [line.taxId] : [])))];
    const [items, taxes] = await Promise.all([
      db.item.findMany({ where: { id: { in: itemIds } }, select: { id: true } }),
      db.tax.findMany({ where: { id: { in: taxIds } } }),
    ]);
    const knownItems = new Set(items.map((item) => item.id));
    const taxById = new Map(taxes.map((tax) => [tax.id, tax]));

    input.lines.forEach((line, index) => {
      if (line.itemId && !knownItems.has(line.itemId)) {
        throw fieldError('ITEM_NOT_FOUND', `lines.${index}.itemId`, 'This item no longer exists');
      }
      if (line.taxId && !taxById.has(line.taxId)) {
        throw fieldError('TAX_NOT_FOUND', `lines.${index}.taxId`, 'Select a valid tax');
      }
    });

    const totals = calculateDocumentTotals({
      lines: input.lines.map((line) => {
        const tax = line.taxId ? taxById.get(line.taxId) : undefined;
        return { ...line, taxName: tax?.name ?? null, taxRate: tax?.rate ?? null };
      }),
      shippingCharge: input.shippingCharge,
      adjustment: input.adjustment,
    });
    if (toDecimal(totals.total).isNegative()) {
      throw fieldError('NEGATIVE_TOTAL', 'adjustment', 'The adjustment makes the total negative');
    }

    const lines = input.lines.map((line, position): PreparedLine => {
      const tax = line.taxId ? taxById.get(line.taxId) : undefined;
      const lineTotals = totals.lines[position];
      return {
        position,
        itemId: line.itemId,
        name: line.name,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        rate: line.rate,
        discountType: line.discountType,
        discountValue: line.discountValue,
        taxId: line.taxId,
        taxName: tax?.name ?? null,
        taxRate: tax ? quantity(tax.rate) : null,
        amount: lineTotals?.amount ?? '0.00',
        taxAmount: lineTotals?.taxAmount ?? '0.00',
      };
    });

    return { lines, totals };
  }
}

export function toDocumentLineDto(line: StoredLine): DocumentLineDto {
  return {
    id: line.id,
    position: line.position,
    itemId: line.itemId,
    name: line.name,
    description: line.description,
    quantity: quantity(line.quantity),
    unit: line.unit,
    rate: money(line.rate),
    discountType: line.discountType,
    discountValue: money(line.discountValue),
    taxId: line.taxId,
    taxName: line.taxName,
    taxRate: quantityOrNull(line.taxRate),
    amount: money(line.amount),
    taxAmount: money(line.taxAmount),
  };
}

/** Tax totals per tax, rebuilt from the rate and name stored on each line. */
export function taxBreakdownFromLines(lines: StoredLine[]): TaxBreakdownEntry[] {
  return calculateDocumentTotals({ lines }).taxBreakdown;
}

export function toDocumentCustomer(customer: {
  id: string;
  displayName: string;
  companyName: string | null;
  email: string | null;
  addresses: Parameters<typeof toAddressDto>[0][];
}): DocumentCustomerDto {
  const address = (kind: 'billing' | 'shipping'): AddressDto | null =>
    toAddressDto(customer.addresses.find((row) => row?.kind === kind));
  return {
    id: customer.id,
    displayName: customer.displayName,
    companyName: customer.companyName,
    email: customer.email,
    billingAddress: address('billing'),
    shippingAddress: address('shipping'),
  };
}
