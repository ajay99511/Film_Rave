import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import type { AppUserDto } from '@filmrave/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator.js';
import { UsersService } from './users.service.js';

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

  // Public (unauthenticated) so invite links resolve a preview before sign-in.
  @Get('by-handle/:handle')
  byHandle(@Param('handle') handle: string): Promise<AppUserDto> {
    return this.users.byHandle(handle);
  }
}
