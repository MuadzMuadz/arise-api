import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

/**
 * Auth endpoints. Login / refresh / logout / me / resend / logout-all
 * di-tambahin per Step 7-10 (lihat docs/auth/implementation-plan.md § 9).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Sign up with email + password' })
  @ApiCreatedResponse({ description: 'User created. Verification email queued.' })
  @ApiConflictResponse({ description: 'Email already registered' })
  async register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm email via verification token' })
  @ApiOkResponse({ description: 'Email verified' })
  @ApiNotFoundResponse({ description: 'Token invalid / used / expired' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmailToken(dto.token);
  }
}
