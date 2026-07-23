/**
 * Backend-agnostic core: token storage, the error type, and the data-source
 * switch. Both the HTTP and local backends import from here, and so does the
 * session provider. Kept separate from `client.ts` so the backend
 * implementations never import the facade (no cycles).
 */
import type { AppUserDto, AuthTokensDto } from '@filmrave/shared';

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000/api/v1';

/**
 * Which backend the app talks to. `local` (default) persists everything in the
 * browser so the product runs with no server; set `NEXT_PUBLIC_DATA_SOURCE=http`
 * to point every call at the real NestJS API instead.
 */
export const DATA_SOURCE: 'local' | 'http' =
  process.env.NEXT_PUBLIC_DATA_SOURCE === 'http' ? 'http' : 'local';

export type AuthTokens = AuthTokensDto;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const ACCESS_KEY = 'fr.access';
const REFRESH_KEY = 'fr.refresh';
const USER_KEY = 'fr.user';

const isBrowser = typeof window !== 'undefined';

/** The token pair + cached user, persisted in localStorage (client-only). */
export const session = {
  get access(): string | null {
    return isBrowser ? localStorage.getItem(ACCESS_KEY) : null;
  },
  get refresh(): string | null {
    return isBrowser ? localStorage.getItem(REFRESH_KEY) : null;
  },
  get user(): AppUserDto | null {
    if (!isBrowser) return null;
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AppUserDto) : null;
  },
  save(tokens: AuthTokens): void {
    if (!isBrowser) return;
    localStorage.setItem(ACCESS_KEY, tokens.access_token);
    localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
    localStorage.setItem(USER_KEY, JSON.stringify(tokens.user));
  },
  setUser(user: AppUserDto): void {
    if (isBrowser) localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear(): void {
    if (!isBrowser) return;
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
  },
};
