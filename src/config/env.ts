import { z } from 'zod';

/**
 * Environment schema — fail-fast validation di bootstrap.
 * Tambah variable baru di sini DULU sebelum dipake di service mana pun.
 *
 * Phase 1: Redis & SMTP optional/deferred. Lihat ADR 0002.
 */
export const envSchema = z.object({
  // ── Runtime ──
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().default('v1'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // ── Database (Postgres) ──
  DATABASE_URL: z.string().url(),

  // ── Auth (JWT) ──
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET min 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET min 32 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  // ── Mail (Phase 1: console transport; Phase 2: real SMTP) ──
  MAIL_TRANSPORT: z.enum(['console', 'smtp']).default('console'),
  MAIL_HOST: z.string().optional(),
  MAIL_PORT: z.coerce.number().int().positive().optional(),
  MAIL_USER: z.string().optional(),
  MAIL_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('ARISE <noreply@tap-in.click>'),
  MAIL_SECURE: z.coerce.boolean().default(false),

  // ── Redis (Phase 2 — BullMQ; defer di Phase 1 pakai @nestjs/schedule cron) ──
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.coerce.number().int().positive().optional(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().min(0).optional(),

  // ── External APIs (Phase 2) ──
  CLAUDE_API_KEY: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  ALADHAN_API_BASE: z.string().url().default('https://api.aladhan.com/v1'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Nest ConfigModule validator. Throws kalo env invalid — bootstrap stops.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${formatted}`);
  }
  return parsed.data;
}
