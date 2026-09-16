import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { InvoiceCreditsController, PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [SettingsModule, InvoicesModule],
  controllers: [PaymentsController, InvoiceCreditsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
