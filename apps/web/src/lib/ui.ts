/** Small presentational helpers shared across the logged-in app. */
import type { AppUserDto } from '@filmrave/shared';

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

const FALLBACK_COLORS = [
  'bg-blue-600',
  'bg-emerald-600',
  'bg-amber-600',
  'bg-purple-600',
  'bg-rose-600',
  'bg-cyan-600',
];

/** Stable avatar color for any user id, even before the server assigns one. */
export function colorFor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
}

export function userColor(u: Pick<AppUserDto, 'user_id' | 'avatar_color'>): string {
  return u.avatar_color ?? colorFor(u.user_id);
}

export function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

/** Relative "2h ago" style timestamp from an ISO string. */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return 'Just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
