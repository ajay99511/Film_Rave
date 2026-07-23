import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type {
  AppUserDto,
  OtpRequestResultDto,
  OtpVerifyResultDto,
} from '@filmrave/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CompleteProfileDto,
  LoginDto,
  OtpRequestDto,
  OtpVerifyDto,
  RegisterDto,
} from './dto/auth.dto.js';

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
}

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
// Deterministic palette so avatars are stable/colorful without a picker.
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private get isProd(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  /** Full profile for session restore (GET /auth/me). */
  async me(userId: string): Promise<AppUserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('user no longer exists');
    }
    return {
      user_id: user.id,
      display_name: user.displayName,
      handle: user.handle,
      avatar_color: user.avatarColor,
    };
  }

  /**
   * Step 1: issue a one-time code for a phone. In non-prod the code is logged
   * and returned as `dev_code` so local testing needs no SMS provider.
   */
  async requestOtp(dto: OtpRequestDto): Promise<OtpRequestResultDto> {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    const challenge = await this.prisma.otpChallenge.create({
      data: { phone: dto.phone, codeHash: await argon2.hash(code), expiresAt },
    });
    await this.sendSms(dto.phone, code);
    return {
      challenge_id: challenge.id,
      expires_at: expiresAt.toISOString(),
      ...(this.isProd ? {} : { dev_code: code }),
    };
  }

  /**
   * Step 2: verify the code. Known phone → tokens. New phone → a short-lived
   * signup token the client exchanges at completeProfile().
   */
  async verifyOtp(dto: OtpVerifyDto): Promise<OtpVerifyResultDto> {
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { phone: dto.phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) {
      throw new UnauthorizedException('no active code; request a new one');
    }
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      throw new UnauthorizedException('too many attempts; request a new code');
    }
    const ok = await argon2.verify(challenge.codeHash, dto.code);
    if (!ok) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('invalid code');
    }
    await this.prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });
    if (user) {
      return { status: 'authenticated', ...(await this.issue(user)) };
    }
    const signup_token = await this.jwt.signAsync(
      { purpose: 'signup', phone: dto.phone },
      { expiresIn: '15m' },
    );
    return { status: 'needs_profile', signup_token };
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

  /** Step 3 (new users only): claim a handle, creating the account. */
  async completeProfile(dto: CompleteProfileDto): Promise<AuthResult> {
    let phone: string;
    try {
      const payload = await this.jwt.verifyAsync<{
        purpose: string;
        phone: string;
      }>(dto.signup_token);
      if (payload.purpose !== 'signup' || !payload.phone) {
        throw new Error('bad token');
      }
      phone = payload.phone;
    } catch {
      throw new UnauthorizedException('invalid or expired signup token');
    }
    const clash = await this.prisma.user.findFirst({
      where: { OR: [{ phone }, { handle: dto.handle }] },
    });
    if (clash) {
      throw new ConflictException('phone or handle already in use');
    }
    const user = await this.prisma.user.create({
      data: {
        phone,
        handle: dto.handle,
        displayName: dto.displayName,
        avatarColor: this.colorFor(dto.handle),
      },
    });
    return this.issue(user);
  }

  private colorFor(seed: string): string {
    let h = 0;
    for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }

  private async sendSms(phone: string, code: string): Promise<void> {
    // Local/dev stub. Swap for Twilio/MessageBird in production.
    this.logger.log(`[SMS] OTP for ${phone}: ${code}`);
  }

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { handle: dto.handle }] },
    });
    if (existing) {
      throw new ConflictException('email or handle already in use');
    }
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        handle: dto.handle,
        displayName: dto.displayName,
        passwordHash: await argon2.hash(dto.password),
        avatarColor: this.colorFor(dto.handle),
      },
    });
    return this.issue(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user?.passwordHash) {
      throw new UnauthorizedException('invalid credentials');
    }
    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) {
      throw new UnauthorizedException('invalid credentials');
    }
    return this.issue(user);
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
    return {
      access_token,
      refresh_token,
      user: {
        user_id: user.id,
        display_name: user.displayName,
        handle: user.handle,
        avatar_color: user.avatarColor,
      },
    };
  }
}
