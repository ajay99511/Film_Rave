import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  isRatingShared,
  isRatingVisible,
  type CirclePrivacy,
  RatingsShared,
  type AppUserDto,
  type CircleDto,
  type CircleMemberDto,
  type FeedItemDto,
  type MovieDto,
  type RatingDto,
} from '@filmrave/shared';
import { PrismaService } from '../prisma/prisma.service.js';

/** Fields that describe a circle's card/banner identity. */
export interface CircleIdentity {
  genreFocus?: string;
  privacy?: CirclePrivacy;
  bannerGradient?: string;
}

@Injectable()
export class CirclesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create a circle; the creator becomes admin, invitees join as members. */
  async create(
    creatorId: string,
    name: string,
    description: string,
    memberUserIds: string[],
    identity: CircleIdentity = {},
  ): Promise<CircleDto> {
    const invitees = [...new Set(memberUserIds)].filter((id) => id !== creatorId);
    const circle = await this.prisma.circle.create({
      data: {
        name,
        description,
        ...this.identityData(identity),
        members: {
          create: [
            { userId: creatorId, role: 'admin' },
            ...invitees.map((userId) => ({ userId, role: 'member' as const })),
          ],
        },
      },
      include: { members: true },
    });
    return this.toCircleDto(circle);
  }

  /**
   * Edit a circle (admin only). Any subset of name/description/identity may be
   * updated; passing `memberUserIds` replaces the roster (the requesting admin
   * is always retained). Roles of surviving members are preserved.
   */
  async update(
    circleId: string,
    requesterId: string,
    patch: {
      name?: string;
      description?: string;
      identity?: CircleIdentity;
      memberUserIds?: string[];
    },
  ): Promise<CircleDto> {
    await this.assertAdmin(circleId, requesterId);

    if (patch.memberUserIds) {
      const desired = new Set([...patch.memberUserIds, requesterId]);
      const current = await this.prisma.circleMember.findMany({ where: { circleId } });
      const currentIds = new Set(current.map((m) => m.userId));
      const toRemove = current.filter((m) => !desired.has(m.userId)).map((m) => m.userId);
      const toAdd = [...desired].filter((id) => !currentIds.has(id));
      await this.prisma.$transaction([
        ...(toRemove.length
          ? [
              this.prisma.circleMember.deleteMany({
                where: { circleId, userId: { in: toRemove } },
              }),
            ]
          : []),
        ...toAdd.map((userId) =>
          this.prisma.circleMember.create({
            data: { circleId, userId, role: 'member' },
          }),
        ),
      ]);
    }

    await this.prisma.circle.update({
      where: { id: circleId },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...this.identityData(patch.identity ?? {}),
      },
    });
    return this.getForUser(circleId, requesterId);
  }

  /** Delete a circle (admin only). Child rows cascade via the schema. */
  async remove(circleId: string, requesterId: string): Promise<void> {
    await this.assertAdmin(circleId, requesterId);
    await this.prisma.circle.delete({ where: { id: circleId } });
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

  /** Build the data patch for identity fields that were provided (create + update). */
  private identityData(
    identity: CircleIdentity,
  ): { genreFocus?: string; privacy?: CirclePrivacy; bannerGradient?: string } {
    return {
      ...(identity.genreFocus !== undefined ? { genreFocus: identity.genreFocus } : {}),
      ...(identity.privacy !== undefined ? { privacy: identity.privacy } : {}),
      ...(identity.bannerGradient !== undefined
        ? { bannerGradient: identity.bannerGradient }
        : {}),
    };
  }

  /** Update the requester's own rating-sharing preference within a circle. */
  async updateSharing(
    circleId: string,
    userId: string,
    ratingsShared: RatingsShared,
    sharedMovieIds: number[],
  ): Promise<CircleDto> {
    const member = await this.prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId } },
    });
    if (!member) {
      throw new ForbiddenException('not a member of this circle');
    }
    await this.prisma.circleMember.update({
      where: { circleId_userId: { circleId, userId } },
      data: {
        ratingsShared,
        sharedMovieIds:
          ratingsShared === RatingsShared.Selective ? sharedMovieIds : [],
      },
    });
    return this.getForUser(circleId, userId);
  }

  /** Record a group co-watch (idempotent per circle+movie). */
  async addGroupWatch(
    circleId: string,
    userId: string,
    movieTmdbId: number,
    watchedDate: string,
  ): Promise<void> {
    const member = await this.prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId } },
    });
    if (!member) {
      throw new ForbiddenException('not a member of this circle');
    }
    await this.prisma.groupWatch.upsert({
      where: { circleId_movieTmdbId: { circleId, movieTmdbId } },
      create: { circleId, movieTmdbId, watchedDate },
      update: { watchedDate },
    });
  }

  /** Public profiles of a circle's members, for rendering avatars/names. */
  async memberProfiles(
    circleId: string,
    requesterId: string,
  ): Promise<AppUserDto[]> {
    const members = await this.prisma.circleMember.findMany({
      where: { circleId },
      include: { user: true },
    });
    if (!members.some((m) => m.userId === requesterId)) {
      throw new ForbiddenException('not a member of this circle');
    }
    return members.map((m) => ({
      user_id: m.user.id,
      display_name: m.user.displayName,
      handle: m.user.handle,
      avatar_color: m.user.avatarColor,
    }));
  }

  /** Circles the user belongs to, with member roster (sharing prefs included). */
  async listForUser(userId: string): Promise<CircleDto[]> {
    const circles = await this.prisma.circle.findMany({
      where: { members: { some: { userId } } },
      include: { members: true },
    });
    return circles.map((c) => this.toCircleDto(c));
  }

  async getForUser(circleId: string, userId: string): Promise<CircleDto> {
    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
      include: { members: true },
    });
    if (!circle) {
      throw new NotFoundException('circle not found');
    }
    if (!circle.members.some((m) => m.userId === userId)) {
      throw new ForbiddenException('not a member of this circle');
    }
    return this.toCircleDto(circle);
  }

  /**
   * Ratings for a movie within a circle, filtered so unshared ratings never
   * leave the server. The requester always sees their own score. This is the
   * server-side enforcement of the visibility rule — the shared package's
   * pure functions are the single source of truth.
   */
  async visibleRatings(
    circleId: string,
    movieTmdbId: number,
    requesterId: string,
  ): Promise<RatingDto[]> {
    const members = await this.prisma.circleMember.findMany({
      where: { circleId },
    });
    if (!members.some((m) => m.userId === requesterId)) {
      throw new ForbiddenException('not a member of this circle');
    }
    const memberByUser = new Map(members.map((m) => [m.userId, m]));

    const ratings = await this.prisma.rating.findMany({
      where: {
        movieTmdbId,
        userId: { in: members.map((m) => m.userId) },
      },
    });

    return ratings
      .filter((r) => {
        const member = memberByUser.get(r.userId);
        if (!member) return false;
        return isRatingVisible(
          { user_id: r.userId, movie_tmdb_id: r.movieTmdbId },
          {
            user_id: member.userId,
            ratings_shared: member.ratingsShared,
            shared_movie_ids: member.sharedMovieIds,
          },
          requesterId,
        );
      })
      .map((r) => ({
        user_id: r.userId,
        movie_tmdb_id: r.movieTmdbId,
        score: r.score,
        rated_at: r.ratedAt.toISOString(),
        source: r.source,
      }));
  }

  /**
   * The circle's Group Feed: every movie any member has rated or the group has
   * co-watched, with visibility-correct aggregates. The group average counts
   * only shared ratings; `my_rating` is the requester's own (always self-visible).
   */
  async feed(circleId: string, requesterId: string): Promise<FeedItemDto[]> {
    const members = await this.prisma.circleMember.findMany({
      where: { circleId },
    });
    if (!members.some((m) => m.userId === requesterId)) {
      throw new ForbiddenException('not a member of this circle');
    }
    const memberIds = members.map((m) => m.userId);
    const memberByUser = new Map(members.map((m) => [m.userId, m]));

    const [ratings, watches] = await Promise.all([
      this.prisma.rating.findMany({ where: { userId: { in: memberIds } } }),
      this.prisma.groupWatch.findMany({ where: { circleId } }),
    ]);

    const movieIds = [
      ...new Set([
        ...ratings.map((r) => r.movieTmdbId),
        ...watches.map((w) => w.movieTmdbId),
      ]),
    ];
    if (movieIds.length === 0) return [];

    const [movies, commentGroups] = await Promise.all([
      this.prisma.movie.findMany({ where: { tmdbId: { in: movieIds } } }),
      this.prisma.chatMessage.groupBy({
        by: ['movieTmdbId'],
        where: { circleId, movieTmdbId: { in: movieIds } },
        _count: { _all: true },
      }),
    ]);
    const movieById = new Map(movies.map((m) => [m.tmdbId, m]));
    const commentCount = new Map(
      commentGroups.map((g) => [g.movieTmdbId, g._count._all]),
    );
    const coWatched = new Set(watches.map((w) => w.movieTmdbId));

    const items: FeedItemDto[] = movieIds.map((tmdbId) => {
      const movieRatings = ratings.filter((r) => r.movieTmdbId === tmdbId);
      const shared = movieRatings.filter((r) => {
        const member = memberByUser.get(r.userId);
        return member
          ? isRatingShared(
              { user_id: r.userId, movie_tmdb_id: r.movieTmdbId },
              {
                user_id: member.userId,
                ratings_shared: member.ratingsShared,
                shared_movie_ids: member.sharedMovieIds,
              },
            )
          : false;
      });
      const mine = movieRatings.find((r) => r.userId === requesterId);
      const m = movieById.get(tmdbId);
      const movie: MovieDto = m
        ? {
            tmdb_id: m.tmdbId,
            title: m.title,
            release_date: m.releaseDate,
            overview: m.overview,
            poster_url: m.posterUrl,
            runtime: m.runtime,
            year: m.year,
          }
        : {
            tmdb_id: tmdbId,
            title: `Movie #${tmdbId}`,
            release_date: '',
          };
      return {
        movie,
        group_average: shared.length
          ? shared.reduce((s, r) => s + r.score, 0) / shared.length
          : null,
        shared_rated_count: shared.length,
        my_rating: mine?.score ?? null,
        comment_count: commentCount.get(tmdbId) ?? 0,
        co_watched: coWatched.has(tmdbId),
      };
    });

    // Most-discussed and highest-rated float up; stable enough for a feed.
    return items.sort(
      (a, b) =>
        b.comment_count - a.comment_count ||
        (b.group_average ?? 0) - (a.group_average ?? 0),
    );
  }

  /** Aggregate (self-excluded) group average, using the sharing switch only. */
  async groupAverage(
    circleId: string,
    movieTmdbId: number,
  ): Promise<{ shared_rated_count: number; group_average: number | null }> {
    const members = await this.prisma.circleMember.findMany({
      where: { circleId },
    });
    const memberByUser = new Map(members.map((m) => [m.userId, m]));
    const ratings = await this.prisma.rating.findMany({
      where: { movieTmdbId, userId: { in: members.map((m) => m.userId) } },
    });
    const shared = ratings.filter((r) => {
      const member = memberByUser.get(r.userId);
      if (!member) return false;
      return isRatingShared(
        { user_id: r.userId, movie_tmdb_id: r.movieTmdbId },
        {
          user_id: member.userId,
          ratings_shared: member.ratingsShared,
          shared_movie_ids: member.sharedMovieIds,
        },
      );
    });
    return {
      shared_rated_count: shared.length,
      group_average: shared.length
        ? shared.reduce((sum, r) => sum + r.score, 0) / shared.length
        : null,
    };
  }

  private toCircleDto(circle: {
    id: string;
    name: string;
    description: string;
    genreFocus: string;
    privacy: CirclePrivacy;
    bannerGradient: string;
    members: {
      userId: string;
      role: CircleMemberDto['role'];
      ratingsShared: CircleMemberDto['ratings_shared'];
      sharedMovieIds: number[];
    }[];
  }): CircleDto {
    return {
      group_id: circle.id,
      name: circle.name,
      description: circle.description,
      genre_focus: circle.genreFocus,
      privacy: circle.privacy,
      banner_gradient: circle.bannerGradient,
      members: circle.members.map((m) => ({
        user_id: m.userId,
        role: m.role,
        ratings_shared: m.ratingsShared,
        ...(m.ratingsShared === 'selective'
          ? { shared_movie_ids: m.sharedMovieIds }
          : {}),
      })),
    };
  }
}
