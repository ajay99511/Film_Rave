import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { MovieDto } from '@filmrave/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { MoviesService } from './movies.service.js';

@UseGuards(JwtAuthGuard)
@Controller('movies')
export class MoviesController {
  constructor(private readonly movies: MoviesService) {}

  @Get('search')
  search(@Query('q') q: string): Promise<MovieDto[]> {
    return this.movies.search(q ?? '');
  }

  @Get('popular')
  popular(@Query('limit') limit?: string): Promise<MovieDto[]> {
    const n = Number(limit);
    return this.movies.popular(Number.isFinite(n) && n > 0 ? n : 25);
  }

  @Get('upcoming')
  upcoming(): Promise<MovieDto[]> {
    return this.movies.upcoming();
  }

  @Get(':tmdbId')
  get(@Param('tmdbId', ParseIntPipe) tmdbId: number): Promise<MovieDto> {
    return this.movies.getOrFetch(tmdbId);
  }
}
