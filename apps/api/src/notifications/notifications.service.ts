import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { NotificationDto, NotificationType } from '@filmrave/shared';
import { PrismaService } from '../prisma/prisma.service.js';

type NotificationRow = {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: unknown;
  readAt: Date | null;
  createdAt: Date;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create a notification for one recipient (used by other services). */
  async create(input: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }): Promise<NotificationDto> {
    const row = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: (input.data ?? {}) as object,
      },
    });
    return this.toDto(row);
  }

  /** Fan-out helper: same notification to many recipients at once. */
  async createMany(
    userIds: string[],
    input: {
      type: NotificationType;
      title: string;
      body: string;
      data?: Record<string, unknown>;
    },
  ): Promise<void> {
    if (userIds.length === 0) return;
    await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: (input.data ?? {}) as object,
      })),
    });
  }

  async listForUser(userId: string): Promise<NotificationDto[]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => this.toDto(r));
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, readAt: null },
    });
  }

  async markRead(id: string, userId: string): Promise<NotificationDto> {
    const row = await this.prisma.notification.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('notification not found');
    if (row.userId !== userId) throw new ForbiddenException('not your notification');
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { readAt: row.readAt ?? new Date() },
    });
    return this.toDto(updated);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const res = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: res.count };
  }

  private toDto(r: NotificationRow): NotificationDto {
    return {
      id: r.id,
      user_id: r.userId,
      type: r.type,
      title: r.title,
      body: r.body,
      data: (r.data ?? {}) as Record<string, unknown>,
      read_at: r.readAt ? r.readAt.toISOString() : null,
      created_at: r.createdAt.toISOString(),
    };
  }
}
