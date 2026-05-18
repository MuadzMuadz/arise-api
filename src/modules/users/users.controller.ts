import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateEmailDto } from './dto/update-email.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Current user (includes profile if exists)' })
  @ApiOkResponse({ description: 'User + profile (profile=null kalo belum di-upsert)' })
  @ApiUnauthorizedResponse({ description: 'Missing / invalid access token' })
  @ApiNotFoundResponse({ description: 'User not found / soft-deleted' })
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.users.getMe(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update account-level fields (currently: email)' })
  @ApiOkResponse({ description: 'Updated. Kalo email berubah, verify token diissue ulang.' })
  @ApiConflictResponse({ description: 'Email already taken by other user' })
  @ApiUnauthorizedResponse({ description: 'Missing / invalid access token' })
  async patchMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateEmailDto) {
    return this.users.updateEmail(user.id, dto.email);
  }

  @Post('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Change password',
    description: 'Re-login required di semua device after success (revoke-all).',
  })
  @ApiNoContentResponse({ description: 'Password updated; all refresh tokens revoked' })
  @ApiUnauthorizedResponse({ description: 'currentPassword salah, atau token invalid' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.users.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete account (idempotent, revoke-all)' })
  @ApiNoContentResponse({ description: 'Account marked deleted' })
  @ApiUnauthorizedResponse({ description: 'Missing / invalid access token' })
  async deleteMe(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.users.softDelete(user.id);
  }
}
