import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import type { AppUserDto } from '@filmrave/shared';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AuthResult {
  access_token: string;
  refresh_token: string;
  user: AppUserDto;
}

interface Userish {
  id: string;
  handle: string;
  displayName: string;
  avatarColor: string | null;
  avatarUrl: string | null;
}

// Deterministic palette so avatars are stable/colorful without a picker (used as
// a fallback when Google provides no picture).
const AVATAR_COLORS = [
  'bg-blue-600',
  'bg-emerald-600',
  'bg-amber-600',
  'bg-purple-600',
  'bg-rose-600',
  'bg-cyan-600',
];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly google: OAuth2Client;
  private readonly googleClientId: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.googleClientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    this.google = new OAuth2Client(this.googleClientId);
  }

  /** Full profile for session restore (GET /auth/me). */
  async me(userId: string): Promise<AppUserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('user no longer exists');
    }
    return this.toDto(user);
  }

  /**
   * Sign in with Google. Verifies the ID token against our client id, then finds
   * the user by Google subject (falling back to email to link a pre-existing
   * account) or provisions a new one with an auto-generated unique handle.
   */
  async googleSignIn(idToken: string): Promise<AuthResult> {
    if (!this.googleClientId) {
      throw new UnauthorizedException('Google sign-in is not configured');
    }
    let payload;
    try {
      const ticket = await this.google.verifyIdToken({
        idToken,
        audience: this.googleClientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('invalid Google token');
    }
    if (!payload?.sub || !payload.email || !payload.email_verified) {
      throw new UnauthorizedException('Google account is missing a verified email');
    }

    const googleId = payload.sub;
    const email = payload.email.toLowerCase();
    const displayName = payload.name?.trim() || email.split('@')[0];
    const avatarUrl = payload.picture ?? null;

    // Existing user: match on Google subject first, then link by email.
    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
    });

    if (user) {
      // Keep the linked account current (backfill googleId, refresh picture).
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { googleId, avatarUrl, email },
      });
    } else {
      const handle = await this.uniqueHandle(email, displayName);
      user = await this.prisma.user.create({
        data: {
          email,
          googleId,
          displayName,
          handle,
          avatarUrl,
          avatarColor: this.colorFor(handle),
        },
      });
    }

    return this.issue(user);
  }

  /** Exchange a valid refresh token for a fresh token pair. */
  async refresh(refreshToken: string): Promise<AuthResult> {
    let sub: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(refreshToken);
      sub = payload.sub;
    } catch {
      throw new UnauthorizedException('invalid or expired refresh token');
    }
    const user = await this.prisma.user.findUnique({ where: { id: sub } });
    if (!user) {
      throw new UnauthorizedException('user no longer exists');
    }
    return this.issue(user);
  }

  /** Derive a unique, URL-safe handle from the Google email/name. */
  private async uniqueHandle(email: string, displayName: string): Promise<string> {
    const base =
      (email.split('@')[0] || displayName || 'user')
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '')
        .slice(0, 18) || 'user';
    const candidate = base.length >= 3 ? base : `${base}_user`.slice(0, 20);
    if (!(await this.prisma.user.findUnique({ where: { handle: candidate } }))) {
      return candidate;
    }
    // Collision: append a short numeric suffix until free.
    for (let i = 0; i < 1000; i++) {
      const suffix = String(Math.floor(Math.random() * 10000));
      const withSuffix = `${candidate.slice(0, 20 - suffix.length)}${suffix}`;
      if (!(await this.prisma.user.findUnique({ where: { handle: withSuffix } }))) {
        return withSuffix;
      }
    }
    // Practically unreachable; fall back to a cuid-ish suffix.
    return `${candidate.slice(0, 12)}${Date.now().toString(36).slice(-6)}`;
  }

  private colorFor(seed: string): string {
    let h = 0;
    for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }

  private async issue(user: Userish): Promise<AuthResult> {
    const payload = { sub: user.id, handle: user.handle };
    const [access_token, refresh_token] = await Promise.all([
      this.jwt.signAsync(payload, {
        expiresIn: this.config.get('JWT_ACCESS_TTL') ?? '15m',
      }),
      this.jwt.signAsync(payload, {
        expiresIn: this.config.get('JWT_REFRESH_TTL') ?? '30d',
      }),
    ]);
    return { access_token, refresh_token, user: this.toDto(user) };
  }

  private toDto(u: Userish): AppUserDto {
    return {
      user_id: u.id,
      display_name: u.displayName,
      handle: u.handle,
      avatar_color: u.avatarColor,
      avatar_url: u.avatarUrl,
    };
  }
}
