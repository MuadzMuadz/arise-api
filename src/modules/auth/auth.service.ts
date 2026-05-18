import { ConflictException, Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { uuidv7 } from 'uuidv7';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from './mail.service';
import { VerifyEmailService } from './verify-email.service';
import { RegisterDto } from './dto/register.dto';

export interface RegisterResult {
  userId: string;
  email: string;
  emailVerificationSent: boolean;
}

/**
 * AuthService — orchestrates register + email verification flows.
 * Login / refresh / logout di-tambahin per Step 7 + 9 (lihat
 * docs/auth/implementation-plan.md § 9).
 */
@Injectable()
export class AuthService {
  private static readonly BCRYPT_ROUNDS = 12;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly verifyEmail: VerifyEmailService,
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
}
