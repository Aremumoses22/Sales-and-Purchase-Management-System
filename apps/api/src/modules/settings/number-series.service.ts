import { Injectable } from '@nestjs/common';
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  formatDocumentNumber,
  type DocumentType,
  type NumberSeriesDto,
  type numberSeriesSchema,
} from '@spms/shared';
import type { z } from 'zod';
import { diffRecords } from '../../audit/diff.js';
import { AuditService } from '../../audit/audit.service.js';
import { conflict, notFound } from '../../common/app-exception.js';
import type { NumberSeries } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../prisma/prisma.service.js';

function toDto(series: NumberSeries): NumberSeriesDto {
  const documentType = series.documentType as DocumentType;
  return {
    documentType,
    label: DOCUMENT_TYPE_LABELS[documentType],
    prefix: series.prefix,
    nextNumber: series.nextNumber,
    padding: series.padding,
    preview: formatDocumentNumber(series.prefix, series.nextNumber, series.padding),
  };
}

@Injectable()
export class NumberSeriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<NumberSeriesDto[]> {
    const rows = await this.prisma.numberSeries.findMany();
    return rows
      .map(toDto)
      .sort((a, b) => DOCUMENT_TYPES.indexOf(a.documentType) - DOCUMENT_TYPES.indexOf(b.documentType));
  }

  async get(documentType: DocumentType): Promise<NumberSeriesDto> {
    const series = await this.prisma.numberSeries.findUnique({ where: { documentType } });
    if (!series) throw notFound('Number series');
    return toDto(series);
  }

  async update(documentType: DocumentType, input: z.output<typeof numberSeriesSchema>): Promise<NumberSeriesDto> {
    const before = await this.prisma.numberSeries.findUnique({ where: { documentType } });
    if (!before) throw notFound('Number series');
    const updated = await this.prisma.numberSeries.update({ where: { documentType }, data: input });
    const changes = diffRecords(
      { prefix: before.prefix, nextNumber: before.nextNumber, padding: before.padding },
      { prefix: updated.prefix, nextNumber: updated.nextNumber, padding: updated.padding },
    );
    if (changes) {
      await this.audit.record({
        action: 'updated',
        entityType: 'number_series',
        entityId: documentType,
        summary: `${DOCUMENT_TYPE_LABELS[documentType]} numbering updated`,
        changes,
      });
    }
    return toDto(updated);
  }

  /**
   * Allocates the next document number inside the caller's transaction. The UPDATE locks the
   * series row until the transaction ends, so concurrent documents never get the same number.
   * Numbers already in use (e.g. after the counter was lowered in Settings) are skipped.
   */
  async next(tx: Tx, documentType: DocumentType, isTaken: (number: string) => Promise<boolean>): Promise<string> {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const rows = await tx.$queryRaw<{ prefix: string; allocated: number; padding: number }[]>`
        UPDATE number_series
        SET next_number = next_number + 1, updated_at = now()
        WHERE document_type = ${documentType}::"DocumentType"
        RETURNING prefix, next_number - 1 AS allocated, padding`;
      const row = rows[0];
      if (!row) throw notFound('Number series');
      const number = formatDocumentNumber(row.prefix, Number(row.allocated), row.padding);
      if (!(await isTaken(number))) return number;
    }
    throw conflict('NUMBER_SERIES_EXHAUSTED', 'Could not find a free document number. Check the numbering settings.');
  }
}
