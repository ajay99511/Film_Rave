import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import type { AppUserDto } from '@filmrave/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator.js';
import { UsersService } from './users.service.js';

class UpdateHandleDto {
  @IsString()
  @Length(3, 20)
  handle!: string;
}

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // Authenticated handle/name search for Find Friends.
  @UseGuards(JwtAuthGuard)
  @Get('search')
  search(
    @Query('q') q: string,
    @CurrentUser() user: AuthUser,
  ): Promise<AppUserDto[]> {
    return this.users.search(q ?? '', user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(
    @Body() dto: UpdateHandleDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AppUserDto> {
    return this.users.updateHandle(user.userId, dto.handle);
  }

  // Public (unauthenticated) so invite links resolve a preview before sign-in.
  @Get('by-handle/:handle')
  byHandle(@Param('handle') handle: string): Promise<AppUserDto> {
    return this.users.byHandle(handle);
  }
}
