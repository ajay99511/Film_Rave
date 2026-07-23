/**
 * The single client the logged-in app imports. It re-exports the token/session
 * core and the *selected* backend's API surface, so components call
 * `circles.feed(...)`, `ratings.upsert(...)`, etc. without knowing whether the
 * data lives in localStorage or behind the NestJS API.
 *
 * The switch is `NEXT_PUBLIC_DATA_SOURCE` (see `client-core.ts`):
 *   - `local` (default) → in-browser store, no server required.
 *   - `http`            → the real API + Socket.IO.
 *
 * Going to production is literally this one binding — every screen is unchanged.
 */
import type { Backend } from './backend/types';
import { DATA_SOURCE } from './client-core';
import { localBackend } from './local/backend';
import { httpBackend } from './http/backend';

export {
  API_BASE,
  ApiError,
  DATA_SOURCE,
  session,
  type AuthTokens,
} from './client-core';

const backend: Backend = DATA_SOURCE === 'http' ? httpBackend : localBackend;

export const auth = backend.auth;
export const circles = backend.circles;
export const ratings = backend.ratings;
export const movies = backend.movies;
export const watchlist = backend.watchlist;
export const outings = backend.outings;
export const friends = backend.friends;
export const imports = backend.imports;
export const notifications = backend.notifications;
export const chat = backend.chat;
