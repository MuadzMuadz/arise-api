import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VerifyEmailService } from './verify-email.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

function makePrismaMock() {
  return {
    emailVerifyToken: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    user: {
      update: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn().mockImplementation(async (ops: unknown[]) => ops),
  };
}

describe('VerifyEmailService', () => {
  let service: VerifyEmailService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new VerifyEmailService(prisma as any);
  });

  describe('issueFor', () => {
    it('returns 64-char hex token', async () => {
      const token = await service.issueFor('u1');
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[a-f0-9]+$/);
    });

    it('invalidates prior unused tokens before issuing', async () => {
      await service.issueFor('u1');
      expect(prisma.emailVerifyToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', usedAt: null, expiresAt: { gt: expect.any(Date) } },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.emailVerifyToken.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.emailVerifyToken.create.mock.invocationCallOrder[0],
      );
    });

    it('persists SHA-256 hash of raw token (raw NEVER stored)', async () => {
      const token = await service.issueFor('u1');
      const createArgs = prisma.emailVerifyToken.create.mock.calls[0]![0] as {
        data: { tokenHash: string; userId: string; expiresAt: Date };
      };
      expect(createArgs.data.tokenHash).not.toBe(token);
      expect(createArgs.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(createArgs.data.userId).toBe('u1');
    });

    it('sets expiresAt ~24h ahead', async () => {
      const before = Date.now();
      await service.issueFor('u1');
      const after = Date.now();
      const createArgs = prisma.emailVerifyToken.create.mock.calls[0]![0] as {
        data: { expiresAt: Date };
      };
      const ttl = createArgs.data.expiresAt.getTime();
      expect(ttl).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000);
      expect(ttl).toBeLessThanOrEqual(after + 24 * 60 * 60 * 1000);
    });
  });

  describe('consume', () => {
    const rawToken = 'a'.repeat(64);

    it('throws NotFoundException when token missing', async () => {
      prisma.emailVerifyToken.findUnique.mockResolvedValue(null);
      await expect(service.consume(rawToken)).rejects.toThrow(NotFoundException);
    });

    it('throws when token already used', async () => {
      prisma.emailVerifyToken.findUnique.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });
      await expect(service.consume(rawToken)).rejects.toThrow(NotFoundException);
    });

    it('throws when token expired', async () => {
      prisma.emailVerifyToken.findUnique.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.consume(rawToken)).rejects.toThrow(NotFoundException);
    });

    it('marks token used + sets user.emailVerifiedAt on valid', async () => {
      prisma.emailVerifyToken.findUnique.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      const result = await service.consume(rawToken);
      expect(result).toEqual({ userId: 'u1' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // Ops dipassed sebagai array
      const ops = prisma.$transaction.mock.calls[0]![0] as unknown[];
      expect(ops).toHaveLength(2);
    });

    it('looks up by SHA-256 hash, not raw token', async () => {
      prisma.emailVerifyToken.findUnique.mockResolvedValue(null);
      await expect(service.consume(rawToken)).rejects.toThrow();
      const lookupArgs = prisma.emailVerifyToken.findUnique.mock.calls[0]![0] as {
        where: { tokenHash: string };
      };
      expect(lookupArgs.where.tokenHash).not.toBe(rawToken);
      expect(lookupArgs.where.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
