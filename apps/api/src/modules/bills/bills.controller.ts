import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  applyBillCreditsSchema,
  billListQuerySchema,
  billSchema,
  openBillsQuerySchema,
  paymentMadeListQuerySchema,
  paymentMadeSchema,
  paymentRefundSchema,
  voidInvoiceSchema,
  type ApplyBillCreditsOutput,
  type BillListQuery,
  type BillOutput,
  type OpenBillsQuery,
  type PaymentMadeListQuery,
  type PaymentMadeOutput,
  type PaymentRefundOutput,
} from '@spms/shared';
import type { z } from 'zod';
import { RequirePermissions } from '../../common/decorators.js';
import { ApiZodBody } from '../../common/swagger.js';
import { uuidParam } from '../../common/validation.js';
import { BillsService } from './bills.service.js';
import { PaymentsMadeService } from './payments-made.service.js';

@ApiTags('Bills')
@Controller('bills')
export class BillsController {
  constructor(
    private readonly bills: BillsService,
    private readonly payments: PaymentsMadeService,
  ) {}

  @Get(':id/available-credits')
  @RequirePermissions('bills:view')
  availableCredits(@Param('id', { schema: uuidParam }) id: string) {
    return this.payments.availableCredits(id);
  }

  @Post(':id/apply-credits')
  @RequirePermissions('payments_made:edit', 'bills:view')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(applyBillCreditsSchema)
  applyCredits(@Param('id', { schema: uuidParam }) id: string, @Body({ schema: applyBillCreditsSchema }) body: ApplyBillCreditsOutput) {
    return this.payments.applyCredits(id, body);
  }

  @Get()
  @RequirePermissions('bills:view')
  list(@Query({ schema: billListQuerySchema }) query: BillListQuery) {
    return this.bills.list(query);
  }

  // Declared before ":id" so the path is not treated as an id.
  @Get('status-counts')
  @RequirePermissions('bills:view')
  statusCounts(@Query({ schema: billListQuerySchema }) query: BillListQuery) {
    return this.bills.statusCounts(query);
  }

  @Get(':id')
  @RequirePermissions('bills:view')
  get(@Param('id', { schema: uuidParam }) id: string) {
    return this.bills.get(id);
  }

  @Get(':id/history')
  @RequirePermissions('bills:view')
  history(@Param('id', { schema: uuidParam }) id: string) {
    return this.bills.history(id);
  }

  @Post()
  @RequirePermissions('bills:create')
  @ApiZodBody(billSchema)
  create(@Body({ schema: billSchema }) body: BillOutput) {
    return this.bills.create(body);
  }

  @Put(':id')
  @RequirePermissions('bills:edit')
  @ApiZodBody(billSchema)
  update(@Param('id', { schema: uuidParam }) id: string, @Body({ schema: billSchema }) body: BillOutput) {
    return this.bills.update(id, body);
  }

  @Delete(':id')
  @RequirePermissions('bills:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', { schema: uuidParam }) id: string) {
    return this.bills.remove(id);
  }

  @Post(':id/mark-open')
  @RequirePermissions('bills:edit')
  @HttpCode(HttpStatus.OK)
  markOpen(@Param('id', { schema: uuidParam }) id: string) {
    return this.bills.markOpen(id);
  }

  @Post(':id/void')
  @RequirePermissions('bills:void')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(voidInvoiceSchema)
  void(@Param('id', { schema: uuidParam }) id: string, @Body({ schema: voidInvoiceSchema }) body: z.output<typeof voidInvoiceSchema>) {
    return this.bills.void(id, body.reason);
  }
}

@ApiTags('Payments Made')
@Controller('payments-made')
export class PaymentsMadeController {
  constructor(private readonly payments: PaymentsMadeService) {}

  @Get()
  @RequirePermissions('payments_made:view')
  list(@Query({ schema: paymentMadeListQuerySchema }) query: PaymentMadeListQuery) {
    return this.payments.list(query);
  }

  // Declared before ":id" so the path is not treated as an id.
  @Get('open-bills')
  @RequirePermissions('payments_made:view', 'bills:view')
  openBills(@Query({ schema: openBillsQuerySchema }) query: OpenBillsQuery) {
    return this.payments.openBills(query);
  }

  @Get(':id')
  @RequirePermissions('payments_made:view')
  get(@Param('id', { schema: uuidParam }) id: string) {
    return this.payments.get(id);
  }

  @Get(':id/history')
  @RequirePermissions('payments_made:view')
  history(@Param('id', { schema: uuidParam }) id: string) {
    return this.payments.history(id);
  }

  @Post()
  @RequirePermissions('payments_made:create')
  @ApiZodBody(paymentMadeSchema)
  create(@Body({ schema: paymentMadeSchema }) body: PaymentMadeOutput) {
    return this.payments.create(body);
  }

  @Put(':id')
  @RequirePermissions('payments_made:edit')
  @ApiZodBody(paymentMadeSchema)
  update(@Param('id', { schema: uuidParam }) id: string, @Body({ schema: paymentMadeSchema }) body: PaymentMadeOutput) {
    return this.payments.update(id, body);
  }

  @Delete(':id')
  @RequirePermissions('payments_made:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', { schema: uuidParam }) id: string) {
    return this.payments.remove(id);
  }

  @Post(':id/refunds')
  @RequirePermissions('payments_made:edit')
  @ApiZodBody(paymentRefundSchema)
  addRefund(@Param('id', { schema: uuidParam }) id: string, @Body({ schema: paymentRefundSchema }) body: PaymentRefundOutput) {
    return this.payments.addRefund(id, body);
  }

  @Delete(':id/refunds/:refundId')
  @RequirePermissions('payments_made:edit')
  removeRefund(@Param('id', { schema: uuidParam }) id: string, @Param('refundId', { schema: uuidParam }) refundId: string) {
    return this.payments.removeRefund(id, refundId);
  }
}
