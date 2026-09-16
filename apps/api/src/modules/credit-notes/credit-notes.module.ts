import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { InvoicesModule } from '../invoices/invoices.module.js';
import { ItemsModule } from '../items/items.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { CreditNotesController } from './credit-notes.controller.js';
import { CreditNotesService } from './credit-notes.service.js';

@Module({
  imports: [SettingsModule, DocumentsModule, ItemsModule, InvoicesModule],
  controllers: [CreditNotesController],
  providers: [CreditNotesService],
  exports: [CreditNotesService],
})
export class CreditNotesModule {}
