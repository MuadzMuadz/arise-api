import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, MaxLength } from 'class-validator';

export class UpdateEmailDto {
  @ApiProperty({ example: 'newemail@example.com', maxLength: 255, required: false })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;
}
