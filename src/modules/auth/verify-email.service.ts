import { Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { uuidv7 } from 'uuidv7';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Email verification token gen + consume.
 *
 * - Token: 32 random bytes → 64-char hex (DTO `VerifyEmailDto` enforces).
 * - Storage: SHA-256(token) di kolom `token_hash` (unique). Plain token
 *   gak pernah di-persist — kalo DB leak, attacker gak bisa pakai.
 * - TTL: 24 jam (`expiresAt`).
 * - Single-use: `usedAt` di-set saat consume.
 * - Issue baru → invalidate token unused yang masih ada (1 active token / user).
 */
@Injectable()
export class VerifyEmailService {
  private static readonly TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  async issueFor(userId: string): Promise<string> {
    const now = new Date();
    await this.prisma.emailVerifyToken.updateMany({
      where: { userId, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256Hex(rawToken);

    await this.prisma.emailVerifyToken.create({
      data: {
        id: uuidv7(),
        userId,
        tokenHash,
        expiresAt: new Date(now.getTime() + VerifyEmailService.TOKEN_TTL_MS),
      },
    });

    return rawToken;
  }

  /**
   * Consume token: cek valid (exists, not used, not expired), then mark
   * usedAt + set user.emailVerifiedAt. Atomic via transaction.
   *
   * Error mapping: SEMUA invalid-state (not found / used / expired) →
   * `NotFoundException('verify_token_invalid')` supaya gak leak info
   * (per plan § 4.2).
   */
  async consume(rawToken: string): Promise<{ userId: string }> {
    const tokenHash = sha256Hex(rawToken);
    const row = await this.prisma.emailVerifyToken.findUnique({
      where: { tokenHash },
    });

    const now = new Date();
    if (!row || row.usedAt !== null || row.expiresAt <= now) {
      throw new NotFoundException('verify_token_invalid');
    }

    await this.prisma.$transaction([
      this.prisma.emailVerifyToken.update({
        where: { id: row.id },
        data: { usedAt: now },
      }),
      this.prisma.user.update({
        where: { id: row.userId },
        data: { emailVerifiedAt: now },
      }),
    ]);

    return { userId: row.userId };
  }
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}
