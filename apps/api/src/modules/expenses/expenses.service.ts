import { HttpStatus, Injectable } from '@nestjs/common';
import {
  calculateExpenseAmounts,
  toDecimal,
  type AuditLogDto,
  type ExpenseDto,
  type ExpenseListItemDto,
  type ExpenseListQuery,
  type ExpenseOutput,
  type ExpenseTotalsDto,
  type Paginated,
} from '@spms/shared';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AuditService } from '../../audit/audit.service.js';
import { diffRecords } from '../../audit/diff.js';
import { AppException, fieldError, notFound } from '../../common/app-exception.js';
import { pageArgs, paginated, parseSort } from '../../common/pagination.js';
import { getRequestContext } from '../../common/request-context.js';
import { fromDateOnly, money, quantity, toDateOnly, toIso } from '../../common/serialize.js';
import { config } from '../../config.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const RECEIPT_DIR = path.join(config.uploadDir, 'receipts');
export const MAX_RECEIPT_BYTES = 5_000_000;

/** Receipts are checked by their contents, not the name or type the browser claims. */
const RECEIPT_TYPES: { mimeType: string; extension: string; matches: (b: Buffer) => boolean }[] = [
  { mimeType: 'image/png', extension: 'png', matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mimeType: 'image/jpeg', extension: 'jpg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mimeType: 'image/webp', extension: 'webp', matches: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
  { mimeType: 'application/pdf', extension: 'pdf', matches: (b) => b.subarray(0, 5).toString('ascii') === '%PDF-' },
];

export interface UploadedReceipt {
  buffer: Buffer;
  size: number;
  originalname: string;
}

const EXPENSE_INCLUDE = {
  category: { select: { id: true, name: true } },
  vendor: { select: { id: true, displayName: true } },
  paymentMode: { select: { id: true, name: true } },
  tax: { select: { id: true, name: true, rate: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.ExpenseInclude;

type ExpenseDetail = Prisma.ExpenseGetPayload<{ include: typeof EXPENSE_INCLUDE }>;

function toListItem(expense: ExpenseDetail): ExpenseListItemDto {
  return {
    id: expense.id,
    expenseDate: toDateOnly(expense.expenseDate),
    category: expense.category,
    vendor: expense.vendor,
    paymentMode: expense.paymentMode,
    referenceNumber: expense.referenceNumber,
    subtotal: money(expense.subtotal),
    taxAmount: money(expense.taxAmount),
    total: money(expense.total),
    hasReceipt: expense.receiptFile !== null,
  };
}

function toExpenseDto(expense: ExpenseDetail): ExpenseDto {
  return {
    ...toListItem(expense),
    amount: money(expense.amount),
    amountIsTaxInclusive: expense.amountIsTaxInclusive,
    tax: expense.taxId
      ? { id: expense.taxId, name: expense.taxName ?? expense.tax?.name ?? '', rate: quantity(expense.taxRate ?? 0) }
      : null,
    notes: expense.notes,
    receipt:
      expense.receiptFile && expense.receiptMimeType
        ? { name: expense.receiptName ?? 'receipt', mimeType: expense.receiptMimeType, size: expense.receiptSize ?? 0 }
        : null,
    createdBy: expense.createdBy,
    createdAt: toIso(expense.createdAt),
    updatedAt: toIso(expense.updatedAt),
  };
}

function auditSnapshot(expense: ExpenseDetail): Record<string, unknown> {
  return {
    expenseDate: toDateOnly(expense.expenseDate),
    category: expense.category.name,
    vendor: expense.vendor?.displayName ?? null,
    paidThrough: expense.paymentMode?.name ?? null,
    referenceNumber: expense.referenceNumber,
    amount: money(expense.amount),
    tax: expense.taxName ? `${expense.taxName} (${expense.amountIsTaxInclusive ? 'inclusive' : 'exclusive'})` : null,
    total: money(expense.total),
    notes: expense.notes,
  };
}

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ExpenseListQuery): Promise<Paginated<ExpenseListItemDto>> {
    const where = this.where(query);
    const orderBy = parseSort<Prisma.ExpenseOrderByWithRelationInput>(
      query.sort,
      {
        date: (sort) => ({ expenseDate: sort }),
        category: (sort) => ({ category: { name: sort } }),
        vendor: (sort) => ({ vendor: { displayName: sort } }),
        total: (sort) => ({ total: sort }),
      },
      '-date',
    );
    const [rows, total] = await Promise.all([
      this.prisma.expense.findMany({ where, include: EXPENSE_INCLUDE, orderBy: [orderBy, { createdAt: 'desc' }], ...pageArgs(query) }),
      this.prisma.expense.count({ where }),
    ]);
    return paginated(rows.map(toListItem), total, query);
  }

  async totals(query: ExpenseListQuery): Promise<ExpenseTotalsDto> {
    const { _count, _sum } = await this.prisma.expense.aggregate({
      where: this.where(query),
      _count: { _all: true },
      _sum: { subtotal: true, taxAmount: true, total: true },
    });
    return {
      count: _count._all,
      subtotal: money(toDecimal(_sum.subtotal)),
      taxTotal: money(toDecimal(_sum.taxAmount)),
      total: money(toDecimal(_sum.total)),
    };
  }

  async get(id: string): Promise<ExpenseDto> {
    return toExpenseDto(await this.find(id));
  }

  async create(input: ExpenseOutput): Promise<ExpenseDto> {
    const data = await this.prepare(input);
    const expense = await this.prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: { ...data, createdById: getRequestContext()?.userId ?? null },
        include: EXPENSE_INCLUDE,
      });
      await this.audit.record(
        {
          action: 'created',
          entityType: 'expense',
          entityId: created.id,
          summary: `Expense of ${money(created.total)} for ${created.category.name}${created.vendor ? ` from ${created.vendor.displayName}` : ''} recorded`,
        },
        tx,
      );
      return created;
    });
    return toExpenseDto(expense);
  }

  async update(id: string, input: ExpenseOutput): Promise<ExpenseDto> {
    const before = await this.find(id);
    const data = await this.prepare(input, before);
    const expense = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({ where: { id }, data, include: EXPENSE_INCLUDE });
      const changes = diffRecords(auditSnapshot(before), auditSnapshot(updated));
      if (changes) {
        await this.audit.record(
          { action: 'updated', entityType: 'expense', entityId: id, summary: `Expense for ${updated.category.name} updated`, changes },
          tx,
        );
      }
      return updated;
    });
    return toExpenseDto(expense);
  }

  async remove(id: string): Promise<void> {
    const expense = await this.find(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.expense.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'deleted',
          entityType: 'expense',
          entityId: id,
          summary: `Expense of ${money(expense.total)} for ${expense.category.name} on ${toDateOnly(expense.expenseDate)} deleted`,
        },
        tx,
      );
    });
    if (expense.receiptFile) await rm(path.join(RECEIPT_DIR, expense.receiptFile), { force: true });
  }

  async attachReceipt(id: string, file: UploadedReceipt | undefined): Promise<ExpenseDto> {
    const expense = await this.find(id);
    if (!file || file.size === 0) throw new AppException('FILE_REQUIRED', 'Choose a receipt to upload', HttpStatus.BAD_REQUEST);
    const format = RECEIPT_TYPES.find((type) => type.matches(file.buffer));
    if (!format) {
      throw new AppException(
        'UNSUPPORTED_FILE_TYPE',
        'The receipt must be a PNG, JPEG or WebP image, or a PDF',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }

    await mkdir(RECEIPT_DIR, { recursive: true });
    const fileName = `${id}-${Date.now()}.${format.extension}`;
    await writeFile(path.join(RECEIPT_DIR, fileName), file.buffer);
    const updated = await this.prisma.expense.update({
      where: { id },
      data: {
        receiptFile: fileName,
        receiptName: path.basename(file.originalname || `receipt.${format.extension}`).slice(0, 200),
        receiptMimeType: format.mimeType,
        receiptSize: file.size,
      },
      include: EXPENSE_INCLUDE,
    });
    if (expense.receiptFile) await rm(path.join(RECEIPT_DIR, expense.receiptFile), { force: true });
    await this.audit.record({
      action: 'updated',
      entityType: 'expense',
      entityId: id,
      summary: `Receipt ${updated.receiptName} attached`,
    });
    return toExpenseDto(updated);
  }

  async removeReceipt(id: string): Promise<ExpenseDto> {
    const expense = await this.find(id);
    if (!expense.receiptFile) return toExpenseDto(expense);
    const updated = await this.prisma.expense.update({
      where: { id },
      data: { receiptFile: null, receiptName: null, receiptMimeType: null, receiptSize: null },
      include: EXPENSE_INCLUDE,
    });
    await rm(path.join(RECEIPT_DIR, expense.receiptFile), { force: true });
    await this.audit.record({ action: 'updated', entityType: 'expense', entityId: id, summary: 'Receipt removed' });
    return toExpenseDto(updated);
  }

  async receipt(id: string): Promise<{ filePath: string; mimeType: string; name: string } | null> {
    const expense = await this.find(id);
    if (!expense.receiptFile || !expense.receiptMimeType) return null;
    return {
      filePath: path.join(RECEIPT_DIR, expense.receiptFile),
      mimeType: expense.receiptMimeType,
      name: expense.receiptName ?? 'receipt',
    };
  }

  async history(id: string): Promise<AuditLogDto[]> {
    await this.find(id);
    return this.audit.history('expense', id);
  }

  /** Validates references and works out the tax, keeping the tax name and rate used at the time. */
  private async prepare(input: ExpenseOutput, before?: ExpenseDetail) {
    const [category, tax, paymentMode, vendor] = await Promise.all([
      this.prisma.expenseCategory.findUnique({ where: { id: input.categoryId }, select: { id: true, isActive: true } }),
      input.taxId ? this.prisma.tax.findUnique({ where: { id: input.taxId } }) : null,
      input.paymentModeId ? this.prisma.paymentMode.findUnique({ where: { id: input.paymentModeId }, select: { id: true } }) : null,
      input.vendorId
        ? this.prisma.contact.findFirst({ where: { id: input.vendorId, type: 'vendor' }, select: { id: true, isActive: true } })
        : null,
    ]);
    // Inactive choices stay valid on an expense that already uses them.
    if (!category || (!category.isActive && before?.categoryId !== category.id)) {
      throw fieldError('CATEGORY_NOT_AVAILABLE', 'categoryId', 'Select an active expense category');
    }
    if (input.taxId && !tax) throw fieldError('TAX_NOT_FOUND', 'taxId', 'Select a valid tax');
    if (input.paymentModeId && !paymentMode) throw fieldError('PAYMENT_MODE_NOT_FOUND', 'paymentModeId', 'Select a valid payment mode');
    if (input.vendorId && (!vendor || (!vendor.isActive && before?.vendorId !== vendor.id))) {
      throw fieldError('VENDOR_NOT_AVAILABLE', 'vendorId', 'Select an active vendor');
    }

    // An unchanged tax keeps its original rate even if the tax has been edited since.
    const keepRate = before && before.taxId === input.taxId && before.taxRate !== null;
    const taxRate = tax ? (keepRate ? before.taxRate : tax.rate) : null;
    const taxName = tax ? (keepRate ? before.taxName : tax.name) : null;
    const amounts = calculateExpenseAmounts({ amount: input.amount, taxRate, amountIsTaxInclusive: input.amountIsTaxInclusive });

    return {
      expenseDate: fromDateOnly(input.expenseDate),
      categoryId: input.categoryId,
      vendorId: input.vendorId,
      paymentModeId: input.paymentModeId,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
      amount: input.amount,
      amountIsTaxInclusive: tax ? input.amountIsTaxInclusive : false,
      taxId: input.taxId,
      taxName,
      taxRate,
      ...amounts,
    };
  }

  private where(query: ExpenseListQuery): Prisma.ExpenseWhereInput {
    const and: Prisma.ExpenseWhereInput[] = [];
    if (query.categoryId) and.push({ categoryId: query.categoryId });
    if (query.vendorId) and.push({ vendorId: query.vendorId });
    if (query.paymentModeId) and.push({ paymentModeId: query.paymentModeId });
    if (query.dateFrom) and.push({ expenseDate: { gte: fromDateOnly(query.dateFrom) } });
    if (query.dateTo) and.push({ expenseDate: { lte: fromDateOnly(query.dateTo) } });
    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' as const };
      and.push({
        OR: [
          { referenceNumber: contains },
          { notes: contains },
          { category: { name: contains } },
          { vendor: { displayName: contains } },
        ],
      });
    }
    return { AND: and };
  }

  private async find(id: string): Promise<ExpenseDetail> {
    const expense = await this.prisma.expense.findUnique({ where: { id }, include: EXPENSE_INCLUDE });
    if (!expense) throw notFound('Expense');
    return expense;
  }
}
