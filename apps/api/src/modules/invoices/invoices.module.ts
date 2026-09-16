import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { ItemsModule } from '../items/items.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesService } from './invoices.service.js';

@Module({
  imports: [SettingsModule, DocumentsModule, ItemsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
