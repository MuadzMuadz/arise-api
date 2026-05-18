import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class ResendVerificationDto {
  @ApiProperty({ example: 'ryvn@example.com', maxLength: 255 })
  @IsEmail()
  @MaxLength(255)
  email!: string;
}
