import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  customerStatementQuerySchema,
  invoiceDetailsQuerySchema,
  reportAsOfQuerySchema,
  reportRangeQuerySchema,
  type CustomerStatementQuery,
  type InvoiceDetailsQuery,
  type ReportAsOfQuery,
  type ReportRangeQuery,
} from '@spms/shared';
import { RequirePermissions } from '../../common/decorators.js';
import { ReportsService } from './reports.service.js';

@ApiTags('Reports')
@Controller('reports')
@RequirePermissions('reports:view')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales-by-customer')
  salesByCustomer(@Query({ schema: reportRangeQuerySchema }) query: ReportRangeQuery) {
    return this.reports.salesByCustomer(query);
  }

  @Get('sales-by-item')
  salesByItem(@Query({ schema: reportRangeQuerySchema }) query: ReportRangeQuery) {
    return this.reports.salesByItem(query);
  }

  @Get('customer-statement')
  customerStatement(@Query({ schema: customerStatementQuerySchema }) query: CustomerStatementQuery) {
    return this.reports.customerStatement(query);
  }

  @Get('invoice-details')
  invoiceDetails(@Query({ schema: invoiceDetailsQuerySchema }) query: InvoiceDetailsQuery) {
    return this.reports.invoiceDetails(query);
  }

  @Get('payments-received')
  paymentsReceived(@Query({ schema: reportRangeQuerySchema }) query: ReportRangeQuery) {
    return this.reports.paymentsReceived(query);
  }

  @Get('credit-note-details')
  creditNoteDetails(@Query({ schema: reportRangeQuerySchema }) query: ReportRangeQuery) {
    return this.reports.creditNoteDetails(query);
  }

  @Get('expenses-by-category')
  expensesByCategory(@Query({ schema: reportRangeQuerySchema }) query: ReportRangeQuery) {
    return this.reports.expensesByCategory(query);
  }

  @Get('expenses-by-vendor')
  expensesByVendor(@Query({ schema: reportRangeQuerySchema }) query: ReportRangeQuery) {
    return this.reports.expensesByVendor(query);
  }

  @Get('customer-balances')
  customerBalances(@Query({ schema: reportAsOfQuerySchema }) query: ReportAsOfQuery) {
    return this.reports.customerBalances(query);
  }

  @Get('ar-aging-summary')
  arAgingSummary(@Query({ schema: reportAsOfQuerySchema }) query: ReportAsOfQuery) {
    return this.reports.arAgingSummary(query);
  }

  @Get('vendor-balances')
  vendorBalances(@Query({ schema: reportAsOfQuerySchema }) query: ReportAsOfQuery) {
    return this.reports.vendorBalances(query);
  }
}
