import { ApiProperty } from '@nestjs/swagger';
import { IsHexadecimal, IsString, Length } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({
    description: '64-char hex token (32 random bytes)',
    minLength: 64,
    maxLength: 64,
  })
  @IsString()
  @Length(64, 64)
  @IsHexadecimal()
  token!: string;
}
