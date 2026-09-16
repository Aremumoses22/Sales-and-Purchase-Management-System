import { ALL_PERMISSIONS, isPermission, type AuthUserDto } from '@spms/shared';
import type { Role, User } from '../../generated/prisma/client.js';

export type UserWithRole = User & { role: Role };

export function rolePermissions(role: Role) {
  // The system Admin role always receives every permission, including ones added later.
  return role.isSystem ? [...ALL_PERMISSIONS] : role.permissions.filter(isPermission);
}

export function toAuthUser(user: UserWithRole): AuthUserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    mustChangePassword: user.mustChangePassword,
    role: { id: user.role.id, name: user.role.name },
    permissions: rolePermissions(user.role),
  };
}
