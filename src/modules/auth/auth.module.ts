import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailService } from './mail.service';
import { VerifyEmailService } from './verify-email.service';

/**
 * Auth module — Sprint 1.
 *
 * JwtModule, PassportModule, TokenService, JwtStrategy di-tambahin
 * per Step 6-8 (lihat docs/auth/implementation-plan.md § 9).
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService, MailService, VerifyEmailService],
  exports: [AuthService],
})
export class AuthModule {}
