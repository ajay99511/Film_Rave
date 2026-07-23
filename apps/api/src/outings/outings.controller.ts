import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsEnum, IsInt, IsString, Max, Min } from 'class-validator';
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
}
