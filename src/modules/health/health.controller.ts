import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('health')
@Controller('health')
@Public()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness + readiness check (DB ping)' })
  async check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.prismaIndicator.pingCheck('postgres', this.prisma, { timeout: 1500 }),
      // TODO Phase 2: tambah Redis check pas BullMQ di-introduce
    ]);
  }
}
