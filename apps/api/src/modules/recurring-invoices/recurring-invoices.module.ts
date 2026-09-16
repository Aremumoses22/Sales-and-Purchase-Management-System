import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { InvoicesModule } from '../invoices/invoices.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { RecurringInvoicesController } from './recurring-invoices.controller.js';
import { RecurringInvoicesScheduler } from './recurring-invoices.scheduler.js';
import { RecurringInvoicesService } from './recurring-invoices.service.js';

@Module({
  imports: [SettingsModule, DocumentsModule, InvoicesModule],
  controllers: [RecurringInvoicesController],
  providers: [RecurringInvoicesService, RecurringInvoicesScheduler],
})
export class RecurringInvoicesModule {}
