import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { NotificationDto } from '@filmrave/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator.js';
import { NotificationsService } from './notifications.service.js';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<NotificationDto[]> {
    return this.notifications.listForUser(user.userId);
  }

  @Get('unread-count')
  async unreadCount(
    @CurrentUser() user: AuthUser,
  ): Promise<{ count: number }> {
    return { count: await this.notifications.unreadCount(user.userId) };
  }

  @Post(':id/read')
  markRead(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<NotificationDto> {
    return this.notifications.markRead(id, user.userId);
  }

  @Post('read-all')
  markAllRead(
    @CurrentUser() user: AuthUser,
  ): Promise<{ updated: number }> {
    return this.notifications.markAllRead(user.userId);
  }
}
