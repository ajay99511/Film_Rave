/** Id + token helpers for the local backend. */

/** Collision-resistant id with a readable prefix, e.g. `msg_lt3k9f_a1b2`. */
export function newId(prefix: string): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${time}${rand}`;
}

/**
 * The local access token encodes the authenticated user id. The real API issues
 * signed JWTs; here the "signature" is a static marker — enough to look the user
 * up on `auth.me()` and nothing a demo needs to protect.
 */
const TOKEN_PREFIX = 'localdev.';

export function issueToken(userId: string): string {
  return `${TOKEN_PREFIX}${userId}`;
}

export function userIdFromToken(token: string | null): string | null {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
  return token.slice(TOKEN_PREFIX.length) || null;
}
