import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenService } from './token.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

function makeMocks() {
  return {
    prisma: {
      refreshToken: {
        create: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      user: {
        findUnique: vi.fn(),
      },
    },
    jwt: {
      signAsync: vi.fn().mockResolvedValue('signed.jwt.token'),
    },
    config: {
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'JWT_REFRESH_TTL') return '30d';
        throw new Error(`unexpected config key: ${key}`);
      }),
    },
  };
}

describe('TokenService', () => {
  let svc: TokenService;
  let m: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    m = makeMocks();
    svc = new TokenService(m.prisma as any, m.jwt as any, m.config as any);
  });

  describe('issuePair', () => {
    it('returns 128-char hex refresh + signed access', async () => {
      const out = await svc.issuePair({ userId: 'u1', email: 'a@b.c' });
      expect(out.pair.accessToken).toBe('signed.jwt.token');
      expect(out.pair.refreshToken).toHaveLength(128);
      expect(out.pair.refreshToken).toMatch(/^[a-f0-9]+$/);
    });

    it('signs JWT with sub + email payload', async () => {
      await svc.issuePair({ userId: 'u1', email: 'a@b.c' });
      expect(m.jwt.signAsync).toHaveBeenCalledWith({ sub: 'u1', email: 'a@b.c' });
    });

    it('creates row with SHA-256 hash, not raw token', async () => {
      const out = await svc.issuePair({ userId: 'u1', email: 'a@b.c' });
      const createArgs = m.prisma.refreshToken.create.mock.calls[0]![0] as {
        data: { tokenHash: string; userId: string; family: string };
      };
      expect(createArgs.data.tokenHash).not.toBe(out.pair.refreshToken);
      expect(createArgs.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('uses provided family for rotation; new UUID family for new login', async () => {
      const a = await svc.issuePair({ userId: 'u1', email: 'a@b.c' });
      const b = await svc.issuePair({
        userId: 'u1',
        email: 'a@b.c',
        family: a.family,
      });
      expect(b.family).toBe(a.family);

      const c = await svc.issuePair({ userId: 'u1', email: 'a@b.c' });
      expect(c.family).not.toBe(a.family);
    });

    it('captures userAgent + ipAddress when provided', async () => {
      await svc.issuePair({
        userId: 'u1',
        email: 'a@b.c',
        userAgent: 'Mozilla/x',
        ipAddress: '1.2.3.4',
      });
      const args = m.prisma.refreshToken.create.mock.calls[0]![0] as {
        data: { userAgent: string | null; ipAddress: string | null };
      };
      expect(args.data.userAgent).toBe('Mozilla/x');
      expect(args.data.ipAddress).toBe('1.2.3.4');
    });
  });

  describe('rotate', () => {
    const rawRefresh = 'b'.repeat(128);

    it('throws Unauthorized when token not found', async () => {
      m.prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(svc.rotate({ rawRefresh })).rejects.toThrow(UnauthorizedException);
    });

    it('detects replay (already-replaced) + revokes family + throws', async () => {
      m.prisma.refreshToken.findUnique.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        family: 'fam-1',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        replacedById: 't2', // ← sudah di-rotate
      });
      await expect(svc.rotate({ rawRefresh })).rejects.toThrow(UnauthorizedException);
      expect(m.prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { family: 'fam-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('detects replay (already-revoked) + revokes family', async () => {
      m.prisma.refreshToken.findUnique.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        family: 'fam-1',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
        replacedById: null,
      });
      await expect(svc.rotate({ rawRefresh })).rejects.toThrow(UnauthorizedException);
      expect(m.prisma.refreshToken.updateMany).toHaveBeenCalled();
    });

    it('rejects expired token (no family-burn)', async () => {
      m.prisma.refreshToken.findUnique.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        family: 'fam-1',
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
        replacedById: null,
      });
      await expect(svc.rotate({ rawRefresh })).rejects.toThrow(UnauthorizedException);
      expect(m.prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('rejects when user soft-deleted', async () => {
      m.prisma.refreshToken.findUnique.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        family: 'fam-1',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        replacedById: null,
      });
      m.prisma.user.findUnique.mockResolvedValue({
        email: 'a@b.c',
        deletedAt: new Date(),
      });
      await expect(svc.rotate({ rawRefresh })).rejects.toThrow(UnauthorizedException);
    });

    it('happy path: issues new pair in same family + links replacedById', async () => {
      m.prisma.refreshToken.findUnique.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        family: 'fam-1',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        replacedById: null,
      });
      m.prisma.user.findUnique.mockResolvedValue({
        email: 'a@b.c',
        deletedAt: null,
      });
      const out = await svc.rotate({ rawRefresh });
      expect(out.pair.accessToken).toBe('signed.jwt.token');
      expect(out.pair.refreshToken).toHaveLength(128);
      expect(out.userId).toBe('u1');

      // New row created in same family
      const createArgs = m.prisma.refreshToken.create.mock.calls[0]![0] as {
        data: { family: string };
      };
      expect(createArgs.data.family).toBe('fam-1');

      // Old token linked to new
      expect(m.prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { replacedById: expect.any(String) },
      });
    });
  });

  describe('revoke', () => {
    it('marks revokedAt via hash lookup; idempotent', async () => {
      await svc.revoke('c'.repeat(128));
      expect(m.prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('revokeAllForUser', () => {
    it('revokes all active refresh rows for given user', async () => {
      await svc.revokeAllForUser('u1');
      expect(m.prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
