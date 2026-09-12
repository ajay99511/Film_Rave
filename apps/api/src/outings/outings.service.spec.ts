import { describe, expect, it, vi } from 'vitest';
import type { OutingDto } from '@filmrave/shared';
import { OutingsService } from './outings.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';

/**
 * The leading theater option is decided by vote count, with ties broken by
 * insertion `position` — matching the Flutter client so all clients agree.
 */
function outing(
  options: { option_id: string; position: number; voter_ids: string[] }[],
): OutingDto {
  return {
    outing_id: 'o1',
    group_id: 'c1',
    movie_tmdb_id: 1,
    status: 'planned',
    tickets_on_sale_date: null,
    rsvps: [],
    theater_options: options.map((o) => ({
      outing_id: 'o1',
      name: o.option_id,
      ...o,
    })),
    night_options: [],
    hypes: [],
    group_hype: null,
    slug: 'test-slug-123',
    locked: false,
  };
}

describe('OutingsService.leadingOption', () => {
  it('returns null when there are no options', () => {
    expect(OutingsService.leadingOption(outing([]))).toBeNull();
  });

  it('picks the option with the most votes', () => {
    const o = outing([
      { option_id: 'a', position: 0, voter_ids: ['u1'] },
      { option_id: 'b', position: 1, voter_ids: ['u1', 'u2'] },
    ]);
    expect(OutingsService.leadingOption(o)).toBe('b');
  });

  it('breaks ties by insertion position', () => {
    const o = outing([
      { option_id: 'a', position: 1, voter_ids: ['u1'] },
      { option_id: 'b', position: 0, voter_ids: ['u2'] },
    ]);
    expect(OutingsService.leadingOption(o)).toBe('b');
  });
});

function makeLockService(member: { role: string } | null) {
  const outingRow = {
    id: 'o1',
    circleId: 'c1',
    movieTmdbId: 550,
    status: 'planned',
    ticketsOnSaleDate: null,
    slug: 'abc123def456',
    lockedAt: null,
    rsvps: [],
    theaterVotes: [],
    nightVotes: [],
    hypes: [],
  };
  const updateFn = vi.fn().mockResolvedValue(outingRow);
  const prisma = {
    outing: {
      findUnique: vi.fn().mockResolvedValue(outingRow),
      findUniqueOrThrow: vi.fn().mockResolvedValue(outingRow),
      update: updateFn,
    },
    circleMember: {
      findUnique: vi.fn().mockResolvedValue(member),
    },
  } as unknown as PrismaService;
  const notifications = {} as unknown as NotificationsService;
  return { service: new OutingsService(prisma, notifications), updateFn };
}

describe('OutingsService.lock / unlock', () => {
  it('rejects a non-admin member', async () => {
    const { service } = makeLockService({ role: 'member' });
    await expect(service.lock('o1', 'u1')).rejects.toThrow(
      'only a circle admin can do this',
    );
  });

  it('rejects a non-member entirely', async () => {
    const { service } = makeLockService(null);
    await expect(service.lock('o1', 'u1')).rejects.toThrow(
      'not a member of this circle',
    );
  });

  it('lets an admin lock and unlock', async () => {
    const { service, updateFn } = makeLockService({ role: 'admin' });
    await service.lock('o1', 'admin1');
    expect(updateFn).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { lockedAt: expect.any(Date) },
    });
    await service.unlock('o1', 'admin1');
    expect(updateFn).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { lockedAt: null },
    });
  });
});

function makeMarkDoneService(overrides: {
  member?: { role: string } | null;
  status?: string;
  goingRsvps?: { userId: string; status: string }[];
}) {
  const outingRow = {
    id: 'o1',
    circleId: 'c1',
    movieTmdbId: 550,
    status: overrides.status ?? 'planned',
    ticketsOnSaleDate: null,
    slug: 'abc123def456',
    lockedAt: null,
    rsvps: [],
    theaterVotes: [],
    nightVotes: [],
    hypes: [],
  };
  const outingUpdate = vi.fn().mockResolvedValue(outingRow);
  const groupWatchUpsert = vi.fn().mockResolvedValue({});
  const createMany = vi.fn().mockResolvedValue(undefined);
  const prisma = {
    outing: {
      findUnique: vi.fn().mockResolvedValue(outingRow),
      findUniqueOrThrow: vi.fn().mockResolvedValue(outingRow),
      update: outingUpdate,
    },
    circleMember: {
      findUnique: vi.fn().mockResolvedValue(overrides.member ?? { role: 'admin' }),
    },
    groupWatch: { upsert: groupWatchUpsert },
    outingRsvp: {
      findMany: vi.fn().mockResolvedValue(
        (overrides.goingRsvps ?? [{ userId: 'attendee1', status: 'going' }]).map((r) => ({
          outingId: 'o1',
          ...r,
        })),
      ),
    },
    movie: { findUnique: vi.fn().mockResolvedValue({ tmdbId: 550, title: 'Fight Club' }) },
  } as unknown as PrismaService;
  const notifications = { createMany } as unknown as NotificationsService;
  return { service: new OutingsService(prisma, notifications), outingUpdate, groupWatchUpsert, createMany };
}

describe('OutingsService.markDone', () => {
  it('rejects a non-admin member', async () => {
    const { service } = makeMarkDoneService({ member: { role: 'member' } });
    await expect(service.markDone('o1', 'u1')).rejects.toThrow(
      'only a circle admin can do this',
    );
  });

  it('sets status done, writes a GroupWatch row, and notifies going attendees (not the actor)', async () => {
    const { service, outingUpdate, groupWatchUpsert, createMany } = makeMarkDoneService({
      goingRsvps: [
        { userId: 'admin1', status: 'going' },
        { userId: 'attendee1', status: 'going' },
      ],
    });
    await service.markDone('o1', 'admin1');

    expect(outingUpdate).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { status: 'done' },
    });
    expect(groupWatchUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { circleId_movieTmdbId: { circleId: 'c1', movieTmdbId: 550 } },
      }),
    );
    expect(createMany).toHaveBeenCalledWith(
      ['attendee1'], // admin1 is the actor — excluded
      expect.objectContaining({ type: 'outing_reminder' }),
    );
  });

  it('is idempotent — re-marking an already-done outing does nothing further', async () => {
    const { service, outingUpdate, groupWatchUpsert, createMany } = makeMarkDoneService({
      status: 'done',
    });
    await service.markDone('o1', 'admin1');
    expect(outingUpdate).not.toHaveBeenCalled();
    expect(groupWatchUpsert).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('sends no notification when nobody besides the actor RSVP\'d going', async () => {
    const { service, createMany } = makeMarkDoneService({
      goingRsvps: [{ userId: 'admin1', status: 'going' }],
    });
    await service.markDone('o1', 'admin1');
    expect(createMany).not.toHaveBeenCalled();
  });
});
