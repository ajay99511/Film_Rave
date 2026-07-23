import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsInt } from 'class-validator';
import type { WatchlistEntryDto } from '@filmrave/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator.js';
import { WatchlistService } from './watchlist.service.js';

class AddDto {
  @IsInt()
  movie_tmdb_id!: number;
}

@UseGuards(JwtAuthGuard)
@Controller('watchlist')
export class WatchlistController {
  constructor(private readonly watchlist: WatchlistService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<WatchlistEntryDto[]> {
    return this.watchlist.list(user.userId);
  }

  @Post()
  add(
    @CurrentUser() user: AuthUser,
    @Body() dto: AddDto,
  ): Promise<WatchlistEntryDto> {
    return this.watchlist.add(user.userId, dto.movie_tmdb_id);
  }

  @Delete(':tmdbId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('tmdbId', ParseIntPipe) tmdbId: number,
  ): Promise<void> {
    return this.watchlist.remove(user.userId, tmdbId);
  }
}
