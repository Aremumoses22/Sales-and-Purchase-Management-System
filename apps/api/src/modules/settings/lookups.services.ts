import { Injectable } from '@nestjs/common';
import type {
  expenseCategorySchema,
  ExpenseCategoryDto,
  paymentModeSchema,
  PaymentModeDto,
  paymentTermSchema,
  PaymentTermDto,
  taxSchema,
  TaxDto,
} from '@spms/shared';
import type { z } from 'zod';
import { quantity } from '../../common/serialize.js';
import type { ExpenseCategory, PaymentMode, PaymentTerm, Tax } from '../../generated/prisma/client.js';
import type { PrismaService, Tx } from '../../prisma/prisma.service.js';
import { LookupService } from './lookup.service.js';

@Injectable()
export class PaymentTermsService extends LookupService<PaymentTerm, PaymentTermDto, z.output<typeof paymentTermSchema>> {
  protected readonly entityType = 'payment_term';
  protected readonly label = 'Payment term';
  protected readonly orderBy = [{ days: 'asc' as const }, { name: 'asc' as const }];

  protected delegate(db: PrismaService | Tx) {
    return db.paymentTerm;
  }

  protected toDto(row: PaymentTerm): PaymentTermDto {
    return { id: row.id, name: row.name, days: row.days, isDefault: row.isDefault, isActive: row.isActive };
  }

  protected override async usageCount(id: string): Promise<number> {
    const [contacts, invoices, recurringProfiles] = await Promise.all([
      this.prisma.contact.count({ where: { paymentTermId: id } }),
      this.prisma.invoice.count({ where: { paymentTermId: id } }),
      this.prisma.recurringInvoiceProfile.count({ where: { paymentTermId: id } }),
    ]);
    return contacts + invoices + recurringProfiles;
  }
}

@Injectable()
export class TaxesService extends LookupService<Tax, TaxDto, z.output<typeof taxSchema>> {
  protected readonly entityType = 'tax';
  protected readonly label = 'Tax';
  protected readonly orderBy = [{ name: 'asc' as const }];

  protected delegate(db: PrismaService | Tx) {
    return db.tax;
  }

  protected toDto(row: Tax): TaxDto {
    return { id: row.id, name: row.name, rate: quantity(row.rate), isActive: row.isActive };
  }

  protected override async usageCount(id: string): Promise<number> {
    const [items, quoteLines, invoiceLines, creditNoteLines, salesReceiptLines, recurringLines, expenses] = await Promise.all([
      this.prisma.item.count({ where: { taxId: id } }),
      this.prisma.quoteLine.count({ where: { taxId: id } }),
      this.prisma.invoiceLine.count({ where: { taxId: id } }),
      this.prisma.creditNoteLine.count({ where: { taxId: id } }),
      this.prisma.salesReceiptLine.count({ where: { taxId: id } }),
      this.prisma.recurringInvoiceLine.count({ where: { taxId: id } }),
      this.prisma.expense.count({ where: { taxId: id } }),
    ]);
    return items + quoteLines + invoiceLines + creditNoteLines + salesReceiptLines + recurringLines + expenses;
  }
}

@Injectable()
export class PaymentModesService extends LookupService<PaymentMode, PaymentModeDto, z.output<typeof paymentModeSchema>> {
  protected readonly entityType = 'payment_mode';
  protected readonly label = 'Payment mode';
  protected readonly orderBy = [{ name: 'asc' as const }];

  protected delegate(db: PrismaService | Tx) {
    return db.paymentMode;
  }

  protected toDto(row: PaymentMode): PaymentModeDto {
    return { id: row.id, name: row.name, isDefault: row.isDefault, isActive: row.isActive };
  }

  protected override async usageCount(id: string): Promise<number> {
    const [payments, refunds, creditRefunds, salesReceipts, expenses] = await Promise.all([
      this.prisma.paymentReceived.count({ where: { paymentModeId: id } }),
      this.prisma.paymentRefund.count({ where: { paymentModeId: id } }),
      this.prisma.creditNoteRefund.count({ where: { paymentModeId: id } }),
      this.prisma.salesReceipt.count({ where: { paymentModeId: id } }),
      this.prisma.expense.count({ where: { paymentModeId: id } }),
    ]);
    return payments + refunds + creditRefunds + salesReceipts + expenses;
  }
}

@Injectable()
export class ExpenseCategoriesService extends LookupService<
  ExpenseCategory,
  ExpenseCategoryDto,
  z.output<typeof expenseCategorySchema>
> {
  protected readonly entityType = 'expense_category';
  protected readonly label = 'Expense category';
  protected readonly orderBy = [{ name: 'asc' as const }];

  protected delegate(db: PrismaService | Tx) {
    return db.expenseCategory;
  }

  protected toDto(row: ExpenseCategory): ExpenseCategoryDto {
    return { id: row.id, name: row.name, description: row.description, isActive: row.isActive };
  }

  protected override usageCount(id: string): Promise<number> {
    return this.prisma.expense.count({ where: { categoryId: id } });
  }
}
