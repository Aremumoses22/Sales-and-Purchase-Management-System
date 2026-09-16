import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { InvoicesModule } from '../invoices/invoices.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { QuotesController } from './quotes.controller.js';
import { QuotesService } from './quotes.service.js';

@Module({
  imports: [SettingsModule, DocumentsModule, InvoicesModule],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
