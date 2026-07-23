/**
 * Local backend — a faithful, in-browser reimplementation of the NestJS API
 * against the localStorage store. It enforces the same invariants the server
 * does (the rating-visibility rule via `@filmrave/shared`, hype averaging,
 * outing tie-breaks), so screens behave identically whether this or the HTTP
 * backend is wired in. Each method here corresponds to one API route/service.
 */
import {
  isRatingShared,
  isRatingVisible,
  type AppUserDto,
  type AuthTokensDto,
  type ChatMessageDto,
  type CircleDto,
  type CircleMemberDto,
  type FeedItemDto,
  type FriendRelationshipDto,
  type ImportResultDto,
  type NotificationDto,
  type OutingDto,
  type RatingDto,
  type RatingSource,
  type WatchlistEntryDto,
} from '@filmrave/shared';
import { ApiError, session } from '../client-core';
import type { Backend, ChatTransport } from '../backend/types';
import { catalogGet, catalogMatchByTitle, catalogSearch } from './catalog';
import { publishMessage, subscribeMessages } from './chat-bus';
import { parseRatingsCsv } from './csv';
import { issueToken, newId, userIdFromToken } from './ids';
import type {
  CircleMemberRow,
  OutingRow,
  UserRow,
} from './schema';
import { db, mutate, table } from './store';

// --- identity ------------------------------------------------------------

function requireUserId(): string {
  const id = userIdFromToken(session.access);
  if (!id) throw new ApiError(401, 'Not authenticated');
  return id;
}

function toAppUser(u: UserRow): AppUserDto {
  return {
    user_id: u.user_id,
    display_name: u.display_name,
    handle: u.handle,
    avatar_color: u.avatar_color,
  };
}

function findUser(userId: string): UserRow | undefined {
  return table('users').find((u) => u.user_id === userId);
}

function tokensFor(u: UserRow): AuthTokensDto {
  return {
    access_token: issueToken(u.user_id),
    refresh_token: issueToken(u.user_id),
    user: toAppUser(u),
  };
}

// --- circle assembly -----------------------------------------------------

function membersOf(groupId: string): CircleMemberRow[] {
  return table('circle_members').filter((m) => m.group_id === groupId);
}

function toMemberDto(m: CircleMemberRow): CircleMemberDto {
  const dto: CircleMemberDto = {
    user_id: m.user_id,
    role: m.role,
    ratings_shared: m.ratings_shared,
  };
  if (m.ratings_shared === 'selective') dto.shared_movie_ids = m.shared_movie_ids ?? [];
  return dto;
}

function toCircleDto(groupId: string): CircleDto {
  const circle = table('circles').find((c) => c.group_id === groupId);
  if (!circle) throw new ApiError(404, 'Circle not found');
  return {
    group_id: circle.group_id,
    name: circle.name,
    description: circle.description,
    members: membersOf(groupId).map(toMemberDto),
  };
}

function requireMembership(groupId: string, userId: string): CircleMemberRow {
  const m = membersOf(groupId).find((x) => x.user_id === userId);
  if (!m) throw new ApiError(403, 'Not a member of this circle');
  return m;
}

// --- ratings visibility (mirrors CirclesService) -------------------------

/** Ratings authored by circle members for one movie, with their member record. */
function memberRatingsForMovie(groupId: string, tmdbId: number) {
  const members = membersOf(groupId);
  const memberById = new Map(members.map((m) => [m.user_id, m]));
  return table('ratings')
    .filter((r) => r.movie_tmdb_id === tmdbId && memberById.has(r.user_id))
    .map((r) => ({ rating: r, member: memberById.get(r.user_id)! }));
}

function groupAverageFor(groupId: string, tmdbId: number) {
  const shared = memberRatingsForMovie(groupId, tmdbId).filter(({ rating, member }) =>
    isRatingShared(rating, member),
  );
  const count = shared.length;
  const group_average =
    count === 0 ? null : shared.reduce((s, { rating }) => s + rating.score, 0) / count;
  return { shared_rated_count: count, group_average };
}

// --- outing assembly (mirrors OutingsService) ----------------------------

function toOutingDto(o: OutingRow): OutingDto {
  const hypes = table('outing_hypes').filter((h) => h.outing_id === o.outing_id);
  const group_hype =
    hypes.length === 0 ? null : hypes.reduce((s, h) => s + h.score, 0) / hypes.length;
  return {
    outing_id: o.outing_id,
    group_id: o.group_id,
    movie_tmdb_id: o.movie_tmdb_id,
    status: o.status,
    tickets_on_sale_date: o.tickets_on_sale_date,
    rsvps: table('outing_rsvps').filter((r) => r.outing_id === o.outing_id),
    theater_options: table('theater_votes')
      .filter((t) => t.outing_id === o.outing_id)
      .sort((a, b) => a.position - b.position),
    night_options: table('night_votes')
      .filter((n) => n.outing_id === o.outing_id)
      .sort((a, b) => a.position - b.position),
    hypes,
    group_hype,
  };
}

function requireOuting(outingId: string): OutingRow {
  const o = table('outings').find((x) => x.outing_id === outingId);
  if (!o) throw new ApiError(404, 'Outing not found');
  return o;
}

/** Toggle `userId` in a vote row's voter list (theater or night). */
function toggleVoter(voterIds: string[], userId: string): string[] {
  return voterIds.includes(userId)
    ? voterIds.filter((id) => id !== userId)
    : [...voterIds, userId];
}

// --- chat transport ------------------------------------------------------

const chat: ChatTransport = {
  async history(circleId, tmdbId) {
    return table('chat_messages')
      .filter((m) => m.group_id === circleId && m.movie_tmdb_id === tmdbId)
      .sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  },
  open(circleId, movieTmdbId, handlers) {
    const unsub = subscribeMessages((m) => {
      if (m.group_id === circleId && m.movie_tmdb_id === movieTmdbId) handlers.onMessage(m);
    });
    // Local transport is always "connected".
    handlers.onStatus(true);
    return {
      send: (body) => {
        const text = body.trim();
        if (!text) return;
        const userId = requireUserId();
        const message: ChatMessageDto = {
          message_id: newId('msg'),
          group_id: circleId,
          movie_tmdb_id: movieTmdbId,
          user_id: userId,
          body: text,
          sent_at: new Date().toISOString(),
        };
        mutate((database) => database.chat_messages.push(message));
        publishMessage(message);
      },
      close: unsub,
    };
  },
};

// --- backend -------------------------------------------------------------

export const localBackend: Backend = {
  auth: {
    async requestOtp(phone) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const challenge_id = newId('otp');
      const expires_at = new Date(Date.now() + 10 * 60_000).toISOString();
      mutate((database) => {
        database.otp_challenges.push({ challenge_id, phone, code, expires_at, consumed: false });
      });
      // `dev_code` is surfaced by the login screen — no SMS provider locally.
      return { challenge_id, expires_at, dev_code: code };
    },

    async verifyOtp(phone, code) {
      const challenge = [...table('otp_challenges')]
        .reverse()
        .find((c) => c.phone === phone && !c.consumed);
      if (!challenge) throw new ApiError(400, 'Request a code first');
      if (challenge.code !== code) throw new ApiError(400, 'Invalid code');
      if (new Date(challenge.expires_at).getTime() < Date.now())
        throw new ApiError(400, 'Code expired');

      mutate((database) => {
        const row = database.otp_challenges.find((c) => c.challenge_id === challenge.challenge_id);
        if (row) row.consumed = true;
      });

      const user = table('users').find((u) => u.phone === phone);
      if (user) return { status: 'authenticated', ...tokensFor(user) };
      return { status: 'needs_profile', signup_token: `signup.${phone}` };
    },

    async completeProfile(signupToken, handle, displayName) {
      const phone = signupToken.startsWith('signup.') ? signupToken.slice('signup.'.length) : '';
      if (!phone) throw new ApiError(400, 'Invalid signup token');
      const cleanHandle = handle.trim().toLowerCase();
      if (table('users').some((u) => u.handle === cleanHandle))
        throw new ApiError(409, 'Handle already taken');

      const user: UserRow = {
        user_id: newId('usr'),
        display_name: displayName.trim() || cleanHandle,
        handle: cleanHandle,
        avatar_color: null,
        phone,
      };
      mutate((database) => database.users.push(user));
      return tokensFor(user);
    },

    async me() {
      const user = findUser(requireUserId());
      if (!user) throw new ApiError(401, 'Session user no longer exists');
      return toAppUser(user);
    },
  },

  circles: {
    async list() {
      const me = requireUserId();
      const myGroupIds = new Set(
        table('circle_members').filter((m) => m.user_id === me).map((m) => m.group_id),
      );
      return table('circles')
        .filter((c) => myGroupIds.has(c.group_id))
        .map((c) => toCircleDto(c.group_id));
    },

    async get(id) {
      return toCircleDto(id);
    },

    async members(id) {
      return membersOf(id)
        .map((m) => findUser(m.user_id))
        .filter((u): u is UserRow => !!u)
        .map(toAppUser);
    },

    async create(name, description, memberIds) {
      const me = requireUserId();
      const group_id = newId('circle');
      mutate((database) => {
        database.circles.push({
          group_id,
          name: name.trim(),
          description,
          created_at: new Date().toISOString(),
        });
        database.circle_members.push({
          group_id,
          user_id: me,
          role: 'admin',
          ratings_shared: 'approved',
        });
        for (const uid of memberIds) {
          if (uid === me) continue;
          database.circle_members.push({
            group_id,
            user_id: uid,
            role: 'member',
            ratings_shared: 'approved',
          });
        }
      });
      return toCircleDto(group_id);
    },

    async updateSharing(id, ratingsShared, sharedMovieIds = []) {
      const me = requireUserId();
      requireMembership(id, me);
      mutate((database) => {
        const row = database.circle_members.find(
          (m) => m.group_id === id && m.user_id === me,
        );
        if (row) {
          row.ratings_shared = ratingsShared;
          if (ratingsShared === 'selective') row.shared_movie_ids = sharedMovieIds;
          else delete row.shared_movie_ids;
        }
      });
      return toCircleDto(id);
    },

    async feed(id) {
      const me = requireUserId();
      const members = membersOf(id);
      const memberIds = new Set(members.map((m) => m.user_id));

      // Movies with any circle activity: a member rated it, or it was co-watched.
      const ratedIds = table('ratings')
        .filter((r) => memberIds.has(r.user_id))
        .map((r) => r.movie_tmdb_id);
      const watchedIds = table('group_watches')
        .filter((w) => w.group_id === id)
        .map((w) => w.movie_tmdb_id);
      const movieIds = [...new Set([...ratedIds, ...watchedIds])];

      const coWatched = new Set(watchedIds);
      const items: FeedItemDto[] = [];
      for (const tmdbId of movieIds) {
        const movie = catalogGet(tmdbId);
        if (!movie) continue;
        const { shared_rated_count, group_average } = groupAverageFor(id, tmdbId);
        const mine = table('ratings').find(
          (r) => r.user_id === me && r.movie_tmdb_id === tmdbId,
        );
        const comment_count = table('chat_messages').filter(
          (m) => m.group_id === id && m.movie_tmdb_id === tmdbId,
        ).length;
        items.push({
          movie,
          group_average,
          shared_rated_count,
          my_rating: mine?.score ?? null,
          comment_count,
          co_watched: coWatched.has(tmdbId),
        });
      }
      // Most-agreed first (shared count, then average), nulls last.
      return items.sort(
        (a, b) =>
          b.shared_rated_count - a.shared_rated_count ||
          (b.group_average ?? -1) - (a.group_average ?? -1) ||
          a.movie.title.localeCompare(b.movie.title),
      );
    },

    async movieRatings(id, tmdbId) {
      const me = requireUserId();
      // Self-inclusive view: I always see my own; others only if shared.
      return memberRatingsForMovie(id, tmdbId)
        .filter(({ rating, member }) => isRatingVisible(rating, member, me))
        .map(({ rating }) => rating);
    },

    async groupAverage(id, tmdbId) {
      return groupAverageFor(id, tmdbId);
    },

    chat: (id, tmdbId) => chat.history(id, tmdbId),

    async addGroupWatch(id, movieTmdbId, watchedDate) {
      const me = requireUserId();
      requireMembership(id, me);
      const date = (watchedDate ?? new Date().toISOString()).slice(0, 10);
      mutate((database) => {
        const exists = database.group_watches.some(
          (w) => w.group_id === id && w.movie_tmdb_id === movieTmdbId,
        );
        if (!exists) {
          database.group_watches.push({
            group_id: id,
            movie_tmdb_id: movieTmdbId,
            watched_date: date,
            logged_by: me,
            created_at: new Date().toISOString(),
          });
        }
      });
    },
  },

  ratings: {
    async mine() {
      const me = requireUserId();
      return table('ratings')
        .filter((r) => r.user_id === me)
        .sort((a, b) => b.rated_at.localeCompare(a.rated_at));
    },

    async upsert(movieTmdbId, score, source: RatingSource = 'app') {
      const me = requireUserId();
      const row: RatingDto = {
        user_id: me,
        movie_tmdb_id: movieTmdbId,
        score,
        rated_at: new Date().toISOString(),
        source,
      };
      mutate((database) => {
        const existing = database.ratings.find(
          (r) => r.user_id === me && r.movie_tmdb_id === movieTmdbId,
        );
        if (existing) {
          existing.score = score;
          existing.rated_at = row.rated_at;
          existing.source = source;
        } else {
          database.ratings.push(row);
        }
      });
      return row;
    },

    async remove(tmdbId) {
      const me = requireUserId();
      mutate((database) => {
        database.ratings = database.ratings.filter(
          (r) => !(r.user_id === me && r.movie_tmdb_id === tmdbId),
        );
      });
    },
  },

  movies: {
    async search(q) {
      return catalogSearch(q);
    },
    async get(tmdbId) {
      const m = catalogGet(tmdbId);
      if (!m) throw new ApiError(404, 'Movie not found');
      return m;
    },
  },

  watchlist: {
    async list() {
      const me = requireUserId();
      return table('watchlist')
        .filter((w) => w.user_id === me)
        .sort((a, b) => b.added_at.localeCompare(a.added_at));
    },
    async add(movieTmdbId) {
      const me = requireUserId();
      const entry: WatchlistEntryDto = {
        user_id: me,
        movie_tmdb_id: movieTmdbId,
        added_at: new Date().toISOString(),
      };
      mutate((database) => {
        if (!database.watchlist.some((w) => w.user_id === me && w.movie_tmdb_id === movieTmdbId))
          database.watchlist.push(entry);
      });
      return entry;
    },
    async remove(tmdbId) {
      const me = requireUserId();
      mutate((database) => {
        database.watchlist = database.watchlist.filter(
          (w) => !(w.user_id === me && w.movie_tmdb_id === tmdbId),
        );
      });
    },
  },

  outings: {
    async list(circleId) {
      return table('outings')
        .filter((o) => o.group_id === circleId)
        .map(toOutingDto);
    },

    async rsvp(outingId, status) {
      const me = requireUserId();
      const outing = requireOuting(outingId);
      mutate((database) => {
        const existing = database.outing_rsvps.find(
          (r) => r.outing_id === outingId && r.user_id === me,
        );
        if (existing) existing.status = status;
        else database.outing_rsvps.push({ outing_id: outingId, user_id: me, status });
        emitRsvpNotifications(database, outing, me, status);
      });
      return toOutingDto(outing);
    },

    async voteTheater(outingId, optionId) {
      const me = requireUserId();
      requireOuting(outingId);
      mutate((database) => {
        const row = database.theater_votes.find(
          (t) => t.outing_id === outingId && t.option_id === optionId,
        );
        if (row) row.voter_ids = toggleVoter(row.voter_ids, me);
      });
      return toOutingDto(requireOuting(outingId));
    },

    async voteNight(outingId, optionId) {
      const me = requireUserId();
      requireOuting(outingId);
      mutate((database) => {
        const row = database.night_votes.find(
          (n) => n.outing_id === outingId && n.option_id === optionId,
        );
        if (row) row.voter_ids = toggleVoter(row.voter_ids, me);
      });
      return toOutingDto(requireOuting(outingId));
    },

    async setHype(outingId, score) {
      const me = requireUserId();
      requireOuting(outingId);
      mutate((database) => {
        database.outing_hypes = database.outing_hypes.filter(
          (h) => !(h.outing_id === outingId && h.user_id === me),
        );
        if (score > 0) database.outing_hypes.push({ outing_id: outingId, user_id: me, score });
      });
      return toOutingDto(requireOuting(outingId));
    },
  },

  friends: {
    async list() {
      const me = requireUserId();
      return table('friendships').filter(
        (f) => f.user_id === me || f.other_id === me,
      ) as FriendRelationshipDto[];
    },

    async request(otherId) {
      const me = requireUserId();
      if (otherId === me) throw new ApiError(400, 'Cannot friend yourself');
      mutate((database) => {
        const existing = database.friendships.find(
          (f) =>
            (f.user_id === me && f.other_id === otherId) ||
            (f.user_id === otherId && f.other_id === me),
        );
        // Demo semantics: seeded contacts accept instantly (mutual friends).
        if (existing) existing.status = 'friends';
        else database.friendships.push({ user_id: me, other_id: otherId, status: 'friends' });
      });
    },

    async accept(otherId) {
      const me = requireUserId();
      mutate((database) => {
        const existing = database.friendships.find(
          (f) =>
            (f.user_id === me && f.other_id === otherId) ||
            (f.user_id === otherId && f.other_id === me),
        );
        if (existing) existing.status = 'friends';
      });
    },

    async search(q) {
      const me = requireUserId();
      const needle = q.trim().toLowerCase().replace(/^@/, '');
      if (!needle) return [];
      return table('users')
        .filter(
          (u) =>
            u.user_id !== me &&
            (u.handle.toLowerCase().includes(needle) ||
              u.display_name.toLowerCase().includes(needle)),
        )
        .map(toAppUser);
    },
  },

  imports: {
    async ratings(csv, format = 'auto') {
      const me = requireUserId();
      const parsed = parseRatingsCsv(csv, format);
      const staged: RatingDto[] = [];
      const unmatched_titles: string[] = [];
      let duplicates_skipped = 0;

      mutate((database) => {
        for (const row of parsed) {
          const movie = catalogMatchByTitle(row.title);
          if (!movie || movie.tmdb_id == null) {
            unmatched_titles.push(row.title);
            continue;
          }
          const tmdbId = movie.tmdb_id;
          if (database.ratings.some((r) => r.user_id === me && r.movie_tmdb_id === tmdbId)) {
            duplicates_skipped++;
            continue;
          }
          const rating: RatingDto = {
            user_id: me,
            movie_tmdb_id: tmdbId,
            score: row.score,
            rated_at: new Date().toISOString(),
            source: row.source,
          };
          database.ratings.push(rating);
          staged.push(rating);
        }
        if (staged.length > 0) {
          database.notifications.unshift({
            id: newId('ntf'),
            user_id: me,
            type: 'rating_imported',
            title: 'Import complete',
            body: `${staged.length} rating${staged.length === 1 ? '' : 's'} imported.`,
            data: {},
            read_at: null,
            created_at: new Date().toISOString(),
          });
        }
      });

      return {
        found: parsed.length,
        matched: staged.length,
        unmatched: unmatched_titles.length,
        duplicates_skipped,
        unmatched_titles,
        staged_ratings: staged,
      } satisfies ImportResultDto;
    },
  },

  notifications: {
    async list() {
      const me = requireUserId();
      return table('notifications')
        .filter((n) => n.user_id === me)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    },

    async unreadCount() {
      const me = requireUserId();
      const count = table('notifications').filter(
        (n) => n.user_id === me && n.read_at === null,
      ).length;
      return { count };
    },

    async markRead(id) {
      const me = requireUserId();
      let updated: NotificationDto | undefined;
      mutate((database) => {
        const row = database.notifications.find((n) => n.id === id && n.user_id === me);
        if (row) {
          row.read_at ??= new Date().toISOString();
          updated = row;
        }
      });
      if (!updated) throw new ApiError(404, 'Notification not found');
      return updated;
    },

    async markAllRead() {
      const me = requireUserId();
      let updated = 0;
      mutate((database) => {
        for (const n of database.notifications) {
          if (n.user_id === me && n.read_at === null) {
            n.read_at = new Date().toISOString();
            updated++;
          }
        }
      });
      return { updated };
    },
  },

  chat,
};

/** Notify the rest of the circle when someone RSVPs (mirrors the API hook). */
function emitRsvpNotifications(
  database: ReturnType<typeof db>,
  outing: OutingRow,
  actorId: string,
  status: string,
): void {
  const actor = database.users.find((u) => u.user_id === actorId);
  const movie = catalogGet(outing.movie_tmdb_id);
  const label = status === 'cant_go' ? 'can’t go' : status;
  for (const m of database.circle_members.filter((cm) => cm.group_id === outing.group_id)) {
    if (m.user_id === actorId) continue;
    database.notifications.unshift({
      id: newId('ntf'),
      user_id: m.user_id,
      type: 'rsvp_change',
      title: `${actor?.display_name ?? 'Someone'} RSVP’d`,
      body: `${actor?.display_name ?? 'A member'} is ${label} to ${movie?.title ?? 'an outing'}.`,
      data: { outing_id: outing.outing_id },
      read_at: null,
      created_at: new Date().toISOString(),
    });
  }
}
