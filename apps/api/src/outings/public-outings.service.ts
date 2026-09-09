import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventType, type Prisma } from '@prisma/client';
import type {
  MovieDto,
  PublicAttendeeDto,
  PublicOutingDto,
  PublicVoteOptionDto,
} from '@filmrave/shared';
import { RsvpStatus } from '@filmrave/shared';
import { PrismaService } from '../prisma/prisma.service.js';

/** Defensive ceiling on guest rows per outing — bounds worst-case abuse
 * regardless of attack duration, independent of the per-IP rate limit. */
const MAX_GUEST_ROWS_PER_OUTING = 200;

// Every read needed to answer the public/guest surface for one outing.
// `Outing.movieTmdbId` is a plain scalar (no Prisma relation is declared on
// Outing — Rating/WatchlistEntry have one, Outing never did), so the movie
// row is fetched separately rather than via `include`.
const PUBLIC_OUTING_INCLUDE = {
  rsvps: { include: { user: true } },
  theaterVotes: { orderBy: { position: 'asc' } },
  nightVotes: { orderBy: { position: 'asc' } },
  hypes: true,
  guestRsvps: true,
} as const;

type PublicOutingRow = Prisma.OutingGetPayload<{
  include: typeof PUBLIC_OUTING_INCLUDE;
}>;

interface PublicOutingBundle {
  outing: PublicOutingRow;
  movie: MovieDto;
}

@Injectable()
export class PublicOutingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Append-only funnel log for the acquisition loop's exit gate. Best-effort
   * — a logging failure must never break the guest-facing request it's
   * attached to. No reporting reads this yet; see docs/plans/f06-guest-outing-page.md. */
  private logEvent(
    type: EventType,
    outingId: string,
    metadata: Prisma.InputJsonValue = {},
  ): void {
    this.prisma.event.create({ data: { type, outingId, metadata } }).catch(() => {
      /* analytics is not allowed to fail the request it's attached to */
    });
  }

  private loadBySlug(slug: string) {
    return this.prisma.outing.findUnique({
      where: { slug },
      include: PUBLIC_OUTING_INCLUDE,
    });
  }

  private async requireOuting(slug: string): Promise<PublicOutingBundle> {
    const outing = await this.loadBySlug(slug);
    if (!outing) throw new NotFoundException('outing not found');
    const movieRow = await this.prisma.movie.findUnique({
      where: { tmdbId: outing.movieTmdbId },
    });
    if (!movieRow) {
      // Shouldn't happen — an outing is always created against a cached
      // movie — but fail loudly rather than send a malformed public DTO.
      throw new NotFoundException('outing movie not found');
    }
    const movie: MovieDto = {
      tmdb_id: movieRow.tmdbId,
      title: movieRow.title,
      release_date: movieRow.releaseDate,
      overview: movieRow.overview,
      poster_url: movieRow.posterUrl,
      runtime: movieRow.runtime,
      year: movieRow.year,
    };
    return { outing, movie };
  }

  async getPublic(
    slug: string,
    guestToken?: string,
  ): Promise<PublicOutingDto> {
    const bundle = await this.requireOuting(slug);
    this.logEvent(EventType.guest_viewed, bundle.outing.id);
    return this.toPublicDto(bundle, guestToken);
  }

  /**
   * Create or update the caller's guest RSVP. Reuses `existingGuestToken`
   * when it names a real row on this outing; otherwise mints a fresh one.
   * Returns the (possibly new) token alongside the DTO so the controller can
   * set the cookie.
   */
  async rsvp(
    slug: string,
    existingGuestToken: string | undefined,
    input: { displayName: string; status: RsvpStatus },
  ): Promise<{ dto: PublicOutingDto; guestToken: string }> {
    const { outing } = await this.requireOuting(slug);
    if (outing.lockedAt) {
      throw new ForbiddenException({
        code: 'OUTING_LOCKED',
        message: 'planning is closed for this outing',
      });
    }

    const displayName = input.displayName.trim();
    if (!displayName) {
      throw new BadRequestException('display_name is required');
    }

    const reused = existingGuestToken
      ? outing.guestRsvps.find((g) => g.guestToken === existingGuestToken)
      : undefined;

    if (reused) {
      await this.prisma.guestRsvp.update({
        where: {
          outingId_guestToken: {
            outingId: outing.id,
            guestToken: reused.guestToken,
          },
        },
        data: { displayName, status: input.status },
      });
      const fresh = await this.requireOuting(slug);
      return {
        dto: this.toPublicDto(fresh, reused.guestToken),
        guestToken: reused.guestToken,
      };
    }

    if (outing.guestRsvps.length >= MAX_GUEST_ROWS_PER_OUTING) {
      throw new ForbiddenException({
        code: 'GUEST_LIMIT_REACHED',
        message: 'this outing has reached its guest RSVP limit',
      });
    }

    const guestToken = randomBytes(18).toString('base64url');
    await this.prisma.guestRsvp.create({
      data: {
        outingId: outing.id,
        guestToken,
        displayName,
        status: input.status,
      },
    });
    this.logEvent(EventType.guest_rsvped, outing.id, { status: input.status });
    const fresh = await this.requireOuting(slug);
    return { dto: this.toPublicDto(fresh, guestToken), guestToken };
  }

  /** Toggle the caller's night-option vote. Requires a prior RSVP (the name
   * capture step) — the vote UI never renders before that on the client, but
   * the server must not trust the client either. */
  async voteNight(
    slug: string,
    guestToken: string | undefined,
    optionId: string,
  ): Promise<PublicOutingDto> {
    const { outing } = await this.requireOuting(slug);
    if (outing.lockedAt) {
      throw new ForbiddenException({
        code: 'OUTING_LOCKED',
        message: 'planning is closed for this outing',
      });
    }
    const guest = guestToken
      ? outing.guestRsvps.find((g) => g.guestToken === guestToken)
      : undefined;
    if (!guest) {
      throw new BadRequestException({
        code: 'RSVP_REQUIRED',
        message: 'RSVP before voting',
      });
    }
    if (!outing.nightVotes.some((v) => v.optionId === optionId)) {
      throw new BadRequestException('unknown night option');
    }
    await this.prisma.guestRsvp.update({
      where: {
        outingId_guestToken: { outingId: outing.id, guestToken: guest.guestToken },
      },
      data: { votedNightOptionId: optionId },
    });
    const fresh = await this.requireOuting(slug);
    return this.toPublicDto(fresh, guest.guestToken);
  }

  /**
   * Mark a guest's RSVP as claimed by a real, now-authenticated user. Does
   * *not* create an OutingRsvp or CircleMember row — both currently assume
   * circle membership a fresh convert does not have; joining the circle is a
   * separate, existing invite flow.
   */
  async claim(
    slug: string,
    guestToken: string | undefined,
    userId: string,
  ): Promise<void> {
    if (!guestToken) {
      throw new BadRequestException('no guest session to claim');
    }
    const { outing } = await this.requireOuting(slug);
    const guest = outing.guestRsvps.find((g) => g.guestToken === guestToken);
    if (!guest) {
      throw new NotFoundException('guest RSVP not found');
    }
    if (guest.claimedByUserId && guest.claimedByUserId !== userId) {
      throw new ConflictException('this RSVP was already claimed');
    }
    if (guest.claimedByUserId === userId) return; // idempotent re-claim
    this.logEvent(EventType.guest_converted, outing.id, { userId });
    await this.prisma.guestRsvp.update({
      where: {
        outingId_guestToken: { outingId: outing.id, guestToken },
      },
      data: { claimedByUserId: userId },
    });
  }

  private toPublicDto(
    bundle: PublicOutingBundle,
    guestToken?: string,
  ): PublicOutingDto {
    const { outing: o, movie } = bundle;
    const memberAttendees: PublicAttendeeDto[] = o.rsvps
      .filter((r) => r.status === RsvpStatus.Going)
      .map((r) => ({
        display_name: r.user.displayName,
        avatar_url: r.user.avatarUrl,
        is_guest: false,
      }));
    const guestAttendees: PublicAttendeeDto[] = o.guestRsvps
      .filter((g) => g.status === RsvpStatus.Going)
      .map((g) => ({
        display_name: g.displayName,
        avatar_url: null,
        is_guest: true,
      }));

    const theaterOptions: PublicVoteOptionDto[] = o.theaterVotes.map((v) => ({
      option_id: v.optionId,
      label: v.name,
      position: v.position,
      vote_count: v.voterIds.length,
    }));
    const nightOptions: PublicVoteOptionDto[] = o.nightVotes.map((v) => {
      const guestVotes = o.guestRsvps.filter(
        (g) => g.votedNightOptionId === v.optionId,
      ).length;
      return {
        option_id: v.optionId,
        label: v.label,
        position: v.position,
        vote_count: v.voterIds.length + guestVotes,
      };
    });

    const groupHype = o.hypes.length
      ? o.hypes.reduce((sum, h) => sum + h.score, 0) / o.hypes.length
      : null;

    const me = guestToken
      ? o.guestRsvps.find((g) => g.guestToken === guestToken)
      : undefined;

    return {
      outing_id: o.id,
      slug: o.slug,
      movie,
      status: o.status,
      locked: o.lockedAt != null,
      tickets_on_sale_date: o.ticketsOnSaleDate,
      attendees_going: [...memberAttendees, ...guestAttendees],
      theater_options: theaterOptions,
      night_options: nightOptions,
      group_hype: groupHype,
      my_guest_status: me?.status ?? null,
      my_guest_night_vote: me?.votedNightOptionId ?? null,
    };
  }
}
