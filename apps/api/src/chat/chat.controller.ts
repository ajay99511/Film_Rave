import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsInt, IsString, Length } from 'class-validator';
import type { ChatMessageDto } from '@filmrave/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator.js';
import { ChatService } from './chat.service.js';

class SendMessageDto {
  @IsInt()
  movie_tmdb_id!: number;

  @IsString()
  @Length(1, 2000)
  body!: string;
}

@UseGuards(JwtAuthGuard)
@Controller('circles/:circleId/chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  history(
    @Param('circleId') circleId: string,
    @Query('movieTmdbId', ParseIntPipe) movieTmdbId: number,
    @CurrentUser() user: AuthUser,
  ): Promise<ChatMessageDto[]> {
    return this.chat.history(circleId, movieTmdbId, user.userId);
  }

  // REST send, independent of the live Socket.IO gateway — used by actions
  // that aren't inside an open chat thread, e.g. "share this movie to a
  // circle" from a browse/watchlist screen.
  @Post()
  send(
    @Param('circleId') circleId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ChatMessageDto> {
    return this.chat.send(circleId, dto.movie_tmdb_id, user.userId, dto.body);
  }
}
