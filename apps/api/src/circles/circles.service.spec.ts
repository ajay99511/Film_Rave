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
