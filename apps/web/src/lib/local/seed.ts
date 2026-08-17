/**
 * First-run seed data. Mirrors the original CineCircle prototype's cast and
 * catalogue, re-expressed as normalized rows so the local backend can exercise
 * the real aggregation paths (visibility-filtered averages, hype, tie-breaks).
 *
 * `SEED_USERS` is also consumed server-side by the invite-landing SSR page, so
 * it must stay free of any browser-only access.
 */
import type { Database, UserRow } from './schema';

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const daysAgo = (d: number) => hoursAgo(d * 24);

// --- users ---------------------------------------------------------------

const seedUser = (
  user_id: string,
  display_name: string,
  handle: string,
  avatar_color: string,
): UserRow => ({
  user_id,
  display_name,
  handle,
  avatar_color,
  avatar_url: null,
  email: `${handle}@example.com`,
  google_id: `demo-${user_id}`,
});

export const SEED_USERS: UserRow[] = [
  seedUser('u1', 'Ajay', 'ajay', 'bg-blue-600'),
  seedUser('u2', 'Sarah', 'sarah', 'bg-emerald-600'),
  seedUser('u3', 'Mike', 'mike', 'bg-amber-600'),
  seedUser('u4', 'Emma', 'emma', 'bg-purple-600'),
  seedUser('u5', 'David', 'david', 'bg-rose-600'),
];

/** The identity used by the one-click demo sign-in in offline mode. */
export const PRIMARY_USER_ID = 'u1';

const CIRCLE_ID = 'circle-inner-five';

// Movie ids from the catalog, named for readability.
const DUNE = 693134;
const FURIOSA = 786892;
const POOR_THINGS = 792307;
const DEADPOOL = 533535;
const ALIEN = 945961;
const OPPENHEIMER = 872585;
const BATMAN = 414906;
const EEAAO = 545611;

export function buildSeed(): Database {
  return {
    users: SEED_USERS.map((u) => ({ ...u })),

    circles: [
      {
        group_id: CIRCLE_ID,
        name: 'The Inner Five',
        description: 'The original crew — no bad takes allowed.',
        genre_focus: 'Sci-Fi & Action',
        privacy: 'private',
        banner_gradient: 'from-orange-600 via-amber-600 to-red-600',
        created_at: daysAgo(120),
      },
    ],

    // Sharing policies chosen to exercise every branch of the visibility rule:
    // approved (all), selective (listed only), none (nothing shared).
    circle_members: [
      { group_id: CIRCLE_ID, user_id: 'u1', role: 'admin', ratings_shared: 'approved' },
      { group_id: CIRCLE_ID, user_id: 'u2', role: 'member', ratings_shared: 'approved' },
      { group_id: CIRCLE_ID, user_id: 'u3', role: 'member', ratings_shared: 'approved' },
      { group_id: CIRCLE_ID, user_id: 'u4', role: 'member', ratings_shared: 'selective', shared_movie_ids: [DUNE, FURIOSA] },
      { group_id: CIRCLE_ID, user_id: 'u5', role: 'member', ratings_shared: 'none' },
    ],

    // u1 is friends with everyone, so New Circle has invite candidates.
    friendships: [
      { user_id: 'u1', other_id: 'u2', status: 'friends' },
      { user_id: 'u1', other_id: 'u3', status: 'friends' },
      { user_id: 'u1', other_id: 'u4', status: 'friends' },
      { user_id: 'u1', other_id: 'u5', status: 'friends' },
    ],

    ratings: [
      // Dune — broad agreement across the circle.
      { user_id: 'u1', movie_tmdb_id: DUNE, score: 9, rated_at: daysAgo(3), source: 'app' },
      { user_id: 'u2', movie_tmdb_id: DUNE, score: 10, rated_at: daysAgo(4), source: 'app' },
      { user_id: 'u3', movie_tmdb_id: DUNE, score: 9, rated_at: daysAgo(4), source: 'app' },
      // Furiosa — u4 (selective, includes it) + u5 (none, stays hidden).
      { user_id: 'u4', movie_tmdb_id: FURIOSA, score: 8, rated_at: daysAgo(2), source: 'app' },
      { user_id: 'u5', movie_tmdb_id: FURIOSA, score: 8, rated_at: daysAgo(2), source: 'app' },
      // Poor Things — only u1 so far.
      { user_id: 'u1', movie_tmdb_id: POOR_THINGS, score: 8, rated_at: daysAgo(10), source: 'app' },
      // u1's personal shelf (My Rated), including an imported one.
      { user_id: 'u1', movie_tmdb_id: OPPENHEIMER, score: 10, rated_at: daysAgo(30), source: 'app' },
      { user_id: 'u1', movie_tmdb_id: BATMAN, score: 9, rated_at: daysAgo(40), source: 'app' },
      { user_id: 'u1', movie_tmdb_id: EEAAO, score: 10, rated_at: daysAgo(50), source: 'letterboxd' },
    ],

    watchlist: [
      { user_id: 'u1', movie_tmdb_id: 614933, added_at: daysAgo(6) }, // Megalopolis
      { user_id: 'u1', movie_tmdb_id: 426063, added_at: daysAgo(5) }, // Nosferatu
      { user_id: 'u1', movie_tmdb_id: 569094, added_at: daysAgo(1) }, // Spider-Man: Beyond
    ],

    group_watches: [
      { group_id: CIRCLE_ID, movie_tmdb_id: DUNE, watched_date: daysAgo(3).slice(0, 10), logged_by: 'u1', created_at: daysAgo(3) },
    ],

    outings: [
      { outing_id: 'outing-deadpool', group_id: CIRCLE_ID, movie_tmdb_id: DEADPOOL, status: 'planned', tickets_on_sale_date: daysAgo(-7).slice(0, 10) },
      { outing_id: 'outing-alien', group_id: CIRCLE_ID, movie_tmdb_id: ALIEN, status: 'planned', tickets_on_sale_date: null },
    ],

    theater_votes: [
      { outing_id: 'outing-deadpool', option_id: 'th-amc', name: 'AMC IMAX Downtown', position: 0, voter_ids: ['u1', 'u2'] },
      { outing_id: 'outing-deadpool', option_id: 'th-alamo', name: 'Alamo Drafthouse', position: 1, voter_ids: ['u3', 'u5'] },
    ],

    night_votes: [
      { outing_id: 'outing-deadpool', option_id: 'ni-fri', label: 'Friday Night', position: 0, voter_ids: ['u1', 'u2', 'u3'] },
      { outing_id: 'outing-deadpool', option_id: 'ni-sat', label: 'Saturday Matinee', position: 1, voter_ids: ['u5'] },
    ],

    outing_hypes: [
      { outing_id: 'outing-deadpool', user_id: 'u1', score: 9 },
      { outing_id: 'outing-deadpool', user_id: 'u2', score: 10 },
      { outing_id: 'outing-deadpool', user_id: 'u3', score: 8 },
      { outing_id: 'outing-deadpool', user_id: 'u5', score: 9 },
      { outing_id: 'outing-alien', user_id: 'u1', score: 7 },
      { outing_id: 'outing-alien', user_id: 'u4', score: 10 },
    ],

    outing_rsvps: [
      { outing_id: 'outing-deadpool', user_id: 'u1', status: 'going' },
      { outing_id: 'outing-deadpool', user_id: 'u2', status: 'going' },
      { outing_id: 'outing-deadpool', user_id: 'u3', status: 'maybe' },
      { outing_id: 'outing-alien', user_id: 'u1', status: 'going' },
      { outing_id: 'outing-alien', user_id: 'u4', status: 'going' },
    ],

    chat_messages: [
      { message_id: 'msg-1', group_id: CIRCLE_ID, movie_tmdb_id: DUNE, user_id: 'u3', body: 'The visual effects were completely mind-blowing. Especially the sandworm ride!', sent_at: daysAgo(2) },
      { message_id: 'msg-2', group_id: CIRCLE_ID, movie_tmdb_id: DUNE, user_id: 'u1', body: 'Agreed, definitely a theater experience.', sent_at: daysAgo(1) },
    ],

    notifications: [
      { id: 'ntf-1', user_id: 'u1', type: 'rsvp_change', title: 'Sarah is going', body: 'Sarah RSVP’d “going” to Deadpool & Wolverine.', data: { outing_id: 'outing-deadpool' }, read_at: null, created_at: hoursAgo(3) },
      { id: 'ntf-2', user_id: 'u1', type: 'chat_message', title: 'New message in Dune: Part Two', body: 'Mike: The visual effects were completely mind-blowing.', data: { movie_tmdb_id: DUNE }, read_at: null, created_at: daysAgo(2) },
      { id: 'ntf-3', user_id: 'u1', type: 'rating_imported', title: 'Import complete', body: '1 rating imported from Letterboxd.', data: {}, read_at: daysAgo(1), created_at: daysAgo(1) },
    ],

  };
}
