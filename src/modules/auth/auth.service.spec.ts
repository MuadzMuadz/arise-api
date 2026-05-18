import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

function makeMocks() {
  return {
    prisma: {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    },
    mail: {
      sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    },
    verifyEmail: {
      issueFor: vi.fn().mockResolvedValue('verify-token-fake'),
      consume: vi.fn().mockResolvedValue({ userId: 'u1' }),
    },
    tokens: {
      issuePair: vi.fn().mockResolvedValue({
        pair: { accessToken: 'acc', refreshToken: 'ref' },
        family: 'fam',
        refreshId: 'rid',
      }),
      rotate: vi.fn().mockResolvedValue({
        pair: { accessToken: 'acc2', refreshToken: 'ref2' },
        userId: 'u1',
      }),
      revoke: vi.fn().mockResolvedValue(undefined),
      revokeAllForUser: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe('AuthService', () => {
  let svc: AuthService;
  let m: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    m = makeMocks();
    svc = new AuthService(m.prisma as any, m.mail as any, m.verifyEmail as any, m.tokens as any);
  });

  describe('register', () => {
    const dto = { email: 'ryvn@example.com', password: 'StrongPass12Chars' };

    it('throws Conflict when email already exists', async () => {
      m.prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(svc.register(dto)).rejects.toThrow(ConflictException);
      expect(m.prisma.user.create).not.toHaveBeenCalled();
    });

    it('hashes password with bcrypt before storing', async () => {
      m.prisma.user.findUnique.mockResolvedValue(null);
      m.prisma.user.create.mockResolvedValue({ id: 'u1', email: dto.email });

      await svc.register(dto);

      const createArgs = m.prisma.user.create.mock.calls[0]![0] as {
        data: { passwordHash: string };
      };
      expect(createArgs.data.passwordHash).not.toBe(dto.password);
      expect(createArgs.data.passwordHash.startsWith('$2')).toBe(true);
      const matches = await bcrypt.compare(dto.password, createArgs.data.passwordHash);
      expect(matches).toBe(true);
    });

    it('issues verify token + sends email on success', async () => {
      m.prisma.user.findUnique.mockResolvedValue(null);
      m.prisma.user.create.mockResolvedValue({ id: 'u1', email: dto.email });

      const result = await svc.register(dto);

      expect(m.verifyEmail.issueFor).toHaveBeenCalledWith('u1');
      expect(m.mail.sendVerificationEmail).toHaveBeenCalledWith(dto.email, 'verify-token-fake');
      expect(result).toEqual({
        userId: 'u1',
        email: dto.email,
        emailVerificationSent: true,
      });
    });
  });

  describe('login', () => {
    const dto = { email: 'a@b.c', password: 'CorrectPass12Char' };
    const ctx = { userAgent: null, ipAddress: null };

    it('rejects when user missing (no info-leak)', async () => {
      m.prisma.user.findUnique.mockResolvedValue(null);
      await expect(svc.login(dto, ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when user soft-deleted', async () => {
      m.prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 4),
        emailVerifiedAt: new Date(),
        deletedAt: new Date(),
      });
      await expect(svc.login(dto, ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when passwordHash is null (e.g. SSO-only user)', async () => {
      m.prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: dto.email,
        passwordHash: null,
        emailVerifiedAt: new Date(),
        deletedAt: null,
      });
      await expect(svc.login(dto, ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects wrong password (same error as wrong-email — no leak)', async () => {
      m.prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: dto.email,
        passwordHash: await bcrypt.hash('different-password', 4),
        emailVerifiedAt: new Date(),
        deletedAt: null,
      });
      await expect(svc.login(dto, ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('returns 403 Forbidden when email not verified', async () => {
      m.prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 4),
        emailVerifiedAt: null,
        deletedAt: null,
      });
      await expect(svc.login(dto, ctx)).rejects.toThrow(ForbiddenException);
    });

    it('returns pair + user summary on success', async () => {
      const verifiedAt = new Date('2026-01-01');
      m.prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 4),
        emailVerifiedAt: verifiedAt,
        deletedAt: null,
      });
      const out = await svc.login(dto, ctx);
      expect(out).toEqual({
        accessToken: 'acc',
        refreshToken: 'ref',
        user: { id: 'u1', email: dto.email, emailVerifiedAt: verifiedAt },
      });
    });
  });

  describe('refresh', () => {
    it('forwards to TokenService.rotate + returns new pair', async () => {
      const out = await svc.refresh('raw', { userAgent: 'ua', ipAddress: 'ip' });
      expect(m.tokens.rotate).toHaveBeenCalledWith({
        rawRefresh: 'raw',
        userAgent: 'ua',
        ipAddress: 'ip',
      });
      expect(out).toEqual({ accessToken: 'acc2', refreshToken: 'ref2' });
    });
  });

  describe('logout / logoutAll', () => {
    it('logout calls TokenService.revoke', async () => {
      await svc.logout('raw');
      expect(m.tokens.revoke).toHaveBeenCalledWith('raw');
    });

    it('logoutAll calls TokenService.revokeAllForUser', async () => {
      await svc.logoutAll('u1');
      expect(m.tokens.revokeAllForUser).toHaveBeenCalledWith('u1');
    });
  });

  describe('me', () => {
    it('returns user info for active user', async () => {
      const created = new Date('2026-01-01');
      const verified = new Date('2026-01-02');
      m.prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.c',
        emailVerifiedAt: verified,
        createdAt: created,
        deletedAt: null,
      });
      const out = await svc.me('u1');
      expect(out).toEqual({
        id: 'u1',
        email: 'a@b.c',
        emailVerifiedAt: verified,
        createdAt: created,
      });
    });

    it('throws 401 when user missing', async () => {
      m.prisma.user.findUnique.mockResolvedValue(null);
      await expect(svc.me('u1')).rejects.toThrow(UnauthorizedException);
    });

    it('throws 401 when user soft-deleted', async () => {
      m.prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.c',
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
        deletedAt: new Date(),
      });
      await expect(svc.me('u1')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('resendVerification (idempotent, no info-leak)', () => {
    it('returns { sent: true } even when email gak ada', async () => {
      m.prisma.user.findUnique.mockResolvedValue(null);
      const out = await svc.resendVerification('ghost@nowhere.io');
      expect(out).toEqual({ sent: true });
      expect(m.verifyEmail.issueFor).not.toHaveBeenCalled();
      expect(m.mail.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('returns { sent: true } untuk user soft-deleted (no mail)', async () => {
      m.prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.c',
        emailVerifiedAt: null,
        deletedAt: new Date(),
      });
      const out = await svc.resendVerification('a@b.c');
      expect(out).toEqual({ sent: true });
      expect(m.mail.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('returns { sent: true } untuk user yg sudah verified (no re-send)', async () => {
      m.prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.c',
        emailVerifiedAt: new Date(),
        deletedAt: null,
      });
      await svc.resendVerification('a@b.c');
      expect(m.mail.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('issues + sends token untuk user unverified yang aktif', async () => {
      m.prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.c',
        emailVerifiedAt: null,
        deletedAt: null,
      });
      await svc.resendVerification('a@b.c');
      expect(m.verifyEmail.issueFor).toHaveBeenCalledWith('u1');
      expect(m.mail.sendVerificationEmail).toHaveBeenCalledWith('a@b.c', 'verify-token-fake');
    });
  });
});
