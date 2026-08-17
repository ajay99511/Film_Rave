import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';

// PrismaService is provided globally (PrismaModule is @Global), so the health
// controller can inject it without importing anything here.
@Module({ controllers: [HealthController] })
export class HealthModule {}
