import { ForbiddenException, Injectable } from '@nestjs/common';
import type { ChatMessageDto } from '@filmrave/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { MoviesService } from '../movies/movies.service.js';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movies: MoviesService,
  ) {}

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
    // The movie row is normally already cached (a thread only opens from a
    // movie already in the feed), but "share to circle" can be the very
    // first thing that references a movie in this circle — guarantee the FK
    // target exists rather than assume it.
    await this.movies.getOrFetch(movieTmdbId);
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
