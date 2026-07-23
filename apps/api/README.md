# @filmrave/api

Owned FilmRave backend — **NestJS + Prisma + PostgreSQL + Socket.IO**.

## Setup

```bash
cp .env.example .env          # DATABASE_URL, JWT_SECRET, TMDB_API_KEY
pnpm --filter @filmrave/shared build
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
pnpm dev                      # http://localhost:4000/api/v1
```

## Layout

```
src/
├─ main.ts               bootstrap (global prefix /api/v1, ValidationPipe, CORS)
├─ app.module.ts         wires all domain modules
├─ prisma/               PrismaService (global)
├─ common/               CurrentUser decorator, CircleAccessGuard
├─ auth/                 register/login, JWT strategy + guard (argon2)
├─ users/                public profile lookup (invite landing)
├─ circles/             ★ visibility-filtered ratings + group average
├─ ratings/             upsert (1–10 invariant) / list / delete
├─ movies/               TMDB search + cache-through
├─ chat/                 REST history + Socket.IO gateway
├─ outings/              RSVP + theater-vote tie-breaks
├─ friendships/          mirrored request/accept pairs
└─ watchlist/            add / list / remove
```

## Tests

```bash
pnpm test
```

`circles.service.spec.ts` proves unshared ratings are filtered **server-side**.

## Notes

- ESM project (`"type": "module"`); intra-package imports use explicit `.js`.
- The DB is idiomatic snake_case (`@map`); Prisma models are camelCase; the wire
  format is snake_case via `@filmrave/shared` DTOs.
