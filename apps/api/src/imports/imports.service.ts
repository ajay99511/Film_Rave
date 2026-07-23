import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  RatingSource,
  type ImportResultDto,
  type RatingDto,
} from '@filmrave/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { MoviesService } from '../movies/movies.service.js';
import { parseCsv } from './csv.js';

export type ImportFormat = 'imdb' | 'letterboxd' | 'auto';

interface ParsedRating {
  title: string;
  year: number | null;
  score: number; // normalized 1..10
  ratedAt: Date;
}

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly movies: MoviesService,
  ) {}

  /**
   * Parse an IMDb/Letterboxd ratings CSV, match rows against the catalog
   * (local first, then TMDB when configured), and commit the matched rows as
   * the user's own ratings. Unmatched titles are reported back, not dropped.
   */
  async importRatings(
    userId: string,
    csv: string,
    format: ImportFormat,
  ): Promise<ImportResultDto> {
    const rows = parseCsv(csv);
    if (rows.length === 0) {
      throw new BadRequestException('CSV appears to be empty');
    }
    const detected = format === 'auto' ? this.detectFormat(rows[0]) : format;
    const source =
      detected === 'letterboxd' ? RatingSource.Letterboxd : RatingSource.Imdb;
    const parsed = rows
      .map((r) => this.extractRow(r, detected))
      .filter((r): r is ParsedRating => r !== null);

    const existing = new Set(
      (
        await this.prisma.rating.findMany({
          where: { userId },
          select: { movieTmdbId: true },
        })
      ).map((r) => r.movieTmdbId),
    );

    const staged: RatingDto[] = [];
    const unmatchedTitles: string[] = [];
    let matched = 0;
    let duplicates = 0;

    for (const row of parsed) {
      const tmdbId = await this.resolve(row.title, row.year);
      if (tmdbId == null) {
        unmatchedTitles.push(
          row.year ? `${row.title} (${row.year})` : row.title,
        );
        continue;
      }
      matched++;
      if (existing.has(tmdbId)) {
        duplicates++;
        continue;
      }
      const rating = await this.prisma.rating.upsert({
        where: { userId_movieTmdbId: { userId, movieTmdbId: tmdbId } },
        create: {
          userId,
          movieTmdbId: tmdbId,
          score: row.score,
          source,
          ratedAt: row.ratedAt,
        },
        update: { score: row.score, source, ratedAt: row.ratedAt },
      });
      existing.add(tmdbId);
      staged.push({
        user_id: rating.userId,
        movie_tmdb_id: rating.movieTmdbId,
        score: rating.score,
        rated_at: rating.ratedAt.toISOString(),
        source: rating.source,
      });
    }

    return {
      found: parsed.length,
      matched,
      unmatched: unmatchedTitles.length,
      duplicates_skipped: duplicates,
      unmatched_titles: unmatchedTitles.slice(0, 100),
      staged_ratings: staged,
    };
  }

  private detectFormat(sample: Record<string, string>): 'imdb' | 'letterboxd' {
    const keys = Object.keys(sample);
    if (keys.some((k) => /letterboxd uri/i.test(k))) return 'letterboxd';
    if (keys.some((k) => /your rating/i.test(k))) return 'imdb';
    // Letterboxd uses "Name"+"Rating"; IMDb uses "Title"+"Const".
    return keys.some((k) => /^name$/i.test(k)) ? 'letterboxd' : 'imdb';
  }

  private extractRow(
    r: Record<string, string>,
    format: 'imdb' | 'letterboxd',
  ): ParsedRating | null {
    const pick = (names: string[]): string => {
      for (const n of names) {
        const key = Object.keys(r).find((k) => k.toLowerCase() === n);
        if (key && r[key]) return r[key];
      }
      return '';
    };

    if (format === 'letterboxd') {
      const title = pick(['name']);
      const raw = parseFloat(pick(['rating']));
      if (!title || Number.isNaN(raw)) return null;
      return {
        title,
        year: this.toYear(pick(['year'])),
        score: this.clamp(Math.round(raw * 2)),
        ratedAt: this.toDate(pick(['date'])),
      };
    }
    // imdb
    const title = pick(['title']);
    const raw = parseInt(pick(['your rating']), 10);
    if (!title || Number.isNaN(raw)) return null;
    return {
      title,
      year: this.toYear(pick(['year'])),
      score: this.clamp(raw),
      ratedAt: this.toDate(pick(['date rated', 'date'])),
    };
  }

  /** Local catalog by title+year first, then TMDB search when configured. */
  private async resolve(title: string, year: number | null): Promise<number | null> {
    const local = await this.prisma.movie.findFirst({
      where: {
        title: { equals: title, mode: 'insensitive' },
        ...(year ? { year } : {}),
      },
    });
    if (local) return local.tmdbId;

    try {
      const results = await this.movies.search(title);
      if (results.length === 0) return null;
      const best =
        (year ? results.find((m) => m.year === year) : undefined) ??
        results[0];
      if (best.tmdb_id == null) return null;
      await this.movies.getOrFetch(best.tmdb_id); // cache into catalog
      return best.tmdb_id;
    } catch (e) {
      // TMDB not configured (503) or transient failure → treat as unmatched.
      this.logger.debug(`TMDB match skipped for "${title}": ${String(e)}`);
      return null;
    }
  }

  private toYear(v: string): number | null {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  }

  private toDate(v: string): Date {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }

  private clamp(n: number): number {
    return Math.max(1, Math.min(10, n));
  }
}
