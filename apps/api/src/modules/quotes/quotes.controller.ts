import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { quoteListQuerySchema, quoteSchema, type QuoteListQuery, type QuoteOutput } from '@spms/shared';
import { RequirePermissions } from '../../common/decorators.js';
import { ApiZodBody } from '../../common/swagger.js';
import { uuidParam } from '../../common/validation.js';
import { InvoicesService } from '../invoices/invoices.service.js';
import { QuotesService } from './quotes.service.js';

@ApiTags('Quotes')
@Controller('quotes')
export class QuotesController {
  constructor(
    private readonly quotes: QuotesService,
    private readonly invoices: InvoicesService,
  ) {}

  @Get()
  @RequirePermissions('quotes:view')
  list(@Query({ schema: quoteListQuerySchema }) query: QuoteListQuery) {
    return this.quotes.list(query);
  }

  // Declared before ":id" so the path is not treated as an id.
  @Get('status-counts')
  @RequirePermissions('quotes:view')
  statusCounts(@Query({ schema: quoteListQuerySchema }) query: QuoteListQuery) {
    return this.quotes.statusCounts(query);
  }

  @Get(':id')
  @RequirePermissions('quotes:view')
  get(@Param('id', { schema: uuidParam }) id: string) {
    return this.quotes.get(id);
  }

  @Get(':id/history')
  @RequirePermissions('quotes:view')
  history(@Param('id', { schema: uuidParam }) id: string) {
    return this.quotes.history(id);
  }

  @Post()
  @RequirePermissions('quotes:create')
  @ApiZodBody(quoteSchema)
  create(@Body({ schema: quoteSchema }) body: QuoteOutput) {
    return this.quotes.create(body);
  }

  @Put(':id')
  @RequirePermissions('quotes:edit')
  @ApiZodBody(quoteSchema)
  update(@Param('id', { schema: uuidParam }) id: string, @Body({ schema: quoteSchema }) body: QuoteOutput) {
    return this.quotes.update(id, body);
  }

  @Delete(':id')
  @RequirePermissions('quotes:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', { schema: uuidParam }) id: string) {
    return this.quotes.remove(id);
  }

  @Post(':id/mark-sent')
  @RequirePermissions('quotes:edit')
  @HttpCode(HttpStatus.OK)
  markSent(@Param('id', { schema: uuidParam }) id: string) {
    return this.quotes.markSent(id);
  }

  @Post(':id/accept')
  @RequirePermissions('quotes:edit')
  @HttpCode(HttpStatus.OK)
  accept(@Param('id', { schema: uuidParam }) id: string) {
    return this.quotes.accept(id);
  }

  @Post(':id/decline')
  @RequirePermissions('quotes:edit')
  @HttpCode(HttpStatus.OK)
  decline(@Param('id', { schema: uuidParam }) id: string) {
    return this.quotes.decline(id);
  }

  @Post(':id/convert-to-invoice')
  @RequirePermissions('quotes:edit', 'invoices:create')
  convertToInvoice(@Param('id', { schema: uuidParam }) id: string) {
    return this.invoices.convertQuote(id);
  }

  @Post(':id/clone')
  @RequirePermissions('quotes:create')
  clone(@Param('id', { schema: uuidParam }) id: string) {
    return this.quotes.clone(id);
  }
}
