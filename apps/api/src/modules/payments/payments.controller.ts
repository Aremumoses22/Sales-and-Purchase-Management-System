import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  applyCreditsSchema,
  openInvoicesQuerySchema,
  paymentListQuerySchema,
  paymentReceivedSchema,
  paymentRefundSchema,
  type ApplyCreditsOutput,
  type OpenInvoicesQuery,
  type PaymentListQuery,
  type PaymentReceivedOutput,
  type PaymentRefundOutput,
} from '@spms/shared';
import { RequirePermissions } from '../../common/decorators.js';
import { ApiZodBody } from '../../common/swagger.js';
import { uuidParam } from '../../common/validation.js';
import { PaymentsService } from './payments.service.js';

@ApiTags('Payments Received')
@Controller('payments-received')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermissions('payments_received:view')
  list(@Query({ schema: paymentListQuerySchema }) query: PaymentListQuery) {
    return this.payments.list(query);
  }

  // Declared before ":id" so the path is not treated as an id.
  @Get('open-invoices')
  @RequirePermissions('payments_received:view', 'invoices:view')
  openInvoices(@Query({ schema: openInvoicesQuerySchema }) query: OpenInvoicesQuery) {
    return this.payments.openInvoices(query);
  }

  @Get(':id')
  @RequirePermissions('payments_received:view')
  get(@Param('id', { schema: uuidParam }) id: string) {
    return this.payments.get(id);
  }

  @Get(':id/history')
  @RequirePermissions('payments_received:view')
  history(@Param('id', { schema: uuidParam }) id: string) {
    return this.payments.history(id);
  }

  @Post()
  @RequirePermissions('payments_received:create')
  @ApiZodBody(paymentReceivedSchema)
  create(@Body({ schema: paymentReceivedSchema }) body: PaymentReceivedOutput) {
    return this.payments.create(body);
  }

  @Put(':id')
  @RequirePermissions('payments_received:edit')
  @ApiZodBody(paymentReceivedSchema)
  update(@Param('id', { schema: uuidParam }) id: string, @Body({ schema: paymentReceivedSchema }) body: PaymentReceivedOutput) {
    return this.payments.update(id, body);
  }

  @Delete(':id')
  @RequirePermissions('payments_received:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', { schema: uuidParam }) id: string) {
    return this.payments.remove(id);
  }

  @Post(':id/refunds')
  @RequirePermissions('payments_received:edit')
  @ApiZodBody(paymentRefundSchema)
  addRefund(@Param('id', { schema: uuidParam }) id: string, @Body({ schema: paymentRefundSchema }) body: PaymentRefundOutput) {
    return this.payments.addRefund(id, body);
  }

  @Delete(':id/refunds/:refundId')
  @RequirePermissions('payments_received:edit')
  removeRefund(
    @Param('id', { schema: uuidParam }) id: string,
    @Param('refundId', { schema: uuidParam }) refundId: string,
  ) {
    return this.payments.removeRefund(id, refundId);
  }
}

/** Credit routes that live under an invoice but belong to the payments module. */
@ApiTags('Invoices')
@Controller('invoices')
export class InvoiceCreditsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get(':id/available-credits')
  @RequirePermissions('invoices:view')
  availableCredits(@Param('id', { schema: uuidParam }) id: string) {
    return this.payments.availableCredits(id);
  }

  @Post(':id/apply-credits')
  @RequirePermissions('payments_received:edit')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(applyCreditsSchema)
  applyCredits(@Param('id', { schema: uuidParam }) id: string, @Body({ schema: applyCreditsSchema }) body: ApplyCreditsOutput) {
    return this.payments.applyCredits(id, body);
  }
}
