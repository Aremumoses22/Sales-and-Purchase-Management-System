import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createUserSchema,
  resetUserPasswordSchema,
  updateUserSchema,
  type AuthUserDto,
  type UserDto,
} from '@spms/shared';
import type { z } from 'zod';
import { CurrentUser, RequirePermissions } from '../../common/decorators.js';
import { ApiZodBody } from '../../common/swagger.js';
import { uuidParam } from '../../common/validation.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@RequirePermissions('users:manage')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): Promise<UserDto[]> {
    return this.users.list();
  }

  @Post()
  @ApiZodBody(createUserSchema)
  create(@Body({ schema: createUserSchema }) body: z.output<typeof createUserSchema>): Promise<UserDto> {
    return this.users.create(body);
  }

  @Put(':id')
  @ApiZodBody(updateUserSchema)
  update(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: updateUserSchema }) body: z.output<typeof updateUserSchema>,
    @CurrentUser() actor: AuthUserDto,
  ): Promise<UserDto> {
    return this.users.update(id, body, actor.id);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiZodBody(resetUserPasswordSchema)
  resetPassword(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: resetUserPasswordSchema }) body: z.output<typeof resetUserPasswordSchema>,
  ): Promise<void> {
    return this.users.resetPassword(id, body);
  }
}
