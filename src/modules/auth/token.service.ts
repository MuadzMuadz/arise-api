import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { uuidv7 } from 'uuidv7';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Env } from '../../config/env';
import { JwtPayload } from './strategies/jwt.strategy';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface IssueOpts {
  userId: string;
  email: string;
  /** Existing family for rotation; new UUID family kalo undefined (login flow). */
  family?: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}

/**
 * JWT access + opaque refresh token management.
 *
 * - Access: HS256 JWT, TTL via JWT_ACCESS_TTL (15m). Stateless (no DB hit per req).
 * - Refresh: 64 random bytes → 128-char hex, hashed (SHA-256) di DB. TTL 30d.
 * - Rotation: setiap pakai refresh → issue pair baru di family yang sama,
 *   token lama mark `replacedById = new.id`. Single-use.
 * - Replay detection: kalo same refresh dipakai 2x (or already revoked),
 *   revoke seluruh family + 401. Reference: OWASP JWT cheatsheet § Refresh.
 */
@Injectable()
export class TokenService {
  private readonly refreshTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService<Env, true>,
  ) {
    this.refreshTtlMs = parseDurationToMs(config.get('JWT_REFRESH_TTL', { infer: true }));
  }

  /**
   * Issue access + refresh pair. New family kalo opts.family undefined.
   * Returns generated refresh row id (caller pake buat link rotation chain).
   */
  async issuePair(
    opts: IssueOpts,
  ): Promise<{ pair: TokenPair; family: string; refreshId: string }> {
    const payload: JwtPayload = { sub: opts.userId, email: opts.email };
    const accessToken = await this.jwt.signAsync(payload);

    const rawRefresh = crypto.randomBytes(64).toString('hex'); // 128 chars hex
    const tokenHash = sha256Hex(rawRefresh);
    const family = opts.family ?? uuidv7();
    const id = uuidv7();

    await this.prisma.refreshToken.create({
      data: {
        id,
        userId: opts.userId,
        tokenHash,
        family,
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
        userAgent: opts.userAgent ?? null,
        ipAddress: opts.ipAddress ?? null,
      },
    });

    return { pair: { accessToken, refreshToken: rawRefresh }, family, refreshId: id };
  }

  /**
   * Refresh flow: validate raw token → detect replay (revoke family) → issue
   * new pair di family yang sama → link old.replacedById = new.id.
   *
   * Single error type (`refresh_invalid`) untuk semua failure modes, gak
   * leak penyebab (not-found / replay / expired / revoked).
   */
  async rotate(opts: {
    rawRefresh: string;
    userAgent?: string | null;
    ipAddress?: string | null;
  }): Promise<{ pair: TokenPair; userId: string }> {
    const tokenHash = sha256Hex(opts.rawRefresh);
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        family: true,
        expiresAt: true,
        revokedAt: true,
        replacedById: true,
      },
    });

    const now = new Date();
    if (!row) throw new UnauthorizedException('refresh_invalid');

    if (row.replacedById !== null || row.revokedAt !== null) {
      // Replay detected — refresh already rotated atau revoked. Burn the family.
      await this.revokeFamily(row.family, now);
      throw new UnauthorizedException('refresh_invalid');
    }
    if (row.expiresAt <= now) {
      throw new UnauthorizedException('refresh_invalid');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: row.userId },
      select: { email: true, deletedAt: true },
    });
    if (!user || user.deletedAt !== null) {
      throw new UnauthorizedException('refresh_invalid');
    }

    const issued = await this.issuePair({
      userId: row.userId,
      email: user.email,
      family: row.family,
      userAgent: opts.userAgent,
      ipAddress: opts.ipAddress,
    });

    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { replacedById: issued.refreshId },
    });

    return { pair: issued.pair, userId: row.userId };
  }

  /** Revoke single refresh (logout). Idempotent. */
  async revoke(rawRefresh: string): Promise<void> {
    const tokenHash = sha256Hex(rawRefresh);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revoke semua refresh aktif untuk user (logout-all). */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(family: string, now: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { family, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** Parse spec ala "15m" / "30d" / "1h" / "60s" → millis. */
function parseDurationToMs(spec: string): number {
  const match = /^(\d+)([smhd])$/.exec(spec);
  if (!match) throw new Error(`Invalid duration spec: ${spec}`);
  const n = Number(match[1]);
  const mult =
    match[2] === 's' ? 1_000 : match[2] === 'm' ? 60_000 : match[2] === 'h' ? 3_600_000 : 86_400_000;
  return n * mult;
}
