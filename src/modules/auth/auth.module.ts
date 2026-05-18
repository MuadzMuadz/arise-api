import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Env } from '../../config/env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailService } from './mail.service';
import { TokenService } from './token.service';
import { VerifyEmailService } from './verify-email.service';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * Auth module — Sprint 1.
 *
 * JwtAuthGuard global registration di Step 8.
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: config.get('JWT_ACCESS_TTL', { infer: true }),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, MailService, VerifyEmailService, TokenService, JwtStrategy],
  exports: [AuthService, TokenService, VerifyEmailService, MailService],
})
export class AuthModule {}
