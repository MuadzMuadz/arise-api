import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { MailService } from '../auth/mail.service';
import { TokenService } from '../auth/token.service';
import { VerifyEmailService } from '../auth/verify-email.service';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface UserProfileSummary {
  displayName: string;
  gender: 'male' | 'female' | 'other';
  birthDate: string;
  heightCm: number | null;
  timezone: string;
  locale: string;
  hunterTitle: string | null;
}

export interface UserMeResult {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  profile: UserProfileSummary | null;
}

export interface UpdateEmailResult {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  emailVerificationSent: boolean;
}

@Injectable()
export class UsersService {
  private static readonly BCRYPT_ROUNDS = 12;
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly verifyEmail: VerifyEmailService,
    private readonly mail: MailService,
  ) {}

  async getMe(userId: string): Promise<UserMeResult> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { profile: true },
    });
    if (!user) {
      throw new NotFoundException('user_not_found');
    }
    return {
      id: user.id,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      profile: user.profile
        ? {
            displayName: user.profile.displayName,
            gender: user.profile.gender,
            birthDate: toDateString(user.profile.birthDate),
            heightCm: user.profile.heightCm,
            timezone: user.profile.timezone,
            locale: user.profile.locale,
            hunterTitle: user.profile.hunterTitle,
          }
        : null,
    };
  }

  /**
   * PATCH /users/me email change.
   * - No-op kalo email sama dgn current (200, gak issue verify ulang).
   * - Demote emailVerifiedAt → null, issue verify token baru ke email baru.
   * - Tidak revoke refresh tokens (email change ≠ security event per OWASP).
   */
  async updateEmail(userId: string, newEmail: string | undefined): Promise<UpdateEmailResult> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, emailVerifiedAt: true },
    });
    if (!user) {
      throw new NotFoundException('user_not_found');
    }

    if (!newEmail || newEmail === user.email) {
      return {
        id: user.id,
        email: user.email,
        emailVerifiedAt: user.emailVerifiedAt,
        emailVerificationSent: false,
      };
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id: user.id },
        data: { email: newEmail, emailVerifiedAt: null },
        select: { id: true, email: true, emailVerifiedAt: true },
      });

      const token = await this.verifyEmail.issueFor(updated.id);
      await this.mail.sendVerificationEmail(updated.email, token);

      this.logger.log(`User ${user.id} changed email → ${updated.email}`);
      return {
        id: updated.id,
        email: updated.email,
        emailVerifiedAt: updated.emailVerifiedAt,
        emailVerificationSent: true,
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('email_taken');
      }
      throw err;
    }
  }

  /**
   * POST /users/me/password.
   * - currentPassword salah → 401.
   * - Sukses → hash new, update, revoke SEMUA refresh (logout-all). Industry standard.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, passwordHash: true },
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('invalid_credentials');
    }

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('invalid_credentials');
    }

    const newHash = await bcrypt.hash(newPassword, UsersService.BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });
    await this.tokens.revokeAllForUser(user.id);
    this.logger.log(`User ${user.id} changed password (all sessions revoked)`);
  }

  /**
   * DELETE /users/me — soft delete + revoke-all. Idempotent.
   */
  async softDelete(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, deletedAt: true },
    });
    if (!user) {
      return; // idempotent
    }

    if (user.deletedAt === null) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { deletedAt: new Date() },
      });
    }
    await this.tokens.revokeAllForUser(user.id);
    this.logger.log(`User ${user.id} soft-deleted`);
  }
}

function toDateString(date: Date): string {
  // PostgreSQL DATE → JS Date di UTC midnight. Format YYYY-MM-DD.
  return date.toISOString().slice(0, 10);
}
