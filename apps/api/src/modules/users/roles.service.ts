import { Injectable } from '@nestjs/common';
import type { RoleDto, roleSchema } from '@spms/shared';
import type { z } from 'zod';
import { AuditService } from '../../audit/audit.service.js';
import { conflict, fieldError, notFound } from '../../common/app-exception.js';
import type { Role } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { rolePermissions } from '../auth/auth-user.js';

type RoleInput = z.output<typeof roleSchema>;

function toRoleDto(role: Role & { _count: { users: number } }): RoleDto {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: rolePermissions(role),
    userCount: role._count.users,
  };
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<RoleDto[]> {
    const roles = await this.prisma.role.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return roles.map(toRoleDto);
  }

  async create(input: RoleInput): Promise<RoleDto> {
    await this.ensureNameAvailable(input.name);
    const role = await this.prisma.role.create({
      data: { name: input.name, description: input.description, permissions: input.permissions },
      include: { _count: { select: { users: true } } },
    });
    await this.audit.record({
      action: 'created',
      entityType: 'role',
      entityId: role.id,
      summary: `Role ${role.name} created with ${role.permissions.length} permissions`,
    });
    return toRoleDto(role);
  }

  async update(id: string, input: RoleInput): Promise<RoleDto> {
    const existing = await this.findEditable(id);
    await this.ensureNameAvailable(input.name, id);

    const role = await this.prisma.role.update({
      where: { id },
      data: { name: input.name, description: input.description, permissions: input.permissions },
      include: { _count: { select: { users: true } } },
    });

    const added = input.permissions.filter((p) => !existing.permissions.includes(p));
    const removed = existing.permissions.filter((p) => !input.permissions.includes(p as never));
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (existing.name !== role.name) changes['name'] = { from: existing.name, to: role.name };
    if (existing.description !== role.description) {
      changes['description'] = { from: existing.description, to: role.description };
    }
    if (added.length) changes['permissionsAdded'] = { from: null, to: added };
    if (removed.length) changes['permissionsRemoved'] = { from: removed, to: null };

    if (Object.keys(changes).length) {
      await this.audit.record({
        action: 'updated',
        entityType: 'role',
        entityId: id,
        summary: `Role ${role.name} updated`,
        changes,
      });
    }
    return toRoleDto(role);
  }

  async remove(id: string): Promise<void> {
    const role = await this.findEditable(id);
    const users = await this.prisma.user.count({ where: { roleId: id } });
    if (users > 0) {
      throw conflict('ROLE_IN_USE', `This role is assigned to ${users} user${users === 1 ? '' : 's'}. Reassign them first.`);
    }
    await this.prisma.role.delete({ where: { id } });
    await this.audit.record({ action: 'deleted', entityType: 'role', entityId: id, summary: `Role ${role.name} deleted` });
  }

  private async findEditable(id: string): Promise<Role> {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw notFound('Role');
    if (role.isSystem) {
      throw conflict('SYSTEM_ROLE', 'The Admin role always has full access and cannot be changed');
    }
    return role;
  }

  private async ensureNameAvailable(name: string, excludeId?: string): Promise<void> {
    const clash = await this.prisma.role.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (clash) throw fieldError('ROLE_EXISTS', 'name', 'A role with this name already exists');
  }
}
