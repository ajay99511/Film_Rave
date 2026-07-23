import { Injectable } from '@nestjs/common';
import type { WatchlistEntryDto } from '@filmrave/shared';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class WatchlistService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<WatchlistEntryDto[]> {
    const rows = await this.prisma.watchlistEntry.findMany({
      where: { userId },
      orderBy: { addedAt: 'desc' },
    });
    return rows.map((e) => ({
      user_id: e.userId,
      movie_tmdb_id: e.movieTmdbId,
      added_at: e.addedAt.toISOString(),
    }));
  }

  async add(userId: string, movieTmdbId: number): Promise<WatchlistEntryDto> {
    const row = await this.prisma.watchlistEntry.upsert({
      where: { userId_movieTmdbId: { userId, movieTmdbId } },
      create: { userId, movieTmdbId },
      update: {},
    });
    return {
      user_id: row.userId,
      movie_tmdb_id: row.movieTmdbId,
      added_at: row.addedAt.toISOString(),
    };
  }

  async remove(userId: string, movieTmdbId: number): Promise<void> {
    await this.prisma.watchlistEntry.deleteMany({
      where: { userId, movieTmdbId },
    });
  }
}
