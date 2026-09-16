import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AuthGuard, CsrfGuard, PermissionsGuard } from './modules/auth/guards.js';
import { ContactsModule } from './modules/contacts/contacts.module.js';
import { DocumentsModule } from './modules/documents/documents.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { ItemsModule } from './modules/items/items.module.js';
import { QuotesModule } from './modules/quotes/quotes.module.js';
import { SearchController } from './modules/search/search.controller.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AuthModule,
    SettingsModule,
    UsersModule,
    ContactsModule,
    ItemsModule,
    DocumentsModule,
    QuotesModule,
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
