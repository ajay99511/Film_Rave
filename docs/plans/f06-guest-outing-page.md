# Plan: Guest-accessible shareable outing page (F-06)

**Tier:** Consequential — new public/unauthenticated attack surface, new tables, needs an explicit
security pass (abuse, enumeration, rate-limiting) and a rollback story, not just a happy-path build.

**Author / date:** planning session, 2026-09-08

**Status:** Draft — ready for implementation review

**Source:** `docs/PRODUCT_BLUEPRINT.md` §4.2, §7.4 (F-06), §11.3, §12.3, §17(Q2). This plan makes every
decision that document left as prose concrete enough to implement, and resolves its one open
question (guest voting scope) rather than leaving it for the implementor to guess.

---

## 1. Problem and outcome

**Outcome:** Today, an Organizer who creates a movie-night Outing can only share it *inside* the app,
so nobody outside the circle can see or respond to it. The product's entire acquisition loop (§4.2 of
the blueprint) depends on a friend being able to drop a link into a WhatsApp/iMessage thread and have
the other 4–7 people open it, see the plan, and RSVP — without installing anything or making an
account first. This plan opens that loop: an Outing gains a public URL that works for a logged-out
visitor, and converts a fraction of those visitors into real users after the movie has happened.

**Users / actors:**
- **Organizer** (existing circle admin) — gains: a shareable link, and the ability to lock an outing
  against further guest writes.
- **Guest** (no account) — gains: view an outing's poster/date/theater options/who's-going, RSVP with
  just a name, vote on the movie night, and later convert that into a real account without losing
  their RSVP.
- **Circle members** (existing, authenticated) — unaffected in their existing flows; gain visibility
  of guest RSVPs/votes alongside member ones in the tallies they already see.

**Domain context:** `Outing` (already exists: circle + movie + status + RSVP/theater/night votes +
hype, all member-scoped today) gains a *public* read/write surface scoped by a new unguessable
`slug`, and a new lightweight identity — `GuestRsvp` — that lets a non-member interact with exactly
one outing without becoming a `User` or a `CircleMember`.

**Invariants (must always hold):**
- A `GuestRsvp` never grants access to anything outside the single `Outing` it belongs to.
- A guest identity can never satisfy `JwtAuthGuard` or any authenticated route — the two identity
  systems (real JWT session vs. guest token) must be structurally incapable of being confused for one
  another.
- Circle membership and its associated visibility rules (`CircleAccessGuard`, `ratingsShared`) are
  never bypassed by the guest surface — a guest sees only what this plan explicitly allows (movie
  info, night/theater option labels and vote *counts*, attendee first names + avatars, group hype
  average), never handles, emails, ratings, or chat.
- Converting a guest into a real user never silently creates data that would violate an existing
  invariant — specifically, it must not create an `OutingRsvp` or `CircleMember` row, because both
  currently assume/enforce circle membership that a converted guest does not yet have (see §4,
  Decision 5).

**Acceptance criteria:**
- [ ] A logged-out browser can open `/o/<slug>` for a real outing and see: movie poster/title, night
      options with vote tallies, theater options with vote tallies (read-only), who's going (first
      names/avatars only), and the group hype average.
- [ ] That same logged-out visitor can submit a display name + RSVP status, and the page reflects
      their RSVP on reload without asking for the name again (cookie persists).
- [ ] The same visitor can vote on a night option; their vote is reflected in the tally alongside
      members' votes.
- [ ] The visitor cannot vote on a theater option (no such control exists on the guest page).
- [ ] An outing's admin can lock it from the authenticated app; after locking, guest RSVP/vote POSTs
      return 403 and the guest page shows a "planning is closed" state; unlocking reverses this.
- [ ] `/o/<slug>` for a nonexistent slug returns a 404 page, not a 500 or a leak of another outing's
      data.
- [ ] Sharing the link into a chat app renders a link preview containing the movie's poster and title
      (verified via the `generateMetadata` output, not by testing a specific chat app).
- [ ] A guest who later signs in with Google while still holding the guest cookie for that outing gets
      their `GuestRsvp.claimed_by_user_id` set to their new user id; no `OutingRsvp` or
      `CircleMember` row is created as a side effect of this (see Non-goals).
- [ ] Repeated rapid POSTs from one IP to a guest write route are throttled (429) before an unbounded
      number of `GuestRsvp` rows can be created for one outing.
- [ ] All of the above behaves identically in `NEXT_PUBLIC_DATA_SOURCE=local` (demo mode, no server)
      and `=http` (real API) — the local backend is a first-class consumer of this contract, not an
      afterthought.

**Non-goals** (explicitly not building in this slice):
- Guest voting on **theater** options — members-only, per the blueprint's own stated default for this
  phase (§17 Q2). Revisit only if a later phase's abuse/engagement data argues for it.
- Auto-creating an `OutingRsvp` or `CircleMember` row when a guest converts to a real account. The
  claim step only marks `GuestRsvp.claimed_by_user_id`; prompting the new user to actually join the
  circle is a separate, already-existing invite flow (`/add/[handle]`-style), not rebuilt here.
- A custom, branded, composited OG preview image (poster + title + date overlaid). This slice uses
  the movie's existing `poster_url` directly as `og:image` — a real, working preview, just not a
  bespoke one. `generateMetadata` is the seam; swapping in a generated image later is a one-line
  change, not a redesign.
- Reminder emails/SMS/push to guests before the outing, or any notification delivery to a guest at
  all — there is no guest contact channel (no email/phone collected) and no delivery provider wired
  up (that's Phase 2, F-11/F-12, unrelated to opening the loop).
- CAPTCHA or other bot-challenge on public write routes. Rate limiting + a per-outing guest-row cap is
  the launch-scale mitigation, matching the product's stated escalation-ladder philosophy (blueprint
  §13): don't pay a UX cost before abuse data justifies it.
- An analytics dashboard or query API over the new event log. This slice writes events; nothing reads
  them back yet.
- Reusing `Outing.id` as the public identifier. `slug` is a second, deliberately separate field so the
  internal cuid is never exposed in a URL.

**Constraints:**
- No Redis, no message queue, no microservices — matches the architecture's explicit Phase 0–2
  decision (blueprint §10.2). Everything here is a single Postgres table plus in-process Nest code.
- Must not require a new third-party service (no CAPTCHA vendor, no email provider) — see Non-goals.
- Every DTO added to `@filmrave/shared` must follow the existing snake_case-wire convention, since the
  Flutter client mirrors this contract even though it isn't touched by this plan.

**Assumptions (load-bearing, verify before/at build time):**
- `CORS_ORIGINS` already includes the web app's origin with `credentials: true` (confirmed in
  `main.ts` — this is existing behavior, not new, so guest cookies will round-trip on browser POSTs
  from the web origin). **Verified**, not just assumed — read directly in discovery.
- The existing three spec files (`circles.service.spec.ts`, `outings.service.spec.ts`,
  `imports/csv.spec.ts`) are the only test convention in this repo: **pure unit tests with a
  hand-mocked `PrismaService`** (`vi.fn()` per method), no real-database integration harness, no
  supertest/e2e layer exists anywhere. **Verified** by reading both files. This plan's test strategy
  follows that convention rather than inventing a new one.

## 2. Current state

**What exists today** (all read directly this session, not inferred):
- `Outing` / `OutingRsvp` / `OutingHype` / `TheaterVote` / `NightVote` — `apps/api/prisma/schema.prisma:198-266`.
  All four child tables are keyed off `outingId`; `TheaterVote`/`NightVote` use a `voterIds: String[]`
  array-of-user-id pattern (not a join table) — deliberate at this scale per the schema's own comments.
- `OutingsService` (`apps/api/src/outings/outings.service.ts`) — `create`, `setRsvp`, `voteTheater`,
  `voteNight`, `setHype`, all gated by a private `assertMember(circleId, userId)` check, all returning
  a fully-hydrated `OutingDto` via a shared `OUTING_INCLUDE` + `toDto`.
- `OutingsController` (`apps/api/src/outings/outings.controller.ts`) — `@UseGuards(JwtAuthGuard)` at
  the controller level; every route requires a real session.
- `CircleAccessGuard` (`apps/api/src/common/circle-access.guard.ts`) — a first-line membership filter
  for `:circleId`-scoped routes; not applicable to outing-scoped public routes (no circle context is
  exposed to a guest).
- `JwtStrategy` (`apps/api/src/auth/jwt.strategy.ts`) — validates a Bearer JWT signed with
  `JWT_SECRET`, payload `{ sub, handle }`, populates `AuthUser`. Guest identity must never be able to
  satisfy this strategy (see Decision 1).
- `AuthService.issue()` (`apps/api/src/auth/auth.service.ts:158`) — how real access/refresh tokens are
  minted today; the guest-conversion "claim" step reuses the *existing* `POST /auth/google` to get a
  real token, then calls a new claim endpoint with that token — it does not touch `AuthService`.
- `/add/[handle]` (`apps/web/src/app/add/[handle]/page.tsx` + `AddFriendActions.tsx`,
  `apps/web/src/lib/api.ts`) — the one existing public/logged-out SSR page. This is the pattern to
  copy: `generateMetadata` for OG tags, a server component that fetches via a small dedicated
  function (not the full `Backend` abstraction), a `notFound()` on 404, and a client "Actions"
  component for the interactive part. `lib/api.ts`'s `getUserByHandle` also shows the required
  `DATA_SOURCE === 'http' ? fetch(...) : seed-lookup` branch — the public outing page needs the same
  branch so it works in local demo mode.
- `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])` global + `@Throttle`/`@SkipThrottle` per
  route already in use (`apps/api/src/app.module.ts`, `auth.controller.ts`) — the pattern to reuse for
  tighter guest-route limits. `app.set('trust proxy', 1)` is already set, so per-IP throttling is
  already correct behind a platform load balancer.
- `apps/web/src/lib/local/backend.ts` + `local/schema.ts` — the no-server demo backend mirrors every
  API table 1:1 in an in-memory/localStorage store (`OutingRow`, `outing_rsvps`, etc., confirmed by
  reading both files). It is a first-class consumer of the contract, not a stub — any new table this
  plan adds server-side needs a matching row shape here.
- `env.validation.ts` — fail-fast required-env check; nothing here today needs a new required var
  (see Decision 1: no new secret needed).
- `TMDB_IMAGE_BASE` is already used to build a full absolute `poster_url` on every `MovieDto`
  (`apps/api/src/movies/movies.service.ts:125`) — the OG image needs no new plumbing, it's already on
  the DTO.

**Reusable as-is:** `OutingsService`'s existing tally/tie-break logic (`leadingOption`), the
`OUTING_INCLUDE` pattern, the throttler module, the CORS+credentials config, the `/add/[handle]`
SSR-page pattern, the local-backend mirroring convention.

**Must not break:** every existing authenticated `OutingsController` route and its member-only
semantics; the `OutingDto` shape consumed by `UpcomingCard.tsx` (this plan adds a *separate*
`PublicOutingDto`, it does not change `OutingDto`); the Flutter client's contract (nothing in
`@filmrave/shared` that Flutter already reads is renamed or removed).

**Prior art / history:** none specific to this feature — it's new. The general "visibility enforced in
app code, not DB RLS" precedent (rating visibility) is the model this plan follows for guest-vs-member
data shaping: one `toPublicDto` function is the single place that decides what a guest may see, same
spirit as `RatingsService`/`CircleAccessGuard`.

## 3. Design

**Approach in one paragraph:** Add two fields to `Outing` (`slug`, `lockedAt`) and one new table
(`GuestRsvp`, keyed by an opaque random token, holding a display name, RSVP status, an optional
night-vote choice, and an optional `claimedByUserId`). A new, entirely unauthenticated controller
exposes a read route and two write routes scoped by `slug`; writes mint an httpOnly cookie holding the
guest's token so repeat visits from the same browser reuse the same `GuestRsvp` row instead of
spawning new ones. A new Next.js route SSR-renders the public page using that read route, with a
client component for the interactive RSVP/vote actions. The organizer's existing authenticated UI
gains a "copy invite link" action and a lock/unlock toggle. A minimal `Event` table records the five
funnel steps the blueprint's own exit gate needs to be measurable at all.

**Contracts:**

*New DTOs* (`packages/shared/src/models.ts`):
```ts
/** What an anonymous guest may see about an outing — deliberately excludes
 *  everything CircleAccessGuard would otherwise gate: handles, emails, ratings,
 *  chat. Only first names, avatars, and vote counts. */
export interface PublicOutingDto {
  outing_id: string;
  slug: string;
  movie: MovieDto;
  status: OutingStatus;
  locked: boolean;
  tickets_on_sale_date?: string | null;
  attendees_going: { display_name: string; avatar_url?: string | null; is_guest: boolean }[];
  theater_options: { option_id: string; name: string; position: number; vote_count: number }[];
  night_options: { option_id: string; label: string; position: number; vote_count: number }[];
  group_hype: number | null;
  // Present only in the response to the browser that just RSVP'd/voted, so the
  // client can render "you already answered" state without re-prompting for a name.
  my_guest_status?: RsvpStatus | null;
  my_guest_night_vote?: string | null;
}
```
(`attendees_going` merges member `display_name`s — from `User`, joined via `OutingRsvp` — with guest
`display_name`s from `GuestRsvp` where `status === 'going'`; `is_guest` lets the UI badge guests, e.g.
"Sam (guest)" per the blueprint's own example.)

*New API routes* (`apps/api/src/outings/public-outings.controller.ts`, no `JwtAuthGuard`):
| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| GET | `/outings/public/:slug` | — | `PublicOutingDto` | 404 if slug unknown. Reads guest cookie if present to populate `my_guest_status`. |
| POST | `/outings/public/:slug/rsvp` | `{ display_name: string, status: RsvpStatus }` | `PublicOutingDto` | Mints/reuses guest cookie. 403 if `locked`. Throttled tighter than global default. |
| POST | `/outings/public/:slug/vote-night` | `{ option_id: string }` | `PublicOutingDto` | Requires an existing guest cookie for this outing (i.e. RSVP first). 403 if `locked` or no prior RSVP. |
| POST | `/outings/public/:slug/claim` | — | `{ claimed: true }` | **Authenticated** (`JwtAuthGuard`) *and* requires the guest cookie. Sets `claimed_by_user_id`. |

*New authenticated routes* (existing `OutingsController`, admin-only):
| Method | Path | Notes |
|---|---|---|
| POST | `/outings/:outingId/lock` | Sets `lockedAt = now()`. Admin-of-circle only (reuse the existing admin check already used for circle edit/delete). |
| POST | `/outings/:outingId/unlock` | Clears `lockedAt`. Same guard. |

*Schema changes* (one additive Prisma migration):
```prisma
model Outing {
  // ...existing fields...
  slug     String    @unique
  lockedAt DateTime? @map("locked_at")
  guestRsvps GuestRsvp[]
}

model GuestRsvp {
  outingId           String     @map("outing_id")
  guestToken         String     @unique @map("guest_token")
  displayName        String     @map("display_name")
  status             RsvpStatus
  votedNightOptionId String?    @map("voted_night_option_id")
  claimedByUserId    String?    @map("claimed_by_user_id")
  createdAt          DateTime   @default(now()) @map("created_at")

  outing Outing @relation(fields: [outingId], references: [id], onDelete: Cascade)
  claimedBy User? @relation(fields: [claimedByUserId], references: [id], onDelete: SetNull)

  @@id([outingId, guestToken])
  @@map("guest_rsvps")
}

enum EventType {
  outing_created
  link_shared
  guest_viewed
  guest_rsvped
  guest_converted
}

model Event {
  id        String    @id @default(cuid())
  type      EventType
  outingId  String?   @map("outing_id")
  metadata  Json      @default("{}")
  createdAt DateTime  @default(now()) @map("created_at")

  @@index([type, createdAt])
  @@map("events")
}
```
`slug` is `@unique` and non-nullable on a table that already has rows (dogfooding/seed data) — see
Slice 1 for the expand→backfill→contract migration shape this requires.

**Data model changes / meaning of new fields:**
- `Outing.slug` — the public, unguessable, URL-safe identifier. Generated once at `create()` time
  (existing member-authenticated flow) and immutable after. Never derived from `Outing.id`.
- `Outing.lockedAt` — non-null means "no more guest writes." Member writes (RSVP/vote from inside the
  app) are **not** affected by this field — locking is specifically a public-surface abuse lever, not
  a general outing-freeze (matches the blueprint's own framing: "freezes guest writes").
- `GuestRsvp` — one row per (outing, browser-that-RSVP'd). `guestToken` is the cookie value and the
  row's effective identity; it is *not* a JWT and carries no signature/claims (see Decision 1).
  `votedNightOptionId` mirrors the member `NightVote.voterIds[]` pattern but kept in a separate column
  rather than appended into `voterIds`, because that array is implicitly typed elsewhere as "real
  `User.id` values" (see Decision 2). `claimedByUserId` is set exactly once, by the claim endpoint, and
  never cleared.
- `Event` — an append-only funnel log. Intentionally minimal: five event types, a nullable
  `outingId`, a free-form `metadata` JSON bag. No reporting is built on top of it this phase.

**Flow — guest RSVP (main path):**
1. Guest opens `filmrave.app/o/<slug>` → Next.js SSR fetches `GET /outings/public/:slug` → renders
   poster, tallies, attendee list. Server logs a `guest_viewed` event (best-effort, non-blocking).
2. Guest taps "I'm going" → client component shows a name field → `POST /outings/public/:slug/rsvp`.
3. API: look up `Outing` by slug (404 if none). If locked, 403. If the request already carries a valid
   guest cookie for this outing, update that `GuestRsvp` row's `status`/`displayName`; otherwise
   generate a new `guestToken`, create the row, and set the cookie on the response. Log
   `guest_rsvped`.
4. Response is a fresh `PublicOutingDto` including `my_guest_status`; the client re-renders showing
   "You're going" instead of the RSVP prompt.

**Flow — failure paths:**
- Unknown slug → 404 at the API; the Next.js page calls `notFound()`, matching the `/add/[handle]`
  precedent.
- Locked outing → 403 with a machine-readable reason (`{ code: 'OUTING_LOCKED' }`) so the client can
  show "planning is closed for this outing" rather than a generic error.
- Rate-limit exceeded → 429 (handled automatically by `ThrottlerGuard`), client shows a generic
  "too many requests, try again shortly."
- Vote without a prior RSVP cookie → 400 (`{ code: 'RSVP_REQUIRED' }`); the client should not normally
  reach this state (vote UI only renders after RSVP), but the API must not trust the client.
- Claim without a guest cookie present → 400; claim with a cookie but the outing already claimed by a
  *different* user id → 409 (idempotent no-op if it's the *same* user id re-claiming).

**Cross-cutting:**
- **Authz:** Public GET/RSVP/vote routes are intentionally open to anyone with the slug — that's the
  feature. Lock/unlock is circle-admin-only via the existing admin check. Claim requires a real JWT
  (`JwtAuthGuard`) *plus* the guest cookie — both must match the same browser.
- **Validation:** `display_name` — trim, 1–40 chars, reject empty after trim (class-validator on the
  new DTOs, mirroring existing controller style). `status`/`option_id` — same `IsEnum`/`IsString`
  pattern already used in `OutingsController`.
- **Observability:** the five `Event` rows are the observability story for this feature's actual
  purpose (is the loop spinning) — see §7. Standard Nest request logging already exists; no new
  logging infra needed.
- **Performance:** `GET /outings/public/:slug` is a single Prisma query with includes, same shape as
  the existing authenticated `get()` — no new query pattern, no caching needed at current traffic
  (blueprint's own <800ms p95 target is easily met by one indexed lookup; revisit only if real traffic
  data says otherwise).
- **Accessibility/i18n:** N/A beyond the existing web app's conventions — no new i18n scope, standard
  semantic HTML/ARIA on the new form controls (name input, RSVP buttons) matching existing form
  patterns in the app.

## 4. Design judgment

**Must be right now** (expensive to retrofit):
- The guest-identity model (opaque DB-backed token, not a JWT) — changing this later means migrating
  every issued cookie. Decided now, see Decision 1.
- The `PublicOutingDto` shape — it's a contract a guest's browser and link-preview crawlers will
  consume; once shared, changing what it *excludes* (privacy) is easy, but changing what it *includes*
  in a breaking way requires care. Specified precisely above.
- `slug` as a field distinct from `Outing.id` — retrofitting this after URLs are already shared would
  break existing links.

**Should be there at ship:**
- Rate limiting on every public write route (`@Throttle`, tighter than the 100/min global default).
- The per-outing guest-row cap (defensive ceiling, see Decision 3).
- The five-event funnel log — without it, the blueprint's own Phase 1 exit gate (≥5 outsider circles
  complete an outing; ≥25% guest→account conversion) is unmeasurable. Cheap now (one table, five
  insert calls), expensive to reconstruct retroactively (can't backfill events you never wrote).
- A spec file per new service method, following the existing hand-mocked-`PrismaService` convention.

**Deferred, with a seam:**
- Branded OG image generation — the seam is `generateMetadata`'s `openGraph.images` field; swapping
  `poster_url` for a generated image URL later touches one function.
- CAPTCHA/bot challenge — the seam is the rate-limit/cap layer already being the single choke point
  for guest writes; adding a challenge later means gating that same choke point, not a redesign.
- Guest theater voting — the seam is that `PublicOutingDto.theater_options` already carries
  `vote_count`; turning it interactive later is a new POST route plus a UI change, not a schema
  change (add a `votedTheaterOptionId` column to `GuestRsvp` then, mirroring `votedNightOptionId`).
- Auto-join-circle-on-convert — the seam is that `claim` already knows the `outingId` → `circleId`;
  a follow-up can add a "join this circle?" prompt using the *existing* invite-accept flow without
  touching this endpoint.

**Explicitly not doing:** see Non-goals in §1 — each has its one-line reason there; not repeated here.

**Abstraction decisions:**

| Tempting generalization | Evidence of variation | Decision | Reason |
|---|---|---|---|
| A generic "GuestIdentity" system reusable for future public surfaces (e.g. a future public circle page) | One concrete case (outings) today; no second public surface planned or requested | Build `GuestRsvp` concrete to outings | Gate 1 fails — no second case exists yet. If a second public surface is ever built, extract the token-cookie mechanics then, informed by what actually varied. |
| A pluggable "OG image provider" interface | One image source (TMDB poster) today | Use `poster_url` directly, no interface | Gate 1 fails — nothing to plug in yet |
| A generic `EventType` extensibility mechanism (free-text type + schema registry) | Five known event types, closed set for this phase | Plain Prisma enum, not a string | Gate 3 fails — the axis that might vary (which events exist) is cheap to extend by adding an enum value in a future migration; a registry would add ceremony with no current second axis of variation |

**One-way doors:**
- **Choosing an opaque DB-backed guest token over a signed stateless token (JWT/HMAC cookie).**
  Justified in Decision 1 — reversing this later means re-issuing every guest's cookie, but the guest
  relationship is short-lived by nature (one outing, weeks not years), so the blast radius of a future
  change is small. Proceeding.
- **`slug` format and generation (crypto-random, 12 chars, not human-readable).** Once links are
  shared, the format is effectively permanent for those links. Decided in Decision 4 with the
  alternative (human-readable slugs) explicitly rejected.
- **Excluding theater-vote from the guest surface.** Two-way door in practice — adding it later is
  additive (new column, new route), not a breaking change. Not one-way despite looking like a product
  decision.

**Decision records:**

> **Decision 1: Guest identity is an opaque, randomly-generated, database-backed token — not a JWT.**
> **Context:** The app already has a JWT-based session system (`JwtStrategy`, `JwtAuthGuard`,
> `JWT_SECRET`). A guest needs *some* way to be recognized on a repeat visit without an account.
> **Alternatives:**
> - *Reuse the JWT signing infra with a distinct payload shape (e.g. `{ guestOutingId }` instead of
>   `{ sub, handle }`).* Rejected: `JwtStrategy.validate()` only checks `payload.sub` truthiness — a
>   guest JWT that happened to include a `sub`-shaped claim could be misread as a real session by any
>   future code that doesn't re-check the claim shape carefully. Reusing the same secret/mechanism for
>   two identity classes with very different trust levels is exactly the kind of coincidental-similarity
>   trap Gate 2 warns about: they "look alike" (both are bearer tokens) but vary for different reasons
>   (one proves account ownership, one is a disposable per-outing handle).
> - *A separate signed cookie (HMAC) with its own secret.* Rejected: adds a new required env var
>   (`GUEST_TOKEN_SECRET`) and signature-verification code for no real benefit over a DB lookup, since
>   every write already hits Postgres anyway (there's no "avoid a DB round-trip" win at this traffic
>   scale — see Performance above).
> **Consequences:** A guest token is meaningless without the `GuestRsvp` row backing it — trivially
> revocable (delete the row) and structurally incapable of passing `JwtAuthGuard` (no `sub`/`handle`
> claims exist because there's no JWT at all). Cost: one extra DB lookup per guest write, negligible
> at this scale.

> **Decision 2: Guest night-votes live in a dedicated `GuestRsvp.votedNightOptionId` column, not
> appended into `NightVote.voterIds`.**
> **Context:** `NightVote.voterIds: String[]` already exists and is populated by
> `OutingsService.voteNight` with real `User.id` values.
> **Alternatives:** *Push guest tokens into `voterIds` with a prefix (e.g. `guest:<token>`).* Rejected
> — any current or future code that treats `voterIds` entries as `User.id` (e.g. looking up a member's
> avatar/name by id) would need a guard against the prefix everywhere it's read, and a missed guard is
> a real-looking bug (an avatar lookup silently failing or, worse, colliding with a real user id
> format). Keeping the two vote sources in separate columns means the *service layer* — not every
> reader — is the one place that merges them for display.
> **Consequences:** `PublicOutingDto.night_options[].vote_count` is `voterIds.length +
> (count of GuestRsvp rows with this votedNightOptionId)`, computed once in `toPublicDto`. Slightly
> more code in one place; zero risk of a stray guest token leaking into member-only logic elsewhere.

> **Decision 3: A hard per-outing cap on `GuestRsvp` rows (200), enforced in the service before insert.**
> **Context:** Rate limiting bounds the *rate* of abuse but not the total damage from a slow, patient
> script, or from the link going more viral than expected in a bad way (mass fake RSVPs).
> **Alternatives:** *Rely on rate limiting alone.* Rejected — 100 req/min sustained for an hour is
> 6,000 rows; a cap makes the worst case bounded and cheap to reason about regardless of attack
> duration. *A lower cap (e.g. 50).* Rejected as premature — a real circle's real friend-of-friend
> outing could plausibly have dozens of genuine guest RSVPs; 200 is generous enough not to be a product
> bug and still small enough that it can't meaningfully bloat the table.
> **Consequences:** Once hit, `POST .../rsvp` for *new* guests on that outing returns 403 (existing
> guests can still update their own row). Revisit the number once real usage data exists (this is
> explicitly a two-way door — just a config constant).

> **Decision 4: `slug` is a 12-character crypto-random base62 string, not a human-readable one (e.g.
> "dune-fri-x7k2" from the blueprint's own illustrative example).**
> **Context:** The blueprint's flow example uses a readable slug; readability is nicer for word-of-mouth
> but adds real complexity (collision handling against movie-title-derived words, profanity filtering,
> uniqueness retries with a fallback shape).
> **Alternatives:** *Human-readable slug (movie-title-slug + short random suffix).* Rejected for this
> slice — real product value, but genuine added scope (title normalization, collision retry loop,
> length limits across very long titles) that doesn't change whether the loop opens at all. Flagged in
> §11 as a good, low-risk follow-up once the base mechanism is proven.
> **Consequences:** URLs look like `filmrave.app/o/aB3xQ9kLm2Pq` rather than
> `filmrave.app/o/dune-fri-x7k2` — less pretty, equally unguessable (12 chars from a 62-symbol alphabet
> is ~71 bits, far beyond what a scraper could brute-force), zero collision-handling complexity (retry
> once on the ~1-in-4-trillion chance of a clash, using Prisma's unique-constraint error as the signal).

## 5. Risks and failure modes

| Risk | Likelihood | Impact | Mitigation / early signal |
|---|---|---|---|
| Guest cookie doesn't round-trip (SameSite/CORS misconfig) and RSVPs silently don't persist | Low | High (feature appears broken) | Verified in Slice 3's acceptance test with an actual cookie jar, not mocked; `CORS_ORIGINS`+`credentials:true` already confirmed correct in discovery |
| A bug in `toPublicDto` leaks a member's handle/email to a guest | Low | Severe (privacy breach, matches the product's most trust-destroying failure class, per blueprint R-4) | `PublicOutingDto` is a hand-built, narrow interface (not a spread of `AppUserDto`); Slice 2's spec explicitly asserts the response has no `handle`/`email` keys |
| Guest-row cap or rate limit is too aggressive and blocks a real large friend group | Medium | Medium | Cap (200) and throttle numbers documented with reasoning above; easy config change, not a redesign |
| Local demo backend (`lib/local/*`) silently diverges from the new contract, breaking demo mode | Medium | Medium | Explicit Slice 6 requirement + acceptance criterion to test both `DATA_SOURCE` modes |
| Slug backfill migration fails against existing dogfooding data with duplicate/empty slugs | Low | Medium (blocks deploy) | Slice 1 migration is expand→backfill→contract with a verified-unique generation step; tested against a copy of the current dev DB before merging |
| Someone enumerates `/o/<slug>` for slugs at scale | Very low at current traffic | Medium | 12-char crypto-random slug (~71 bits) makes brute-force infeasible; global throttler already caps request rate regardless |

**Blast radius:** Worst case, a bug here affects only Outing-related data (new tables + two new
`Outing` columns) — it cannot touch `Rating`, `Circle`, `Friendship`, or auth. Fully additive schema
means a bad deploy can be rolled back at the application layer without a destructive migration.

**Worst realistic failure:** a privacy leak in `toPublicDto` exposing a member's real name/handle
pairing or email to an anonymous visitor. Detected by: the dedicated spec test (Slice 2) asserting the
exact key set of the response, plus a manual review of `toPublicDto`'s implementation as part of this
slice's code review (call this out explicitly to the reviewer, don't rely on tests alone for something
this severity-sensitive).

## 6. Implementation slices

Ordered so the riskiest/most foundational assumption is retired first.

### Slice 1 — Schema: slug, lock, GuestRsvp, Event
- **Intent:** The data model can represent everything this feature needs; nothing about it depends on
  guessed API shapes yet.
- **Changes:** `apps/api/prisma/schema.prisma` — add `Outing.slug`/`lockedAt`, `GuestRsvp`, `EventType`
  enum, `Event`. New migration under `apps/api/prisma/migrations/`, hand-authored in three steps
  within one migration file (matching the "hand-authored migration" precedent already used for
  `20260809000000_add_circle_identity`): (1) add `slug` as nullable, add `locked_at`; (2)
  `UPDATE outings SET slug = <12-char random base62> WHERE slug IS NULL` for any pre-existing rows —
  use `encode(gen_random_bytes(9), 'base64')` (or equivalent) truncated/cleaned to a URL-safe alphabet,
  looped per-row if a collision-safe generation needs it (row count is tiny at this stage, a PL/pgSQL
  loop or a Node backfill script run once is acceptable — pick whichever is less code, note the choice
  in the migration file's comment); (3) `ALTER TABLE outings ALTER COLUMN slug SET NOT NULL`, add the
  unique constraint. Also add `GuestRsvp`/`Event` tables (no backfill needed, they start empty).
- **Acceptance:** `pnpm db:migrate` succeeds against a local dev DB seeded with the existing seed data
  (which includes at least one `Outing` row); `pnpm db:generate` succeeds; every existing outings spec
  still passes unmodified.
- **Verify:** `pnpm --filter @filmrave/api prisma:migrate && pnpm db:generate && pnpm --filter @filmrave/api test`
- **Rollback:** `prisma migrate resolve --rolled-back` + a down migration dropping the new
  columns/tables (all additive, so a rollback here cannot lose pre-existing data — it can only remove
  the new capability).
- **Risk retired:** the migration mechanics against real (dogfooded) data — proven before any line of
  service code depends on the new fields existing.

### Slice 2 — Public read: `GET /outings/public/:slug` + `PublicOutingDto`
- **Intent:** A guest-safe view of an outing exists and is provably free of member PII, independent of
  any write path.
- **Changes:**
  `packages/shared/src/models.ts` — add `PublicOutingDto` as specified in §3.
  `apps/api/src/outings/public-outings.controller.ts` (new) — `GET /outings/public/:slug`, no guard.
  `apps/api/src/outings/public-outings.service.ts` (new) — `getPublic(slug, guestToken?)`; builds the
  merged attendee list (members from `OutingRsvp` join `User`, guests from `GuestRsvp`), merges vote
  tallies per Decision 2, returns 404 (`NotFoundException`) for an unknown slug.
  `apps/api/src/outings/outings.module.ts` — register the new controller/service.
- **Acceptance:** curling the route for a seeded outing's slug returns 200 with the documented shape;
  curling an invalid slug returns 404; the response JSON has no `handle`, `email`, or `google_id` key
  anywhere in it.
- **Verify:** `pnpm --filter @filmrave/api test -- public-outings` — a new
  `public-outings.service.spec.ts` (hand-mocked `PrismaService`, following the `circles.service.spec.ts`
  convention) asserting: (a) attendee list contains only `display_name`/`avatar_url`/`is_guest`; (b)
  vote counts correctly sum member `voterIds.length` + matching `GuestRsvp` rows; (c) unknown slug
  throws `NotFoundException`.
- **Rollback:** remove the new controller/service/DTO; no data impact (read-only).
- **Risk retired:** the exact response shape is settled and privacy-verified before any write path or
  UI is built against it.

### Slice 3 — Guest RSVP write + cookie issuance
- **Intent:** An anonymous visitor can RSVP and be recognized on a second request via cookie —
  the riskiest integration point in the whole feature (cross-cutting: cookies, CORS, per-outing
  identity), proven end-to-end here before more is built on top of it.
- **Changes:**
  `apps/api/src/outings/public-outings.controller.ts` — `POST /outings/public/:slug/rsvp`, reads/sets
  an httpOnly cookie named `fr_guest_<outingId>` (value = `guestToken`, `SameSite=Lax`,
  `Secure` in production, `Path=/`, `maxAge` ~30 days). `@Throttle({ default: { limit: 10, ttl: 60_000 } })`
  or the project's equivalent decorator shape (match whatever `auth.controller.ts` uses precisely).
  `apps/api/src/outings/public-outings.service.ts` — `rsvp(slug, ip, existingGuestToken, { displayName, status })`:
  loads outing by slug (404 if missing), 403 if `lockedAt` is set, enforces the 200-row cap (Decision
  3) only when *creating* a new row, upserts by `guestToken` if one was supplied and matches an
  existing row for this outing, otherwise generates a new token (`crypto.randomBytes(9).toString('base64url')`
  or equivalent — reuse whatever random-generation utility the project already imports, e.g. Node's
  `crypto`, matching `randomUUID` usage already seen in `outings.service.ts`) and creates the row.
  Fires a best-effort `Event` insert (`guest_rsvped`) — wrap in try/catch so an analytics-write failure
  never fails the user-facing RSVP.
- **Acceptance:** two sequential POSTs from the same cookie jar (same `guestToken`) update one
  `GuestRsvp` row, not two; a POST to a locked outing returns 403; a 201st distinct-guest POST to an
  outing already at the cap returns 403.
- **Verify:** `pnpm --filter @filmrave/api test -- public-outings` (extend the Slice 2 spec file) plus
  one manual verification: run the API locally, `curl -c cookies.txt -b cookies.txt` twice against the
  real route, confirm one `GuestRsvp` row via `prisma studio` or a `SELECT`. Record this manual check's
  output in the PR description — this is the one step in this plan too integration-heavy for the
  existing mocked-Prisma unit-test convention to fully cover, and the codebase has no e2e harness to
  reach for instead (see Assumptions).
- **Rollback:** remove the route; existing `GuestRsvp` rows are harmless orphans if rolled back (no
  other code reads them).
- **Risk retired:** cookie issuance/reuse and the guest-identity model work end-to-end against the real
  HTTP stack, not just in mocked unit tests.

### Slice 4 — Guest night-vote
- **Intent:** A guest who's already RSVP'd can vote on a proposed night, and that vote shows up in
  tallies the same request onward (member and web app callers see it immediately).
- **Changes:** `public-outings.controller.ts` — `POST /outings/public/:slug/vote-night`, requires a
  valid guest cookie for this outing (400 `RSVP_REQUIRED` if absent/invalid), same lock check and
  throttle treatment as Slice 3. `public-outings.service.ts` — `voteNight(slug, guestToken, optionId)`
  sets `GuestRsvp.votedNightOptionId`, validates `optionId` belongs to this outing's `nightVotes`.
- **Acceptance:** a guest vote appears in the *next* `GET /outings/public/:slug`'s
  `night_options[].vote_count`, correctly combined with any member votes on the same option.
- **Verify:** extend the Slice 2/3 spec file with a case covering the merge.
- **Rollback:** remove the route; `votedNightOptionId` values become inert, harmless.
- **Risk retired:** the tally-merge logic (Decision 2) is correct, not just designed.

### Slice 5 — Organizer lock/unlock
- **Intent:** An admin can freeze guest writes on an outing, closing the abuse-mitigation loop this
  plan promises.
- **Changes:** `apps/api/src/outings/outings.controller.ts` — `POST :outingId/lock` and `/unlock`,
  admin-only (reuse whatever the circle edit/delete admin check already looks like —
  read `circles.controller.ts`/`circles.service.ts`'s existing admin-role check at implementation time
  and match it exactly, don't invent a new authorization pattern). `outings.service.ts` — `lock`/
  `unlock` methods setting/clearing `lockedAt`.
- **Acceptance:** a non-admin member gets 403; an admin succeeds; a subsequent guest RSVP/vote POST to
  that outing returns 403 with `OUTING_LOCKED`.
- **Verify:** extend `outings.service.spec.ts` with lock/unlock cases plus an authorization case.
- **Rollback:** remove the routes; any outing left `locked` stays locked until manually cleared via a
  one-off DB update (acceptable — it's an intentional admin action, not silent data loss).
- **Risk retired:** the one authenticated-side change in this plan is isolated and verified before
  moving to the web UI.

### Slice 6 — Web: public page `/o/[slug]`
- **Intent:** The feature is actually usable by a human in a browser, in both data-source modes.
- **Changes:**
  `apps/web/src/lib/api.ts` (or a new sibling file, e.g. `lib/api-outings.ts`, mirroring the existing
  file's separation of "SSR-only public data access" from the authenticated `Backend`) — add
  `getPublicOuting(slug)` with the same `DATA_SOURCE === 'http' ? fetch(...) : local-lookup` branch as
  `getUserByHandle`.
  `apps/web/src/lib/local/schema.ts` + `local/backend.ts` — add `slug`/`locked_at` to the local
  `OutingRow` shape and a `guest_rsvps` local table, so demo mode can answer `getPublicOuting`.
  `apps/web/src/app/o/[slug]/page.tsx` (new) — SSR page following the `/add/[handle]/page.tsx`
  pattern exactly: `generateMetadata` (title = movie title, description = date/attendee summary,
  `openGraph.images = [movie.poster_url]`), `notFound()` on a 404 from the fetch, renders poster/
  tallies/attendee list server-side.
  `apps/web/src/app/o/[slug]/GuestOutingActions.tsx` (new, client component) — name input + RSVP
  buttons + night-vote buttons, calling the new public POST routes directly via `fetch(..., { credentials: 'include' })`
  (not through the `Backend` interface — this is a separate, purpose-built client path, matching how
  `AddFriendActions.tsx` already does its own thing outside `Backend`).
- **Acceptance:** loading `/o/<slug>` in an incognito browser window (no auth) renders the page;
  RSVP'ing with a name works and survives a page reload; verified in **both**
  `NEXT_PUBLIC_DATA_SOURCE=local` and `=http`.
- **Verify:** manual browser check (this is UI — per the project's own standards, UI changes are
  verified by using the feature in a browser, not just typechecking). Also run
  `pnpm --filter @filmrave/web typecheck && pnpm --filter @filmrave/web lint`.
- **Rollback:** delete the new route directory; no server-side impact.
- **Risk retired:** the full guest journey works for an actual human, not just at the API layer.

### Slice 7 — Web: organizer invite-link + lock UI, event instrumentation wiring
- **Intent:** An organizer inside the authenticated app can actually produce and share the link, and
  the funnel events promised in §4 are wired into the real request handlers (not just schema).
- **Changes:** `apps/web/src/components/app/UpcomingCard.tsx` (or its details-modal equivalent —
  confirm exact insertion point by reading the component at implementation time) — add a "Copy invite
  link" button (`${window.location.origin}/o/${outing.slug}`, requires `OutingDto` to now include
  `slug` — add it to `OutingDto` in `@filmrave/shared` as an **additive** field, matching pattern) and,
  admin-only, a lock/unlock toggle calling Slice 5's routes. On copy-link click, fire a best-effort
  `POST` (or reuse an existing lightweight mechanism if one exists) to record a `link_shared` event —
  accept and document that this only counts *copies*, not actual forwards/opens, as a known
  measurement limitation (see §1 assumption notes). Wire `guest_viewed` (Slice 2's read handler) and
  `guest_converted` (Slice 8's claim handler) event inserts if not already added inline during those
  slices.
- **Acceptance:** clicking "Copy invite link" puts a working `/o/<slug>` URL on the clipboard; an
  `Event` row with `type = 'link_shared'` appears; lock/unlock buttons work end-to-end from the UI.
- **Verify:** manual browser check + `pnpm --filter @filmrave/web typecheck`.
- **Rollback:** revert the UI change; `Event` rows are harmless if the feature is rolled back.
- **Risk retired:** none new — this is polish/instrumentation on top of already-retired risk, kept as
  its own slice because it's independently shippable and reviewable.

### Slice 8 — Guest → user claim on conversion
- **Intent:** The funnel's actual conversion step (blueprint's north-star-adjacent metric) is
  measurable and functional, without violating the circle-membership invariant.
- **Changes:** `public-outings.controller.ts` — `POST /outings/public/:slug/claim`, `@UseGuards(JwtAuthGuard)`,
  reads the guest cookie from the request, calls `public-outings.service.ts`'s `claim(slug, guestToken, userId)`
  which sets `GuestRsvp.claimedByUserId` (409 if already claimed by a *different* user; no-op success
  if by the same user). Fires `guest_converted`.
  `apps/web/src/app/login/page.tsx` — accept a `returnTo` query param (if not already supported — check
  at implementation time) and redirect there after a successful sign-in.
  `apps/web/src/app/o/[slug]/page.tsx` — after the outing's date has passed (compare against the
  night-vote's date/label if resolvable, otherwise against `status === 'done'` once that's set by
  existing logic — confirm which signal is reliable by reading how `status` transitions today), show
  a "Rate it — create your account" CTA linking to `/login?returnTo=/o/<slug>`. On return, the page
  calls the claim endpoint client-side if a guest cookie is present and the user is now authenticated.
- **Acceptance:** the full journey (RSVP as guest → sign in via Google → land back on `/o/<slug>` →
  `GuestRsvp.claimedByUserId` set) works manually; explicitly verify no `OutingRsvp` or `CircleMember`
  row was created as a side effect (per the Non-goals invariant).
- **Verify:** a spec covering `claim`'s three cases (fresh claim, idempotent re-claim, conflicting
  claim) + manual browser walkthrough of the full journey.
- **Rollback:** remove the claim route and the login redirect param; guests simply can't convert via
  this path until re-added (no data loss — `GuestRsvp` rows remain valid either way).
- **Risk retired:** the conversion step — the actual point of this whole feature per the blueprint's
  own metric tree — is proven working, last, once everything it depends on already works.

## 7. Verification

**Test strategy:**
| What | Level | Why this level |
|---|---|---|
| `toPublicDto` PII exclusion (no handle/email in output) | Unit (mocked Prisma) | Correctness/logic risk, matches existing convention, and this is the single highest-severity thing to get provably right |
| Vote-tally merge (member `voterIds` + guest `votedNightOptionId`) | Unit (mocked Prisma) | Pure computation risk |
| Guest-row cap / lock enforcement | Unit (mocked Prisma) | Business-rule risk |
| Cookie issuance/reuse round-trip | Manual (documented curl session in PR) | No e2e harness exists in this repo (verified in Discovery); introducing one is out of scope for this plan — flagged as a follow-up in §11 |
| Full guest journey (view → RSVP → vote → convert) | Manual browser walkthrough, both `local` and `http` modes | UI/integration risk; per this project's own standard, UI changes are verified by using the feature in a browser |
| Migration backfill against real seed data | Manual (`pnpm db:migrate` run against a dev DB copy) | Data-safety risk on a table with pre-existing rows |

**Edge cases to cover:** empty/whitespace-only display name (reject), display name at the 40-char
boundary, RSVP status changed twice in a row by the same guest (last write wins, no duplicate rows),
vote for a nonexistent `option_id` (400), claim called twice by the same now-authenticated user
(idempotent), claim called by a second, different user against an already-claimed `GuestRsvp` (409),
outing locked *after* a guest already voted (existing vote stands, no further writes), slug collision
during generation (retried, not surfaced as an error).

**Non-functional checks:** `GET /outings/public/:slug` latency — no formal load test this phase (not
warranted at current traffic), but sanity-check response time manually during Slice 2/3's manual
verification and note it in the PR description against the blueprint's <800ms p95 aspiration.

## 8. Rollout

**Migration order:** expand (nullable `slug` + new tables) → backfill (generate slugs for existing
rows) → contract (`NOT NULL` + unique constraint) — all three steps are combined into Slice 1's single
migration file since the backfill set is tiny (dogfooding-scale data) and doing it as one deploy is
lower-risk here than coordinating three separate deploys for a handful of rows. If the production
`Outing` table ever grows large before this ships, split Slice 1 into three separate migrations
instead — call this out to whoever executes the slice as a judgment call to make based on current row
count at build time.

**Feature flag:** not building one. The new public routes and web route are inert until an outing has
a `slug` in a shared link — there's no user-visible surface to gate behind a flag beyond "has anyone
been given a link yet," which is naturally true. If a kill switch is wanted anyway, the cheapest one is
already built in: lock every outing (an admin action) or, at the infra level, temporarily block the
`/outings/public/*` and `/o/*` paths at the reverse proxy — no code flag needed.

**Staged rollout:** ship to the founder's own dogfooding circle first (per the blueprint's Phase 0/1
framing — "your circle" tests this before it's shared externally); no formal staged-percentage rollout
mechanism exists in this stack and building one is out of scope.

**Rollback:** application-code rollback is safe at any point (all schema changes are additive; reverting
the deployed code leaves harmless unused columns/tables behind). No step in this plan makes a code
rollback unsafe.

**Monitoring:** the `Event` table is the monitoring surface for this feature's actual success (funnel
counts by type over time) — no dashboard is built this phase (Non-goals), so "monitoring" for now means
someone can run a `SELECT type, count(*) FROM events GROUP BY type` manually against the exit-gate
metrics. Standard existing request logging covers operational health (error rates, latency) with no
new work needed.

**Comms:** none required — no existing external consumer of `OutingDto` or the auth contract is broken;
the Flutter client's shared contract gains new *additive* types it can ignore until it chooses to use
them.

## 9. Stop-and-ask triggers

The implementor must stop and ask rather than decide alone if:
- The current `Outing.status` transition logic doesn't actually give a reliable "has this outing's
  date passed" signal for Slice 8's post-outing CTA — the plan assumes one exists or is inferable from
  `status === 'done'` plus the chosen night option's label/date; if that inference doesn't hold up on
  inspection, the CTA logic needs a real decision, not a guess.
- The existing circle-admin-only check pattern (for Slice 5's lock/unlock) turns out to be more
  complex or different in shape than the circle edit/delete precedent this plan assumes — don't
  improvise a new authorization pattern.
- Production row count for `Outing` at implementation time is large enough that the combined
  expand-backfill-contract migration (Slice 1) is a real risk rather than a formality — split it into
  three deploys instead of guessing it's fine.
- Any acceptance criterion in this plan turns out to be untestable as written given what the
  codebase's existing test conventions can actually reach (beyond the one already flagged — cookie
  round-trip — which this plan already routes around via a documented manual check).

## 10. Open questions

| Question | Owner | Blocks? | Default if unanswered |
|---|---|---|---|
| Human-readable slugs (movie-title-based) vs. the opaque random slug this plan specifies | Product (you) | No — Decision 4 already picks a working default | Ship opaque slugs now; revisit as a follow-up (§11) once the base mechanism is proven |
| Exact wording/design of the guest-facing UI (name prompt copy, "closed for planning" state, post-outing CTA copy) | Product/design (you) | No — implementor can use reasonable placeholder copy matching the app's existing tone | Implementor writes copy consistent with existing UI strings, flags it for a copy pass before wide sharing |
| Whether to build a minimal e2e/integration test harness now, given this plan is the first feature to really need one (cookie round-trips) | Engineering (you) | No — this plan routes around it with a documented manual check | Ship with the manual-check approach; treat "add an e2e harness" as separate, explicit follow-up work if this pattern recurs |

## 11. Out of scope follow-ups

- Human-readable slugs (movie-title + short suffix), once the opaque-slug mechanism is proven.
- Branded, composited OG preview images instead of the raw movie poster.
- Guest theater voting, if abuse/engagement data from the night-vote-only launch supports it.
- Auto-prompting a converted guest to join the circle (reusing the existing invite-accept flow).
- A minimal e2e/integration test harness (real Postgres + supertest against a running Nest instance) —
  this plan is the first feature whose core risk (cookie/session behavior) a mocked-Prisma unit test
  genuinely can't cover; if more features like this arrive, that gap is worth closing deliberately
  rather than routing around it again.
- A real analytics read path over the `Event` table (even a simple internal admin count endpoint) once
  there's enough data to be worth looking at.
