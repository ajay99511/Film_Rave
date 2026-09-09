# Handoff: Guest-accessible shareable outing page (F-06)

**Plan:** `docs/plans/f06-guest-outing-page.md`  ·  **Status:** Partial — code complete and locally
verified where possible; two verification steps genuinely could not be run in this environment (see
below). Not committed to git — left staged for your review first.

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
| RSVP with name persists across reload (cookie) | **Not independently verified** | Implemented (httpOnly cookie in http mode, localStorage key in local mode) and unit-tested for the reuse-vs-create logic, but I could not exercise real cookie round-trip in a live browser — see "Not verified" below |
| Guest can vote on a night option; guest can't vote theater | Met | `public-outings.service.spec.ts`: tally-merge test; no theater-vote route exists on the public controller at all (by design) |
| Admin lock freezes guest writes; unlock reverses it | Met | `outings.service.spec.ts` lock/unlock tests (non-admin rejected, non-member rejected, admin succeeds); `public-outings.service.spec.ts` "rejects writes to a locked outing" |
| Unknown slug → 404, not 500 or data leak | Met | `getPublic` throws `NotFoundException`; curl smoke test confirmed `HTTP 404` for an unknown slug |
| Shared link renders a rich preview (OG tags) | Met | `generateMetadata` in `page.tsx` sets title/description/`openGraph.images` from the movie poster; confirmed present in the built page's `<title>` via curl |
| Guest→user claim sets `claimed_by_user_id`, never `OutingRsvp`/`CircleMember` | Met | New spec test asserts this explicitly against a mock `PrismaService` that has no `outingRsvp`/`circleMember` delegate at all — an accidental write would throw, not silently pass |
| Rate limiting + per-outing guest cap block runaway writes | Met (unit level) | `@Throttle` on all three public write routes (10–20/min); 200-row cap enforced in service, tested |
| Works in both `NEXT_PUBLIC_DATA_SOURCE=local` and `=http` | **Partial** | `local` mode SSR-verified via curl; `http` mode could not be exercised end-to-end — no local Postgres available (Docker not running) |

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

**Not verified — be aware before treating this as done:**
- **No live Postgres was available** (Docker Desktop not running in this environment). The
  migration was never applied to a real database. Before shipping: run
  `docker compose up -d db && pnpm db:migrate` and confirm the migration applies cleanly against a
  DB that already has the seeded outing row (exercises the backfill step for real, not just by
  inspection).
- **`NEXT_PUBLIC_DATA_SOURCE=http` end-to-end flow was not exercised** for the same reason (needs
  the API running against a real DB). The `http`-mode code paths (cookie set/read, CORS+credentials,
  the real claim endpoint) are implemented to the same contract as the tested `local`-mode paths and
  typecheck/build cleanly, but have not been run.
- **The Chrome browser extension was not connected** in this environment, so no real interactive
  click-through (RSVP submit → reload → cookie persists; night-vote; lock toggle from the UI) was
  performed. The curl smoke test only exercises the SSR read path, which has no JavaScript.
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

- **Highest risk: the migration has never touched a real database.** The backfill SQL
  (`substr(md5(random()::text || clock_timestamp()::text || "outing_id"), 1, 12)`) is standard core
  Postgres with no extension dependency, and the schema validated cleanly, but "validated" is not
  "ran." Run it against a copy of real data before deploying, per the plan's own rollout section.
  If `guest_rsvps`/`events` tables already exist from a prior partial run, the migration is not
  idempotent (`CREATE TABLE` without `IF NOT EXISTS`) — check for that specifically if a previous
  attempt was interrupted.
- **Cookie behavior is unverified in a real browser.** The logic is unit-tested at the service
  level and the CORS+credentials config was confirmed correct by reading `main.ts`, but the actual
  set-cookie/send-cookie round-trip across the Next.js↔NestJS origin boundary has not been observed
  running. This is the single most important manual check before shipping — a `curl -c cookies.txt
  -b cookies.txt` two-request session against a running API, or a real browser click-through, would
  close this gap in minutes once a DB is available.
- **`guest_viewed` event volume will be noisy** (see Deviations) — don't trust it as a precise view
  count without first understanding the ~2x inflation from the client reconciliation fetch.

## Rollback

Everything in this change is additive at the schema level — a plain code revert is safe even after
the migration has been applied to a real database; it would just leave unused columns/tables behind
(`Outing.slug`/`lockedAt`, `GuestRsvp`, `Event`). No existing table had a column removed, renamed, or
had its type changed. If you want to fully undo the schema too: drop `guest_rsvps` and `events`,
drop `outings.slug`/`outings.locked_at`, drop the `EventType` enum — in that order, to respect FK
dependencies.

## Follow-ups not done

- Apply the migration against a real database and run the manual cookie round-trip check (see
  Risks) — the two items this session genuinely could not close.
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
