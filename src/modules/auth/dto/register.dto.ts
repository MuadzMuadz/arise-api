import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'ryvn@example.com', maxLength: 255 })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({
    example: 'StrongPass12Chars',
    minLength: 12,
    maxLength: 128,
    description: 'Min 12 chars. Recommend mix alpha + digit + symbol.',
  })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
