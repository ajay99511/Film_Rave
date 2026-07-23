import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from './current-user.decorator.js';

/**
 * Reusable membership gate: allows the request only if the authenticated user
 * belongs to the circle named by the `:circleId` route param. Services still
 * enforce their own checks; this guard is a first-line filter for circle-scoped
 * controllers. Must run after JwtAuthGuard (needs request.user populated).
 */
@Injectable()
export class CircleAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx
      .switchToHttp()
      .getRequest<{ user?: AuthUser; params: { circleId?: string } }>();
    const userId = req.user?.userId;
    const circleId = req.params.circleId;
    if (!userId || !circleId) {
      throw new ForbiddenException('missing circle context');
    }
    const member = await this.prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId } },
    });
    if (!member) {
      throw new ForbiddenException('not a member of this circle');
    }
    return true;
  }
}
