import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  CirclePrivacy,
  RatingsShared,
  type AppUserDto,
  type CircleDto,
  type FeedItemDto,
  type RatingDto,
} from '@filmrave/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator.js';
import { CirclesService } from './circles.service.js';

class CreateCircleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  member_ids!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(60)
  genre_focus?: string;

  @IsOptional()
  @IsEnum(CirclePrivacy)
  privacy?: CirclePrivacy;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  banner_gradient?: string;
}

class UpdateCircleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  member_ids?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(60)
  genre_focus?: string;

  @IsOptional()
  @IsEnum(CirclePrivacy)
  privacy?: CirclePrivacy;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  banner_gradient?: string;
}

class UpdateSharingDto {
  @IsEnum(RatingsShared)
  ratings_shared!: RatingsShared;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  shared_movie_ids?: number[];
}

class GroupWatchDto {
  @IsInt()
  movie_tmdb_id!: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'watched_date must be YYYY-MM-DD' })
  watched_date?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('circles')
export class CirclesController {
  constructor(private readonly circles: CirclesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<CircleDto[]> {
    return this.circles.listForUser(user.userId);
  }

  @Post()
  create(
    @Body() dto: CreateCircleDto,
    @CurrentUser() user: AuthUser,
  ): Promise<CircleDto> {
    return this.circles.create(user.userId, dto.name, dto.description ?? '', dto.member_ids, {
      genreFocus: dto.genre_focus,
      privacy: dto.privacy,
      bannerGradient: dto.banner_gradient,
    });
  }

  @Patch(':circleId')
  updateCircle(
    @Param('circleId') circleId: string,
    @Body() dto: UpdateCircleDto,
    @CurrentUser() user: AuthUser,
  ): Promise<CircleDto> {
    return this.circles.update(circleId, user.userId, {
      name: dto.name,
      description: dto.description,
      memberUserIds: dto.member_ids,
      identity: {
        genreFocus: dto.genre_focus,
        privacy: dto.privacy,
        bannerGradient: dto.banner_gradient,
      },
    });
  }

  @Delete(':circleId')
  @HttpCode(204)
  async remove(
    @Param('circleId') circleId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.circles.remove(circleId, user.userId);
  }

  @Patch(':circleId/sharing')
  updateSharing(
    @Param('circleId') circleId: string,
    @Body() dto: UpdateSharingDto,
    @CurrentUser() user: AuthUser,
  ): Promise<CircleDto> {
    return this.circles.updateSharing(
      circleId,
      user.userId,
      dto.ratings_shared,
      dto.shared_movie_ids ?? [],
    );
  }

  @Get(':circleId')
  get(
    @Param('circleId') circleId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<CircleDto> {
    return this.circles.getForUser(circleId, user.userId);
  }

  @Post(':circleId/group-watch')
  @HttpCode(204)
  async addGroupWatch(
    @Param('circleId') circleId: string,
    @Body() dto: GroupWatchDto,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.circles.addGroupWatch(
      circleId,
      user.userId,
      dto.movie_tmdb_id,
      dto.watched_date ?? new Date().toISOString().slice(0, 10),
    );
  }

  @Get(':circleId/members')
  members(
    @Param('circleId') circleId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<AppUserDto[]> {
    return this.circles.memberProfiles(circleId, user.userId);
  }

  /** Group Feed: circle movies with visibility-correct aggregates. */
  @Get(':circleId/feed')
  feed(
    @Param('circleId') circleId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<FeedItemDto[]> {
    return this.circles.feed(circleId, user.userId);
  }

  /** Movie Room ratings, visibility-filtered server-side. */
  @Get(':circleId/movies/:tmdbId/ratings')
  ratings(
    @Param('circleId') circleId: string,
    @Param('tmdbId', ParseIntPipe) tmdbId: number,
    @CurrentUser() user: AuthUser,
  ): Promise<RatingDto[]> {
    return this.circles.visibleRatings(circleId, tmdbId, user.userId);
  }

  @Get(':circleId/movies/:tmdbId/group-average')
  groupAverage(
    @Param('circleId') circleId: string,
    @Param('tmdbId', ParseIntPipe) tmdbId: number,
  ): Promise<{ shared_rated_count: number; group_average: number | null }> {
    return this.circles.groupAverage(circleId, tmdbId);
  }
}
