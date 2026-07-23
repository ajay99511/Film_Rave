/**
 * The persistence engine for the local backend: one JSON document in
 * localStorage holding every table, loaded once into an in-memory cache and
 * written back whole on each mutation. It stands in for Postgres — so the
 * backend services below never touch `localStorage` directly, exactly as they
 * would never touch a driver directly once a real API exists.
 *
 * A `schema_version` gate re-seeds when the shape changes, mirroring a DB
 * migration reset in development.
 */
import type { Database, TableName } from './schema';
import { buildSeed } from './seed';

const STORAGE_KEY = 'filmrave.local.db';
const SCHEMA_VERSION = 1;

interface Persisted {
  schema_version: number;
  data: Database;
}

const isBrowser = typeof window !== 'undefined';

let cache: Database | null = null;

function persist(db: Database): void {
  if (!isBrowser) return;
  const payload: Persisted = { schema_version: SCHEMA_VERSION, data: db };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

/** Loads the DB (seeding on first run or after a schema bump) and caches it. */
function load(): Database {
  if (cache) return cache;

  if (!isBrowser) {
    // SSR has no persistence; hand back a fresh seed so reads still resolve.
    cache = buildSeed();
    return cache;
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Persisted;
      if (parsed.schema_version === SCHEMA_VERSION && parsed.data) {
        cache = parsed.data;
        return cache;
      }
    } catch {
      /* corrupt payload → fall through to reseed */
    }
  }

  cache = buildSeed();
  persist(cache);
  return cache;
}

/** The whole database (cached reference). Do not mutate outside `mutate`. */
export function db(): Database {
  return load();
}

/** A table's rows (cached reference). */
export function table<K extends TableName>(name: K): Database[K] {
  return load()[name];
}

/**
 * Apply a mutation across one or more tables, then persist atomically. Return a
 * value from `fn` to hand it back to the caller (e.g. the row you just inserted).
 */
export function mutate<T>(fn: (database: Database) => T): T {
  const database = load();
  const result = fn(database);
  persist(database);
  return result;
}

/** Wipe local state and reseed — powers the "Reset demo data" / sign-out reset. */
export function resetStore(): void {
  cache = buildSeed();
  persist(cache);
}

export function clearStore(): void {
  cache = null;
  if (isBrowser) localStorage.removeItem(STORAGE_KEY);
}
