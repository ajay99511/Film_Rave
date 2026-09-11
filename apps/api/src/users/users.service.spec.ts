import { describe, expect, it, vi } from 'vitest';
import { UsersService } from './users.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

function makeService(overrides: {
  existingHandleOwner?: { id: string } | null;
  updateResult?: Record<string, unknown>;
}) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(overrides.existingHandleOwner ?? null),
      update: vi.fn().mockResolvedValue(
        overrides.updateResult ?? {
          id: 'u1',
          displayName: 'Ada',
          handle: 'ada_new',
          avatarColor: null,
          avatarUrl: null,
        },
      ),
    },
  } as unknown as PrismaService;
  return { service: new UsersService(prisma), prisma };
}

describe('UsersService.updateHandle', () => {
  it('rejects a handle outside the 3-20 lowercase/digit/underscore pattern', async () => {
    const { service } = makeService({});
    await expect(service.updateHandle('u1', 'AB')).rejects.toThrow(/3-20 characters/);
    await expect(service.updateHandle('u1', 'has space')).rejects.toThrow(
      /3-20 characters/,
    );
  });

  it('rejects a handle already taken by someone else', async () => {
    const { service } = makeService({ existingHandleOwner: { id: 'someone-else' } });
    await expect(service.updateHandle('u1', 'taken')).rejects.toThrow('taken');
  });

  it('allows a user to "reclaim" their own current handle (no-op collision)', async () => {
    const { service, prisma } = makeService({ existingHandleOwner: { id: 'u1' } });
    await expect(service.updateHandle('u1', 'ada_new')).resolves.toMatchObject({
      handle: 'ada_new',
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { handle: 'ada_new' },
    });
  });

  it('lowercases the input before validating/storing', async () => {
    const { service, prisma } = makeService({});
    await service.updateHandle('u1', 'AdaNew1');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { handle: 'adanew1' },
    });
  });
});
