import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MovieDto } from '@filmrave/shared';
import { PrismaService } from '../prisma/prisma.service.js';

interface TmdbMovie {
  id: number;
  title: string;
  release_date?: string;
  overview?: string;
  poster_path?: string | null;
  runtime?: number;
}

@Injectable()
export class MoviesService {
  private readonly logger = new Logger(MoviesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async search(query: string): Promise<MovieDto[]> {
    const results = await this.tmdb<{ results: TmdbMovie[] }>('/search/movie', {
      query,
    });
    return results.results.map((m) => this.toDto(m));
  }

  /** Return a movie, hydrating and caching it from TMDB on cache miss. */
  async getOrFetch(tmdbId: number): Promise<MovieDto> {
    const cached = await this.prisma.movie.findUnique({ where: { tmdbId } });
    if (cached) {
      return {
        tmdb_id: cached.tmdbId,
        title: cached.title,
        release_date: cached.releaseDate,
        overview: cached.overview,
        poster_url: cached.posterUrl,
        runtime: cached.runtime,
        year: cached.year,
      };
    }
    const movie = await this.tmdb<TmdbMovie>(`/movie/${tmdbId}`, {});
    const dto = this.toDto(movie);
    await this.prisma.movie.upsert({
      where: { tmdbId: movie.id },
      create: {
        tmdbId: movie.id,
        title: dto.title,
        releaseDate: dto.release_date,
        overview: dto.overview ?? null,
        posterUrl: dto.poster_url ?? null,
        runtime: dto.runtime ?? null,
        year: dto.year ?? null,
      },
      update: {},
    });
    return dto;
  }

  private toDto(m: TmdbMovie): MovieDto {
    const releaseDate = m.release_date ?? '';
    const imageBase = this.config.get<string>('TMDB_IMAGE_BASE') ?? '';
    return {
      tmdb_id: m.id,
      title: m.title,
      release_date: releaseDate,
      overview: m.overview ?? null,
      poster_url: m.poster_path ? `${imageBase}${m.poster_path}` : null,
      runtime: m.runtime ?? null,
      year: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
    };
  }

  private async tmdb<T>(
    path: string,
    params: Record<string, string>,
  ): Promise<T> {
    const key = this.config.get<string>('TMDB_API_KEY');
    const base = this.config.get<string>('TMDB_BASE_URL');
    if (!key || !base) {
      throw new HttpException('TMDB is not configured', 503);
    }
    const url = new URL(base + path);
    url.searchParams.set('api_key', key);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      this.logger.warn(`TMDB ${path} -> ${res.status}`);
      throw new HttpException('TMDB request failed', res.status);
    }
    return (await res.json()) as T;
  }
}
