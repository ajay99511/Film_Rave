import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OutingsController } from './outings.controller.js';
import { OutingsService } from './outings.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [OutingsController],
  providers: [OutingsService],
})
export class OutingsModule {}
