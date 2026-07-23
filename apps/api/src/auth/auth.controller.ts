import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import type {
  AppUserDto,
  OtpRequestResultDto,
  OtpVerifyResultDto,
} from '@filmrave/shared';
import { AuthService, type AuthResult } from './auth.service.js';
import {
  CompleteProfileDto,
  LoginDto,
  OtpRequestDto,
  OtpVerifyDto,
  RefreshDto,
  RegisterDto,
} from './dto/auth.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp/request')
  @HttpCode(200)
  requestOtp(@Body() dto: OtpRequestDto): Promise<OtpRequestResultDto> {
    return this.auth.requestOtp(dto);
  }

  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(@Body() dto: OtpVerifyDto): Promise<OtpVerifyResultDto> {
    return this.auth.verifyOtp(dto);
  }

  @Post('complete-profile')
  completeProfile(@Body() dto: CompleteProfileDto): Promise<AuthResult> {
    return this.auth.completeProfile(dto);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto): Promise<AuthResult> {
    return this.auth.refresh(dto.refresh_token);
  }

  @Post('register')
  register(@Body() dto: RegisterDto): Promise<AuthResult> {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto): Promise<AuthResult> {
    return this.auth.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<AppUserDto> {
    return this.auth.me(user.userId);
  }
}
