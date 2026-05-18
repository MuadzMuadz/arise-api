import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { validateEnv } from './config/env';
import { PrismaModule } from './common/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    // ── Domain modules (added per roadmap §3, lihat arise-api/claude-rules/context.md) ──
    // UsersModule, ProfilesModule, AwakeningModule, StatsModule,
    // QuestsModule, WorkoutsModule, WorshipModule, RanksModule, PenaltiesModule,
    // BodyMeasurementsModule, NotificationsModule
  ],
  providers: [
    // Global JWT auth guard — opt-out per handler/controller via @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
