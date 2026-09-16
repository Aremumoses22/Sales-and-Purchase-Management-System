import { Module } from '@nestjs/common';
import { DocumentLinesService } from './document-lines.service.js';

@Module({
  providers: [DocumentLinesService],
  exports: [DocumentLinesService],
})
export class DocumentsModule {}
