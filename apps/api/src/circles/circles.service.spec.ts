import { describe, expect, it, vi } from 'vitest';
import { CirclesService } from './circles.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Proves the visibility rule is enforced *server-side*: an unshared rating must
 * never be returned to another member, while its author still sees their own.
 */
function makeService(overrides: {
  members: {
    userId: string;
    ratingsShared: string;
    sharedMovieIds: number[];
  }[];
  ratings: { userId: string; movieTmdbId: number; score: number }[];
}): CirclesService {
  const prisma = {
    circleMember: {
      findMany: vi.fn().mockResolvedValue(overrides.members),
    },
    rating: {
      findMany: vi.fn().mockResolvedValue(
        overrides.ratings.map((r) => ({
          ...r,
          ratedAt: new Date('2024-01-01T00:00:00Z'),
          source: 'app',
        })),
      ),
    },
  } as unknown as PrismaService;
  return new CirclesService(prisma);
}

const members = [
  { userId: 'ada', ratingsShared: 'approved', sharedMovieIds: [] },
  { userId: 'finn', ratingsShared: 'none', sharedMovieIds: [] },
];
const ratings = [
  { userId: 'ada', movieTmdbId: 550, score: 9 },
  { userId: 'finn', movieTmdbId: 550, score: 6 },
];

describe('CirclesService.visibleRatings', () => {
  it("hides an unshared rating from another member", async () => {
    const service = makeService({ members, ratings });
    const result = await service.visibleRatings('c1', 550, 'ada');
    expect(result.map((r) => r.user_id)).toEqual(['ada']);
  });

  it('shows a member their own unshared rating', async () => {
    const service = makeService({ members, ratings });
    const result = await service.visibleRatings('c1', 550, 'finn');
    const finn = result.find((r) => r.user_id === 'finn');
    expect(finn?.score).toBe(6);
    // Finn also sees Ada's shared rating.
    expect(result.map((r) => r.user_id).sort()).toEqual(['ada', 'finn']);
  });

  it('rejects non-members', async () => {
    const service = makeService({ members, ratings });
    await expect(service.visibleRatings('c1', 550, 'stranger')).rejects.toThrow();
  });
});

describe('CirclesService.groupAverage', () => {
  it('averages only shared ratings (self-excluded switch)', async () => {
    const service = makeService({ members, ratings });
    const { shared_rated_count, group_average } = await service.groupAverage(
      'c1',
      550,
    );
    expect(shared_rated_count).toBe(1);
    expect(group_average).toBe(9);
  });
});

describe('CirclesService.feed member_ratings', () => {
  function makeFeedService(overrides: { chatMovies?: { movieTmdbId: number }[] } = {}) {
    const membersWithUser = [
      {
        userId: 'ada',
        ratingsShared: 'approved',
        sharedMovieIds: [],
        user: { id: 'ada', displayName: 'Ada', avatarUrl: null },
      },
      {
        userId: 'finn',
        ratingsShared: 'none',
        sharedMovieIds: [],
        user: { id: 'finn', displayName: 'Finn', avatarUrl: null },
      },
      {
        userId: 'zoe',
        ratingsShared: 'approved',
        sharedMovieIds: [],
        user: { id: 'zoe', displayName: 'Zoe', avatarUrl: null },
      },
    ];
    const feedRatings = [
      { userId: 'ada', movieTmdbId: 550, score: 9, ratedAt: new Date(), source: 'app' },
      { userId: 'finn', movieTmdbId: 550, score: 6, ratedAt: new Date(), source: 'app' },
      { userId: 'zoe', movieTmdbId: 550, score: 4, ratedAt: new Date(), source: 'app' },
    ];
    const prisma = {
      circleMember: { findMany: vi.fn().mockResolvedValue(membersWithUser) },
      rating: { findMany: vi.fn().mockResolvedValue(feedRatings) },
      groupWatch: { findMany: vi.fn().mockResolvedValue([]) },
      movie: {
        findMany: vi.fn().mockResolvedValue([
          { tmdbId: 550, title: 'Fight Club', releaseDate: '1999-10-15', overview: null, posterUrl: null, runtime: null, year: 1999 },
          { tmdbId: 999, title: 'Shared Movie', releaseDate: '2026-01-01', overview: null, posterUrl: null, runtime: null, year: 2026 },
        ]),
      },
      chatMessage: {
        groupBy: vi.fn().mockResolvedValue([]),
        findMany: vi.fn().mockResolvedValue(overrides.chatMovies ?? []),
      },
    } as unknown as PrismaService;
    return new CirclesService(prisma);
  }

  it('excludes the requester and unshared ratings, sorted highest first', async () => {
    const service = makeFeedService();
    const feed = await service.feed('c1', 'ada');
    const item = feed.find((f) => f.movie.tmdb_id === 550)!;
    // Ada is the requester (excluded, shown as my_rating instead); Finn's
    // rating is 'none' (excluded); only Zoe's shared rating remains.
    expect(item.my_rating).toBe(9);
    expect(item.member_ratings).toEqual([
      { user_id: 'zoe', display_name: 'Zoe', avatar_url: null, score: 4 },
    ]);
  });

  it("shows both other members' shared ratings, highest first", async () => {
    const service = makeFeedService();
    const feed = await service.feed('c1', 'finn');
    const item = feed.find((f) => f.movie.tmdb_id === 550)!;
    expect(item.member_ratings.map((r) => r.user_id)).toEqual(['ada', 'zoe']);
    expect(item.member_ratings.map((r) => r.score)).toEqual([9, 4]);
  });

  it('surfaces a movie that only has a shared chat message, with no ratings yet', async () => {
    const service = makeFeedService({ chatMovies: [{ movieTmdbId: 999 }] });
    const feed = await service.feed('c1', 'ada');
    const shared = feed.find((f) => f.movie.tmdb_id === 999);
    expect(shared).toBeDefined();
    expect(shared?.member_ratings).toEqual([]);
    expect(shared?.my_rating).toBeNull();
    expect(shared?.group_average).toBeNull();
  });
});
