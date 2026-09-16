import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { roleSchema, type RoleDto } from '@spms/shared';
import type { z } from 'zod';
import { RequirePermissions } from '../../common/decorators.js';
import { ApiZodBody } from '../../common/swagger.js';
import { uuidParam } from '../../common/validation.js';
import { RolesService } from './roles.service.js';

@ApiTags('Roles')
@RequirePermissions('users:manage')
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  list(): Promise<RoleDto[]> {
    return this.roles.list();
  }

  @Post()
  @ApiZodBody(roleSchema)
  create(@Body({ schema: roleSchema }) body: z.output<typeof roleSchema>): Promise<RoleDto> {
    return this.roles.create(body);
  }

  @Put(':id')
  @ApiZodBody(roleSchema)
  update(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: roleSchema }) body: z.output<typeof roleSchema>,
  ): Promise<RoleDto> {
    return this.roles.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', { schema: uuidParam }) id: string): Promise<void> {
    return this.roles.remove(id);
  }
}
