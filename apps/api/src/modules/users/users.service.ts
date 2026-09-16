import { Injectable } from '@nestjs/common';
import type { createUserSchema, resetUserPasswordSchema, updateUserSchema, UserDto } from '@spms/shared';
import * as argon2 from 'argon2';
import type { z } from 'zod';
import { diffRecords } from '../../audit/diff.js';
import { AuditService } from '../../audit/audit.service.js';
import { conflict, fieldError, notFound } from '../../common/app-exception.js';
import { toIso, toIsoOrNull } from '../../common/serialize.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UserWithRole } from '../auth/auth-user.js';
import { TokenService } from '../auth/token.service.js';

function toUserDto(user: UserWithRole): UserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: toIsoOrNull(user.lastLoginAt),
    role: { id: user.role.id, name: user.role.name },
    createdAt: toIso(user.createdAt),
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tokens: TokenService,
  ) {}

  async list(): Promise<UserDto[]> {
    const users = await this.prisma.user.findMany({ include: { role: true }, orderBy: { name: 'asc' } });
    return users.map(toUserDto);
  }

  async create(input: z.output<typeof createUserSchema>): Promise<UserDto> {
    if (await this.prisma.user.findUnique({ where: { email: input.email } })) {
      throw fieldError('EMAIL_TAKEN', 'email', 'A user with this email already exists');
    }
    await this.findRole(input.roleId);

    const user = await this.prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        roleId: input.roleId,
        passwordHash: await argon2.hash(input.password),
        mustChangePassword: true,
      },
      include: { role: true },
    });
    await this.audit.record({
      action: 'created',
      entityType: 'user',
      entityId: user.id,
      summary: `User ${user.name} (${user.email}) created with the ${user.role.name} role`,
    });
    return toUserDto(user);
  }

  async update(id: string, input: z.output<typeof updateUserSchema>, actorId: string): Promise<UserDto> {
    const existing = await this.findUser(id);
    if (id === actorId && !input.isActive) {
      throw conflict('CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account');
    }
    const role = await this.findRole(input.roleId);

    const losesAdminAccess = existing.role.isSystem && existing.isActive && (!role.isSystem || !input.isActive);
    if (losesAdminAccess) await this.ensureAnotherActiveAdmin(id);

    const updated = await this.prisma.user.update({
      where: { id },
      data: { name: input.name, roleId: input.roleId, isActive: input.isActive },
      include: { role: true },
    });
    if (existing.isActive && !updated.isActive) await this.tokens.revokeAllForUser(id);

    const changes = diffRecords(
      { name: existing.name, role: existing.role.name, isActive: existing.isActive },
      { name: updated.name, role: updated.role.name, isActive: updated.isActive },
    );
    if (changes) {
      await this.audit.record({
        action: 'updated',
        entityType: 'user',
        entityId: id,
        summary: `User ${updated.name} updated`,
        changes,
      });
    }
    return toUserDto(updated);
  }

  async resetPassword(id: string, input: z.output<typeof resetUserPasswordSchema>): Promise<void> {
    const user = await this.findUser(id);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await argon2.hash(input.password), mustChangePassword: true },
    });
    await this.tokens.revokeAllForUser(id);
    await this.audit.record({
      action: 'password_reset',
      entityType: 'user',
      entityId: id,
      summary: `Temporary password set for ${user.name}`,
    });
  }

  private async findUser(id: string): Promise<UserWithRole> {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!user) throw notFound('User');
    return user;
  }

  private async findRole(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw fieldError('ROLE_NOT_FOUND', 'roleId', 'Select a valid role');
    return role;
  }

  private async ensureAnotherActiveAdmin(excludeUserId: string): Promise<void> {
    const admins = await this.prisma.user.count({
      where: { id: { not: excludeUserId }, isActive: true, role: { isSystem: true } },
    });
    if (admins === 0) {
      throw conflict('LAST_ADMIN', 'At least one active user must keep the Admin role');
    }
  }
}
