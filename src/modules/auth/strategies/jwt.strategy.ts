import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Env } from '../../../config/env';

export interface JwtPayload {
  sub: string; // userId
  email: string;
  iat?: number;
  exp?: number;
}

/**
 * Object attached to `req.user` after successful JWT auth. Consumers
 * pakai @CurrentUser() (lihat decorators/current-user.decorator.ts).
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
}

/**
 * Stateless access-token validation (plan § 2.2 / § 2.5):
 * NO DB hit per request. JWT signature + expiry only. Worst case:
 * stolen access valid up to TTL (15m). Logout revokes refresh, not access.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    if (!payload?.sub || !payload?.email) {
      throw new UnauthorizedException('invalid_token');
    }
    return { id: payload.sub, email: payload.email };
  }
}
