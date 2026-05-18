import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService, RequestContext } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { AuthenticatedUser } from './strategies/jwt.strategy';

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
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-send email verification token (idempotent)' })
  @ApiOkResponse({
    description: 'Always { sent: true } — no info-leak whether email exists',
  })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.auth.resendVerification(dto.email);
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

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token; return new pair' })
  @ApiOkResponse({ description: 'New access + refresh pair' })
  @ApiUnauthorizedResponse({
    description: 'Refresh invalid / expired / revoked / replayed',
  })
  async refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, requestContext(req));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a single refresh token (idempotent)' })
  @ApiNoContentResponse({ description: 'Token revoked (or already was)' })
  async logout(@Body() dto: LogoutDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke all refresh tokens for current user' })
  @ApiNoContentResponse({ description: 'All refresh tokens revoked' })
  @ApiUnauthorizedResponse({ description: 'Missing / invalid access token' })
  async logoutAll(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.auth.logoutAll(user.id);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current authenticated user' })
  @ApiOkResponse({ description: 'User info' })
  @ApiUnauthorizedResponse({ description: 'Missing / invalid access token' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }
}

function requestContext(req: Request): RequestContext {
  return {
    userAgent: req.headers['user-agent'] ?? null,
    ipAddress: req.ip ?? null,
  };
}
