/**
 * Circle card styling. Genre/privacy/banner are now real persisted fields on
 * CircleDto, so `circleTheme` returns those directly. The deterministic
 * derivation is kept only as a fallback for older records that predate the
 * fields (or a demo store that hasn't been reseeded).
 */
import type { CircleDto } from '@filmrave/shared';

const GRADIENTS = [
  'from-orange-600 via-amber-600 to-red-600',
  'from-purple-900 via-slate-900 to-indigo-950',
  'from-blue-700 via-indigo-800 to-slate-900',
  'from-emerald-700 via-teal-900 to-slate-950',
  'from-rose-600 via-pink-700 to-slate-900',
];

const GENRES = [
  'Sci-Fi & Action',
  'Horror & Thriller',
  'Drama & Festival Cinema',
  'Comedy & Animation',
  'General / All Genres',
];

function hash(seed: string): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export interface CircleTheme {
  banner: string;
  /** Display-only genre focus hint. */
  genre: string;
  /** Display-only access hint. Small circles read as "Private". */
  privacy: 'Private' | 'Public';
}

export function circleTheme(circle: CircleDto): CircleTheme {
  const h = hash(circle.group_id || circle.name);
  return {
    banner: circle.banner_gradient || GRADIENTS[h % GRADIENTS.length],
    genre: circle.genre_focus || GENRES[(h >> 3) % GENRES.length],
    privacy: circle.privacy === 'public' ? 'Public' : 'Private',
  };
}
