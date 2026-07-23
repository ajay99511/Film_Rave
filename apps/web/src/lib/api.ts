/**
 * Server-side data access for public, SSR pages (the invite-landing route).
 * Honors the same `NEXT_PUBLIC_DATA_SOURCE` switch as the app client:
 *   - `local` → resolve against the seed roster (no server, works during SSR).
 *   - `http`  → fetch the public profile from the API.
 */
import type { AppUserDto } from '@filmrave/shared';
import { API_BASE, DATA_SOURCE } from './client-core';
import { SEED_USERS } from './local/seed';

export { ApiError } from './client-core';
import { ApiError } from './client-core';

async function fetchByHandle(handle: string): Promise<AppUserDto> {
  const res = await fetch(
    `${API_BASE}/users/by-handle/${encodeURIComponent(handle)}`,
    { headers: { accept: 'application/json' }, next: { revalidate: 60 } },
  );
  if (!res.ok) {
    throw new ApiError(res.status, `GET /users/by-handle failed (${res.status})`);
  }
  return (await res.json()) as AppUserDto;
}

function seedByHandle(handle: string): AppUserDto {
  const clean = handle.replace(/^@/, '').toLowerCase();
  const user = SEED_USERS.find((u) => u.handle === clean);
  if (!user) throw new ApiError(404, 'User not found');
  return {
    user_id: user.user_id,
    display_name: user.display_name,
    handle: user.handle,
    avatar_color: user.avatar_color,
  };
}

/** Public profile lookup powering the invite-landing page. */
export function getUserByHandle(handle: string): Promise<AppUserDto> {
  return DATA_SOURCE === 'http'
    ? fetchByHandle(handle)
    : Promise.resolve(seedByHandle(handle));
}
