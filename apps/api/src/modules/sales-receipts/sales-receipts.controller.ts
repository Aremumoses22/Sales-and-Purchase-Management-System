import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  salesReceiptListQuerySchema,
  salesReceiptSchema,
  voidInvoiceSchema,
  type SalesReceiptListQuery,
  type SalesReceiptOutput,
} from '@spms/shared';
import type { z } from 'zod';
import { RequirePermissions } from '../../common/decorators.js';
import { ApiZodBody } from '../../common/swagger.js';
import { uuidParam } from '../../common/validation.js';
import { SalesReceiptsService } from './sales-receipts.service.js';

@ApiTags('Sales Receipts')
@Controller('sales-receipts')
export class SalesReceiptsController {
  constructor(private readonly receipts: SalesReceiptsService) {}

  @Get()
  @RequirePermissions('sales_receipts:view')
  list(@Query({ schema: salesReceiptListQuerySchema }) query: SalesReceiptListQuery) {
    return this.receipts.list(query);
  }

  // Declared before ":id" so the path is not treated as an id.
  @Get('status-counts')
  @RequirePermissions('sales_receipts:view')
  statusCounts(@Query({ schema: salesReceiptListQuerySchema }) query: SalesReceiptListQuery) {
    return this.receipts.statusCounts(query);
  }

  @Get(':id')
  @RequirePermissions('sales_receipts:view')
  get(@Param('id', { schema: uuidParam }) id: string) {
    return this.receipts.get(id);
  }

  @Get(':id/history')
  @RequirePermissions('sales_receipts:view')
  history(@Param('id', { schema: uuidParam }) id: string) {
    return this.receipts.history(id);
  }

  @Post()
  @RequirePermissions('sales_receipts:create')
  @ApiZodBody(salesReceiptSchema)
  create(@Body({ schema: salesReceiptSchema }) body: SalesReceiptOutput) {
    return this.receipts.create(body);
  }

  @Put(':id')
  @RequirePermissions('sales_receipts:edit')
  @ApiZodBody(salesReceiptSchema)
  update(@Param('id', { schema: uuidParam }) id: string, @Body({ schema: salesReceiptSchema }) body: SalesReceiptOutput) {
    return this.receipts.update(id, body);
  }

  @Delete(':id')
  @RequirePermissions('sales_receipts:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', { schema: uuidParam }) id: string) {
    return this.receipts.remove(id);
  }

  @Post(':id/complete')
  @RequirePermissions('sales_receipts:edit')
  @HttpCode(HttpStatus.OK)
  complete(@Param('id', { schema: uuidParam }) id: string) {
    return this.receipts.complete(id);
  }

  @Post(':id/void')
  @RequirePermissions('sales_receipts:void')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(voidInvoiceSchema)
  void(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: voidInvoiceSchema }) body: z.output<typeof voidInvoiceSchema>,
  ) {
    return this.receipts.void(id, body.reason);
  }

  @Post(':id/clone')
  @RequirePermissions('sales_receipts:create')
  clone(@Param('id', { schema: uuidParam }) id: string) {
    return this.receipts.clone(id);
  }
}
