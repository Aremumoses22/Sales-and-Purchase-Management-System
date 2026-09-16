import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { DEFAULT_NUMBER_SERIES, DEFAULT_ROLES, DOCUMENT_TYPES } from '@spms/shared';
import * as argon2 from 'argon2';
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '../src/generated/prisma/client.js';

const PAYMENT_TERMS = [
  { name: 'Due on Receipt', days: 0 },
  { name: 'Net 15', days: 15 },
  { name: 'Net 30', days: 30, isDefault: true },
  { name: 'Net 45', days: 45 },
  { name: 'Net 60', days: 60 },
];

const PAYMENT_MODES = [{ name: 'Cash', isDefault: true }, { name: 'Bank Transfer' }, { name: 'Cheque' }, { name: 'Card' }];

const EXPENSE_CATEGORIES = [
  'Advertising & Marketing',
  'Bank Fees & Charges',
  'Fuel & Transport',
  'Internet & Telephone',
  'Meals & Entertainment',
  'Office Supplies',
  'Professional Fees',
  'Rent',
  'Repairs & Maintenance',
  'Salaries & Wages',
  'Travel',
  'Utilities',
  'Other Expenses',
];

/** Idempotent: safe to run repeatedly, and never overwrites settings an admin has changed. */
export async function seed(prisma: PrismaClient): Promise<void> {
  await prisma.organization.upsert({ where: { id: 1 }, create: { id: 1, name: 'My Company' }, update: {} });

  for (const role of DEFAULT_ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      create: {
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        permissions: [...role.permissions],
      },
      update: role.isSystem ? { isSystem: true, permissions: [...role.permissions] } : {},
    });
  }

  for (const documentType of DOCUMENT_TYPES) {
    const defaults = DEFAULT_NUMBER_SERIES[documentType];
    await prisma.numberSeries.upsert({
      where: { documentType },
      create: { documentType, prefix: defaults.prefix, padding: defaults.padding, nextNumber: 1 },
      update: {},
    });
  }

  if ((await prisma.paymentTerm.count()) === 0) await prisma.paymentTerm.createMany({ data: PAYMENT_TERMS });
  if ((await prisma.paymentMode.count()) === 0) await prisma.paymentMode.createMany({ data: PAYMENT_MODES });
  if ((await prisma.expenseCategory.count()) === 0) {
    await prisma.expenseCategory.createMany({ data: EXPENSE_CATEGORIES.map((name) => ({ name })) });
  }

  if ((await prisma.user.count()) === 0) {
    const email = (process.env['SEED_ADMIN_EMAIL'] ?? 'admin@example.com').toLowerCase();
    const password = process.env['SEED_ADMIN_PASSWORD'] ?? 'Admin12345';
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'Admin' } });
    await prisma.user.create({
      data: { name: 'Administrator', email, passwordHash: await argon2.hash(password), roleId: adminRole.id },
    });
    console.log(`Created admin user ${email}`);
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }) });
  try {
    await seed(prisma);
    console.log('Seed complete');
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
