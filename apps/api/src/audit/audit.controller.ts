import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { auditLogQuerySchema, type AuditLogQuery } from '@spms/shared';
import { RequirePermissions } from '../common/decorators.js';
import { AuditService } from './audit.service.js';

@ApiTags('Audit Log')
@Controller('audit-logs')
@RequirePermissions('audit:view')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query({ schema: auditLogQuerySchema }) query: AuditLogQuery) {
    return this.audit.list(query);
  }

  @Get('filters')
  filters() {
    return this.audit.filters();
  }
}
