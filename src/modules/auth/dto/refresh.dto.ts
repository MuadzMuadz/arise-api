import { ApiProperty } from '@nestjs/swagger';
import { IsHexadecimal, IsString, Length } from 'class-validator';

export class RefreshDto {
  @ApiProperty({
    description: '128-char hex token (64 random bytes, opaque)',
    minLength: 128,
    maxLength: 128,
  })
  @IsString()
  @Length(128, 128)
  @IsHexadecimal()
  refreshToken!: string;
}
