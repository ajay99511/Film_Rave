import { describe, expect, it, vi } from 'vitest';
import { PublicOutingsService } from './public-outings.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const MOVIE_ROW = {
  tmdbId: 550,
  title: 'Fight Club',
  releaseDate: '1999-10-15',
  overview: 'Insomniac office worker...',
  posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
  runtime: 139,
  year: 1999,
};

const MEMBER_USER = {
  id: 'u1',
  displayName: 'Priya',
  handle: 'priya_h',
  email: 'priya@example.com',
  googleId: 'g1',
  avatarUrl: 'https://example.com/priya.png',
};

function baseOuting(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'o1',
    circleId: 'c1',
    movieTmdbId: 550,
    status: 'planned',
    ticketsOnSaleDate: null,
    slug: 'abc123def456',
    lockedAt: null,
    rsvps: [{ outingId: 'o1', userId: 'u1', status: 'going', user: MEMBER_USER }],
    theaterVotes: [
      { outingId: 'o1', optionId: 't1', name: 'AMC', position: 0, voterIds: ['u1'] },
    ],
    nightVotes: [
      { outingId: 'o1', optionId: 'n1', label: 'Friday', position: 0, voterIds: ['u1'] },
    ],
    hypes: [{ outingId: 'o1', userId: 'u1', score: 8 }],
    guestRsvps: [] as {
      outingId: string;
      guestToken: string;
      displayName: string;
      status: string;
      votedNightOptionId: string | null;
      claimedByUserId: string | null;
    }[],
    ...overrides,
  };
}

function makeService(outing: ReturnType<typeof baseOuting> | null) {
  const outingFindUnique = vi.fn().mockResolvedValue(outing);
  const movieFindUnique = vi.fn().mockResolvedValue(MOVIE_ROW);
  const guestRsvpUpdate = vi.fn().mockResolvedValue({});
  const guestRsvpCreate = vi.fn().mockResolvedValue({});
  const eventCreate = vi.fn().mockResolvedValue({});
  const prisma = {
    outing: { findUnique: outingFindUnique },
    movie: { findUnique: movieFindUnique },
    guestRsvp: { update: guestRsvpUpdate, create: guestRsvpCreate },
    event: { create: eventCreate },
  } as unknown as PrismaService;
  return {
    service: new PublicOutingsService(prisma),
    outingFindUnique,
    guestRsvpUpdate,
    guestRsvpCreate,
  };
}

describe('PublicOutingsService.getPublic', () => {
  it('never exposes a member handle or email', async () => {
    const { service } = makeService(
      baseOuting({
        guestRsvps: [
          {
            outingId: 'o1',
            guestToken: 'gt1',
            displayName: 'Sam',
            status: 'going',
            votedNightOptionId: null,
            claimedByUserId: null,
          },
        ],
      }),
    );
    const dto = await service.getPublic('abc123def456');
    expect(dto.attendees_going).toEqual([
      { display_name: 'Priya', avatar_url: MEMBER_USER.avatarUrl, is_guest: false },
      { display_name: 'Sam', avatar_url: null, is_guest: true },
    ]);
    const json = JSON.stringify(dto);
    expect(json).not.toContain('priya_h');
    expect(json).not.toContain('priya@example.com');
  });

  it('merges member and guest night-vote counts', async () => {
    const { service } = makeService(
      baseOuting({
        guestRsvps: [
          {
            outingId: 'o1',
            guestToken: 'gt1',
            displayName: 'Sam',
            status: 'going',
            votedNightOptionId: 'n1',
            claimedByUserId: null,
          },
        ],
      }),
    );
    const dto = await service.getPublic('abc123def456');
    expect(dto.night_options[0].vote_count).toBe(2); // 1 member + 1 guest
    expect(dto.theater_options[0].vote_count).toBe(1); // guests never vote theater
  });

  it('throws NotFound for an unknown slug', async () => {
    const { service } = makeService(null);
    await expect(service.getPublic('nope')).rejects.toThrow('outing not found');
  });
});

describe('PublicOutingsService.rsvp', () => {
  it('rejects writes to a locked outing', async () => {
    const { service } = makeService(baseOuting({ lockedAt: new Date() }));
    await expect(
      service.rsvp('abc123def456', undefined, {
        displayName: 'Sam',
        status: 'going' as never,
      }),
    ).rejects.toMatchObject({ response: { code: 'OUTING_LOCKED' } });
  });

  it('reuses an existing guest token instead of creating a new row', async () => {
    const { service, guestRsvpUpdate, guestRsvpCreate } = makeService(
      baseOuting({
        guestRsvps: [
          {
            outingId: 'o1',
            guestToken: 'gt1',
            displayName: 'Sam',
            status: 'maybe',
            votedNightOptionId: null,
            claimedByUserId: null,
          },
        ],
      }),
    );
    const result = await service.rsvp('abc123def456', 'gt1', {
      displayName: 'Sam',
      status: 'going' as never,
    });
    expect(result.guestToken).toBe('gt1');
    expect(guestRsvpUpdate).toHaveBeenCalledOnce();
    expect(guestRsvpCreate).not.toHaveBeenCalled();
  });

  it('rejects a new guest once the per-outing cap is reached', async () => {
    const guestRsvps = Array.from({ length: 200 }, (_, i) => ({
      outingId: 'o1',
      guestToken: `gt${i}`,
      displayName: `Guest ${i}`,
      status: 'going',
      votedNightOptionId: null,
      claimedByUserId: null,
    }));
    const { service, guestRsvpCreate } = makeService(baseOuting({ guestRsvps }));
    await expect(
      service.rsvp('abc123def456', undefined, {
        displayName: 'One Too Many',
        status: 'going' as never,
      }),
    ).rejects.toMatchObject({ response: { code: 'GUEST_LIMIT_REACHED' } });
    expect(guestRsvpCreate).not.toHaveBeenCalled();
  });
});

describe('PublicOutingsService.voteNight', () => {
  it('requires a prior RSVP before accepting a vote', async () => {
    const { service } = makeService(baseOuting());
    await expect(
      service.voteNight('abc123def456', undefined, 'n1'),
    ).rejects.toMatchObject({ response: { code: 'RSVP_REQUIRED' } });
  });
});

describe('PublicOutingsService.claim', () => {
  it('sets claimed_by_user_id only — never touches outingRsvp/circleMember', async () => {
    // The mocked PrismaService below has no `outingRsvp` or `circleMember`
    // delegate at all, so an accidental write to either would throw here
    // rather than silently pass — this is the enforcement mechanism for the
    // "claim never implies circle membership" invariant (see plan §1).
    const { service, guestRsvpUpdate } = makeService(
      baseOuting({
        guestRsvps: [
          {
            outingId: 'o1',
            guestToken: 'gt1',
            displayName: 'Sam',
            status: 'going',
            votedNightOptionId: null,
            claimedByUserId: null,
          },
        ],
      }),
    );
    await service.claim('abc123def456', 'gt1', 'u9');
    expect(guestRsvpUpdate).toHaveBeenCalledWith({
      where: { outingId_guestToken: { outingId: 'o1', guestToken: 'gt1' } },
      data: { claimedByUserId: 'u9' },
    });
  });

  it('is idempotent when the same user re-claims', async () => {
    const { service, guestRsvpUpdate } = makeService(
      baseOuting({
        guestRsvps: [
          {
            outingId: 'o1',
            guestToken: 'gt1',
            displayName: 'Sam',
            status: 'going',
            votedNightOptionId: null,
            claimedByUserId: 'u2',
          },
        ],
      }),
    );
    await expect(
      service.claim('abc123def456', 'gt1', 'u2'),
    ).resolves.toBeUndefined();
    expect(guestRsvpUpdate).not.toHaveBeenCalled();
  });

  it('rejects a claim by a different user than who already claimed it', async () => {
    const { service } = makeService(
      baseOuting({
        guestRsvps: [
          {
            outingId: 'o1',
            guestToken: 'gt1',
            displayName: 'Sam',
            status: 'going',
            votedNightOptionId: null,
            claimedByUserId: 'u2',
          },
        ],
      }),
    );
    await expect(service.claim('abc123def456', 'gt1', 'u3')).rejects.toThrow(
      'already claimed',
    );
  });
});
