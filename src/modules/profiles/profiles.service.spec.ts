import { NotFoundException } from '@nestjs/common';
import { Gender } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilesService } from './profiles.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

function makeMocks() {
  return {
    prisma: {
      profile: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    },
  };
}

const sampleRow = {
  id: 'p1',
  userId: 'u1',
  displayName: 'Ryvn',
  gender: Gender.male,
  birthDate: new Date('1995-08-12T00:00:00Z'),
  heightCm: 173,
  timezone: 'Asia/Jakarta',
  locale: 'id-ID',
  hunterTitle: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ProfilesService', () => {
  let svc: ProfilesService;
  let m: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    m = makeMocks();
    svc = new ProfilesService(m.prisma as any);
  });

  describe('getMe', () => {
    it('throws NotFound kalo profile gak ada', async () => {
      m.prisma.profile.findUnique.mockResolvedValue(null);
      await expect(svc.getMe('u1')).rejects.toThrow(NotFoundException);
    });

    it('returns serialized profile (birthDate YYYY-MM-DD)', async () => {
      m.prisma.profile.findUnique.mockResolvedValue(sampleRow);
      const out = await svc.getMe('u1');
      expect(out).toEqual({
        displayName: 'Ryvn',
        gender: Gender.male,
        birthDate: '1995-08-12',
        heightCm: 173,
        timezone: 'Asia/Jakarta',
        locale: 'id-ID',
        hunterTitle: null,
      });
    });
  });

  describe('upsert', () => {
    const dto = {
      displayName: 'Ryvn',
      gender: Gender.male,
      birthDate: '1995-08-12',
      timezone: 'Asia/Jakarta',
    };

    it('create kalo belum ada → created=true', async () => {
      m.prisma.profile.findUnique.mockResolvedValue(null);
      m.prisma.profile.create.mockResolvedValue(sampleRow);

      const out = await svc.upsert('u1', dto);

      expect(out.created).toBe(true);
      expect(m.prisma.profile.create).toHaveBeenCalled();
      const args = m.prisma.profile.create.mock.calls[0]![0] as { data: any };
      expect(args.data.userId).toBe('u1');
      expect(args.data.birthDate).toEqual(new Date('1995-08-12T00:00:00Z'));
      expect(args.data.locale).toBe('id-ID'); // default
      expect(args.data.heightCm).toBeNull();
      expect(args.data.hunterTitle).toBeNull();
      expect(args.data.id).toBeDefined();
    });

    it('update kalo udah ada → created=false', async () => {
      m.prisma.profile.findUnique.mockResolvedValue({ id: 'p1' });
      m.prisma.profile.update.mockResolvedValue(sampleRow);

      const out = await svc.upsert('u1', { ...dto, hunterTitle: 'Shadow Monarch' });

      expect(out.created).toBe(false);
      expect(m.prisma.profile.create).not.toHaveBeenCalled();
      expect(m.prisma.profile.update).toHaveBeenCalled();
      const args = m.prisma.profile.update.mock.calls[0]![0] as {
        where: { userId: string };
        data: any;
      };
      expect(args.where.userId).toBe('u1');
      expect(args.data.hunterTitle).toBe('Shadow Monarch');
    });

    it('honors optional fields (heightCm, locale, hunterTitle) saat provided', async () => {
      m.prisma.profile.findUnique.mockResolvedValue(null);
      m.prisma.profile.create.mockResolvedValue(sampleRow);

      await svc.upsert('u1', {
        ...dto,
        heightCm: 180,
        locale: 'en-US',
        hunterTitle: 'Shadow',
      });

      const args = m.prisma.profile.create.mock.calls[0]![0] as { data: any };
      expect(args.data.heightCm).toBe(180);
      expect(args.data.locale).toBe('en-US');
      expect(args.data.hunterTitle).toBe('Shadow');
    });
  });

  describe('patch', () => {
    it('throws NotFound kalo profile belum ada', async () => {
      m.prisma.profile.findUnique.mockResolvedValue(null);
      await expect(svc.patch('u1', { displayName: 'New' })).rejects.toThrow(NotFoundException);
      expect(m.prisma.profile.update).not.toHaveBeenCalled();
    });

    it('only sets fields yang present di dto', async () => {
      m.prisma.profile.findUnique.mockResolvedValue({ id: 'p1' });
      m.prisma.profile.update.mockResolvedValue(sampleRow);

      await svc.patch('u1', { displayName: 'New', hunterTitle: 'King' });

      const args = m.prisma.profile.update.mock.calls[0]![0] as { data: Record<string, unknown> };
      expect(args.data).toEqual({ displayName: 'New', hunterTitle: 'King' });
      expect('gender' in args.data).toBe(false);
      expect('birthDate' in args.data).toBe(false);
    });

    it('parses birthDate string saat di-update', async () => {
      m.prisma.profile.findUnique.mockResolvedValue({ id: 'p1' });
      m.prisma.profile.update.mockResolvedValue(sampleRow);

      await svc.patch('u1', { birthDate: '2000-01-15' });

      const args = m.prisma.profile.update.mock.calls[0]![0] as { data: any };
      expect(args.data.birthDate).toEqual(new Date('2000-01-15T00:00:00Z'));
    });
  });
});
