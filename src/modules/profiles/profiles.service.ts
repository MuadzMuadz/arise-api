import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Gender } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpsertProfileDto } from './dto/upsert-profile.dto';

export interface ProfileResult {
  displayName: string;
  gender: Gender;
  birthDate: string;
  heightCm: number | null;
  timezone: string;
  locale: string;
  hunterTitle: string | null;
}

export interface ProfileUpsertResult {
  profile: ProfileResult;
  created: boolean;
}

@Injectable()
export class ProfilesService {
  private readonly logger = new Logger(ProfilesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string): Promise<ProfileResult> {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('profile_not_found');
    }
    return serialize(profile);
  }

  /**
   * PUT — full upsert. Onboarding-friendly:
   * - Create kalo gak ada → return created=true (controller maps ke 201).
   * - Update full kalo udah ada → return created=false (200).
   */
  async upsert(userId: string, dto: UpsertProfileDto): Promise<ProfileUpsertResult> {
    const birthDate = parseDate(dto.birthDate);
    const existing = await this.prisma.profile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (existing) {
      const updated = await this.prisma.profile.update({
        where: { userId },
        data: {
          displayName: dto.displayName,
          gender: dto.gender,
          birthDate,
          heightCm: dto.heightCm ?? null,
          timezone: dto.timezone,
          locale: dto.locale ?? 'id-ID',
          hunterTitle: dto.hunterTitle ?? null,
        },
      });
      return { profile: serialize(updated), created: false };
    }

    const created = await this.prisma.profile.create({
      data: {
        id: uuidv7(),
        userId,
        displayName: dto.displayName,
        gender: dto.gender,
        birthDate,
        heightCm: dto.heightCm ?? null,
        timezone: dto.timezone,
        locale: dto.locale ?? 'id-ID',
        hunterTitle: dto.hunterTitle ?? null,
      },
    });
    this.logger.log(`Profile created for user ${userId}`);
    return { profile: serialize(created), created: true };
  }

  /**
   * PATCH — partial update. 404 kalo belum ada (harus PUT dulu).
   * Hanya field present di dto yang di-set; field omitted dibiarkan.
   */
  async patch(userId: string, dto: UpdateProfileDto): Promise<ProfileResult> {
    const existing = await this.prisma.profile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('profile_not_found');
    }

    const data: Record<string, unknown> = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.birthDate !== undefined) data.birthDate = parseDate(dto.birthDate);
    if (dto.heightCm !== undefined) data.heightCm = dto.heightCm;
    if (dto.timezone !== undefined) data.timezone = dto.timezone;
    if (dto.locale !== undefined) data.locale = dto.locale;
    if (dto.hunterTitle !== undefined) data.hunterTitle = dto.hunterTitle;

    const updated = await this.prisma.profile.update({
      where: { userId },
      data,
    });
    return serialize(updated);
  }
}

interface ProfileRow {
  displayName: string;
  gender: Gender;
  birthDate: Date;
  heightCm: number | null;
  timezone: string;
  locale: string;
  hunterTitle: string | null;
}

function serialize(p: ProfileRow): ProfileResult {
  return {
    displayName: p.displayName,
    gender: p.gender,
    birthDate: p.birthDate.toISOString().slice(0, 10),
    heightCm: p.heightCm,
    timezone: p.timezone,
    locale: p.locale,
    hunterTitle: p.hunterTitle,
  };
}

function parseDate(iso: string): Date {
  // YYYY-MM-DD → UTC midnight (Postgres DATE = date-only, gak ada timezone).
  return new Date(`${iso}T00:00:00Z`);
}
