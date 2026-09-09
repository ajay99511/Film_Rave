/**
 * Wire DTO shapes. Field names are snake_case to match the Flutter client's
 * `@JsonKey(name: ...)` mappings so a single JSON contract serves all clients.
 * The API serializes Prisma rows into exactly these shapes.
 */
import type {
  CirclePrivacy,
  MemberRole,
  NotificationType,
  OutingStatus,
  RatingSource,
  RatingsShared,
  RelationshipStatus,
  RsvpStatus,
} from './enums.js';

export interface AppUserDto {
  user_id: string;
  display_name: string;
  handle: string;
  avatar_color?: string | null;
  /** Google profile picture URL, when available. */
  avatar_url?: string | null;
}

export interface CircleMemberDto {
  user_id: string;
  role: MemberRole;
  ratings_shared: RatingsShared;
  /** Present only when ratings_shared === 'selective'. */
  shared_movie_ids?: number[];
}

export interface CircleDto {
  group_id: string;
  name: string;
  description: string;
  /** Display-only genre focus label (e.g. "Sci-Fi & Action"). */
  genre_focus: string;
  privacy: CirclePrivacy;
  /** Tailwind gradient class string for the circle banner. */
  banner_gradient: string;
  members: CircleMemberDto[];
}

export interface FriendRelationshipDto {
  user_id: string;
  other_id: string;
  status: RelationshipStatus;
}

export interface RatingDto {
  user_id: string;
  movie_tmdb_id: number;
  score: number; // invariant: 1..10
  rated_at: string; // ISO-8601
  source: RatingSource;
}

export interface MovieDto {
  tmdb_id: number | null;
  title: string;
  release_date: string; // YYYY-MM-DD
  overview?: string | null;
  poster_url?: string | null;
  runtime?: number | null;
  year?: number | null;
}

export interface ChatMessageDto {
  message_id: string;
  group_id: string;
  movie_tmdb_id: number;
  user_id: string;
  body: string;
  sent_at: string; // ISO-8601
}

export interface WatchlistEntryDto {
  user_id: string;
  movie_tmdb_id: number;
  added_at: string; // ISO-8601
}

export interface OutingRsvpDto {
  outing_id: string;
  user_id: string;
  status: RsvpStatus;
}

export interface TheaterVoteDto {
  outing_id: string;
  option_id: string;
  name: string;
  position: number;
  voter_ids: string[];
}

/** Proposed movie-night option, structurally identical to a theater vote. */
export interface NightVoteDto {
  outing_id: string;
  option_id: string;
  label: string;
  position: number;
  voter_ids: string[];
}

/** One member's excitement score (1..10) for an outing's movie. */
export interface OutingHypeDto {
  outing_id: string;
  user_id: string;
  score: number;
}

export interface OutingDto {
  outing_id: string;
  group_id: string;
  movie_tmdb_id: number;
  status: OutingStatus;
  tickets_on_sale_date?: string | null;
  rsvps: OutingRsvpDto[];
  theater_options: TheaterVoteDto[];
  night_options: NightVoteDto[];
  hypes: OutingHypeDto[];
  /** Server-computed average of `hypes` (null when nobody has set hype). */
  group_hype: number | null;
  /** Public, unguessable id for the guest outing page (/o/[slug]). */
  slug: string;
  /** True once an admin has frozen further *guest* writes on the public page. */
  locked: boolean;
}

/** One attendee shown on a public outing page — first name/avatar only, never
 * a handle or email, whether they're a circle member or an anonymous guest. */
export interface PublicAttendeeDto {
  display_name: string;
  avatar_url?: string | null;
  is_guest: boolean;
}

export interface PublicVoteOptionDto {
  option_id: string;
  label: string;
  position: number;
  vote_count: number;
}

/**
 * What an anonymous guest may see about an outing (GET /outings/public/:slug).
 * Deliberately narrower than OutingDto — no handles, emails, ratings, or
 * per-voter identity, matching the same visibility discipline as ratings.
 */
export interface PublicOutingDto {
  outing_id: string;
  slug: string;
  movie: MovieDto;
  status: OutingStatus;
  locked: boolean;
  tickets_on_sale_date?: string | null;
  attendees_going: PublicAttendeeDto[];
  theater_options: PublicVoteOptionDto[];
  night_options: PublicVoteOptionDto[];
  group_hype: number | null;
  /** Present only when the requesting browser already holds a guest cookie
   * for this outing, so the client can render "you already answered" state. */
  my_guest_status?: RsvpStatus | null;
  my_guest_night_vote?: string | null;
}

export interface NotificationDto {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null; // ISO-8601 or null
  created_at: string; // ISO-8601
}

export interface GroupWatchDto {
  group_id: string;
  movie_tmdb_id: number;
  watched_date: string; // YYYY-MM-DD
}

/** One card in a circle's Group Feed: a movie plus circle-scoped aggregates. */
export interface FeedItemDto {
  movie: MovieDto;
  group_average: number | null; // avg of *shared* ratings
  shared_rated_count: number;
  my_rating: number | null;
  comment_count: number;
  co_watched: boolean;
}

export interface ImportResultDto {
  found: number;
  matched: number;
  unmatched: number;
  duplicates_skipped: number;
  unmatched_titles: string[];
  staged_ratings: RatingDto[];
}

// --- Auth wire shapes (Google OAuth → JWT) ---

export interface AuthTokensDto {
  access_token: string;
  refresh_token: string;
  user: AppUserDto;
}
