import { z } from 'zod';
import { ALL_PERMISSIONS, type Permission } from '../permissions.js';
import { emailSchema, idSchema, optionalText, requiredText } from './common.js';

export const passwordSchema = z
  .string('Password is required')
  .min(8, 'Use at least 8 characters')
  .max(128, 'Use at most 128 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string('Password is required').min(1, 'Password is required').max(128),
});
export type LoginInput = z.input<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from the current one',
    path: ['newPassword'],
  });
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;

export const createUserSchema = z.object({
  name: requiredText(100, 'Name'),
  email: emailSchema,
  roleId: idSchema,
  password: passwordSchema,
});
export type CreateUserInput = z.input<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: requiredText(100, 'Name'),
  roleId: idSchema,
  isActive: z.boolean(),
});
export type UpdateUserInput = z.input<typeof updateUserSchema>;

export const resetUserPasswordSchema = z.object({ password: passwordSchema });
export type ResetUserPasswordInput = z.input<typeof resetUserPasswordSchema>;

const permissionSchema = z.enum(ALL_PERMISSIONS as unknown as [Permission, ...Permission[]]);

export const roleSchema = z.object({
  name: requiredText(50, 'Role name'),
  description: optionalText(200),
  permissions: z
    .array(permissionSchema)
    .max(ALL_PERMISSIONS.length)
    .transform((permissions) => [...new Set(permissions)]),
});
export type RoleInput = z.input<typeof roleSchema>;
