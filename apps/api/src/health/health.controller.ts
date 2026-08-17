import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Liveness/readiness probe for the hosting platform. Reachable at `/health`
 * (excluded from the api/v1 prefix). Returns 200 when the DB answers a trivial
 * query, and 503 otherwise so the platform can pull an unhealthy instance.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{
    status: 'ok';
    db: boolean;
    uptime_s: number;
    timestamp: string;
  }> {
    let db = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }
    const payload = {
      db,
      uptime_s: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
    if (!db) {
      throw new ServiceUnavailableException({ status: 'degraded', ...payload });
    }
    return { status: 'ok', ...payload };
  }
}
