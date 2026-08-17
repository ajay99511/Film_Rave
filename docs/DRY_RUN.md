# FilmRave — Dry Production-Grade Run

The exact, ordered steps to stand up the full stack (Google auth + TMDB + a real
Postgres) and smoke-test it. Two identities of interest:

- **Local** — everything on your machine (Docker Postgres). Do this first.
- **Cloud** — the same app pointed at Neon Postgres by swapping one env var.

Auth is **Google OAuth only** (no phone/OTP). Data is **PostgreSQL via Prisma**;
migrating to the cloud is a connection-string change, nothing more.

---

## 0. One-time prerequisites
- Node ≥ 22, `pnpm`, and Docker Desktop installed.
- From the repo root: `pnpm install`.

## 1. Google OAuth client (your action — ~5 min)
1. Go to **Google Cloud Console → APIs & Services → Credentials**.
2. Configure the **OAuth consent screen** (External, app name "FilmRave", your
   email). While in "Testing", add your own Google account under **Test users**.
3. **Create Credentials → OAuth client ID → Web application.**
4. Under **Authorized JavaScript origins** add:
   - `http://localhost:3000` (local web)
   - your deployed web origin later (e.g. `https://filmrave.vercel.app`)
   (No redirect URI is needed — we use the Google Identity Services button, which
   returns an ID token directly.)
5. Copy the **Client ID** (looks like `xxxx.apps.googleusercontent.com`). You'll
   paste the *same* value into both the API and the web env.

## 2. TMDB key (your action — ~2 min)
- themoviedb.org → account → **Settings → API** → request a **v3 API Key** (the
  short key, **not** the v4 Read Access Token). Keep it handy for `TMDB_API_KEY`.

## 3. API env — `apps/api/.env`
Copy `apps/api/.env.example` → `apps/api/.env` and set:
```
DATABASE_URL="postgresql://filmrave:filmrave@localhost:5432/filmrave?schema=public"
DIRECT_URL="postgresql://filmrave:filmrave@localhost:5432/filmrave?schema=public"
JWT_SECRET=<paste output of: openssl rand -hex 32>
GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
TMDB_API_KEY=<your-tmdb-v3-key>
```
> The server now **refuses to boot** if `DATABASE_URL`, `JWT_SECRET`, or
> `GOOGLE_CLIENT_ID` is missing — that's intentional fail-fast validation.

## 4. Web env — `apps/web/.env.local`
Copy `apps/web/.env.example` → `apps/web/.env.local` and set:
```
NEXT_PUBLIC_DATA_SOURCE=http
NEXT_PUBLIC_API_BASE=http://localhost:4000/api/v1
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<same client id as the API>
```
> Leave `NEXT_PUBLIC_DATA_SOURCE=local` (or omit the file) to run the offline
> demo with a one-click demo user — no Google or DB required.

## 5. Database up + schema + seed
```
docker compose up -d db
pnpm db:migrate      # applies all migrations incl. google_auth
pnpm db:seed         # seed users/circle/outing content
```
> The `google_auth` migration makes `email` NOT NULL and adds `google_id`. On a
> **fresh** DB (the case here) it applies cleanly. If you ever have pre-existing
> rows and hit a NOT NULL error, run `pnpm --filter @filmrave/api exec prisma migrate reset`
> (drops + recreates + reseeds — dev only).

## 6. Run it
```
pnpm api:dev     # http://localhost:4000/api/v1   (and /health)
pnpm web:dev     # http://localhost:3000
```

## 7. Smoke test (the actual dry run)
| Check | Expected |
|---|---|
| `GET http://localhost:4000/health` | `200 {status:'ok', db:true}` |
| Visit `/login`, click **Continue with Google** | Google popup → lands in `/app` as your account (name + Google avatar) |
| TMDB Popular / Upcoming / Search | Real posters load; a viewed movie is cached to the `movies` table |
| Rate + watchlist a movie | Persists; shows on your shelves |
| Circle create (genre/privacy/banner) → edit → delete | Delete asks via the confirm modal |
| Plan Watch Party on an upcoming movie | Creates an outing → RSVP/theater/night/hype voting works |
| Two browsers in one movie room | A chat message appears live in both |
| Hammer login/auth > its limit | `429 Too Many Requests` |
| CSV import (IMDb/Letterboxd) | Ratings import with the right source |

---

## 8. Move to the cloud (Neon) — the "just a connection string" step
1. Create a project at **neon.tech** (free tier is enough). It gives you two
   strings: a **pooled** URL (`...-pooler...`) and a **direct** URL.
2. In `apps/api/.env` (or your host's env vars) set:
   ```
   DATABASE_URL=<neon POOLED url>?sslmode=require
   DIRECT_URL=<neon DIRECT url>?sslmode=require
   ```
3. `pnpm --filter @filmrave/api prisma:deploy` (prod-safe `migrate deploy`) →
   optionally `pnpm db:seed`.
4. Redeploy the API. **Nothing else changes** — same Prisma, same code.

**Why Neon:** scale-to-zero usage pricing (cheap while idle), database
**branching** (a throwaway copy per migration/PR — safe schema changes later),
plain-Postgres connection strings, and first-class Next.js/Prisma support. Local
Docker Postgres and Neon are the same engine, so there is zero code difference.

## 9. Before real users (not required for the dry run)
- Move Google consent screen from "Testing" to "In production".
- Add your prod web origin to the OAuth **Authorized JavaScript origins**.
- Set `CORS_ORIGINS` to your web origin; tighten the chat gateway CORS.
- Point `NEXT_PUBLIC_API_BASE` at the deployed API URL.
