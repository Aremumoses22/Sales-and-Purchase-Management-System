import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AuthGuard, CsrfGuard, PermissionsGuard } from './modules/auth/guards.js';
import { BillsModule } from './modules/bills/bills.module.js';
import { ContactsModule } from './modules/contacts/contacts.module.js';
import { DocumentsModule } from './modules/documents/documents.module.js';
import { ExpensesModule } from './modules/expenses/expenses.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { InvoicesModule } from './modules/invoices/invoices.module.js';
import { ItemsModule } from './modules/items/items.module.js';
import { CreditNotesModule } from './modules/credit-notes/credit-notes.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { SalesReceiptsModule } from './modules/sales-receipts/sales-receipts.module.js';
import { QuotesModule } from './modules/quotes/quotes.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { RecurringInvoicesModule } from './modules/recurring-invoices/recurring-invoices.module.js';
import { SearchController } from './modules/search/search.controller.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    AuthModule,
    SettingsModule,
    UsersModule,
    ContactsModule,
    ItemsModule,
    DocumentsModule,
    QuotesModule,
    InvoicesModule,
    PaymentsModule,
    CreditNotesModule,
    SalesReceiptsModule,
    RecurringInvoicesModule,
    ExpensesModule,
    BillsModule,
    ReportsModule,
    DashboardModule,
  ],
  controllers: [HealthController, SearchController],
  providers: [
    // Order matters: CSRF check, then session, then permissions.
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
