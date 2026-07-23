import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import type { FriendRelationshipDto } from '@filmrave/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator.js';
import { FriendshipsService } from './friendships.service.js';

class TargetDto {
  @IsString()
  other_id!: string;
}

@UseGuards(JwtAuthGuard)
@Controller('friendships')
export class FriendshipsController {
  constructor(private readonly friendships: FriendshipsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<FriendRelationshipDto[]> {
    return this.friendships.list(user.userId);
  }

  @Post('request')
  @HttpCode(204)
  request(
    @CurrentUser() user: AuthUser,
    @Body() dto: TargetDto,
  ): Promise<void> {
    return this.friendships.request(user.userId, dto.other_id);
  }

  @Post(':otherId/accept')
  @HttpCode(204)
  accept(
    @CurrentUser() user: AuthUser,
    @Param('otherId') otherId: string,
  ): Promise<void> {
    return this.friendships.accept(user.userId, otherId);
  }
}
