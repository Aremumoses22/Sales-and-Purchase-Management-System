import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DOCUMENT_TYPES, numberSeriesSchema, type DocumentType, type NumberSeriesDto } from '@spms/shared';
import { z } from 'zod';
import { RequirePermissions } from '../../common/decorators.js';
import { ApiZodBody } from '../../common/swagger.js';
import { NumberSeriesService } from './number-series.service.js';

const documentTypeParam = z.enum(DOCUMENT_TYPES);

@ApiTags('Settings')
@Controller('settings/number-series')
export class NumberSeriesController {
  constructor(private readonly series: NumberSeriesService) {}

  @Get()
  @RequirePermissions('settings:view')
  list(): Promise<NumberSeriesDto[]> {
    return this.series.list();
  }

  /** Any signed-in user may see the next number, e.g. on a new quote form. */
  @Get(':documentType')
  get(@Param('documentType', { schema: documentTypeParam }) documentType: DocumentType): Promise<NumberSeriesDto> {
    return this.series.get(documentType);
  }

  @Put(':documentType')
  @RequirePermissions('settings:manage')
  @ApiZodBody(numberSeriesSchema)
  update(
    @Param('documentType', { schema: documentTypeParam }) documentType: DocumentType,
    @Body({ schema: numberSeriesSchema }) body: z.output<typeof numberSeriesSchema>,
  ): Promise<NumberSeriesDto> {
    return this.series.update(documentType, body);
  }
}
