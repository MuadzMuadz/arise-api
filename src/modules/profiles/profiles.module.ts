import { Module } from '@nestjs/common';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

/**
 * Profiles module — Sprint 2.
 * Hunter biodata (displayName, gender, birthDate, timezone, ...).
 * 1:1 dengan User. Lazy-create via PUT (onboarding-friendly).
 */
@Module({
  controllers: [ProfilesController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
