import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Put, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpsertProfileDto } from './dto/upsert-profile.dto';
import { ProfilesService } from './profiles.service';

@ApiTags('profiles')
@ApiBearerAuth()
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiOkResponse({ description: 'Profile object' })
  @ApiNotFoundResponse({ description: 'Profile belum di-upsert (lakukan PUT)' })
  @ApiUnauthorizedResponse({ description: 'Missing / invalid access token' })
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.profiles.getMe(user.id);
  }

  @Put('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Upsert profile (full replace)',
    description: '201 kalo create pertama kali; 200 kalo update existing.',
  })
  @ApiOkResponse({ description: 'Profile updated' })
  @ApiCreatedResponse({ description: 'Profile created (first upsert)' })
  @ApiUnauthorizedResponse({ description: 'Missing / invalid access token' })
  async putMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertProfileDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { profile, created } = await this.profiles.upsert(user.id, dto);
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return profile;
  }

  @Patch('me')
  @ApiOperation({ summary: 'Partial update profile' })
  @ApiOkResponse({ description: 'Profile updated' })
  @ApiNotFoundResponse({ description: 'Profile belum di-upsert (lakukan PUT)' })
  @ApiUnauthorizedResponse({ description: 'Missing / invalid access token' })
  async patchMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.profiles.patch(user.id, dto);
  }
}
