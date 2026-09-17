import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { dashboardQuerySchema, type DashboardQuery } from '@spms/shared';
import { RequirePermissions } from '../../common/decorators.js';
import { DashboardService } from './dashboard.service.js';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @RequirePermissions('dashboard:view')
  summary(@Query({ schema: dashboardQuerySchema }) query: DashboardQuery) {
    return this.dashboard.summary(query);
  }
}
