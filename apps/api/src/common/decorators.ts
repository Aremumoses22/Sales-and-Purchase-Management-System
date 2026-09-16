import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthUserDto, Permission } from '@spms/shared';
import type { Request } from 'express';

export const IS_PUBLIC_KEY = 'spms:isPublic';
export const ALLOW_DURING_PASSWORD_CHANGE_KEY = 'spms:allowDuringPasswordChange';
export const PERMISSIONS_KEY = 'spms:permissions';

/** Route needs no session. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Route stays reachable while the user must still change a temporary password. */
export const AllowDuringPasswordChange = () => SetMetadata(ALLOW_DURING_PASSWORD_CHANGE_KEY, true);

/** Every listed permission is required. Method-level metadata overrides class-level. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUserDto;
}

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.authUser) throw new UnauthorizedException();
  return request.authUser;
});
