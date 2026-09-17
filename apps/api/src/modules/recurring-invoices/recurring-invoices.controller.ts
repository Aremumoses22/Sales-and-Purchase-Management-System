import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  recurringInvoiceListQuerySchema,
  recurringInvoiceSchema,
  type RecurringInvoiceListQuery,
  type RecurringInvoiceOutput,
} from '@spms/shared';
import { RequirePermissions } from '../../common/decorators.js';
import { ApiZodBody } from '../../common/swagger.js';
import { uuidParam } from '../../common/validation.js';
import { RecurringInvoicesService } from './recurring-invoices.service.js';

@ApiTags('Recurring Invoices')
@Controller('recurring-invoices')
export class RecurringInvoicesController {
  constructor(private readonly recurring: RecurringInvoicesService) {}

  @Get()
  @RequirePermissions('recurring_invoices:view')
  list(@Query({ schema: recurringInvoiceListQuerySchema }) query: RecurringInvoiceListQuery) {
    return this.recurring.list(query);
  }

  // Declared before ":id" so the path is not treated as an id.
  @Get('status-counts')
  @RequirePermissions('recurring_invoices:view')
  statusCounts(@Query({ schema: recurringInvoiceListQuerySchema }) query: RecurringInvoiceListQuery) {
    return this.recurring.statusCounts(query);
  }

  /** Runs the scheduled job now for everything due today; safe to repeat. */
  @Post('run-due')
  @RequirePermissions('recurring_invoices:edit', 'invoices:create')
  @HttpCode(HttpStatus.OK)
  runDue() {
    return this.recurring.runDue();
  }

  @Get(':id')
  @RequirePermissions('recurring_invoices:view')
  get(@Param('id', { schema: uuidParam }) id: string) {
    return this.recurring.get(id);
  }

  @Get(':id/history')
  @RequirePermissions('recurring_invoices:view')
  history(@Param('id', { schema: uuidParam }) id: string) {
    return this.recurring.history(id);
  }

  @Post()
  @RequirePermissions('recurring_invoices:create')
  @ApiZodBody(recurringInvoiceSchema)
  create(@Body({ schema: recurringInvoiceSchema }) body: RecurringInvoiceOutput) {
    return this.recurring.create(body);
  }

  @Put(':id')
  @RequirePermissions('recurring_invoices:edit')
  @ApiZodBody(recurringInvoiceSchema)
  update(@Param('id', { schema: uuidParam }) id: string, @Body({ schema: recurringInvoiceSchema }) body: RecurringInvoiceOutput) {
    return this.recurring.update(id, body);
  }

  @Delete(':id')
  @RequirePermissions('recurring_invoices:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', { schema: uuidParam }) id: string) {
    return this.recurring.remove(id);
  }

  @Post(':id/stop')
  @RequirePermissions('recurring_invoices:edit')
  @HttpCode(HttpStatus.OK)
  stop(@Param('id', { schema: uuidParam }) id: string) {
    return this.recurring.stop(id);
  }

  @Post(':id/resume')
  @RequirePermissions('recurring_invoices:edit')
  @HttpCode(HttpStatus.OK)
  resume(@Param('id', { schema: uuidParam }) id: string) {
    return this.recurring.resume(id);
  }

  @Post(':id/create-invoice')
  @RequirePermissions('recurring_invoices:view', 'invoices:create')
  createNow(@Param('id', { schema: uuidParam }) id: string) {
    return this.recurring.createNow(id);
  }
}
