import { ApiProperty } from '@nestjs/swagger';
import { IsHexadecimal, IsString, Length } from 'class-validator';

export class LogoutDto {
  @ApiProperty({ description: '128-char hex refresh token to revoke' })
  @IsString()
  @Length(128, 128)
  @IsHexadecimal()
  refreshToken!: string;
}
