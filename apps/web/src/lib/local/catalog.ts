/**
 * Static movie catalog — the local stand-in for TMDB. `movies.search` and
 * `movies.get` read from here, and the CSV importer matches titles against it.
 * Ids are real TMDB ids so the day we point `movies.*` at the live TMDB proxy,
 * every stored reference (ratings, outings, watchlist) still resolves.
 *
 * This is read-only reference data, so it lives outside the mutable store — the
 * same split the API keeps between its TMDB cache and user-owned rows.
 */
import type { MovieDto } from '@filmrave/shared';

function movie(
  tmdb_id: number,
  title: string,
  release_date: string,
  runtime: number,
  poster_url: string,
  overview: string,
): MovieDto {
  return {
    tmdb_id,
    title,
    release_date,
    overview,
    poster_url,
    runtime,
    year: Number(release_date.slice(0, 4)),
  };
}

const U = (id: string) =>
  `https://images.unsplash.com/${id}?q=80&w=1400&auto=format&fit=crop`;

export const CATALOG: MovieDto[] = [
  movie(
    693134,
    'Dune: Part Two',
    '2024-03-01',
    166,
    U('photo-1534447677768-be436bb09401'),
    'Paul Atreides unites with Chani and the Fremen while on a warpath of revenge against the conspirators who destroyed his family.',
  ),
  movie(
    786892,
    'Furiosa: A Mad Max Saga',
    '2024-05-24',
    148,
    U('photo-1536440136628-849c177e76a1'),
    'The origin story of renegade warrior Furiosa before her encounter and teamup with Mad Max.',
  ),
  movie(
    792307,
    'Poor Things',
    '2023-12-08',
    141,
    U('photo-1518676590629-3dcbd9c5a5c9'),
    'The fantastical evolution of Bella Baxter, a young woman brought back to life by the unorthodox scientist Dr. Godwin Baxter.',
  ),
  movie(
    533535,
    'Deadpool & Wolverine',
    '2024-07-26',
    128,
    U('photo-1626814026160-2237a95fc5a0'),
    'Wolverine is recovering from his injuries when he crosses paths with the loudmouth Deadpool. They team up to defeat a common enemy.',
  ),
  movie(
    945961,
    'Alien: Romulus',
    '2024-08-16',
    119,
    U('photo-1605806616949-1e87b487cb2a'),
    'Young people from a distant world must face the most terrifying life form in the universe.',
  ),
  movie(
    614933,
    'Megalopolis',
    '2024-09-27',
    138,
    U('photo-1486406146926-c627a92ad1ab'),
    'An architect wants to rebuild New York City as a utopia following a devastating disaster.',
  ),
  movie(
    426063,
    'Nosferatu',
    '2024-12-25',
    132,
    U('photo-1505635552518-3448ff116af3'),
    'A gothic tale of obsession between a haunted young woman and the terrifying vampire infatuated with her.',
  ),
  movie(
    569094,
    'Spider-Man: Beyond the Spider-Verse',
    '2025-06-27',
    140,
    U('photo-1534809027769-b00d750a6bac'),
    'Miles Morales returns for the next chapter of the Spider-Verse saga.',
  ),
  movie(
    872585,
    'Oppenheimer',
    '2023-07-21',
    181,
    U('photo-1543332164-6e82f355badc'),
    'The story of J. Robert Oppenheimer and his role in the development of the atomic bomb.',
  ),
  movie(
    414906,
    'The Batman',
    '2022-03-04',
    176,
    U('photo-1509347528160-9a9e33742cdb'),
    'When a sadistic serial killer targets Gotham\'s elite, Batman must investigate the city\'s hidden corruption.',
  ),
  movie(
    545611,
    'Everything Everywhere All at Once',
    '2022-03-25',
    139,
    U('photo-1517604931442-7e0c8ed2963c'),
    'An aging Chinese immigrant is swept up in an insane adventure where she alone can save existence across the multiverse.',
  ),
  movie(
    1022789,
    'Inside Out 2',
    '2024-06-14',
    96,
    U('photo-1489599849927-2ee91cede3ba'),
    'Teenager Riley\'s mind headquarters is undergoing a sudden demolition to make room for new emotions.',
  ),
];

const BY_ID = new Map<number, MovieDto>(CATALOG.map((m) => [m.tmdb_id as number, m]));

export function catalogGet(tmdbId: number): MovieDto | undefined {
  return BY_ID.get(tmdbId);
}

/** Case-insensitive substring match on title, mirroring a naive TMDB search. */
export function catalogSearch(query: string): MovieDto[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return CATALOG.filter((m) => m.title.toLowerCase().includes(q));
}

/** Local stand-in for TMDB "popular": newest releases first, capped at `limit`. */
export function catalogPopular(limit = 25): MovieDto[] {
  return [...CATALOG]
    .sort((a, b) => (b.release_date ?? '').localeCompare(a.release_date ?? ''))
    .slice(0, limit);
}

/** Local stand-in for TMDB "upcoming": releases dated in the future. */
export function catalogUpcoming(): MovieDto[] {
  const today = new Date().toISOString().slice(0, 10);
  return [...CATALOG]
    .filter((m) => (m.release_date ?? '') >= today)
    .sort((a, b) => (a.release_date ?? '').localeCompare(b.release_date ?? ''));
}

/** Loose title match used by the CSV importer (ignores punctuation/case). */
function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const BY_NORM_TITLE = new Map<string, MovieDto>(
  CATALOG.map((m) => [normalizeTitle(m.title), m]),
);

export function catalogMatchByTitle(title: string): MovieDto | undefined {
  return BY_NORM_TITLE.get(normalizeTitle(title));
}
