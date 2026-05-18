import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { AuthenticatedUser } from '../strategies/jwt.strategy';

/**
 * Extract authenticated user dari `req.user` (populated by JwtStrategy.validate).
 *
 * Usage:
 *   @Get('me')
 *   me(@CurrentUser() user: AuthenticatedUser) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return req.user;
  },
);
