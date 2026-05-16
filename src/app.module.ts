import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env';
import { PrismaModule } from './common/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    // ── Domain modules (added per roadmap §3, lihat arise-api/claude-rules/context.md) ──
    // AuthModule, UsersModule, ProfilesModule, AwakeningModule, StatsModule,
    // QuestsModule, WorkoutsModule, WorshipModule, RanksModule, PenaltiesModule,
    // BodyMeasurementsModule, NotificationsModule
  ],
})
export class AppModule {}
