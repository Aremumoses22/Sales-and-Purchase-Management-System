import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { ItemsModule } from '../items/items.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { SalesReceiptsController } from './sales-receipts.controller.js';
import { SalesReceiptsService } from './sales-receipts.service.js';

@Module({
  imports: [SettingsModule, DocumentsModule, ItemsModule],
  controllers: [SalesReceiptsController],
  providers: [SalesReceiptsService],
})
export class SalesReceiptsModule {}
