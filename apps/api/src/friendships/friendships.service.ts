import { Injectable } from '@nestjs/common';
import {
  RelationshipStatus,
  type FriendRelationshipDto,
} from '@filmrave/shared';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Friendships are stored as a directed pair per user so each side sees a
 * status from its own perspective (requested_by_me vs requested_by_them).
 */
@Injectable()
export class FriendshipsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<FriendRelationshipDto[]> {
    const rows = await this.prisma.friendship.findMany({ where: { userId } });
    return rows.map((r) => ({
      user_id: r.userId,
      other_id: r.otherId,
      status: r.status,
    }));
  }

  /** Send a request: sets the mirrored pair (me -> requested_by_me, them -> requested_by_them). */
  async request(userId: string, otherId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.friendship.upsert({
        where: { userId_otherId: { userId, otherId } },
        create: { userId, otherId, status: RelationshipStatus.RequestedByMe },
        update: { status: RelationshipStatus.RequestedByMe },
      }),
      this.prisma.friendship.upsert({
        where: { userId_otherId: { userId: otherId, otherId: userId } },
        create: {
          userId: otherId,
          otherId: userId,
          status: RelationshipStatus.RequestedByThem,
        },
        update: { status: RelationshipStatus.RequestedByThem },
      }),
    ]);
  }

  async accept(userId: string, otherId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.friendship.updateMany({
        where: { userId, otherId },
        data: { status: RelationshipStatus.Friends },
      }),
      this.prisma.friendship.updateMany({
        where: { userId: otherId, otherId: userId },
        data: { status: RelationshipStatus.Friends },
      }),
    ]);
  }
}
