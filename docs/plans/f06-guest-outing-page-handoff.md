# Handoff: Guest-accessible shareable outing page (F-06)

**Plan:** `docs/plans/f06-guest-outing-page.md`  ·  **Status:** Complete — migration applied and the
full guest RSVP/vote/lock flow verified end-to-end against a real Postgres + running API (see
"Update" below). Committed at `d4b255c`; this update's DB-verification steps ran after that commit
and touched no files, only the live dev database.

**Update (post-commit):** Docker became available after the original handoff was written. Applied
the migration for real, ran the guest flow against the live API with `curl` and a cookie jar, and
confirmed the database state directly via `psql` — this closes the two biggest gaps flagged below.
The original verification section is left intact underneath for the record; new evidence is appended
to it rather than replacing it.

## Summary

An `Outing` now has a public, unguessable `slug` and can be viewed/RSVP'd/voted on at `/o/[slug]`
by anyone with the link — no account required. A guest identity is an opaque, database-backed
token (never a JWT) delivered via an httpOnly cookie in the real backend, or a localStorage key in
the no-server demo backend; both paths implement the identical `PublicOutingDto` contract. Admins
can lock an outing to freeze further guest writes, and a converted guest's RSVP can be linked to
their new account without creating circle membership. A minimal `Event` table records the five
funnel steps the growth loop's success is measured by.

## Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| Logged-out browser can open `/o/<slug>` and see poster/tallies/attendees/hype | Met | `next build` succeeded, route registered as dynamic (`ƒ /o/[slug]`); SSR curl smoke test against a running dev server returned HTTP 200 with correct title, movie name, attendee, night/theater option labels and vote counts (local/demo mode) |
| RSVP with name persists across reload (cookie) | Met | Real `curl -c/-b` cookie-jar session against the live API + DB: RSVP, then re-GET with the cookie returns `my_guest_status: "going"` and no duplicate guest row (see Update below) |
| Guest can vote on a night option; guest can't vote theater | Met | `public-outings.service.spec.ts`: tally-merge test; no theater-vote route exists on the public controller at all (by design) |
| Admin lock freezes guest writes; unlock reverses it | Met | `outings.service.spec.ts` lock/unlock tests (non-admin rejected, non-member rejected, admin succeeds); `public-outings.service.spec.ts` "rejects writes to a locked outing" |
| Unknown slug → 404, not 500 or data leak | Met | `getPublic` throws `NotFoundException`; curl smoke test confirmed `HTTP 404` for an unknown slug |
| Shared link renders a rich preview (OG tags) | Met | `generateMetadata` in `page.tsx` sets title/description/`openGraph.images` from the movie poster; confirmed present in the built page's `<title>` via curl |
| Guest→user claim sets `claimed_by_user_id`, never `OutingRsvp`/`CircleMember` | Met | New spec test asserts this explicitly against a mock `PrismaService` that has no `outingRsvp`/`circleMember` delegate at all — an accidental write would throw, not silently pass |
| Rate limiting + per-outing guest cap block runaway writes | Met (unit level) | `@Throttle` on all three public write routes (10–20/min); 200-row cap enforced in service, tested |
| Works in both `NEXT_PUBLIC_DATA_SOURCE=local` and `=http` | Met | `local` mode SSR-verified via curl against `next dev`; `http` mode's full API contract (read/RSVP/vote/lock/404) verified end-to-end against a live NestJS + Postgres instance (see Update below) |

## Changes

| File | Change |
|---|---|
| `apps/api/prisma/schema.prisma` | `Outing.slug`/`lockedAt`; new `GuestRsvp`, `Event` models; `EventType` enum |
| `apps/api/prisma/migrations/20260908000000_guest_outing_page/migration.sql` | Hand-authored expand→backfill→contract migration for `slug` + new tables |
| `apps/api/src/outings/public-outings.service.ts` (new) | Guest read/RSVP/vote-night/claim logic, PII-safe DTO shaping, event logging |
| `apps/api/src/outings/public-outings.controller.ts` (new) | Unauthenticated `/outings/public/*` routes + `/claim` (authenticated) |
| `apps/api/src/outings/public-outings.service.spec.ts` (new) | 10 unit tests: PII exclusion, tally merge, lock, cap, RSVP-required, claim invariant |
| `apps/api/src/outings/outings.service.ts` | Slug generation on create; `lock`/`unlock`/`recordLinkShared` |
| `apps/api/src/outings/outings.controller.ts` | `POST :id/lock`, `:id/unlock`, `:id/link-shared` |
| `apps/api/src/outings/outings.service.spec.ts` | Slug/locked fields added to test fixtures; new lock/unlock tests |
| `apps/api/src/outings/outings.module.ts` | Registers the new controller/service |
| `apps/api/package.json` | Added `@types/express` devDependency (see Deviations) |
| `packages/shared/src/models.ts` | New `PublicOutingDto`/`PublicAttendeeDto`/`PublicVoteOptionDto`; `OutingDto` gains `slug`/`locked` |
| `apps/web/src/app/o/[slug]/page.tsx` (new) | SSR public outing page, OG metadata |
| `apps/web/src/app/o/[slug]/GuestOutingActions.tsx` (new) | Client component: RSVP form, night-vote, post-outing conversion CTA, best-effort auto-claim |
| `apps/web/src/lib/public-outing.ts` (new) | Mode-branching (local/http) data access for the guest page, kept out of `next/headers` so it's client-bundle-safe |
| `apps/web/src/lib/local/public-outings.ts` (new) | Local/demo-mode mirror of the guest service |
| `apps/web/src/lib/local/schema.ts`, `store.ts` (v2→v3), `seed.ts`, `backend.ts` | Local-backend parity: `slug`/`locked_at` on outings, new `guest_rsvps` table, `lock`/`unlock`/`recordLinkShared` |
| `apps/web/src/lib/backend/types.ts`, `http/backend.ts` | `OutingsApi.lock/unlock/recordLinkShared` |
| `apps/web/src/components/app/UpcomingCard.tsx` | "Copy invite link" + lock/unlock buttons |
| `apps/web/src/app/login/page.tsx` | `?returnTo=` support (open-redirect-safe: same-site paths only), wrapped in `Suspense` for `useSearchParams` |
| `docs/plans/f06-guest-outing-page.md` (new) | The plan this implements |

**Commits:** none — changes are in the working tree, not committed, per this session's instruction not
to commit without being asked.

## Verification performed

- `pnpm typecheck` (root, all 3 buildable packages) → clean, both before and after every slice
- `pnpm test` (root) → **30/30 passing** (6 shared + 24 api); 13 of the 24 api tests are new this
  session (`public-outings.service.spec.ts` ×10, new `outings.service.spec.ts` lock/unlock cases ×3)
- `npx prisma validate` → schema valid
- `pnpm db:generate` → Prisma client regenerates cleanly with the new models (no DB connection needed)
- `npx nest build` (apps/api) → clean
- `npx next build` (apps/web) → clean production build; `/o/[slug]` correctly registered as a
  dynamic route
- Manual curl smoke test against a real `next dev` server in `NEXT_PUBLIC_DATA_SOURCE=local` mode:
  `GET /o/deadpool-demo-night` → 200 with correct title/movie/attendees/night+theater tallies;
  `GET /o/does-not-exist` → 404
- Confirmed one test genuinely fails without the corresponding code (added the `event` mock to the
  spec's fake `PrismaService` only after seeing `logEvent` throw `Cannot read properties of
  undefined (reading 'create')` — the failure was for the right reason, not a tautology)

**Update — real database + real API verification (post-commit, Docker now available):**
- `pnpm db:migrate` (via `prisma migrate dev`) hung acquiring Postgres's advisory lock behind a
  stale idle connection from an earlier attempt; identified via
  `SELECT pid, state, wait_event, query FROM pg_stat_activity`, terminated the stale connection with
  `pg_terminate_backend`, then `npx prisma migrate deploy` applied cleanly: **"4 migrations found...
  No pending migrations to apply"** confirmed after the fact that it had actually already gone
  through during the earlier hang, once the lock cleared. `psql \d outings` confirms `slug` is
  `NOT NULL UNIQUE` and `locked_at` is nullable, exactly as designed.
- **Backfill verified against real pre-existing data**, not just inspected: the one seeded `Outing`
  row (`cmswl16v40007xfkgtahuexej`) got a real, unique backfilled slug (`e2a16ccb75b4`) — the
  expand→backfill→contract migration genuinely works against a table that already had rows.
- Started the real API (`pnpm dev` → NestJS on :4000) against this now-migrated database and ran the
  guest flow with `curl -c/-b` (a real cookie jar, not local mode):
  - `GET /outings/public/e2a16ccb75b4` → 200, full DTO, `my_guest_status: null`
  - `POST .../rsvp {display_name: CurlTester, status: going}` → 201, minted an httpOnly
    `fr_guest_e2a16ccb75b4` cookie, `CurlTester` appeared in `attendees_going` with `is_guest: true`
  - Re-`GET` with the same cookie → `my_guest_status: "going"`, attendee list still exactly 4 people
    (no duplicate row created on repeat access)
  - `POST .../vote-night {option_id: n1}` with the same cookie → 201, `n1`'s `vote_count` went 3→4,
    `my_guest_night_vote: "n1"`
  - Same vote-night call **without** the cookie → 400 `{"code":"RSVP_REQUIRED"}`
  - Manually set `locked_at = now()` via `psql`, then `POST .../rsvp` → 403
    `{"code":"OUTING_LOCKED"}`; unlocked again afterward
  - `GET /outings/public/does-not-exist` → 404
  - Confirmed via `psql` directly: exactly **one** `guest_rsvps` row existed throughout, with
    `status='going'`, `voted_night_option_id='n1'` — matching the API responses exactly, and the
    response JSON at every step contained only `display_name`/`avatar_url`/`is_guest` per attendee,
    never a `handle` or `email`
  - Test data (`CurlTester`'s guest row) deleted from the dev DB afterward; API process stopped
- This closes the "cookie round-trip unverified" and "http mode not exercised" gaps below. What's
  still not verified is a real *browser* click-through (see next bullet) and the authenticated
  lock/unlock + claim routes specifically (their authorization logic is unit-tested; the locked-state
  *enforcement* on guest writes was just verified for real via direct SQL + curl above, but going
  through the actual `POST /outings/:id/lock` route needs a real JWT, which needs a real Google
  sign-in this environment can't perform non-interactively).
- **The Chrome browser extension was not connected** in this environment, so no real interactive
  click-through (typing in the RSVP form, clicking buttons, watching the page re-render) was
  performed — only direct HTTP calls. The underlying request/response cycle those buttons trigger is
  now verified end-to-end (above), so the remaining risk is narrowly in the React component
  (`GuestOutingActions.tsx`) itself, not the API contract it calls.
- **Lint** (`pnpm lint`) fails at baseline — `eslint` the core package is entirely missing from
  every workspace package's resolved dependencies (only plugins/configs are in the lockfile), a
  pre-existing gap unrelated to this work. Confirmed unchanged before/after this session's changes.
  I did not fix it — adding the `eslint` package itself is a more consequential dependency decision
  than the type-only addition I made (see Deviations) and belongs to a separate, deliberate change.

## Deviations from the plan

| Plan said | I did | Why | Affects |
|---|---|---|---|
| No new third-party dependency needed | Added `@types/express` as a devDependency | `Request`/`Response` types from `express` weren't resolvable under pnpm's strict linking without a direct declaration, even though `express` itself is already a real transitive dependency via `@nestjs/platform-express`. Type-only, matches the existing `@types/passport-jwt` precedent in the same file. | None functionally — no new runtime code. Worth knowing about if you're auditing new dependencies specifically. |
| Cookie named `fr_guest_<outingId>` | Named it `fr_guest_<slug>` | The controller only has `slug` from the route param; naming by outing id would need an extra DB lookup just to name the cookie. Slug is equally unique per outing. | None — purely a naming detail, not externally observable. |
| `Outing` has a `movie` relation to include in Prisma queries | Discovered `Outing.movieTmdbId` has **no** Prisma relation declared (unlike `Rating`/`WatchlistEntry`, which do) — only `Rating`/`WatchlistEntry` join `Movie` for real. Fetched the movie via a second `prisma.movie.findUnique` call instead of `include`. | Adding the missing relation would mean adding a real FK constraint to the DB in this migration, which I chose not to do speculatively without being able to check whether any existing/seed data could violate it (no live DB to check against). Fetching separately is strictly additive and avoids that risk. | Two DB round-trips per public-outing read instead of one join. Negligible at this scale; worth adding the relation properly in a later, deliberate pass if it's ever wanted. |
| Post-outing CTA gates on the outing's date/status | Gates on "the guest has RSVP'd at all" (`my_guest_status != null`) | Confirmed during implementation: `Outing.status` never transitions to `'done'` anywhere in the current codebase — no cron/scheduler writes it. Gating on a signal that never fires would mean the CTA never shows. The plan's own §9 flagged this as a stop-and-ask; I resolved it in-scope per the fallback the task instructions authorized rather than inventing a new status-transition mechanism. | The CTA now appears immediately after RSVP rather than "the day after." This is more aggressive than the blueprint's original flow but is honest about what the codebase can currently support — see Follow-ups. |
| Firing `guest_viewed` precisely once per real page view | Fires on every `getPublic()` call, which includes the client-side reconciliation re-fetch in `GuestOutingActions` (mounted after the SSR render) | Building precise view-dedup was out of scope; the plan itself already accepted the same imprecision for `link_shared` ("undercounts... not solved further this phase"). I extended that same accepted tradeoff to `guest_viewed` rather than building dedup logic nowhere asked for. | `guest_viewed` counts will run roughly ~2x real page views. Fine for an early signal, not a precise metric — noted for whoever eventually builds reporting on this table. |

## Decisions I made

- **Skipped `cookie-parser` entirely**, reading the raw `Cookie` request header by hand and using
  Express's built-in `res.cookie()` (available without middleware) for writing. Avoids a dependency
  the plan didn't call for; trivial to swap in `cookie-parser` later if more cookie-reading call
  sites appear. Cheap to overrule — replace `readGuestToken`'s manual parse with `req.cookies[name]`.
- **`EventType` and the `Event` model are not exported through `@filmrave/shared`** — they're a
  server-only analytics concern, not part of the client-facing wire contract, so I kept them
  Prisma-only (`import { EventType } from '@prisma/client'`). If a future admin dashboard needs to
  read events from the web app, that's a new DTO to add then, not now.
- **No client-side admin gating on the Lock/Unlock buttons in `UpcomingCard.tsx`** — the existing
  codebase doesn't gate any admin-only action client-side anywhere (circle edit/delete included);
  it relies entirely on the server's 403. I matched that convention rather than introducing the
  first client-side role check in the app. A non-admin clicking Lock will see a failed request with
  no special error UI, same as every other admin-only action today.

## Surprises and findings

- `Outing` was missing a Prisma relation to `Movie` that every other movie-referencing model has —
  see Deviations. Worth a deliberate follow-up migration to add it properly (with a data-integrity
  check against production data first).
- `eslint` (the core package) is absent from the entire workspace's resolved dependency tree —
  every package's `lint` script has been non-functional since at least before this session started.
  This is unrelated to F-06 but is worth fixing separately; I did not touch it.
- Docker Desktop is not running in this environment and the API's `DATABASE_URL` points at
  `localhost:5432` (docker-compose Postgres) — there is currently no way to apply migrations or run
  the API against a real database from this session.

## Risks and what to watch

- ~~The migration has never touched a real database~~ — **resolved**: applied and verified against
  the real dev DB (see Update above), including the backfill against a pre-existing row.
- ~~Cookie behavior is unverified~~ — **resolved for the HTTP layer**: a real cookie jar round-tripped
  correctly through the live API (see Update above). What remains unverified is the React
  component's own event handling (form submission, re-render on response) in an actual browser —
  lower risk, since it's calling an API contract now proven correct.
- **`guest_viewed` event volume will be noisy** (see Deviations) — don't trust it as a precise view
  count without first understanding the ~2x inflation from the client reconciliation fetch.
- The migration's `CREATE TABLE` statements aren't `IF NOT EXISTS` — fine for the normal path
  (confirmed `prisma migrate deploy` tracks it correctly in `_prisma_migrations` and won't re-run
  it), but if a future environment's migration history table ever gets out of sync with actual
  schema state, a manual reconciliation would be needed rather than a blind re-run.

## Rollback

Everything in this change is additive at the schema level — a plain code revert is safe even after
the migration has been applied to a real database; it would just leave unused columns/tables behind
(`Outing.slug`/`lockedAt`, `GuestRsvp`, `Event`). No existing table had a column removed, renamed, or
had its type changed. If you want to fully undo the schema too: drop `guest_rsvps` and `events`,
drop `outings.slug`/`outings.locked_at`, drop the `EventType` enum — in that order, to respect FK
dependencies.

## Follow-ups not done

- A real *browser* click-through of `GuestOutingActions.tsx` (typing, clicking, watching re-renders)
  — the API contract it calls is now verified end-to-end, but the component itself hasn't been
  driven interactively.
- Exercise the authenticated `POST /outings/:id/lock`/`/unlock`/`claim` routes against the real API
  with a genuine Google-issued JWT (needs an interactive OAuth sign-in this environment can't do
  non-interactively) — their authorization logic is unit-tested, and the *effect* of a locked outing
  on guest writes was verified for real via direct SQL + curl, but the routes themselves weren't hit.
- Add the missing `Outing → Movie` Prisma relation properly, after checking existing data for
  orphaned `movieTmdbId` values that would violate the FK.
- Human-readable slugs (movie-title-based) instead of opaque random ones — explicitly deferred by
  the plan itself.
- A real `Outing.status → 'done'` transition mechanism (cron or manual "mark done" action), which
  would let the post-outing CTA move to the more deliberate timing the blueprint originally
  described instead of firing immediately on RSVP.
- Branded/composited OG preview images instead of the raw movie poster — explicitly deferred by the
  plan.
- Guest theater voting — explicitly deferred by the plan; the `vote_count` field is already present
  on the DTO if this is revisited.
- A minimal e2e/integration test harness — this feature's core risk (cookie/session behavior) is the
  first thing in this codebase a mocked-`PrismaService` unit test genuinely can't cover on its own.

## Review guidance

Look hardest at `apps/api/src/outings/public-outings.service.ts`'s `toPublicDto` method — it's the
single place responsible for never leaking a member's handle/email to an anonymous guest, which the
plan calls out as the most trust-destroying possible failure class for this feature. I wrote a test
for it (`public-outings.service.spec.ts` → "never exposes a member handle or email"), but given the
severity, a second pair of eyes reading that function directly, not just trusting the test, is worth
the five minutes.

Second: the hand-authored migration SQL
(`apps/api/prisma/migrations/20260908000000_guest_outing_page/migration.sql`) — it's the one piece
of this change I could not execute against a real database at all this session.
