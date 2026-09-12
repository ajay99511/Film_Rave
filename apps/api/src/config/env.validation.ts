/**
 * Fail-fast environment validation, run once at boot via ConfigModule's
 * `validate` hook. A missing or placeholder secret stops the server with a
 * clear message instead of surfacing later as a cryptic 500 on the first
 * request that needs it.
 */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const required = ['DATABASE_URL', 'JWT_SECRET', 'GOOGLE_CLIENT_ID'];
  const missing = required.filter((key) => {
    const value = config[key];
    return typeof value !== 'string' || value.trim() === '';
  });
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        `Copy apps/api/.env.example to apps/api/.env and fill them in.`,
    );
  }

  const isProd = config.NODE_ENV === 'production';
  if (isProd && String(config.JWT_SECRET).includes('change-me')) {
    throw new Error(
      'JWT_SECRET is still the placeholder value; set a strong random secret before deploying.',
    );
  }

  if (!config.TMDB_API_KEY) {
    // Non-fatal: the /movies endpoints already return 503 until this is set.
    // This runs synchronously inside ConfigModule's `validate` hook, before
    // Nest's DI container exists — the structured (pino) logger isn't
    // reachable yet, so this writes the same GCP-shaped JSON line by hand
    // rather than falling back to plain console output.
    process.stdout.write(
      `${JSON.stringify({
        severity: 'WARNING',
        message:
          '[env] TMDB_API_KEY is not set — /movies endpoints will return 503 until it is configured.',
      })}\n`,
    );
  }

  return config;
}
