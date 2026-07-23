/**
 * Wire DTO shapes. Field names are snake_case to match the Flutter client's
 * `@JsonKey(name: ...)` mappings so a single JSON contract serves all clients.
 * The API serializes Prisma rows into exactly these shapes.
 */
import type {
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

// --- Auth (phone-OTP) wire shapes ---

export interface AuthTokensDto {
  access_token: string;
  refresh_token: string;
  user: AppUserDto;
}

/** Response to POST /auth/otp/request. `dev_code` is only present outside prod. */
export interface OtpRequestResultDto {
  challenge_id: string;
  expires_at: string; // ISO-8601
  dev_code?: string;
}

/**
 * Response to POST /auth/otp/verify. Discriminated by `status`:
 * - `authenticated`: known phone → tokens issued.
 * - `needs_profile`: new phone → carry `signup_token` to /auth/complete-profile.
 */
export type OtpVerifyResultDto =
  | ({ status: 'authenticated' } & AuthTokensDto)
  | { status: 'needs_profile'; signup_token: string };
