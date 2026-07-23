import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { ChatMessageDto } from '@filmrave/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator.js';
import { ChatService } from './chat.service.js';

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
}
