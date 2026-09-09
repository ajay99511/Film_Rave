import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { IsEnum, IsString, Length } from 'class-validator';
import { RsvpStatus, type PublicOutingDto } from '@filmrave/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator.js';
import { PublicOutingsService } from './public-outings.service.js';

const GUEST_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

class GuestRsvpDto {
  @IsString()
  @Length(1, 40)
  display_name!: string;

  @IsEnum(RsvpStatus)
  status!: RsvpStatus;
}

class GuestVoteDto {
  @IsString()
  option_id!: string;
}

function cookieName(slug: string): string {
  return `fr_guest_${slug}`;
}

function readGuestToken(req: Request, slug: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const name = cookieName(slug);
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

function setGuestCookie(
  res: Response,
  slug: string,
  token: string,
  secure: boolean,
): void {
  res.cookie(cookieName(slug), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: GUEST_COOKIE_MAX_AGE_MS,
  });
}

/**
 * Unauthenticated surface for the guest-accessible outing page (F-06). Never
 * behind JwtAuthGuard except /claim, which additionally requires the guest
 * cookie to link a fresh account back to its anonymous RSVP.
 */
@Controller('outings/public')
export class PublicOutingsController {
  constructor(private readonly outings: PublicOutingsService) {}

  @Get(':slug')
  async get(
    @Param('slug') slug: string,
    @Req() req: Request,
  ): Promise<PublicOutingDto> {
    return this.outings.getPublic(slug, readGuestToken(req, slug));
  }

  @Post(':slug/rsvp')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async rsvp(
    @Param('slug') slug: string,
    @Body() dto: GuestRsvpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicOutingDto> {
    const existing = readGuestToken(req, slug);
    const { dto: publicDto, guestToken } = await this.outings.rsvp(
      slug,
      existing,
      { displayName: dto.display_name, status: dto.status },
    );
    setGuestCookie(res, slug, guestToken, req.protocol === 'https');
    return publicDto;
  }

  @Post(':slug/vote-night')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async voteNight(
    @Param('slug') slug: string,
    @Body() dto: GuestVoteDto,
    @Req() req: Request,
  ): Promise<PublicOutingDto> {
    return this.outings.voteNight(
      slug,
      readGuestToken(req, slug),
      dto.option_id,
    );
  }

  @Post(':slug/claim')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async claim(
    @Param('slug') slug: string,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ): Promise<{ claimed: true }> {
    await this.outings.claim(slug, readGuestToken(req, slug), user.userId);
    return { claimed: true };
  }
}
