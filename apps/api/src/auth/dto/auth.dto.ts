import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsString()
  @MaxLength(50)
  displayName!: string;

  @IsString()
  @Matches(/^[a-z0-9_]{3,20}$/, {
    message: 'handle must be 3-20 chars, lowercase letters, digits, underscore',
  })
  handle!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

// --- Phone-OTP flow ---

// E.164-ish: leading +, 8-15 digits. Lenient enough for local testing.
const PHONE_RE = /^\+?[1-9]\d{7,14}$/;

export class OtpRequestDto {
  @IsString()
  @Matches(PHONE_RE, { message: 'phone must be a valid number (E.164)' })
  phone!: string;
}

export class OtpVerifyDto {
  @IsString()
  @Matches(PHONE_RE, { message: 'phone must be a valid number (E.164)' })
  phone!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}

export class RefreshDto {
  @IsString()
  refresh_token!: string;
}

export class CompleteProfileDto {
  @IsString()
  signup_token!: string;

  @IsString()
  @MaxLength(50)
  displayName!: string;

  @IsString()
  @Matches(/^[a-z0-9_]{3,20}$/, {
    message: 'handle must be 3-20 chars, lowercase letters, digits, underscore',
  })
  handle!: string;
}
