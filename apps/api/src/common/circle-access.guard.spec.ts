import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { CircleAccessGuard } from './circle-access.guard.js';
import type { PrismaService } from '../prisma/prisma.service.js';

function makeContext(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function makeGuard(member: unknown) {
  const findUnique = vi.fn().mockResolvedValue(member);
  const prisma = {
    circleMember: { findUnique },
  } as unknown as PrismaService;
  return { guard: new CircleAccessGuard(prisma), findUnique };
}

describe('CircleAccessGuard', () => {
  it('allows a real member through', async () => {
    const { guard } = makeGuard({ circleId: 'c1', userId: 'u1' });
    const ctx = makeContext({ user: { userId: 'u1' }, params: { circleId: 'c1' } });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects a non-member with 403', async () => {
    const { guard } = makeGuard(null);
    const ctx = makeContext({ user: { userId: 'stranger' }, params: { circleId: 'c1' } });
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: 403 });
  });

  it('rejects when the request has no authenticated user', async () => {
    const { guard, findUnique } = makeGuard({ circleId: 'c1', userId: 'u1' });
    const ctx = makeContext({ user: undefined, params: { circleId: 'c1' } });
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: 403 });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects when the route has no :circleId param', async () => {
    const { guard, findUnique } = makeGuard({ circleId: 'c1', userId: 'u1' });
    const ctx = makeContext({ user: { userId: 'u1' }, params: {} });
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: 403 });
    expect(findUnique).not.toHaveBeenCalled();
  });
});
