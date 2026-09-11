import { describe, expect, it, vi } from 'vitest';
import { ChatService } from './chat.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { MoviesService } from '../movies/movies.service.js';

function makeService() {
  const chatMessageCreate = vi.fn().mockResolvedValue({
    id: 'm1',
    circleId: 'c1',
    movieTmdbId: 550,
    userId: 'u1',
    body: 'Shared: check this out',
    sentAt: new Date('2026-01-01T00:00:00Z'),
  });
  const prisma = {
    circleMember: {
      findUnique: vi.fn().mockResolvedValue({ circleId: 'c1', userId: 'u1' }),
    },
    chatMessage: { create: chatMessageCreate },
  } as unknown as PrismaService;
  const getOrFetch = vi.fn().mockResolvedValue({ tmdb_id: 550, title: 'Fight Club', release_date: '1999-10-15' });
  const movies = { getOrFetch } as unknown as MoviesService;
  return { service: new ChatService(prisma, movies), chatMessageCreate, getOrFetch, prisma };
}

describe('ChatService.send', () => {
  it('caches the movie before creating the message (FK target must exist)', async () => {
    const { service, getOrFetch, chatMessageCreate } = makeService();
    await service.send('c1', 550, 'u1', 'Shared: check this out');
    expect(getOrFetch).toHaveBeenCalledWith(550);
    expect(chatMessageCreate).toHaveBeenCalledWith({
      data: { circleId: 'c1', movieTmdbId: 550, userId: 'u1', body: 'Shared: check this out' },
    });
  });

  it('rejects a non-member', async () => {
    const { service, prisma } = makeService();
    (prisma.circleMember.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    await expect(service.send('c1', 550, 'stranger', 'hi')).rejects.toThrow(
      'not a member',
    );
  });
});
