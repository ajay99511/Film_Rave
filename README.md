# FilmRave — Client / Server Monorepo

FilmRave is a privacy-first movie club: friends form **circles**, share ratings
**on their own terms** (all / selective / none per circle), rate films in a
**Movie Room**, chat thread-by-thread, and plan cinema **outings**.

This repository (`FilmRaveCS`) holds the **owned backend** and the **web client**.
The mobile & desktop app is the existing Flutter project at `../FilmRave`.

```
FilmRaveCS/
├─ apps/
│  ├─ api/     @filmrave/api    NestJS + Prisma + PostgreSQL + Socket.IO
│  └─ web/     @filmrave/web    Next.js (App Router) — marketing, invite landing + logged-in app
├─ packages/
│  └─ shared/  @filmrave/shared Typed contract: enums, DTOs, visibility rule
├─ pnpm-workspace.yaml
└─ package.json
```

## Why this stack

| Concern            | Choice                        | Why |
|--------------------|-------------------------------|-----|
| Own the backend    | **NestJS**                    | Structured DI + modules map 1:1 onto the domain; **guards** are the clean, testable home for the rating-visibility rule. |
| Persistence        | **PostgreSQL + Prisma**       | The 13 relational models are join-heavy (circles, memberships, ratings, outings) — a relational store fits far better than NoSQL. |
| Realtime chat      | **Socket.IO gateway**         | First-class in NestJS; supports the client's optimistic-send / rollback pattern (`message:ack` reconciles `tempId`). |
| Auth               | **Phone-OTP + Passport JWT**  | Phone number is the sole identity (no passwords), per product research; a hashed, single-use, short-lived OTP issues stateless access/refresh JWTs. Email+password kept as a legacy path. |
| Web                | **Next.js (App Router)**      | SSR **public marketing + invite-landing** (`/add/:handle`), plus the **logged-in React client** at `/app` (sidebar shell: feed, Movie Room, upcoming outings, watchlist, circles, friends, notifications) wired to the API. |
| Movie catalog      | **TMDB**                      | Models already carry `tmdb_id`. |
| Shared contract    | **`@filmrave/shared`**        | One source of truth for enums, DTO shapes (snake_case wire format), and the **visibility rule**, so the three clients + server can't drift. |

The single most important invariant — **unshared ratings must never reach another
client** — is enforced server-side in `apps/api/src/circles/circles.service.ts`
using the pure functions in `packages/shared/src/visibility.ts` (ported verbatim
from the Flutter app's `visibility.dart`). Both are covered by tests.

## Prerequisites

- Node.js ≥ 22 (`.nvmrc`)
- pnpm ≥ 10
- Docker (for the local Postgres), or a local PostgreSQL 14+

## Getting started

```bash
pnpm install

# 1. Build the shared contract (api & web depend on it)
pnpm --filter @filmrave/shared build

# 2. Start the local database (mirrors prod Postgres 1:1, arrays included)
docker compose up -d db

# 3. Configure the API
cp apps/api/.env.example apps/api/.env      # DATABASE_URL already points at the Docker DB
pnpm db:migrate                             # create schema (also generates the client)
pnpm db:seed                                # "The Inner Five" world: 5 friends, ratings, an outing

# 4. Configure the web client
cp apps/web/.env.example apps/web/.env.local

# 5. Run everything
pnpm dev                                    # api on :4000, web on :3000
```

Or individually: `pnpm api:dev` / `pnpm web:dev`.

### Signing in (local)

Auth is **phone-OTP**. Open <http://localhost:3000/login>, enter a seeded phone
(e.g. `+15550000001` for Ajay), and the code — outside production the API returns
it as `dev_code` and the login screen shows it, so no SMS provider is needed.
Seeded phones: `+15550000001`…`+15550000005` (Ajay, Sarah, Mike, Emma, David).
The logged-in app lives at `/app`. Movie **search** and cache-through catalog
need a `TMDB_API_KEY` in `apps/api/.env`; the seeded catalog works without one.

## Scripts (root)

| Script            | Action |
|-------------------|--------|
| `pnpm dev`        | Run all workspaces in dev (parallel) |
| `pnpm build`      | Build all workspaces |
| `pnpm test`       | Run all test suites (Vitest) |
| `pnpm typecheck`  | Type-check all workspaces |
| `pnpm db:migrate` | Prisma migrate (dev) |
| `pnpm db:seed`    | Seed demo data |

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the data model, the API surface,
and the wire contract.
