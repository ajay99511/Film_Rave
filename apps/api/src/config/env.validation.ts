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
  const missing = required.filter(
    (key) => !config[key] || String(config[key]).trim() === '',
  );
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
    // eslint-disable-next-line no-console
    console.warn(
      '[env] TMDB_API_KEY is not set — /movies endpoints will return 503 until it is configured.',
    );
  }

  return config;
}
