import { Module } from '@nestjs/common';
import {
  ExpenseCategoriesController,
  PaymentModesController,
  PaymentTermsController,
  TaxesController,
} from './lookups.controllers.js';
import {
  ExpenseCategoriesService,
  PaymentModesService,
  PaymentTermsService,
  TaxesService,
} from './lookups.services.js';
import { NumberSeriesController } from './number-series.controller.js';
import { NumberSeriesService } from './number-series.service.js';
import { OrganizationController } from './organization.controller.js';
import { OrganizationService } from './organization.service.js';

@Module({
  controllers: [
    OrganizationController,
    NumberSeriesController,
    PaymentTermsController,
    TaxesController,
    PaymentModesController,
    ExpenseCategoriesController,
  ],
  providers: [
    OrganizationService,
    NumberSeriesService,
    PaymentTermsService,
    TaxesService,
    PaymentModesService,
    ExpenseCategoriesService,
  ],
  exports: [OrganizationService, NumberSeriesService],
})
export class SettingsModule {}
