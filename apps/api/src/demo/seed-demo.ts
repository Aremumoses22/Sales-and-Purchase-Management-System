/**
 * Demo data: a year of realistic activity for a Lagos office supplies business, created through
 * the application's own services so balances, stock, numbering and the audit log are all real.
 *
 *   pnpm --filter @spms/api run db:seed:demo
 *
 * Runs only on a database with no transactions yet (set DEMO_SEED_FORCE=true to add to one that
 * has some) and never when NODE_ENV=production. The random choices are seeded, so every run on an
 * empty database produces the same data relative to today's date.
 */
process.env['RECURRING_JOB_ENABLED'] = 'false';

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  addDays,
  addMonths,
  billSchema,
  contactSchema,
  creditNoteSchema,
  expenseSchema,
  invoiceSchema,
  itemSchema,
  paymentMadeSchema,
  paymentReceivedSchema,
  quoteSchema,
  recurringInvoiceSchema,
  salesReceiptSchema,
  taxSchema,
  todayInTimeZone,
  toDecimal,
  type ContactDto,
  type ItemDto,
  type TaxDto,
} from '@spms/shared';
import { AppModule } from '../app.module.js';
import { BillsService } from '../modules/bills/bills.service.js';
import { PaymentsMadeService } from '../modules/bills/payments-made.service.js';
import { ContactsService } from '../modules/contacts/contacts.service.js';
import { CreditNotesService } from '../modules/credit-notes/credit-notes.service.js';
import { ExpensesService } from '../modules/expenses/expenses.service.js';
import { InvoicesService } from '../modules/invoices/invoices.service.js';
import { ItemsService } from '../modules/items/items.service.js';
import { PaymentsService } from '../modules/payments/payments.service.js';
import { QuotesService } from '../modules/quotes/quotes.service.js';
import { RecurringInvoicesService } from '../modules/recurring-invoices/recurring-invoices.service.js';
import { SalesReceiptsService } from '../modules/sales-receipts/sales-receipts.service.js';
import { OrganizationService } from '../modules/settings/organization.service.js';
import { TaxesService } from '../modules/settings/lookups.services.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Progress goes straight to the console; the app's logger is limited to warnings and errors. */
const logger = { log: (message: string) => console.log(`[demo] ${message}`), error: (message: string) => console.error(`[demo] ${message}`) };

/** Small deterministic generator (mulberry32) so demo data is reproducible. */
function random(seed: number) {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(values: readonly T[]): T => values[Math.floor(next() * values.length)] as T,
    chance: (probability: number) => next() < probability,
  };
}

const CUSTOMERS = [
  ['Zenith Logistics Ltd', 'Ikeja', 'accounts@zenithlogistics.ng'],
  ['Adebayo & Sons Enterprises', 'Surulere', 'adebayo.sons@gmail.com'],
  ['Lekki Medical Centre', 'Lekki', 'procurement@lekkimedical.ng'],
  ['Unity Grammar School', 'Yaba', 'bursar@unitygrammar.edu.ng'],
  ['Okafor Legal Chambers', 'Victoria Island', 'office@okaforlegal.ng'],
  ['Crestview Hotels', 'Ikoyi', 'purchasing@crestviewhotels.ng'],
  ['Sunrise Bakery', 'Ogba', 'sunrisebakery@yahoo.com'],
  ['Delta Tech Hub', 'Yaba', 'ops@deltatechhub.io'],
  ['Mainland Pharmacy', 'Maryland', 'mainlandpharmacy@gmail.com'],
  ['Harbour Point Shipping', 'Apapa', 'finance@harbourpoint.ng'],
  ['Greenfield Estates', 'Ajah', 'admin@greenfieldestates.ng'],
  ['Kingsway Church', 'Festac', 'secretary@kingswaychurch.org'],
] as const;

const VENDORS = [
  ['Afprint Paper Mills', 'Isolo'],
  ['Dangote Office Furniture', 'Oregun'],
  ['Slot Systems Ltd', 'Ikeja'],
  ['Lagos Property Managers', 'Victoria Island'],
  ['Ikeja Electric', 'Ikeja'],
  ['Spectranet Internet', 'Lekki'],
] as const;

const ITEMS = [
  { name: 'A4 Paper (Ream)', sku: 'PAP-A4', unit: 'pcs', selling: '6500', cost: '4800', stock: '400', vendor: 0 },
  { name: 'Ballpoint Pens (Box of 50)', sku: 'PEN-50', unit: 'box', selling: '4500', cost: '3000', stock: '150', vendor: 0 },
  { name: 'Box Files', sku: 'FIL-BOX', unit: 'pcs', selling: '1800', cost: '1100', stock: '300', vendor: 0 },
  { name: 'Printer Toner Cartridge', sku: 'TON-85A', unit: 'pcs', selling: '38000', cost: '29000', stock: '60', vendor: 2 },
  { name: 'Executive Office Chair', sku: 'CHR-EXE', unit: 'pcs', selling: '145000', cost: '98000', stock: '25', vendor: 1 },
  { name: 'Office Desk (1.4m)', sku: 'DSK-140', unit: 'pcs', selling: '185000', cost: '126000', stock: '15', vendor: 1 },
  { name: 'Filing Cabinet (4 Drawer)', sku: 'CAB-4D', unit: 'pcs', selling: '160000', cost: '112000', stock: '12', vendor: 1 },
  { name: 'Whiteboard (4x3 ft)', sku: 'WBD-43', unit: 'pcs', selling: '42000', cost: '28000', stock: '30', vendor: 0 },
  { name: 'Laptop (Core i5, 16GB)', sku: 'LAP-I5', unit: 'pcs', selling: '720000', cost: '610000', stock: '10', vendor: 2 },
  { name: 'Wireless Keyboard & Mouse', sku: 'KBM-WL', unit: 'set', selling: '28000', cost: '18500', stock: '60', vendor: 2 },
] as const;

const SERVICES = [
  { name: 'Office Setup & Installation', selling: '85000' },
  { name: 'IT Support (per visit)', selling: '45000' },
  { name: 'Delivery (Lagos Mainland)', selling: '7500' },
] as const;

async function main() {
  if (process.env['NODE_ENV'] === 'production') throw new Error('The demo seed never runs with NODE_ENV=production.');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const existing = (await prisma.invoice.count()) + (await prisma.expense.count()) + (await prisma.bill.count());
    if (existing > 0 && process.env['DEMO_SEED_FORCE'] !== 'true') {
      throw new Error(
        `This database already has ${existing} transactions. Run the demo seed on an empty database, or set DEMO_SEED_FORCE=true to add demo data anyway.`,
      );
    }
    if ((await prisma.expenseCategory.count()) === 0) throw new Error('Run `pnpm db:seed` first to create the lists the demo data uses.');

    const contacts = app.get(ContactsService);
    const items = app.get(ItemsService);
    const quotes = app.get(QuotesService);
    const invoices = app.get(InvoicesService);
    const payments = app.get(PaymentsService);
    const creditNotes = app.get(CreditNotesService);
    const salesReceipts = app.get(SalesReceiptsService);
    const expenses = app.get(ExpensesService);
    const bills = app.get(BillsService);
    const paymentsMade = app.get(PaymentsMadeService);
    const recurring = app.get(RecurringInvoicesService);
    const taxes = app.get(TaxesService);
    const organization = app.get(OrganizationService);

    const rng = random(20260917);
    const today = todayInTimeZone(await organization.timezone());
    const start = addMonths(`${today.slice(0, 7)}-01`, -11);
    const dayIn = (month: string, day: number) => {
      const date = `${month}-${String(Math.min(day, 28)).padStart(2, '0')}`;
      return date > today ? today : date;
    };

    const [terms, modes, categories] = await Promise.all([
      prisma.paymentTerm.findMany(),
      prisma.paymentMode.findMany(),
      prisma.expenseCategory.findMany(),
    ]);
    const term = (days: number) => terms.find((row) => row.days === days) ?? terms[0];
    const mode = (name: string) => modes.find((row) => row.name === name)?.id ?? null;
    const category = (name: string) => categories.find((row) => row.name === name)?.id as string;

    const vat: TaxDto =
      (await taxes.list(true)).find((tax) => tax.name === 'VAT') ?? (await taxes.create(taxSchema.parse({ name: 'VAT', rate: '7.5' })));

    logger.log('Creating customers, vendors and items');
    const customers: ContactDto[] = [];
    for (const [index, [name, area, email]] of CUSTOMERS.entries()) {
      customers.push(
        await contacts.create(
          'customer',
          contactSchema.parse({
            kind: 'business',
            companyName: name,
            displayName: name,
            email,
            workPhone: `+234 80${index + 1} 555 ${String(1000 + index * 37).slice(0, 4)}`,
            paymentTermId: term(index % 3 === 0 ? 15 : 30)?.id ?? null,
            billingAddress: { line1: `${12 + index} Adeola Odeku Street`, city: area, state: 'Lagos', country: 'Nigeria' },
            contactPersons: [{ firstName: rng.pick(['Chidi', 'Aisha', 'Tunde', 'Ngozi', 'Emeka', 'Funmi']), lastName: rng.pick(['Okeke', 'Bello', 'Adeyemi', 'Eze']), email, isPrimary: true }],
          }),
        ),
      );
    }
    const vendors: ContactDto[] = [];
    for (const [name, area] of VENDORS) {
      vendors.push(
        await contacts.create(
          'vendor',
          contactSchema.parse({
            kind: 'business',
            companyName: name,
            displayName: name,
            paymentTermId: term(30)?.id ?? null,
            billingAddress: { line1: 'Industrial Avenue', city: area, state: 'Lagos', country: 'Nigeria' },
          }),
        ),
      );
    }
    const goods: ItemDto[] = [];
    for (const item of ITEMS) {
      goods.push(
        await items.create(
          itemSchema.parse({
            type: 'goods',
            name: item.name,
            sku: item.sku,
            unit: item.unit,
            sellingPrice: item.selling,
            costPrice: item.cost,
            taxId: vat.id,
            preferredVendorId: vendors[item.vendor]?.id ?? null,
            trackInventory: true,
            openingStock: item.stock,
            reorderLevel: String(Math.max(2, Math.round(Number(item.stock) / 10))),
          }),
        ),
      );
    }
    const services: ItemDto[] = [];
    for (const service of SERVICES) {
      services.push(await items.create(itemSchema.parse({ type: 'service', name: service.name, sellingPrice: service.selling, taxId: vat.id })));
    }

    // Track stock as documents are created, so sales never exceed what is on the shelf.
    const stock = new Map<string, number>(goods.map((item, index) => [item.id, Number(ITEMS[index]?.stock ?? 0)]));
    const target = new Map<string, number>(goods.map((item, index) => [item.id, Number(ITEMS[index]?.stock ?? 0)]));
    const take = (lines: { itemId: string; quantity: string }[]) => {
      for (const line of lines) if (stock.has(line.itemId)) stock.set(line.itemId, (stock.get(line.itemId) ?? 0) - Number(line.quantity));
    };

    const lineFor = (item: ItemDto, quantity: number) => ({
      itemId: item.id,
      name: item.name,
      quantity: String(quantity),
      rate: item.sellingPrice ?? '0',
      unit: item.unit,
      taxId: vat.id,
    });
    const salesLines = () => {
      const count = rng.int(1, 3);
      const lines = [];
      const used = new Set<string>();
      for (let i = 0; i < count; i += 1) {
        const item = rng.chance(0.8) ? rng.pick(goods) : rng.pick(services);
        if (used.has(item.id)) continue;
        used.add(item.id);
        const expensive = Number(item.sellingPrice) > 100000;
        const wanted = expensive ? rng.int(1, 3) : rng.int(2, 25);
        const available = stock.has(item.id) ? (stock.get(item.id) ?? 0) : Number.POSITIVE_INFINITY;
        if (available < wanted) continue;
        lines.push(lineFor(item, wanted));
      }
      if (lines.length === 0) lines.push(lineFor(services[1] as ItemDto, 1));
      take(lines);
      return lines;
    };

    const counts = { invoices: 0, payments: 0, receipts: 0, expenses: 0, bills: 0, quotes: 0, creditNotes: 0 };

    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      const month = addMonths(start, monthIndex).slice(0, 7);
      logger.log(`Month ${month}`);
      const isCurrentMonth = monthIndex === 11;

      // Restock from each supplier at the start of the month, then pay most bills.
      for (const vendorIndex of [0, 1, 2]) {
        const lines = goods
          .map((item, index) => ({ item, index }))
          .filter(({ index }) => ITEMS[index]?.vendor === vendorIndex)
          .map(({ item }) => ({ item, quantity: (target.get(item.id) ?? 0) - (stock.get(item.id) ?? 0) }))
          .filter(({ quantity }) => quantity > 0);
        if (lines.length === 0) continue;
        const billDate = dayIn(month, rng.int(1, 5));
        const bill = await bills.create(
          billSchema.parse({
            vendorId: vendors[vendorIndex]?.id,
            billNumber: `${VENDORS[vendorIndex]?.[0].split(' ')[0]?.toUpperCase()}-${month.replace('-', '')}`,
            billDate,
            dueDate: addDays(billDate, 30),
            paymentTermId: term(30)?.id ?? null,
            lines: lines.map(({ item, quantity }) => ({ itemId: item.id, name: item.name, quantity: String(quantity), rate: item.costPrice ?? '0', taxId: vat.id })),
            saveAs: 'open',
          }),
        );
        for (const { item, quantity } of lines) stock.set(item.id, (stock.get(item.id) ?? 0) + quantity);
        counts.bills += 1;
        if (!isCurrentMonth || rng.chance(0.3)) {
          const paid = rng.chance(0.85) ? bill.total : toDecimal(bill.total).div(2).toFixed(2);
          await paymentsMade.create(
            paymentMadeSchema.parse({
              vendorId: bill.vendor.id,
              paymentDate: dayIn(month, rng.int(15, 27)),
              amount: paid,
              paymentModeId: mode('Bank Transfer'),
              referenceNumber: `GTB-${rng.int(100000, 999999)}`,
              allocations: [{ billId: bill.id, amount: paid }],
            }),
          );
        }
      }

      // Quotes, some of which turn into invoices.
      for (let q = 0; q < rng.int(2, 4); q += 1) {
        const customer = rng.pick(customers);
        const quoteDate = dayIn(month, rng.int(2, 20));
        const quote = await quotes.create(
          quoteSchema.parse({ customerId: customer.id, quoteDate, expiryDate: addDays(quoteDate, 30), lines: salesLines(), saveAs: 'sent' }),
        );
        counts.quotes += 1;
        if (rng.chance(0.5)) {
          await quotes.accept(quote.id);
          const draft = await invoices.convertQuote(quote.id);
          await invoices.markSent(draft.id);
          counts.invoices += 1;
        } else if (rng.chance(0.4)) {
          await quotes.decline(quote.id);
        }
      }

      // Invoices, mostly paid on time, some partly, recent ones still open.
      for (let i = 0; i < rng.int(6, 10); i += 1) {
        const customer = rng.pick(customers);
        const invoiceDate = dayIn(month, rng.int(1, 26));
        const days = customer.paymentTerm?.days ?? 30;
        const invoice = await invoices.create(
          invoiceSchema.parse({
            customerId: customer.id,
            invoiceDate,
            dueDate: addDays(invoiceDate, days),
            paymentTermId: customer.paymentTerm?.id ?? null,
            orderNumber: rng.chance(0.4) ? `LPO-${rng.int(1000, 9999)}` : '',
            lines: salesLines(),
            shippingCharge: rng.chance(0.3) ? '7500' : '0',
            saveAs: 'sent',
          }),
        );
        counts.invoices += 1;
        const age = monthIndex >= 10 ? rng.next() : 1;
        const paymentDate = addDays(invoiceDate, rng.int(3, days + 10));
        if (paymentDate > today || age < 0.35) continue;
        const amount = rng.chance(0.15) ? toDecimal(invoice.total).times(0.5).toFixed(2) : invoice.total;
        await payments.create(
          paymentReceivedSchema.parse({
            customerId: customer.id,
            paymentDate,
            amount,
            paymentModeId: mode(rng.pick(['Bank Transfer', 'Bank Transfer', 'Cheque', 'Card'])),
            referenceNumber: `TRF-${rng.int(100000, 999999)}`,
            allocations: [{ invoiceId: invoice.id, amount }],
          }),
        );
        counts.payments += 1;
      }

      // Walk-in sales paid on the spot.
      for (let r = 0; r < rng.int(3, 6); r += 1) {
        await salesReceipts.create(
          salesReceiptSchema.parse({
            customerId: rng.pick(customers).id,
            receiptDate: dayIn(month, rng.int(1, 28)),
            paymentModeId: mode(rng.pick(['Cash', 'Card'])),
            referenceNumber: `POS-${rng.int(1000, 9999)}`,
            lines: (() => {
              const item = rng.pick(goods.slice(0, 4));
              const lines = [lineFor(item, Math.max(1, Math.min(rng.int(1, 10), stock.get(item.id) ?? 0)))];
              if ((stock.get(item.id) ?? 0) < 1) return [lineFor(services[2] as ItemDto, 1)];
              take(lines);
              return lines;
            })(),
            saveAs: 'completed',
          }),
        );
        counts.receipts += 1;
      }

      // Running costs.
      const monthly: [string, string, number | null, string][] = [
        ['Rent', '850000', 3, 'Bank Transfer'],
        ['Salaries & Wages', '2400000', null, 'Bank Transfer'],
        ['Utilities', String(rng.int(95, 180) * 1000), 4, 'Bank Transfer'],
        ['Internet & Telephone', '65000', 5, 'Card'],
        ['Fuel & Transport', String(rng.int(80, 160) * 1000), null, 'Cash'],
      ];
      for (const [name, amount, vendorIndex, paidThrough] of monthly) {
        await expenses.create(
          expenseSchema.parse({
            expenseDate: dayIn(month, name === 'Salaries & Wages' ? 27 : rng.int(1, 25)),
            categoryId: category(name),
            amount,
            taxId: name === 'Utilities' || name === 'Internet & Telephone' ? vat.id : null,
            amountIsTaxInclusive: true,
            vendorId: vendorIndex === null ? null : (vendors[vendorIndex]?.id ?? null),
            paymentModeId: mode(paidThrough),
            referenceNumber: name === 'Rent' ? `RENT-${month}` : '',
          }),
        );
        counts.expenses += 1;
      }
      if (rng.chance(0.6)) {
        await expenses.create(
          expenseSchema.parse({
            expenseDate: dayIn(month, rng.int(1, 28)),
            categoryId: category(rng.pick(['Advertising & Marketing', 'Repairs & Maintenance', 'Meals & Entertainment', 'Bank Fees & Charges'])),
            amount: String(rng.int(15, 120) * 1000),
            paymentModeId: mode('Card'),
          }),
        );
        counts.expenses += 1;
      }
    }

    logger.log('Adding credit notes and recurring profiles');
    const damaged = await invoices.create(
      invoiceSchema.parse({
        customerId: customers[5]?.id,
        invoiceDate: addDays(today, -20),
        dueDate: addDays(today, 10),
        lines: [lineFor(goods[4] as ItemDto, Math.min(4, stock.get((goods[4] as ItemDto).id) ?? 0) || 1)],
        saveAs: 'sent',
      }),
    );
    const credit = await creditNotes.create(
      creditNoteSchema.parse({
        customerId: customers[5]?.id,
        invoiceId: damaged.id,
        creditNoteDate: addDays(today, -15),
        reason: 'One chair delivered with a broken base',
        returnToStock: true,
        lines: [lineFor(goods[4] as ItemDto, 1)],
        saveAs: 'open',
      }),
    );
    await creditNotes.apply(credit.id, { applications: [{ invoiceId: damaged.id, amount: credit.total }] });
    counts.invoices += 1;
    counts.creditNotes += 1;

    for (const [customerIndex, name, rate] of [
      [7, 'Monthly IT support retainer', '350000'],
      [2, 'Quarterly printer servicing', '180000'],
    ] as const) {
      await recurring.create(
        recurringInvoiceSchema.parse({
          name,
          customerId: customers[customerIndex]?.id,
          repeatEvery: name.startsWith('Quarterly') ? 3 : 1,
          repeatUnit: 'month',
          startDate: addDays(today, 3),
          paymentTermId: term(15)?.id ?? null,
          createAs: 'sent',
          lines: [{ name, quantity: '1', rate, taxId: vat.id }],
        }),
      );
    }

    logger.log(
      `Done: ${customers.length} customers, ${vendors.length} vendors, ${goods.length + services.length} items, ${counts.quotes} quotes, ${counts.invoices} invoices, ${counts.payments} payments, ${counts.receipts} sales receipts, ${counts.creditNotes} credit note, ${counts.bills} bills, ${counts.expenses} expenses and 2 recurring profiles.`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
