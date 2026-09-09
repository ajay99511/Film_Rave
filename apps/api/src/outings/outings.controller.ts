import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
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
  Max,
  Min,
} from 'class-validator';
import { RsvpStatus, type OutingDto } from '@filmrave/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator.js';
import { OutingsService } from './outings.service.js';

class RsvpDto {
  @IsEnum(RsvpStatus)
  status!: RsvpStatus;
}

class VoteDto {
  @IsString()
  option_id!: string;
}

class HypeDto {
  @IsInt()
  @Min(0)
  @Max(10)
  score!: number;
}

class CreateOutingDto {
  @IsString()
  circle_id!: string;

  @IsInt()
  movie_tmdb_id!: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'tickets_on_sale_date must be YYYY-MM-DD' })
  tickets_on_sale_date?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  theater_options?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  night_options?: string[];
}

@UseGuards(JwtAuthGuard)
@Controller('outings')
export class OutingsController {
  constructor(private readonly outings: OutingsService) {}

  @Get()
  list(
    @Query('circleId') circleId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<OutingDto[]> {
    return this.outings.listForCircle(circleId, user.userId);
  }

  @Post()
  create(
    @Body() dto: CreateOutingDto,
    @CurrentUser() user: AuthUser,
  ): Promise<OutingDto> {
    return this.outings.create(dto.circle_id, user.userId, {
      movieTmdbId: dto.movie_tmdb_id,
      ticketsOnSaleDate: dto.tickets_on_sale_date ?? null,
      theaterOptions: dto.theater_options,
      nightOptions: dto.night_options,
    });
  }

  @Post(':outingId/rsvp')
  rsvp(
    @Param('outingId') outingId: string,
    @Body() dto: RsvpDto,
    @CurrentUser() user: AuthUser,
  ): Promise<OutingDto> {
    return this.outings.setRsvp(outingId, user.userId, dto.status);
  }

  @Post(':outingId/vote')
  vote(
    @Param('outingId') outingId: string,
    @Body() dto: VoteDto,
    @CurrentUser() user: AuthUser,
  ): Promise<OutingDto> {
    return this.outings.voteTheater(outingId, dto.option_id, user.userId);
  }

  @Post(':outingId/vote-night')
  voteNight(
    @Param('outingId') outingId: string,
    @Body() dto: VoteDto,
    @CurrentUser() user: AuthUser,
  ): Promise<OutingDto> {
    return this.outings.voteNight(outingId, dto.option_id, user.userId);
  }

  @Post(':outingId/hype')
  hype(
    @Param('outingId') outingId: string,
    @Body() dto: HypeDto,
    @CurrentUser() user: AuthUser,
  ): Promise<OutingDto> {
    return this.outings.setHype(outingId, user.userId, dto.score);
  }

  /** Freeze guest writes on the public outing page. Admin-only. */
  @Post(':outingId/lock')
  lock(
    @Param('outingId') outingId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<OutingDto> {
    return this.outings.lock(outingId, user.userId);
  }

  @Post(':outingId/unlock')
  unlock(
    @Param('outingId') outingId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<OutingDto> {
    return this.outings.unlock(outingId, user.userId);
  }

  /** Best-effort funnel instrumentation — see OutingsService.recordLinkShared. */
  @Post(':outingId/link-shared')
  @HttpCode(204)
  async linkShared(
    @Param('outingId') outingId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.outings.recordLinkShared(outingId, user.userId);
  }
}
