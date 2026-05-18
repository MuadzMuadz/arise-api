import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * Auth module — Sprint 1.
 *
 * JwtModule, PassportModule, TokenService, MailService, JwtStrategy
 * di-tambahin per Step 4-8 (lihat docs/auth/implementation-plan.md § 9).
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
