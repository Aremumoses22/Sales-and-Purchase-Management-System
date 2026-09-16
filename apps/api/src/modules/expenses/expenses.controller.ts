import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { expenseListQuerySchema, expenseSchema, type ExpenseListQuery, type ExpenseOutput } from '@spms/shared';
import type { Response } from 'express';
import { notFound } from '../../common/app-exception.js';
import { RequirePermissions } from '../../common/decorators.js';
import { ApiZodBody } from '../../common/swagger.js';
import { uuidParam } from '../../common/validation.js';
import { ExpensesService, MAX_RECEIPT_BYTES, type UploadedReceipt } from './expenses.service.js';

@ApiTags('Expenses')
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  @RequirePermissions('expenses:view')
  list(@Query({ schema: expenseListQuerySchema }) query: ExpenseListQuery) {
    return this.expenses.list(query);
  }

  // Declared before ":id" so the path is not treated as an id.
  @Get('totals')
  @RequirePermissions('expenses:view')
  totals(@Query({ schema: expenseListQuerySchema }) query: ExpenseListQuery) {
    return this.expenses.totals(query);
  }

  @Get(':id')
  @RequirePermissions('expenses:view')
  get(@Param('id', { schema: uuidParam }) id: string) {
    return this.expenses.get(id);
  }

  @Get(':id/history')
  @RequirePermissions('expenses:view')
  history(@Param('id', { schema: uuidParam }) id: string) {
    return this.expenses.history(id);
  }

  @Post()
  @RequirePermissions('expenses:create')
  @ApiZodBody(expenseSchema)
  create(@Body({ schema: expenseSchema }) body: ExpenseOutput) {
    return this.expenses.create(body);
  }

  @Put(':id')
  @RequirePermissions('expenses:edit')
  @ApiZodBody(expenseSchema)
  update(@Param('id', { schema: uuidParam }) id: string, @Body({ schema: expenseSchema }) body: ExpenseOutput) {
    return this.expenses.update(id, body);
  }

  @Delete(':id')
  @RequirePermissions('expenses:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', { schema: uuidParam }) id: string) {
    return this.expenses.remove(id);
  }

  @Post(':id/receipt')
  @RequirePermissions('expenses:edit')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_RECEIPT_BYTES, files: 1 } }))
  attachReceipt(@Param('id', { schema: uuidParam }) id: string, @UploadedFile() file: UploadedReceipt | undefined) {
    return this.expenses.attachReceipt(id, file);
  }

  @Delete(':id/receipt')
  @RequirePermissions('expenses:edit')
  removeReceipt(@Param('id', { schema: uuidParam }) id: string) {
    return this.expenses.removeReceipt(id);
  }

  @Get(':id/receipt')
  @RequirePermissions('expenses:view')
  async receipt(@Param('id', { schema: uuidParam }) id: string, @Res() res: Response): Promise<void> {
    const receipt = await this.expenses.receipt(id);
    if (!receipt) throw notFound('Receipt');
    res.setHeader('Content-Type', receipt.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${receipt.name.replace(/[^\w.\- ]/g, '_')}"`);
    res.setHeader('Cache-Control', 'private, no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(receipt.filePath);
  }
}
