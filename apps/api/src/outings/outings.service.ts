import { randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  OutingStatus,
  RsvpStatus,
  type OutingDto,
} from '@filmrave/shared';
import { EventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

type OutingRow = {
  id: string;
  circleId: string;
  movieTmdbId: number;
  status: OutingStatus;
  ticketsOnSaleDate: string | null;
  slug: string;
  lockedAt: Date | null;
  rsvps: { outingId: string; userId: string; status: RsvpStatus }[];
  theaterVotes: {
    outingId: string;
    optionId: string;
    name: string;
    position: number;
    voterIds: string[];
  }[];
  nightVotes: {
    outingId: string;
    optionId: string;
    label: string;
    position: number;
    voterIds: string[];
  }[];
  hypes: { outingId: string; userId: string; score: number }[];
};

// Shared include so every read returns a fully-hydrated outing.
const OUTING_INCLUDE = {
  rsvps: true,
  theaterVotes: { orderBy: { position: 'asc' } },
  nightVotes: { orderBy: { position: 'asc' } },
  hypes: true,
} as const;

@Injectable()
export class OutingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * A public, unguessable identifier for the guest outing page — never
   * derived from `Outing.id`, so the internal cuid stays out of shared URLs.
   * ~53 bits of entropy per attempt; retried on the astronomically rare
   * collision rather than failing outright.
   */
  private async generateUniqueSlug(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = randomBytes(9).toString('base64url').slice(0, 12);
      const existing = await this.prisma.outing.findUnique({ where: { slug } });
      if (!existing) return slug;
    }
    throw new Error('failed to generate a unique outing slug');
  }

  private async assertMember(circleId: string, userId: string): Promise<void> {
    const member = await this.prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId } },
    });
    if (!member) {
      throw new ForbiddenException('not a member of this circle');
    }
  }

  private async assertAdmin(circleId: string, userId: string): Promise<void> {
    const member = await this.prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId } },
    });
    if (!member) throw new ForbiddenException('not a member of this circle');
    if (member.role !== 'admin') {
      throw new ForbiddenException('only a circle admin can do this');
    }
  }

  /** Freeze guest writes on the outing's public page. Member writes (RSVP,
   * votes, hype from inside the app) are unaffected — this is an abuse lever
   * for the public surface only, not a general outing freeze. */
  async lock(outingId: string, userId: string): Promise<OutingDto> {
    const outing = await this.prisma.outing.findUnique({ where: { id: outingId } });
    if (!outing) throw new NotFoundException('outing not found');
    await this.assertAdmin(outing.circleId, userId);
    await this.prisma.outing.update({
      where: { id: outingId },
      data: { lockedAt: new Date() },
    });
    return this.get(outingId);
  }

  async unlock(outingId: string, userId: string): Promise<OutingDto> {
    const outing = await this.prisma.outing.findUnique({ where: { id: outingId } });
    if (!outing) throw new NotFoundException('outing not found');
    await this.assertAdmin(outing.circleId, userId);
    await this.prisma.outing.update({
      where: { id: outingId },
      data: { lockedAt: null },
    });
    return this.get(outingId);
  }

  /** Best-effort funnel signal: an organizer copied the guest invite link.
   * Undercounts real distribution (a copy isn't necessarily a forward, and a
   * forward isn't captured at all) — documented limitation, not solved
   * further this phase. Any member may fire this, not just admins. */
  async recordLinkShared(outingId: string, userId: string): Promise<void> {
    const outing = await this.prisma.outing.findUnique({ where: { id: outingId } });
    if (!outing) throw new NotFoundException('outing not found');
    await this.assertMember(outing.circleId, userId);
    await this.prisma.event
      .create({ data: { type: EventType.link_shared, outingId } })
      .catch(() => {
        /* analytics is not allowed to fail the request it's attached to */
      });
  }

  async listForCircle(circleId: string, userId: string): Promise<OutingDto[]> {
    await this.assertMember(circleId, userId);
    const rows = await this.prisma.outing.findMany({
      where: { circleId },
      include: OUTING_INCLUDE,
    });
    return rows.map((r) => this.toDto(r));
  }

  /**
   * Plan a watch party: create an outing for a circle + movie, seeded with the
   * proposed theater/night options the group will vote on. When the caller
   * supplies no options, sensible defaults are used so voting works immediately.
   */
  async create(
    circleId: string,
    userId: string,
    input: {
      movieTmdbId: number;
      ticketsOnSaleDate?: string | null;
      theaterOptions?: string[];
      nightOptions?: string[];
    },
  ): Promise<OutingDto> {
    await this.assertMember(circleId, userId);

    const theaters = (input.theaterOptions?.length
      ? input.theaterOptions
      : ['AMC / Local IMAX', 'Regal / Cineplex']
    )
      .map((n) => n.trim())
      .filter(Boolean)
      .slice(0, 10);
    const nights = (input.nightOptions?.length
      ? input.nightOptions
      : ['Opening Friday', 'Saturday Evening']
    )
      .map((n) => n.trim())
      .filter(Boolean)
      .slice(0, 10);

    const outing = await this.prisma.outing.create({
      data: {
        circleId,
        movieTmdbId: input.movieTmdbId,
        status: OutingStatus.Planned,
        ticketsOnSaleDate: input.ticketsOnSaleDate ?? null,
        slug: await this.generateUniqueSlug(),
        theaterVotes: {
          create: theaters.map((name, position) => ({
            optionId: randomUUID(),
            name,
            position,
            voterIds: [],
          })),
        },
        nightVotes: {
          create: nights.map((label, position) => ({
            optionId: randomUUID(),
            label,
            position,
            voterIds: [],
          })),
        },
      },
    });
    return this.get(outing.id);
  }

  async setRsvp(
    outingId: string,
    userId: string,
    status: RsvpStatus,
  ): Promise<OutingDto> {
    const outing = await this.prisma.outing.findUnique({
      where: { id: outingId },
    });
    if (!outing) throw new NotFoundException('outing not found');
    await this.assertMember(outing.circleId, userId);
    await this.prisma.outingRsvp.upsert({
      where: { outingId_userId: { outingId, userId } },
      create: { outingId, userId, status },
      update: { status },
    });
    await this.notifyRsvpChange(outing.circleId, outingId, userId, status);
    return this.get(outingId);
  }

  /** Notify the rest of the circle that someone changed their RSVP. */
  private async notifyRsvpChange(
    circleId: string,
    outingId: string,
    actorId: string,
    status: RsvpStatus,
  ): Promise<void> {
    const [actor, members] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: actorId } }),
      this.prisma.circleMember.findMany({ where: { circleId } }),
    ]);
    const recipients = members
      .map((m) => m.userId)
      .filter((id) => id !== actorId);
    const verb =
      status === RsvpStatus.Going
        ? 'is going'
        : status === RsvpStatus.Maybe
          ? 'might go'
          : "can't go";
    await this.notifications.createMany(recipients, {
      type: NotificationType.RsvpChange,
      title: 'Outing update',
      body: `${actor?.displayName ?? 'Someone'} ${verb} to the movie night.`,
      data: { circleId, outingId, actorId, status },
    });
  }

  /** Toggle a theater vote: a user's id appears in exactly one option at a time. */
  async voteTheater(
    outingId: string,
    optionId: string,
    userId: string,
  ): Promise<OutingDto> {
    const outing = await this.prisma.outing.findUnique({
      where: { id: outingId },
      include: { theaterVotes: true },
    });
    if (!outing) throw new NotFoundException('outing not found');
    await this.assertMember(outing.circleId, userId);

    await this.prisma.$transaction(
      outing.theaterVotes.map((v) => {
        const isTarget = v.optionId === optionId;
        const without = v.voterIds.filter((id) => id !== userId);
        const next = isTarget ? [...without, userId] : without;
        return this.prisma.theaterVote.update({
          where: { outingId_optionId: { outingId, optionId: v.optionId } },
          data: { voterIds: next },
        });
      }),
    );
    return this.get(outingId);
  }

  /** Toggle a proposed-night vote: a user's id appears in one option at a time. */
  async voteNight(
    outingId: string,
    optionId: string,
    userId: string,
  ): Promise<OutingDto> {
    const outing = await this.prisma.outing.findUnique({
      where: { id: outingId },
      include: { nightVotes: true },
    });
    if (!outing) throw new NotFoundException('outing not found');
    await this.assertMember(outing.circleId, userId);

    await this.prisma.$transaction(
      outing.nightVotes.map((v) => {
        const isTarget = v.optionId === optionId;
        const without = v.voterIds.filter((id) => id !== userId);
        const next = isTarget ? [...without, userId] : without;
        return this.prisma.nightVote.update({
          where: { outingId_optionId: { outingId, optionId: v.optionId } },
          data: { voterIds: next },
        });
      }),
    );
    return this.get(outingId);
  }

  /** Set (or clear, when score === 0) the requester's hype for an outing. */
  async setHype(
    outingId: string,
    userId: string,
    score: number,
  ): Promise<OutingDto> {
    const outing = await this.prisma.outing.findUnique({
      where: { id: outingId },
    });
    if (!outing) throw new NotFoundException('outing not found');
    await this.assertMember(outing.circleId, userId);
    if (!Number.isInteger(score) || score < 0 || score > 10) {
      throw new BadRequestException('hype must be an integer 0..10');
    }
    if (score === 0) {
      await this.prisma.outingHype.deleteMany({ where: { outingId, userId } });
    } else {
      await this.prisma.outingHype.upsert({
        where: { outingId_userId: { outingId, userId } },
        create: { outingId, userId, score },
        update: { score },
      });
    }
    return this.get(outingId);
  }

  private async get(outingId: string): Promise<OutingDto> {
    const row = await this.prisma.outing.findUniqueOrThrow({
      where: { id: outingId },
      include: OUTING_INCLUDE,
    });
    return this.toDto(row);
  }

  /**
   * Leading theater option. Ties break by `position` (the order options were
   * added), matching the Flutter client's tie-break rule.
   */
  static leadingOption(outing: OutingDto): string | null {
    if (outing.theater_options.length === 0) return null;
    return [...outing.theater_options]
      .sort(
        (a, b) =>
          b.voter_ids.length - a.voter_ids.length || a.position - b.position,
      )[0].option_id;
  }

  private toDto(o: OutingRow): OutingDto {
    const groupHype = o.hypes.length
      ? o.hypes.reduce((sum, h) => sum + h.score, 0) / o.hypes.length
      : null;
    return {
      outing_id: o.id,
      group_id: o.circleId,
      movie_tmdb_id: o.movieTmdbId,
      status: o.status,
      tickets_on_sale_date: o.ticketsOnSaleDate,
      rsvps: o.rsvps.map((r) => ({
        outing_id: r.outingId,
        user_id: r.userId,
        status: r.status,
      })),
      theater_options: o.theaterVotes.map((v) => ({
        outing_id: v.outingId,
        option_id: v.optionId,
        name: v.name,
        position: v.position,
        voter_ids: v.voterIds,
      })),
      night_options: o.nightVotes.map((v) => ({
        outing_id: v.outingId,
        option_id: v.optionId,
        label: v.label,
        position: v.position,
        voter_ids: v.voterIds,
      })),
      hypes: o.hypes.map((h) => ({
        outing_id: h.outingId,
        user_id: h.userId,
        score: h.score,
      })),
      group_hype: groupHype,
      slug: o.slug,
      locked: o.lockedAt != null,
    };
  }
}
