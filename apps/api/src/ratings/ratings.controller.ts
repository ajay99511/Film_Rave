import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { RatingDto } from '@filmrave/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator.js';
import { RatingsService } from './ratings.service.js';
import { UpsertRatingDto } from './dto/upsert-rating.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @Get('me')
  mine(@CurrentUser() user: AuthUser): Promise<RatingDto[]> {
    return this.ratings.listMine(user.userId);
  }

  @Put()
  upsert(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertRatingDto,
  ): Promise<RatingDto> {
    return this.ratings.upsert(user.userId, dto);
  }

  @Delete(':tmdbId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('tmdbId', ParseIntPipe) tmdbId: number,
  ): Promise<void> {
    return this.ratings.remove(user.userId, tmdbId);
  }
}
