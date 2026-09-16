import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AppException } from '../../common/app-exception.js';
import type { ClientMeta } from '../../common/request-context.js';
import { config } from '../../config.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

/** Two tabs refreshing at the same moment is normal; only later reuse of a rotated token is suspicious. */
const REUSE_GRACE_MS = 30_000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const invalidSession = () =>
  new AppException('SESSION_EXPIRED', 'Your session has expired. Please sign in again.', HttpStatus.UNAUTHORIZED);

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async issueSession(userId: string, meta: ClientMeta, familyId: string = randomUUID()): Promise<SessionTokens> {
    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + config.refreshTokenTtlDays * 86_400_000),
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    });
    const accessToken = await this.jwt.signAsync(
      { sub: userId },
      { secret: config.jwtSecret, expiresIn: config.accessTokenTtlMinutes * 60 },
    );
    return { accessToken, refreshToken };
  }

  /** Returns the user id stored in a valid access token. */
  async verifyAccessToken(token: string): Promise<string> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, { secret: config.jwtSecret });
      return payload.sub;
    } catch {
      throw invalidSession();
    }
  }

  /** Exchanges a refresh token for a new pair; each refresh token works once. */
  async rotate(rawToken: string, meta: ClientMeta): Promise<SessionTokens> {
    const now = new Date();
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: { select: { isActive: true } } },
    });
    if (!existing) throw invalidSession();

    if (existing.revokedAt) {
      if (now.getTime() - existing.revokedAt.getTime() > REUSE_GRACE_MS) {
        await this.prisma.refreshToken.updateMany({
          where: { familyId: existing.familyId, revokedAt: null },
          data: { revokedAt: now },
        });
      }
      throw invalidSession();
    }
    if (existing.expiresAt <= now || !existing.user.isActive) throw invalidSession();

    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: now },
    });
    if (count === 0) throw invalidSession();

    return this.issueSession(existing.userId, meta, existing.familyId);
  }

  async revoke(rawToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
