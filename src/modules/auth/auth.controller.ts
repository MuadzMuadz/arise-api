import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService, RequestContext } from './auth.service';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

/**
 * Auth endpoints. /me, /refresh, /logout, /logout-all, /resend-verification
 * ditambahin per Step 9-10.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Sign up with email + password' })
  @ApiCreatedResponse({ description: 'User created. Verification email queued.' })
  @ApiConflictResponse({ description: 'Email already registered' })
  async register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm email via verification token' })
  @ApiOkResponse({ description: 'Email verified' })
  @ApiNotFoundResponse({ description: 'Token invalid / used / expired' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmailToken(dto.token);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login — return access + refresh tokens' })
  @ApiOkResponse({ description: 'Logged in; pair returned' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiForbiddenResponse({ description: 'Email not verified' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, requestContext(req));
  }
}

function requestContext(req: Request): RequestContext {
  return {
    userAgent: req.headers['user-agent'] ?? null,
    ipAddress: req.ip ?? null,
  };
}
