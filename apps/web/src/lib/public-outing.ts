/**
 * Data access for the guest-accessible outing page (/o/[slug]). Deliberately
 * separate from the authenticated `Backend` interface (lib/backend/types.ts)
 * — guests never hold a session, so this is its own small client, the same
 * way lib/api.ts's invite-landing helpers sit outside `Backend`.
 *
 * Usable from both the SSR page component and the "use client" actions
 * component: no `next/headers` here, so it's safe in a client bundle. The
 * SSR read can't see a returning guest's cookie (no request context is
 * threaded through), so the client component re-reads on mount to reconcile
 * — a minor, deliberately accepted gap, see docs/plans/f06-guest-outing-page.md.
 */
import type { PublicOutingDto, RsvpStatus } from '@filmrave/shared';
import { API_BASE, ApiError, DATA_SOURCE } from './client-core';
import {
  claimPublicOuting as claimLocal,
  getPublicOuting as getLocal,
  rsvpPublicOuting as rsvpLocal,
  voteNightPublicOuting as voteNightLocal,
} from './local/public-outings';

async function httpJson(
  path: string,
  init: RequestInit = {},
): Promise<PublicOutingDto> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? `request failed (${res.status})`);
  }
  return (await res.json()) as PublicOutingDto;
}

export function getPublicOuting(slug: string): Promise<PublicOutingDto> {
  return DATA_SOURCE === 'http'
    ? httpJson(`/outings/public/${encodeURIComponent(slug)}`)
    : getLocal(slug);
}

export function rsvpPublicOuting(
  slug: string,
  input: { display_name: string; status: RsvpStatus },
): Promise<PublicOutingDto> {
  return DATA_SOURCE === 'http'
    ? httpJson(`/outings/public/${encodeURIComponent(slug)}/rsvp`, {
        method: 'POST',
        body: JSON.stringify(input),
      })
    : rsvpLocal(slug, input);
}

export function voteNightPublicOuting(
  slug: string,
  optionId: string,
): Promise<PublicOutingDto> {
  return DATA_SOURCE === 'http'
    ? httpJson(`/outings/public/${encodeURIComponent(slug)}/vote-night`, {
        method: 'POST',
        body: JSON.stringify({ option_id: optionId }),
      })
    : voteNightLocal(slug, optionId);
}

export async function claimPublicOuting(
  slug: string,
  accessToken: string,
  localUserId?: string,
): Promise<void> {
  if (DATA_SOURCE === 'http') {
    const res = await fetch(
      `${API_BASE}/outings/public/${encodeURIComponent(slug)}/claim`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { authorization: `Bearer ${accessToken}` },
      },
    );
    if (!res.ok) {
      throw new ApiError(res.status, `claim failed (${res.status})`);
    }
    return;
  }
  if (!localUserId) throw new ApiError(400, 'no local user to claim with');
  return claimLocal(slug, localUserId);
}
