import { Injectable } from '@nestjs/common';
import type { RatingDto } from '@filmrave/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpsertRatingDto } from './dto/upsert-rating.dto.js';

@Injectable()
export class RatingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** A user's own ratings (self-view — always fully visible to the owner). */
  async listMine(userId: string): Promise<RatingDto[]> {
    const rows = await this.prisma.rating.findMany({ where: { userId } });
    return rows.map((r) => this.toDto(r));
  }

  async upsert(userId: string, dto: UpsertRatingDto): Promise<RatingDto> {
    const row = await this.prisma.rating.upsert({
      where: {
        userId_movieTmdbId: { userId, movieTmdbId: dto.movie_tmdb_id },
      },
      create: {
        userId,
        movieTmdbId: dto.movie_tmdb_id,
        score: dto.score,
        source: dto.source,
        ratedAt: new Date(),
      },
      update: { score: dto.score, source: dto.source, ratedAt: new Date() },
    });
    return this.toDto(row);
  }

  async remove(userId: string, movieTmdbId: number): Promise<void> {
    await this.prisma.rating.deleteMany({ where: { userId, movieTmdbId } });
  }

  private toDto(r: {
    userId: string;
    movieTmdbId: number;
    score: number;
    ratedAt: Date;
    source: RatingDto['source'];
  }): RatingDto {
    return {
      user_id: r.userId,
      movie_tmdb_id: r.movieTmdbId,
      score: r.score,
      rated_at: r.ratedAt.toISOString(),
      source: r.source,
    };
  }
}
