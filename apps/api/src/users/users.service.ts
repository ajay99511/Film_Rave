import { Injectable, NotFoundException } from '@nestjs/common';
import type { AppUserDto } from '@filmrave/shared';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public profile lookup by handle — powers the /add/:handle invite landing. */
  async byHandle(handle: string): Promise<AppUserDto> {
    const user = await this.prisma.user.findUnique({ where: { handle } });
    if (!user) {
      throw new NotFoundException('user not found');
    }
    return this.toDto(user);
  }

  /** Handle/name search for the Find Friends screen (excludes the requester). */
  async search(query: string, requesterId: string): Promise<AppUserDto[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const users = await this.prisma.user.findMany({
      where: {
        id: { not: requesterId },
        OR: [
          { handle: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 20,
    });
    return users.map((u) => this.toDto(u));
  }

  private toDto(u: {
    id: string;
    displayName: string;
    handle: string;
    avatarColor: string | null;
  }): AppUserDto {
    return {
      user_id: u.id,
      display_name: u.displayName,
      handle: u.handle,
      avatar_color: u.avatarColor,
    };
  }
}
