import { IsString } from 'class-validator';

/** Sign in with Google: the client posts the Google Identity Services ID token
 * (a JWT credential), which the server verifies with google-auth-library. */
export class GoogleAuthDto {
  @IsString()
  id_token!: string;
}

export class RefreshDto {
  @IsString()
  refresh_token!: string;
}
