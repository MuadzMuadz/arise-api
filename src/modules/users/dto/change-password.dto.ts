import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current password (for re-auth)' })
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @ApiProperty({
    example: 'StrongPass12Chars',
    minLength: 12,
    maxLength: 128,
    description: 'Min 12 chars. Recommend mix alpha + digit + symbol.',
  })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;
}
