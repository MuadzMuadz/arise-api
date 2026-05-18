import { ApiPropertyOptional } from '@nestjs/swagger';
import { Gender } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Ryvn', minLength: 2, maxLength: 60 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  displayName?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ example: '1995-08-12', description: 'ISO date YYYY-MM-DD' })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(DATE_REGEX, { message: 'birthDate must be YYYY-MM-DD' })
  birthDate?: string;

  @ApiPropertyOptional({ example: 173, minimum: 50, maximum: 300, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(300)
  heightCm?: number;

  @ApiPropertyOptional({ example: 'Asia/Jakarta', maxLength: 64 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ example: 'id-ID', maxLength: 16 })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  locale?: string;

  @ApiPropertyOptional({ example: 'Shadow Monarch', maxLength: 60, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  hunterTitle?: string;
}
