import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { uuidv7 } from 'uuidv7';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from './mail.service';
import { TokenService } from './token.service';
import { VerifyEmailService } from './verify-email.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export interface RegisterResult {
  userId: string;
  email: string;
  emailVerificationSent: boolean;
}

export interface AuthUserSummary {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUserSummary;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

export interface MeResult {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

export interface RequestContext {
  userAgent?: string | null;
  ipAddress?: string | null;
}

@Injectable()
export class AuthService {
  private static readonly BCRYPT_ROUNDS = 12;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly verifyEmail: VerifyEmailService,
    private readonly tokens: TokenService,
  ) {}

  async register(dto: RegisterDto): Promise<RegisterResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('email_taken');
    }

    const passwordHash = await bcrypt.hash(dto.password, AuthService.BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        id: uuidv7(),
        email: dto.email,
        passwordHash,
      },
      select: { id: true, email: true },
    });

    const token = await this.verifyEmail.issueFor(user.id);
    await this.mail.sendVerificationEmail(user.email, token);

    this.logger.log(`Registered user ${user.id} (${user.email})`);
    return { userId: user.id, email: user.email, emailVerificationSent: true };
  }

  async verifyEmailToken(token: string): Promise<{ verified: true }> {
    await this.verifyEmail.consume(token);
    return { verified: true };
  }

  /**
   * Plan § 4.4 login:
   * - 401 invalid_credentials  → wrong email OR password (combined, no leak)
   * - 403 email_not_verified   → credentials OK tapi belum verify
   */
  async login(dto: LoginDto, ctx: RequestContext): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        emailVerifiedAt: true,
        deletedAt: true,
      },
    });

    if (!user || user.deletedAt !== null || !user.passwordHash) {
      throw new UnauthorizedException('invalid_credentials');
    }

    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('invalid_credentials');
    }

    if (user.emailVerifiedAt === null) {
      throw new ForbiddenException('email_not_verified');
    }

    const { pair } = await this.tokens.issuePair({
      userId: user.id,
      email: user.email,
      userAgent: ctx.userAgent,
      ipAddress: ctx.ipAddress,
    });

    this.logger.log(`Login ${user.id} (${user.email})`);
    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        emailVerifiedAt: user.emailVerifiedAt,
      },
    };
  }

  /** Refresh rotation. Forwards 401 dari TokenService.rotate (replay/expired/etc). */
  async refresh(rawRefresh: string, ctx: RequestContext): Promise<RefreshResult> {
    const { pair } = await this.tokens.rotate({
      rawRefresh,
      userAgent: ctx.userAgent,
      ipAddress: ctx.ipAddress,
    });
    return { accessToken: pair.accessToken, refreshToken: pair.refreshToken };
  }

  /** Revoke single refresh token. Idempotent — gak fail kalo token gak ada. */
  async logout(rawRefresh: string): Promise<void> {
    await this.tokens.revoke(rawRefresh);
  }

  /** Revoke semua refresh aktif untuk user (semua device). */
  async logoutAll(userId: string): Promise<void> {
    await this.tokens.revokeAllForUser(userId);
  }

  async me(userId: string): Promise<MeResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        createdAt: true,
        deletedAt: true,
      },
    });
    if (!user || user.deletedAt !== null) {
      throw new UnauthorizedException('user_not_found');
    }
    return {
      id: user.id,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
    };
  }

  /**
   * Plan § 4.3 — idempotent. Always returns { sent: true } even kalo:
   * - email gak ada di DB
   * - user soft-deleted
   * - user udah verified
   * Supaya gak leak existence. Token issuance silently skip di kasus itu.
   */
  async resendVerification(email: string): Promise<{ sent: true }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, emailVerifiedAt: true, deletedAt: true },
    });
    if (user && user.deletedAt === null && user.emailVerifiedAt === null) {
      const token = await this.verifyEmail.issueFor(user.id);
      await this.mail.sendVerificationEmail(user.email, token);
    }
    return { sent: true };
  }
}
