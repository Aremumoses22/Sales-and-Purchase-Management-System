import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  itemListQuerySchema,
  itemSchema,
  stockAdjustmentSchema,
  type ItemListQuery,
  type ItemOutput,
  type StockAdjustmentOutput,
} from '@spms/shared';
import { RequirePermissions } from '../../common/decorators.js';
import { ApiZodBody } from '../../common/swagger.js';
import { uuidParam } from '../../common/validation.js';
import { ItemsService } from './items.service.js';

@ApiTags('Items')
@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  @RequirePermissions('items:view')
  list(@Query({ schema: itemListQuerySchema }) query: ItemListQuery) {
    return this.items.list(query);
  }

  @Get(':id')
  @RequirePermissions('items:view')
  get(@Param('id', { schema: uuidParam }) id: string) {
    return this.items.get(id);
  }

  @Get(':id/stock-movements')
  @RequirePermissions('items:view')
  stockMovements(@Param('id', { schema: uuidParam }) id: string) {
    return this.items.stockMovements(id);
  }

  @Get(':id/history')
  @RequirePermissions('items:view')
  history(@Param('id', { schema: uuidParam }) id: string) {
    return this.items.history(id);
  }

  @Post()
  @RequirePermissions('items:create')
  @ApiZodBody(itemSchema)
  create(@Body({ schema: itemSchema }) body: ItemOutput) {
    return this.items.create(body);
  }

  @Put(':id')
  @RequirePermissions('items:edit')
  @ApiZodBody(itemSchema)
  update(@Param('id', { schema: uuidParam }) id: string, @Body({ schema: itemSchema }) body: ItemOutput) {
    return this.items.update(id, body);
  }

  @Post(':id/activate')
  @RequirePermissions('items:edit')
  @HttpCode(HttpStatus.OK)
  activate(@Param('id', { schema: uuidParam }) id: string) {
    return this.items.setActive(id, true);
  }

  @Post(':id/deactivate')
  @RequirePermissions('items:edit')
  @HttpCode(HttpStatus.OK)
  deactivate(@Param('id', { schema: uuidParam }) id: string) {
    return this.items.setActive(id, false);
  }

  @Post(':id/stock-adjustments')
  @RequirePermissions('items:adjust_stock')
  @ApiZodBody(stockAdjustmentSchema)
  adjustStock(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: stockAdjustmentSchema }) body: StockAdjustmentOutput,
  ) {
    return this.items.adjustStock(id, body);
  }

  @Delete(':id')
  @RequirePermissions('items:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', { schema: uuidParam }) id: string) {
    return this.items.remove(id);
  }
}
