import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  userId: string;
  handle: string;
}

/** Injects the authenticated user attached by JwtStrategy.validate(). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);
