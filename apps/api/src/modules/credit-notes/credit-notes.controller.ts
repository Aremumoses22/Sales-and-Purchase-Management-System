import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  applyCreditNoteSchema,
  creditNoteListQuerySchema,
  creditNoteSchema,
  paymentRefundSchema,
  voidInvoiceSchema,
  type ApplyCreditNoteOutput,
  type CreditNoteListQuery,
  type CreditNoteOutput,
  type PaymentRefundOutput,
} from '@spms/shared';
import type { z } from 'zod';
import { RequirePermissions } from '../../common/decorators.js';
import { ApiZodBody } from '../../common/swagger.js';
import { uuidParam } from '../../common/validation.js';
import { CreditNotesService } from './credit-notes.service.js';

@ApiTags('Credit Notes')
@Controller('credit-notes')
export class CreditNotesController {
  constructor(private readonly creditNotes: CreditNotesService) {}

  @Get()
  @RequirePermissions('credit_notes:view')
  list(@Query({ schema: creditNoteListQuerySchema }) query: CreditNoteListQuery) {
    return this.creditNotes.list(query);
  }

  // Declared before ":id" so the path is not treated as an id.
  @Get('status-counts')
  @RequirePermissions('credit_notes:view')
  statusCounts(@Query({ schema: creditNoteListQuerySchema }) query: CreditNoteListQuery) {
    return this.creditNotes.statusCounts(query);
  }

  @Get(':id')
  @RequirePermissions('credit_notes:view')
  get(@Param('id', { schema: uuidParam }) id: string) {
    return this.creditNotes.get(id);
  }

  @Get(':id/history')
  @RequirePermissions('credit_notes:view')
  history(@Param('id', { schema: uuidParam }) id: string) {
    return this.creditNotes.history(id);
  }

  @Get(':id/open-invoices')
  @RequirePermissions('credit_notes:view', 'invoices:view')
  openInvoices(@Param('id', { schema: uuidParam }) id: string) {
    return this.creditNotes.openInvoices(id);
  }

  @Post()
  @RequirePermissions('credit_notes:create')
  @ApiZodBody(creditNoteSchema)
  create(@Body({ schema: creditNoteSchema }) body: CreditNoteOutput) {
    return this.creditNotes.create(body);
  }

  @Put(':id')
  @RequirePermissions('credit_notes:edit')
  @ApiZodBody(creditNoteSchema)
  update(@Param('id', { schema: uuidParam }) id: string, @Body({ schema: creditNoteSchema }) body: CreditNoteOutput) {
    return this.creditNotes.update(id, body);
  }

  @Delete(':id')
  @RequirePermissions('credit_notes:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', { schema: uuidParam }) id: string) {
    return this.creditNotes.remove(id);
  }

  @Post(':id/mark-open')
  @RequirePermissions('credit_notes:edit')
  @HttpCode(HttpStatus.OK)
  markOpen(@Param('id', { schema: uuidParam }) id: string) {
    return this.creditNotes.markOpen(id);
  }

  @Post(':id/void')
  @RequirePermissions('credit_notes:void')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(voidInvoiceSchema)
  void(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: voidInvoiceSchema }) body: z.output<typeof voidInvoiceSchema>,
  ) {
    return this.creditNotes.void(id, body.reason);
  }

  @Post(':id/apply')
  @RequirePermissions('credit_notes:edit', 'invoices:view')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(applyCreditNoteSchema)
  apply(@Param('id', { schema: uuidParam }) id: string, @Body({ schema: applyCreditNoteSchema }) body: ApplyCreditNoteOutput) {
    return this.creditNotes.apply(id, body);
  }

  @Delete(':id/applications/:applicationId')
  @RequirePermissions('credit_notes:edit')
  removeApplication(
    @Param('id', { schema: uuidParam }) id: string,
    @Param('applicationId', { schema: uuidParam }) applicationId: string,
  ) {
    return this.creditNotes.removeApplication(id, applicationId);
  }

  @Post(':id/refunds')
  @RequirePermissions('credit_notes:edit')
  @ApiZodBody(paymentRefundSchema)
  addRefund(@Param('id', { schema: uuidParam }) id: string, @Body({ schema: paymentRefundSchema }) body: PaymentRefundOutput) {
    return this.creditNotes.addRefund(id, body);
  }

  @Delete(':id/refunds/:refundId')
  @RequirePermissions('credit_notes:edit')
  removeRefund(
    @Param('id', { schema: uuidParam }) id: string,
    @Param('refundId', { schema: uuidParam }) refundId: string,
  ) {
    return this.creditNotes.removeRefund(id, refundId);
  }
}
