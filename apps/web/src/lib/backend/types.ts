/**
 * The Backend contract. Both the HTTP backend (talks to the NestJS API) and the
 * local backend (localStorage) implement this identical surface, so the app is
 * agnostic to which one is wired in. Method signatures mirror the REST routes in
 * `ARCHITECTURE.md`; the return types are the `@filmrave/shared` DTOs.
 *
 * Swapping "static local data" for "database + API" is therefore a one-line
 * change in `client.ts` — every screen keeps calling the same methods.
 */
import type {
  AppUserDto,
  AuthTokensDto,
  ChatMessageDto,
  CircleDto,
  CirclePrivacy,
  FeedItemDto,
  FriendRelationshipDto,
  ImportResultDto,
  MovieDto,
  NotificationDto,
  OutingDto,
  RatingDto,
  RatingSource,
  RatingsShared,
  RsvpStatus,
  WatchlistEntryDto,
} from '@filmrave/shared';

/** Card/banner identity fields for a circle (all optional on create/update). */
export interface CircleIdentityInput {
  genre_focus?: string;
  privacy?: CirclePrivacy;
  banner_gradient?: string;
}

/** Partial edit for a circle. Any omitted field is left unchanged. */
export interface CircleUpdateInput extends CircleIdentityInput {
  name?: string;
  description?: string;
  member_ids?: string[];
}

/** Inputs for planning a watch-party outing. */
export interface CreateOutingInput {
  movie_tmdb_id: number;
  tickets_on_sale_date?: string | null;
  theater_options?: string[];
  night_options?: string[];
}

export interface AuthApi {
  /** Sign in / sign up with a Google Identity Services ID token. */
  google(idToken: string): Promise<AuthTokensDto>;
  me(): Promise<AppUserDto>;
}

export interface CirclesApi {
  list(): Promise<CircleDto[]>;
  get(id: string): Promise<CircleDto>;
  members(id: string): Promise<AppUserDto[]>;
  create(
    name: string,
    description: string,
    memberIds: string[],
    identity?: CircleIdentityInput,
  ): Promise<CircleDto>;
  update(id: string, patch: CircleUpdateInput): Promise<CircleDto>;
  remove(id: string): Promise<void>;
  updateSharing(
    id: string,
    ratingsShared: RatingsShared,
    sharedMovieIds?: number[],
  ): Promise<CircleDto>;
  feed(id: string): Promise<FeedItemDto[]>;
  movieRatings(id: string, tmdbId: number): Promise<RatingDto[]>;
  groupAverage(
    id: string,
    tmdbId: number,
  ): Promise<{ shared_rated_count: number; group_average: number | null }>;
  chat(id: string, tmdbId: number): Promise<ChatMessageDto[]>;
  addGroupWatch(id: string, movieTmdbId: number, watchedDate?: string): Promise<void>;
}

export interface RatingsApi {
  mine(): Promise<RatingDto[]>;
  upsert(movieTmdbId: number, score: number, source?: RatingSource): Promise<RatingDto>;
  remove(tmdbId: number): Promise<void>;
}

export interface MoviesApi {
  search(q: string): Promise<MovieDto[]>;
  get(tmdbId: number): Promise<MovieDto>;
  /** Popular titles for the TMDB browse surface. */
  popular(limit?: number): Promise<MovieDto[]>;
  /** Upcoming theatrical releases. */
  upcoming(): Promise<MovieDto[]>;
}

export interface WatchlistApi {
  list(): Promise<WatchlistEntryDto[]>;
  add(movieTmdbId: number): Promise<WatchlistEntryDto>;
  remove(tmdbId: number): Promise<void>;
}

export interface OutingsApi {
  list(circleId: string): Promise<OutingDto[]>;
  create(circleId: string, input: CreateOutingInput): Promise<OutingDto>;
  rsvp(outingId: string, status: RsvpStatus): Promise<OutingDto>;
  voteTheater(outingId: string, optionId: string): Promise<OutingDto>;
  voteNight(outingId: string, optionId: string): Promise<OutingDto>;
  setHype(outingId: string, score: number): Promise<OutingDto>;
  /** Freeze/unfreeze guest writes on the public outing page. Admin-only. */
  lock(outingId: string): Promise<OutingDto>;
  unlock(outingId: string): Promise<OutingDto>;
  /** Best-effort funnel signal for the "copy invite link" action. */
  recordLinkShared(outingId: string): Promise<void>;
}

export interface FriendsApi {
  list(): Promise<FriendRelationshipDto[]>;
  request(otherId: string): Promise<void>;
  accept(otherId: string): Promise<void>;
  remove(otherId: string): Promise<void>;
  search(q: string): Promise<AppUserDto[]>;
}

export interface ImportsApi {
  ratings(csv: string, format?: 'imdb' | 'letterboxd' | 'auto'): Promise<ImportResultDto>;
}

export interface NotificationsApi {
  list(): Promise<NotificationDto[]>;
  unreadCount(): Promise<{ count: number }>;
  markRead(id: string): Promise<NotificationDto>;
  markAllRead(): Promise<{ updated: number }>;
}

/** Live message transport. Abstracts Socket.IO (HTTP) vs BroadcastChannel (local). */
export interface ChatTransport {
  /** History for a movie thread (also available via `circles.chat`). */
  history(circleId: string, movieTmdbId: number): Promise<ChatMessageDto[]>;
  /**
   * Open a live subscription for a thread. `onMessage` fires for every new
   * message; `onStatus` reports connectivity. Returns a handle to send + close.
   */
  open(
    circleId: string,
    movieTmdbId: number,
    handlers: {
      onMessage: (m: ChatMessageDto) => void;
      onStatus: (connected: boolean) => void;
    },
  ): { send: (body: string) => void; close: () => void };
}

export interface Backend {
  auth: AuthApi;
  circles: CirclesApi;
  ratings: RatingsApi;
  movies: MoviesApi;
  watchlist: WatchlistApi;
  outings: OutingsApi;
  friends: FriendsApi;
  imports: ImportsApi;
  notifications: NotificationsApi;
  chat: ChatTransport;
}
