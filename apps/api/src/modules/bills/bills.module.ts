import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { ItemsModule } from '../items/items.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { BillsController, PaymentsMadeController } from './bills.controller.js';
import { BillsService } from './bills.service.js';
import { PaymentsMadeService } from './payments-made.service.js';

@Module({
  imports: [SettingsModule, DocumentsModule, ItemsModule],
  controllers: [BillsController, PaymentsMadeController],
  providers: [BillsService, PaymentsMadeService],
})
export class BillsModule {}
