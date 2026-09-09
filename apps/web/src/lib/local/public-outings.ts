/**
 * Local-mode counterpart to the API's PublicOutingsService, so the guest
 * outing page (/o/[slug]) works identically with no server
 * (NEXT_PUBLIC_DATA_SOURCE=local). There is no real cookie in this mode; the
 * guest token is kept in its own localStorage key per outing, which plays
 * the same role as the httpOnly cookie in the http backend.
 */
import type {
  PublicAttendeeDto,
  PublicOutingDto,
  PublicVoteOptionDto,
  RsvpStatus,
} from '@filmrave/shared';
import { ApiError } from '../client-core';
import { catalogGet } from './catalog';
import type { GuestRsvpRow, OutingRow } from './schema';
import { mutate, table } from './store';

const MAX_GUEST_ROWS_PER_OUTING = 200;

const isBrowser = typeof window !== 'undefined';

function guestTokenKey(slug: string): string {
  return `filmrave.guest.${slug}`;
}

export function readGuestToken(slug: string): string | undefined {
  if (!isBrowser) return undefined;
  return localStorage.getItem(guestTokenKey(slug)) ?? undefined;
}

function writeGuestToken(slug: string, token: string): void {
  if (isBrowser) localStorage.setItem(guestTokenKey(slug), token);
}

function findOuting(slug: string): OutingRow {
  const outing = table('outings').find((o) => o.slug === slug);
  if (!outing) throw new ApiError(404, 'outing not found');
  return outing;
}

function toPublicDto(outing: OutingRow, guestToken?: string): PublicOutingDto {
  const memberAttendees: PublicAttendeeDto[] = table('outing_rsvps')
    .filter((r) => r.outing_id === outing.outing_id && r.status === 'going')
    .map((r) => {
      const user = table('users').find((u) => u.user_id === r.user_id);
      return {
        display_name: user?.display_name ?? 'Member',
        avatar_url: user?.avatar_url ?? null,
        is_guest: false,
      };
    });
  const guestRows = table('guest_rsvps').filter(
    (g) => g.outing_id === outing.outing_id,
  );
  const guestAttendees: PublicAttendeeDto[] = guestRows
    .filter((g) => g.status === 'going')
    .map((g) => ({ display_name: g.display_name, avatar_url: null, is_guest: true }));

  const theaterOptions: PublicVoteOptionDto[] = table('theater_votes')
    .filter((v) => v.outing_id === outing.outing_id)
    .map((v) => ({
      option_id: v.option_id,
      label: v.name,
      position: v.position,
      vote_count: v.voter_ids.length,
    }));
  const nightOptions: PublicVoteOptionDto[] = table('night_votes')
    .filter((v) => v.outing_id === outing.outing_id)
    .map((v) => {
      const guestVotes = guestRows.filter(
        (g) => g.voted_night_option_id === v.option_id,
      ).length;
      return {
        option_id: v.option_id,
        label: v.label,
        position: v.position,
        vote_count: v.voter_ids.length + guestVotes,
      };
    });

  const hypes = table('outing_hypes').filter((h) => h.outing_id === outing.outing_id);
  const groupHype = hypes.length
    ? hypes.reduce((sum, h) => sum + h.score, 0) / hypes.length
    : null;

  const movie = catalogGet(outing.movie_tmdb_id) ?? {
    tmdb_id: outing.movie_tmdb_id,
    title: `Movie #${outing.movie_tmdb_id}`,
    release_date: '',
  };

  const me = guestToken ? guestRows.find((g) => g.guest_token === guestToken) : undefined;

  return {
    outing_id: outing.outing_id,
    slug: outing.slug,
    movie,
    status: outing.status,
    locked: outing.locked_at != null,
    tickets_on_sale_date: outing.tickets_on_sale_date,
    attendees_going: [...memberAttendees, ...guestAttendees],
    theater_options: theaterOptions,
    night_options: nightOptions,
    group_hype: groupHype,
    my_guest_status: me?.status ?? null,
    my_guest_night_vote: me?.voted_night_option_id ?? null,
  };
}

export async function getPublicOuting(slug: string): Promise<PublicOutingDto> {
  const outing = findOuting(slug);
  return toPublicDto(outing, readGuestToken(slug));
}

export async function rsvpPublicOuting(
  slug: string,
  input: { display_name: string; status: RsvpStatus },
): Promise<PublicOutingDto> {
  const outing = findOuting(slug);
  if (outing.locked_at) {
    throw new ApiError(403, 'planning is closed for this outing');
  }
  const displayName = input.display_name.trim();
  if (!displayName) throw new ApiError(400, 'display_name is required');

  const existingToken = readGuestToken(slug);
  mutate((database) => {
    const rows = database.guest_rsvps.filter((g) => g.outing_id === outing.outing_id);
    const existing = existingToken
      ? rows.find((g) => g.guest_token === existingToken)
      : undefined;
    if (existing) {
      existing.display_name = displayName;
      existing.status = input.status;
      return;
    }
    if (rows.length >= MAX_GUEST_ROWS_PER_OUTING) {
      throw new ApiError(403, 'this outing has reached its guest RSVP limit');
    }
    const guest_token = `gt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    writeGuestToken(slug, guest_token);
    const row: GuestRsvpRow = {
      outing_id: outing.outing_id,
      guest_token,
      display_name: displayName,
      status: input.status,
      voted_night_option_id: null,
      claimed_by_user_id: null,
      created_at: new Date().toISOString(),
    };
    database.guest_rsvps.push(row);
  });
  return toPublicDto(outing, readGuestToken(slug));
}

export async function voteNightPublicOuting(
  slug: string,
  optionId: string,
): Promise<PublicOutingDto> {
  const outing = findOuting(slug);
  if (outing.locked_at) {
    throw new ApiError(403, 'planning is closed for this outing');
  }
  const token = readGuestToken(slug);
  if (!token) throw new ApiError(400, 'RSVP before voting');
  mutate((database) => {
    const guest = database.guest_rsvps.find(
      (g) => g.outing_id === outing.outing_id && g.guest_token === token,
    );
    if (!guest) throw new ApiError(400, 'RSVP before voting');
    guest.voted_night_option_id = optionId;
  });
  return toPublicDto(outing, token);
}

/** Marks the guest row as claimed by the now-authenticated local user. Does
 * not create an outing_rsvps/circle_members row — matches the http backend's
 * scope for this step. */
export async function claimPublicOuting(slug: string, userId: string): Promise<void> {
  const outing = findOuting(slug);
  const token = readGuestToken(slug);
  if (!token) throw new ApiError(400, 'no guest session to claim');
  mutate((database) => {
    const guest = database.guest_rsvps.find(
      (g) => g.outing_id === outing.outing_id && g.guest_token === token,
    );
    if (!guest) throw new ApiError(404, 'guest RSVP not found');
    if (guest.claimed_by_user_id && guest.claimed_by_user_id !== userId) {
      throw new ApiError(409, 'this RSVP was already claimed');
    }
    guest.claimed_by_user_id = userId;
  });
}
