import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

/**
 * Endpoints di-tambahin per Step 5-10 (register, verify, login,
 * refresh, logout, logout-all, me, resend-verification).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {}
