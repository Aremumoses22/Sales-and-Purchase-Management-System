import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  invoiceListQuerySchema,
  invoiceSchema,
  voidInvoiceSchema,
  type InvoiceListQuery,
  type InvoiceOutput,
} from '@spms/shared';
import type { z } from 'zod';
import { RequirePermissions } from '../../common/decorators.js';
import { ApiZodBody } from '../../common/swagger.js';
import { uuidParam } from '../../common/validation.js';
import { InvoicesService } from './invoices.service.js';

@ApiTags('Invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @RequirePermissions('invoices:view')
  list(@Query({ schema: invoiceListQuerySchema }) query: InvoiceListQuery) {
    return this.invoices.list(query);
  }

  // Declared before ":id" so the path is not treated as an id.
  @Get('status-counts')
  @RequirePermissions('invoices:view')
  statusCounts(@Query({ schema: invoiceListQuerySchema }) query: InvoiceListQuery) {
    return this.invoices.statusCounts(query);
  }

  @Get(':id')
  @RequirePermissions('invoices:view')
  get(@Param('id', { schema: uuidParam }) id: string) {
    return this.invoices.get(id);
  }

  @Get(':id/history')
  @RequirePermissions('invoices:view')
  history(@Param('id', { schema: uuidParam }) id: string) {
    return this.invoices.history(id);
  }

  @Post()
  @RequirePermissions('invoices:create')
  @ApiZodBody(invoiceSchema)
  create(@Body({ schema: invoiceSchema }) body: InvoiceOutput) {
    return this.invoices.create(body);
  }

  @Put(':id')
  @RequirePermissions('invoices:edit')
  @ApiZodBody(invoiceSchema)
  update(@Param('id', { schema: uuidParam }) id: string, @Body({ schema: invoiceSchema }) body: InvoiceOutput) {
    return this.invoices.update(id, body);
  }

  @Delete(':id')
  @RequirePermissions('invoices:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', { schema: uuidParam }) id: string) {
    return this.invoices.remove(id);
  }

  @Post(':id/mark-sent')
  @RequirePermissions('invoices:edit')
  @HttpCode(HttpStatus.OK)
  markSent(@Param('id', { schema: uuidParam }) id: string) {
    return this.invoices.markSent(id);
  }

  @Post(':id/void')
  @RequirePermissions('invoices:void')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(voidInvoiceSchema)
  void(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: voidInvoiceSchema }) body: z.output<typeof voidInvoiceSchema>,
  ) {
    return this.invoices.void(id, body.reason);
  }

  @Post(':id/clone')
  @RequirePermissions('invoices:create')
  clone(@Param('id', { schema: uuidParam }) id: string) {
    return this.invoices.clone(id);
  }
}
