/**
 * Local persistence schema — the browser-side mirror of the Postgres/Prisma
 * tables the API will own. Every row is a normalized, snake_case record so the
 * shapes line up 1:1 with `apps/api/prisma/schema.prisma`. When the real backend
 * lands, each `Table` here maps to one SQL table and the local backend's service
 * functions map to one NestJS service method — nothing about these shapes has to
 * change.
 *
 * Rows reuse the wire DTOs from `@filmrave/shared` wherever the stored shape and
 * the transmitted shape are identical (ratings, watchlist, votes, …). Where the
 * server keeps extra columns that never reach the client (a user's `phone`, an
 * OTP `code`), we extend the DTO with a storage-only type.
 */
import type {
  ChatMessageDto,
  CircleMemberDto,
  GroupWatchDto,
  NightVoteDto,
  NotificationDto,
  OutingHypeDto,
  OutingRsvpDto,
  OutingStatus,
  RatingDto,
  TheaterVoteDto,
  WatchlistEntryDto,
} from '@filmrave/shared';

/** users — includes columns the API never serializes (phone). */
export interface UserRow {
  user_id: string;
  display_name: string;
  handle: string;
  avatar_color: string | null;
  phone: string;
}

/** circles */
export interface CircleRow {
  group_id: string;
  name: string;
  description: string;
  created_at: string;
}

/** circle_members — the join row carrying role + this member's sharing policy. */
export interface CircleMemberRow extends CircleMemberDto {
  group_id: string;
}

/** friendships — one directed row per relationship, exactly the wire shape. */
export interface FriendshipRow {
  user_id: string;
  other_id: string;
  status: 'friends' | 'requested_by_me' | 'requested_by_them' | 'none';
}

/** ratings — a user's score for a movie (unique on user_id + movie_tmdb_id). */
export type RatingRow = RatingDto;

/** watchlist */
export type WatchlistRow = WatchlistEntryDto;

/** group_watches — a circle logged a co-watch of a movie. */
export interface GroupWatchRow extends GroupWatchDto {
  logged_by: string;
  created_at: string;
}

/** outings — the planned/completed cinema trip; child rows live in their own tables. */
export interface OutingRow {
  outing_id: string;
  group_id: string;
  movie_tmdb_id: number;
  status: OutingStatus;
  tickets_on_sale_date: string | null;
}

export type TheaterVoteRow = TheaterVoteDto;
export type NightVoteRow = NightVoteDto;
export type OutingHypeRow = OutingHypeDto;
export type OutingRsvpRow = OutingRsvpDto;

/** chat_messages */
export type ChatMessageRow = ChatMessageDto;

/** notifications */
export type NotificationRow = NotificationDto;

/** otp_challenges — short-lived; the code is the storage-only secret. */
export interface OtpChallengeRow {
  challenge_id: string;
  phone: string;
  code: string;
  expires_at: string;
  consumed: boolean;
}

/**
 * The whole database. Table name → row type. Keep keys identical to the eventual
 * SQL table names so a migration is a rename-free copy.
 */
export interface Database {
  users: UserRow[];
  circles: CircleRow[];
  circle_members: CircleMemberRow[];
  friendships: FriendshipRow[];
  ratings: RatingRow[];
  watchlist: WatchlistRow[];
  group_watches: GroupWatchRow[];
  outings: OutingRow[];
  theater_votes: TheaterVoteRow[];
  night_votes: NightVoteRow[];
  outing_hypes: OutingHypeRow[];
  outing_rsvps: OutingRsvpRow[];
  chat_messages: ChatMessageRow[];
  notifications: NotificationRow[];
  otp_challenges: OtpChallengeRow[];
}

export type TableName = keyof Database;
