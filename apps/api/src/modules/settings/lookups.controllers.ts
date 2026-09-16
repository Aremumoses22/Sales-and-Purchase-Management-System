import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
  type Type,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { expenseCategorySchema, paymentModeSchema, paymentTermSchema, taxSchema } from '@spms/shared';
import { z } from 'zod';
import { RequirePermissions } from '../../common/decorators.js';
import { ApiZodBody } from '../../common/swagger.js';
import { uuidParam } from '../../common/validation.js';
import type { LookupOperations } from './lookup.service.js';
import {
  ExpenseCategoriesService,
  PaymentModesService,
  PaymentTermsService,
  TaxesService,
} from './lookups.services.js';

const listQuery = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

/**
 * Builds the CRUD controller for one Settings list. Reading is open to every signed-in user
 * (document forms need taxes and terms); changes need `settings:manage`.
 */
function lookupController<S extends z.ZodType<{ name: string; isActive: boolean }>>(
  path: string,
  schema: S,
  serviceClass: Type<LookupOperations<z.output<S>>>,
) {
  @ApiTags('Settings')
  @Controller(`settings/${path}`)
  class LookupController {
    constructor(@Inject(serviceClass) readonly service: LookupOperations<z.output<S>>) {}

    @Get()
    list(@Query({ schema: listQuery }) query: z.output<typeof listQuery>) {
      return this.service.list(query.includeInactive);
    }

    @Post()
    @RequirePermissions('settings:manage')
    @ApiZodBody(schema)
    create(@Body({ schema }) body: z.output<S>) {
      return this.service.create(body);
    }

    @Put(':id')
    @RequirePermissions('settings:manage')
    @ApiZodBody(schema)
    update(@Param('id', { schema: uuidParam }) id: string, @Body({ schema }) body: z.output<S>) {
      return this.service.update(id, body);
    }

    @Delete(':id')
    @RequirePermissions('settings:manage')
    @HttpCode(HttpStatus.NO_CONTENT)
    remove(@Param('id', { schema: uuidParam }) id: string) {
      return this.service.remove(id);
    }
  }
  return LookupController;
}

export const PaymentTermsController = lookupController('payment-terms', paymentTermSchema, PaymentTermsService);
export const TaxesController = lookupController('taxes', taxSchema, TaxesService);
export const PaymentModesController = lookupController('payment-modes', paymentModeSchema, PaymentModesService);
export const ExpenseCategoriesController = lookupController(
  'expense-categories',
  expenseCategorySchema,
  ExpenseCategoriesService,
);
