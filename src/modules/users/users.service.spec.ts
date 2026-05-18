import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersService } from './users.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

function makeMocks() {
  return {
    prisma: {
      user: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    },
    tokens: {
      revokeAllForUser: vi.fn().mockResolvedValue(undefined),
    },
    verifyEmail: {
      issueFor: vi.fn().mockResolvedValue('verify-token-fake'),
    },
    mail: {
      sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe('UsersService', () => {
  let svc: UsersService;
  let m: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    m = makeMocks();
    svc = new UsersService(
      m.prisma as any,
      m.tokens as any,
      m.verifyEmail as any,
      m.mail as any,
    );
  });

  describe('getMe', () => {
    it('returns user + profile null when profile gak ada', async () => {
      const created = new Date('2026-01-01');
      m.prisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        email: 'a@b.c',
        emailVerifiedAt: created,
        createdAt: created,
        profile: null,
      });
      const out = await svc.getMe('u1');
      expect(out).toEqual({
        id: 'u1',
        email: 'a@b.c',
        emailVerifiedAt: created,
        createdAt: created,
        profile: null,
      });
    });

    it('returns user + profile populated, birthDate serialized YYYY-MM-DD', async () => {
      const created = new Date('2026-01-01');
      m.prisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        email: 'a@b.c',
        emailVerifiedAt: created,
        createdAt: created,
        profile: {
          displayName: 'Ryvn',
          gender: 'male',
          birthDate: new Date('1995-08-12T00:00:00Z'),
          heightCm: 173,
          timezone: 'Asia/Jakarta',
          locale: 'id-ID',
          hunterTitle: null,
        },
      });
      const out = await svc.getMe('u1');
      expect(out.profile).toEqual({
        displayName: 'Ryvn',
        gender: 'male',
        birthDate: '1995-08-12',
        heightCm: 173,
        timezone: 'Asia/Jakarta',
        locale: 'id-ID',
        hunterTitle: null,
      });
    });

    it('throws NotFound kalo user gak ada / soft-deleted', async () => {
      m.prisma.user.findFirst.mockResolvedValue(null);
      await expect(svc.getMe('u1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateEmail', () => {
    const userId = 'u1';

    it('no-op kalo newEmail undefined — return current without re-verify', async () => {
      m.prisma.user.findFirst.mockResolvedValue({
        id: userId,
        email: 'a@b.c',
        emailVerifiedAt: new Date('2026-01-01'),
      });
      const out = await svc.updateEmail(userId, undefined);
      expect(out.emailVerificationSent).toBe(false);
      expect(m.prisma.user.update).not.toHaveBeenCalled();
      expect(m.verifyEmail.issueFor).not.toHaveBeenCalled();
    });

    it('no-op kalo newEmail sama dgn current', async () => {
      m.prisma.user.findFirst.mockResolvedValue({
        id: userId,
        email: 'a@b.c',
        emailVerifiedAt: new Date('2026-01-01'),
      });
      const out = await svc.updateEmail(userId, 'a@b.c');
      expect(out.emailVerificationSent).toBe(false);
      expect(m.prisma.user.update).not.toHaveBeenCalled();
    });

    it('demote emailVerifiedAt + issue token baru + send mail saat email berubah', async () => {
      m.prisma.user.findFirst.mockResolvedValue({
        id: userId,
        email: 'a@b.c',
        emailVerifiedAt: new Date('2026-01-01'),
      });
      m.prisma.user.update.mockResolvedValue({
        id: userId,
        email: 'new@b.c',
        emailVerifiedAt: null,
      });

      const out = await svc.updateEmail(userId, 'new@b.c');

      expect(m.prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { email: 'new@b.c', emailVerifiedAt: null },
        select: { id: true, email: true, emailVerifiedAt: true },
      });
      expect(m.verifyEmail.issueFor).toHaveBeenCalledWith(userId);
      expect(m.mail.sendVerificationEmail).toHaveBeenCalledWith('new@b.c', 'verify-token-fake');
      expect(out).toEqual({
        id: userId,
        email: 'new@b.c',
        emailVerifiedAt: null,
        emailVerificationSent: true,
      });
    });

    it('throws Conflict kalo email taken oleh user lain (P2002)', async () => {
      m.prisma.user.findFirst.mockResolvedValue({
        id: userId,
        email: 'a@b.c',
        emailVerifiedAt: new Date(),
      });
      m.prisma.user.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );
      await expect(svc.updateEmail(userId, 'taken@b.c')).rejects.toThrow(ConflictException);
    });

    it('throws NotFound kalo user gak ada', async () => {
      m.prisma.user.findFirst.mockResolvedValue(null);
      await expect(svc.updateEmail(userId, 'x@y.z')).rejects.toThrow(NotFoundException);
    });
  });

  describe('changePassword', () => {
    const userId = 'u1';

    it('throws 401 kalo currentPassword salah', async () => {
      m.prisma.user.findFirst.mockResolvedValue({
        id: userId,
        passwordHash: await bcrypt.hash('correct-pass', 4),
      });
      await expect(svc.changePassword(userId, 'wrong-pass', 'NewPass12Chars!')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(m.prisma.user.update).not.toHaveBeenCalled();
      expect(m.tokens.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('throws 401 kalo passwordHash null (SSO-only user)', async () => {
      m.prisma.user.findFirst.mockResolvedValue({ id: userId, passwordHash: null });
      await expect(svc.changePassword(userId, 'anything', 'NewPass12Chars!')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws 401 kalo user gak ada / soft-deleted', async () => {
      m.prisma.user.findFirst.mockResolvedValue(null);
      await expect(svc.changePassword(userId, 'x', 'NewPass12Chars!')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('hashes new password + revokes all sessions on success', async () => {
      const currentPass = 'CorrectPass12';
      m.prisma.user.findFirst.mockResolvedValue({
        id: userId,
        passwordHash: await bcrypt.hash(currentPass, 4),
      });
      m.prisma.user.update.mockResolvedValue({});

      await svc.changePassword(userId, currentPass, 'NewPass12Chars!');

      const updateArgs = m.prisma.user.update.mock.calls[0]![0] as {
        data: { passwordHash: string };
      };
      expect(updateArgs.data.passwordHash.startsWith('$2')).toBe(true);
      expect(
        await bcrypt.compare('NewPass12Chars!', updateArgs.data.passwordHash),
      ).toBe(true);
      expect(m.tokens.revokeAllForUser).toHaveBeenCalledWith(userId);
    });
  });

  describe('softDelete', () => {
    const userId = 'u1';

    it('returns silently kalo user gak ada (idempotent)', async () => {
      m.prisma.user.findUnique.mockResolvedValue(null);
      await svc.softDelete(userId);
      expect(m.prisma.user.update).not.toHaveBeenCalled();
      expect(m.tokens.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('skips update kalo udah deleted, tetep revoke-all (defensive)', async () => {
      m.prisma.user.findUnique.mockResolvedValue({
        id: userId,
        deletedAt: new Date('2026-01-01'),
      });
      await svc.softDelete(userId);
      expect(m.prisma.user.update).not.toHaveBeenCalled();
      expect(m.tokens.revokeAllForUser).toHaveBeenCalledWith(userId);
    });

    it('sets deletedAt + revoke-all untuk active user', async () => {
      m.prisma.user.findUnique.mockResolvedValue({ id: userId, deletedAt: null });
      m.prisma.user.update.mockResolvedValue({});
      await svc.softDelete(userId);
      const args = m.prisma.user.update.mock.calls[0]![0] as { data: { deletedAt: Date } };
      expect(args.data.deletedAt).toBeInstanceOf(Date);
      expect(m.tokens.revokeAllForUser).toHaveBeenCalledWith(userId);
    });
  });
});
