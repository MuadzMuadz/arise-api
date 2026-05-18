import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { uuidv7 } from 'uuidv7';

/**
 * Daftar model yang punya kolom `id: UUID` dan butuh auto-generation UUID v7.
 * Update setiap kali tambah model baru di schema.prisma.
 *
 * Alternatif: pakai `Prisma.ModelName` enum, tapi requires extra introspection.
 * Manual list cukup explicit & safe untuk Phase 1.
 */
const MODELS_WITH_UUID_ID = ['User', 'RefreshToken', 'EmailVerifyToken', 'Profile'] as const;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
      errorFormat: 'pretty',
    });
  }

  /**
   * Apply Prisma extension untuk auto-set `id` field pakai UUID v7
   * kalo create call gak ngasih id explicitly. Ini menggantikan
   * `@default(dbgenerated("uuid_generate_v7()"))` di schema (lihat ADR 0002).
   *
   * Strategy: mutate input data in-place (gak reassign args.data) supaya
   * Prisma's strict generated types stay happy.
   */
  withUuidExtension(): PrismaClient {
    const isManagedModel = (model: string): boolean =>
      MODELS_WITH_UUID_ID.includes(model as (typeof MODELS_WITH_UUID_ID)[number]);

    const ensureId = (row: unknown): void => {
      if (row && typeof row === 'object' && !('id' in row)) {
        (row as Record<string, unknown>).id = uuidv7();
      }
    };

    return this.$extends({
      query: {
        $allModels: {
          async create({ model, args, query }) {
            if (isManagedModel(model)) ensureId(args.data);
            return query(args);
          },
          async createMany({ model, args, query }) {
            if (isManagedModel(model)) {
              if (Array.isArray(args.data)) {
                for (const row of args.data) ensureId(row);
              } else {
                ensureId(args.data);
              }
            }
            return query(args);
          },
        },
      },
    }) as unknown as PrismaClient;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma disconnected');
  }
}
