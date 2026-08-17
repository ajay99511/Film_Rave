/**
 * HTTP backend — the production path. Talks to the NestJS API over REST with a
 * transparent one-shot token refresh, and streams chat over Socket.IO. Selected
 * when NEXT_PUBLIC_DATA_SOURCE=http. Shapes come from @filmrave/shared.
 */
import { io, type Socket } from 'socket.io-client';
import type {
  AppUserDto,
  AuthTokensDto,
  ChatMessageDto,
  CircleDto,
  FeedItemDto,
  FriendRelationshipDto,
  ImportResultDto,
  MovieDto,
  NotificationDto,
  OutingDto,
  RatingDto,
  RatingSource,
  RsvpStatus,
  WatchlistEntryDto,
} from '@filmrave/shared';
import { API_BASE, ApiError, session } from '../client-core';
import type { Backend, ChatTransport } from '../backend/types';

async function raw<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = true, headers, ...rest } = init;
  const token = auth ? session.access : null;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      accept: 'application/json',
      ...(rest.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    let message = `${res.status}`;
    try {
      const j = (await res.json()) as { message?: string | string[] };
      message = Array.isArray(j.message) ? j.message.join(', ') : (j.message ?? message);
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const rt = session.refresh;
  if (!rt) return false;
  refreshing ??= (async () => {
    try {
      const tokens = await raw<AuthTokensDto>('/auth/refresh', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ refresh_token: rt }),
      });
      session.save(tokens);
      return true;
    } catch {
      session.clear();
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function api<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  try {
    return await raw<T>(path, init);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && init.auth !== false) {
      if (await tryRefresh()) return raw<T>(path, init);
    }
    throw e;
  }
}

const CHAT_URL = API_BASE.replace(/\/api\/v1\/?$/, '') + '/chat';

const chat: ChatTransport = {
  history: (circleId, tmdbId) =>
    api<ChatMessageDto[]>(`/circles/${circleId}/chat?movieTmdbId=${tmdbId}`),
  open(circleId, movieTmdbId, handlers) {
    const socket: Socket = io(CHAT_URL, {
      auth: { token: session.access },
      transports: ['websocket'],
    });
    socket.on('connect', () => {
      handlers.onStatus(true);
      socket.emit('thread:join', { circleId, movieTmdbId });
    });
    socket.on('disconnect', () => handlers.onStatus(false));
    socket.on('message:new', handlers.onMessage);
    socket.on('message:ack', (p: { message: ChatMessageDto }) => handlers.onMessage(p.message));
    return {
      send: (body) => socket.emit('message:send', { circleId, movieTmdbId, body }),
      close: () => socket.disconnect(),
    };
  },
};

export const httpBackend: Backend = {
  auth: {
    google: (id_token) =>
      api<AuthTokensDto>('/auth/google', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ id_token }),
      }),
    me: () => api<AppUserDto>('/auth/me'),
  },

  circles: {
    list: () => api<CircleDto[]>('/circles'),
    get: (id) => api<CircleDto>(`/circles/${id}`),
    members: (id) => api<AppUserDto[]>(`/circles/${id}/members`),
    create: (name, description, member_ids, identity = {}) =>
      api<CircleDto>('/circles', {
        method: 'POST',
        body: JSON.stringify({ name, description, member_ids, ...identity }),
      }),
    update: (id, patch) =>
      api<CircleDto>(`/circles/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    remove: (id) => api<void>(`/circles/${id}`, { method: 'DELETE' }),
    updateSharing: (id, ratings_shared, shared_movie_ids = []) =>
      api<CircleDto>(`/circles/${id}/sharing`, {
        method: 'PATCH',
        body: JSON.stringify({ ratings_shared, shared_movie_ids }),
      }),
    feed: (id) => api<FeedItemDto[]>(`/circles/${id}/feed`),
    movieRatings: (id, tmdbId) =>
      api<RatingDto[]>(`/circles/${id}/movies/${tmdbId}/ratings`),
    groupAverage: (id, tmdbId) =>
      api<{ shared_rated_count: number; group_average: number | null }>(
        `/circles/${id}/movies/${tmdbId}/group-average`,
      ),
    chat: (id, tmdbId) =>
      api<ChatMessageDto[]>(`/circles/${id}/chat?movieTmdbId=${tmdbId}`),
    addGroupWatch: (id, movie_tmdb_id, watched_date) =>
      api<void>(`/circles/${id}/group-watch`, {
        method: 'POST',
        body: JSON.stringify({ movie_tmdb_id, watched_date }),
      }),
  },

  ratings: {
    mine: () => api<RatingDto[]>('/ratings/me'),
    upsert: (movie_tmdb_id, score, source: RatingSource = 'app') =>
      api<RatingDto>('/ratings', {
        method: 'PUT',
        body: JSON.stringify({ movie_tmdb_id, score, source }),
      }),
    remove: (tmdbId) => api<void>(`/ratings/${tmdbId}`, { method: 'DELETE' }),
  },

  movies: {
    search: (q) => api<MovieDto[]>(`/movies/search?q=${encodeURIComponent(q)}`),
    get: (tmdbId) => api<MovieDto>(`/movies/${tmdbId}`),
    popular: (limit = 25) => api<MovieDto[]>(`/movies/popular?limit=${limit}`),
    upcoming: () => api<MovieDto[]>('/movies/upcoming'),
  },

  watchlist: {
    list: () => api<WatchlistEntryDto[]>('/watchlist'),
    add: (movie_tmdb_id) =>
      api<WatchlistEntryDto>('/watchlist', {
        method: 'POST',
        body: JSON.stringify({ movie_tmdb_id }),
      }),
    remove: (tmdbId) => api<void>(`/watchlist/${tmdbId}`, { method: 'DELETE' }),
  },

  outings: {
    list: (circleId) => api<OutingDto[]>(`/outings?circleId=${circleId}`),
    create: (circleId, input) =>
      api<OutingDto>('/outings', {
        method: 'POST',
        body: JSON.stringify({ circle_id: circleId, ...input }),
      }),
    rsvp: (outingId, status: RsvpStatus) =>
      api<OutingDto>(`/outings/${outingId}/rsvp`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      }),
    voteTheater: (outingId, option_id) =>
      api<OutingDto>(`/outings/${outingId}/vote`, {
        method: 'POST',
        body: JSON.stringify({ option_id }),
      }),
    voteNight: (outingId, option_id) =>
      api<OutingDto>(`/outings/${outingId}/vote-night`, {
        method: 'POST',
        body: JSON.stringify({ option_id }),
      }),
    setHype: (outingId, score) =>
      api<OutingDto>(`/outings/${outingId}/hype`, {
        method: 'POST',
        body: JSON.stringify({ score }),
      }),
  },

  friends: {
    list: () => api<FriendRelationshipDto[]>('/friendships'),
    request: (other_id) =>
      api<void>('/friendships/request', {
        method: 'POST',
        body: JSON.stringify({ other_id }),
      }),
    accept: (otherId) =>
      api<void>(`/friendships/${otherId}/accept`, { method: 'POST' }),
    search: (q) => api<AppUserDto[]>(`/users/search?q=${encodeURIComponent(q)}`),
  },

  imports: {
    ratings: (csv, format = 'auto') =>
      api<ImportResultDto>('/imports/ratings', {
        method: 'POST',
        body: JSON.stringify({ csv, format }),
      }),
  },

  notifications: {
    list: () => api<NotificationDto[]>('/notifications'),
    unreadCount: () => api<{ count: number }>('/notifications/unread-count'),
    markRead: (id) =>
      api<NotificationDto>(`/notifications/${id}/read`, { method: 'POST' }),
    markAllRead: () =>
      api<{ updated: number }>('/notifications/read-all', { method: 'POST' }),
  },

  chat,
};
