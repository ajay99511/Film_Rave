import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OutingsController } from './outings.controller.js';
import { OutingsService } from './outings.service.js';
import { PublicOutingsController } from './public-outings.controller.js';
import { PublicOutingsService } from './public-outings.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [OutingsController, PublicOutingsController],
  providers: [OutingsService, PublicOutingsService],
})
export class OutingsModule {}
