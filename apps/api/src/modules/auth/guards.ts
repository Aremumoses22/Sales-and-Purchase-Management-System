import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@spms/shared';
import type { Request } from 'express';
import { AppException } from '../../common/app-exception.js';
import {
  ALLOW_DURING_PASSWORD_CHANGE_KEY,
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  type AuthenticatedRequest,
} from '../../common/decorators.js';
import { getRequestContext } from '../../common/request-context.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toAuthUser } from './auth-user.js';
import { ACCESS_COOKIE } from './cookies.js';
import { TokenService } from './token.service.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cookies are sent automatically, so state-changing requests must carry a custom header.
 * Cross-site forms cannot add one, and cross-origin scripts would need a CORS preflight we never allow.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method) || request.get('x-requested-with')) return true;
    throw new AppException('CSRF_HEADER_MISSING', 'Missing X-Requested-With header', HttpStatus.FORBIDDEN);
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.[ACCESS_COOKIE] as string | undefined;
    if (!token) {
      throw new AppException('UNAUTHENTICATED', 'Please sign in to continue', HttpStatus.UNAUTHORIZED);
    }

    const userId = await this.tokens.verifyAccessToken(token);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!user || !user.isActive) {
      throw new AppException('UNAUTHENTICATED', 'Please sign in to continue', HttpStatus.UNAUTHORIZED);
    }

    request.authUser = toAuthUser(user);
    const store = getRequestContext();
    if (store) store.userId = user.id;

    if (
      user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_DURING_PASSWORD_CHANGE_KEY, targets)
    ) {
      throw new AppException(
        'PASSWORD_CHANGE_REQUIRED',
        'Please change your temporary password to continue',
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, targets);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().authUser;
    if (user && required.every((permission) => user.permissions.includes(permission))) return true;

    throw new AppException('FORBIDDEN', 'You do not have permission to do this', HttpStatus.FORBIDDEN);
  }
}
