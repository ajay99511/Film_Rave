import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AppUserDto } from '@filmrave/shared';
import { AuthService, type AuthResult } from './auth.service.js';
import { GoogleAuthDto, RefreshDto } from './dto/auth.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Sign in / sign up with a Google ID token. Modest per-IP ceiling.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('google')
  @HttpCode(200)
  google(@Body() dto: GoogleAuthDto): Promise<AuthResult> {
    return this.auth.googleSignIn(dto.id_token);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto): Promise<AuthResult> {
    return this.auth.refresh(dto.refresh_token);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<AppUserDto> {
    return this.auth.me(user.userId);
  }
}
