import { CustomDecorator, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opt-out dari global JwtAuthGuard. Pakai di handler / controller yang
 * sengaja unauthenticated (register, login, health, dll).
 */
export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true);
