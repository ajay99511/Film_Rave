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
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

type OutingRow = {
  id: string;
  circleId: string;
  movieTmdbId: number;
  status: OutingStatus;
  ticketsOnSaleDate: string | null;
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

  private async assertMember(circleId: string, userId: string): Promise<void> {
    const member = await this.prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId } },
    });
    if (!member) {
      throw new ForbiddenException('not a member of this circle');
    }
  }

  async listForCircle(circleId: string, userId: string): Promise<OutingDto[]> {
    await this.assertMember(circleId, userId);
    const rows = await this.prisma.outing.findMany({
      where: { circleId },
      include: OUTING_INCLUDE,
    });
    return rows.map((r) => this.toDto(r));
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
    };
  }
}
