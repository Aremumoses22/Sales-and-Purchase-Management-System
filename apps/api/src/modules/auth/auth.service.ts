import { HttpStatus, Injectable } from '@nestjs/common';
import type { changePasswordSchema, loginSchema, MeDto } from '@spms/shared';
import * as argon2 from 'argon2';
import type { z } from 'zod';
import { AppException, fieldError } from '../../common/app-exception.js';
import { AttemptLimiter } from '../../common/attempt-limiter.js';
import type { ClientMeta } from '../../common/request-context.js';
import { AuditService } from '../../audit/audit.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { OrganizationService } from '../settings/organization.service.js';
import { toAuthUser, type UserWithRole } from './auth-user.js';
import { TokenService, type SessionTokens } from './token.service.js';

type LoginInput = z.output<typeof loginSchema>;
type ChangePasswordInput = z.output<typeof changePasswordSchema>;

@Injectable()
export class AuthService {
  private readonly limiter = new AttemptLimiter(5, 15 * 60_000);
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly organization: OrganizationService,
  ) {}

  async login(input: LoginInput, meta: ClientMeta): Promise<{ me: MeDto } & SessionTokens> {
    const key = `${meta.ipAddress ?? 'unknown'}|${input.email}`;
    if (this.limiter.isBlocked(key)) {
      const minutes = Math.ceil(this.limiter.retryAfterSeconds(key) / 60);
      throw new AppException(
        'TOO_MANY_ATTEMPTS',
        `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({ where: { email: input.email }, include: { role: true } });
    // Hash even for unknown emails so response time doesn't reveal which accounts exist.
    const passwordOk = user
      ? await argon2.verify(user.passwordHash, input.password)
      : await this.verifyAgainstDummy(input.password);

    if (!user || !passwordOk) {
      this.limiter.recordFailure(key);
      throw new AppException('INVALID_CREDENTIALS', 'Incorrect email or password', HttpStatus.UNAUTHORIZED);
    }
    if (!user.isActive) {
      throw new AppException(
        'ACCOUNT_DISABLED',
        'This account has been deactivated. Contact your administrator.',
        HttpStatus.FORBIDDEN,
      );
    }

    this.limiter.reset(key);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.record({
      action: 'login',
      entityType: 'user',
      entityId: user.id,
      summary: `${user.name} signed in`,
      userId: user.id,
    });

    const tokens = await this.tokens.issueSession(user.id, meta);
    return { me: await this.buildMe(user), ...tokens };
  }

  refresh(rawToken: string | undefined, meta: ClientMeta): Promise<SessionTokens> {
    if (!rawToken) {
      throw new AppException('SESSION_EXPIRED', 'Your session has expired. Please sign in again.', HttpStatus.UNAUTHORIZED);
    }
    return this.tokens.rotate(rawToken, meta);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (rawToken) await this.tokens.revoke(rawToken);
  }

  async me(userId: string): Promise<MeDto> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { role: true } });
    return this.buildMe(user);
  }

  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    meta: ClientMeta,
  ): Promise<{ me: MeDto } & SessionTokens> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, input.currentPassword))) {
      throw fieldError('INVALID_PASSWORD', 'currentPassword', 'Current password is incorrect');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(input.newPassword), mustChangePassword: false },
      include: { role: true },
    });
    // Sign out every other device; this one gets a fresh session below.
    await this.tokens.revokeAllForUser(userId);
    await this.audit.record({
      action: 'password_changed',
      entityType: 'user',
      entityId: userId,
      summary: `${updated.name} changed their password`,
    });

    const tokens = await this.tokens.issueSession(userId, meta);
    return { me: await this.buildMe(updated), ...tokens };
  }

  private async buildMe(user: UserWithRole): Promise<MeDto> {
    return { user: toAuthUser(user), organization: await this.organization.get() };
  }

  private async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= argon2.hash('not-a-real-account-password');
    await argon2.verify(await this.dummyHash, password);
    return false;
  }
}
