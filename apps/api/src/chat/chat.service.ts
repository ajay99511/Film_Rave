import { ForbiddenException, Injectable } from '@nestjs/common';
import type { ChatMessageDto } from '@filmrave/shared';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertMember(circleId: string, userId: string): Promise<void> {
    const member = await this.prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId } },
    });
    if (!member) {
      throw new ForbiddenException('not a member of this circle');
    }
  }

  /** Message history for a circle's movie thread, oldest first. */
  async history(
    circleId: string,
    movieTmdbId: number,
    userId: string,
  ): Promise<ChatMessageDto[]> {
    await this.assertMember(circleId, userId);
    const rows = await this.prisma.chatMessage.findMany({
      where: { circleId, movieTmdbId },
      orderBy: { sentAt: 'asc' },
    });
    return rows.map((m) => this.toDto(m));
  }

  async send(
    circleId: string,
    movieTmdbId: number,
    userId: string,
    body: string,
  ): Promise<ChatMessageDto> {
    await this.assertMember(circleId, userId);
    const row = await this.prisma.chatMessage.create({
      data: { circleId, movieTmdbId, userId, body },
    });
    return this.toDto(row);
  }

  private toDto(m: {
    id: string;
    circleId: string;
    movieTmdbId: number;
    userId: string;
    body: string;
    sentAt: Date;
  }): ChatMessageDto {
    return {
      message_id: m.id,
      group_id: m.circleId,
      movie_tmdb_id: m.movieTmdbId,
      user_id: m.userId,
      body: m.body,
      sent_at: m.sentAt.toISOString(),
    };
  }
}
