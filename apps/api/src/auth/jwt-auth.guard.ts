import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Protects routes with a valid access token. Apply per-controller or per-route. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
