# FilmRave Architecture

## System shape

```
┌───────────────┐     ┌───────────────┐     ┌─────────────────────┐
│ Flutter app   │     │ Next.js web   │     │  @filmrave/shared   │
│ (mobile/      │     │ (marketing +  │     │  enums · DTOs ·     │
│  desktop/web) │     │  invite land) │     │  visibility rule    │
└───────┬───────┘     └───────┬───────┘     └─────────┬───────────┘
        │  HTTPS + WS         │  HTTPS                 │ (imported by
        └──────────┬──────────┘                        │  web + api)
                   ▼
         ┌───────────────────────┐        ┌──────────────┐
         │  @filmrave/api         │◀──────▶│  PostgreSQL  │
         │  NestJS · Prisma       │        └──────────────┘
         │  Socket.IO · Passport  │
         └───────────┬───────────┘
                     │ HTTPS
                     ▼
              ┌────────────┐
              │  TMDB API  │
              └────────────┘
```

## The wire contract (`@filmrave/shared`)

All three clients and the server speak one JSON dialect. Field names are
**snake_case**, matching the Flutter app's `@JsonKey(name: ...)` mappings, and
enum values are the exact `@JsonValue(...)` strings. The package exports:

- `enums.ts` — `MemberRole`, `RatingsShared`, `RelationshipStatus`, `RatingSource`,
  `OutingStatus`, `RsvpStatus`.
- `models.ts` — DTO interfaces for all 13 domain models.
- `visibility.ts` — `isRatingShared` / `isRatingVisible`, ported verbatim from
  `FilmRave/lib/providers/derived/visibility.dart`.

## Domain models (13)

`User`, `Circle`, `CircleMember`, `Friendship`, `Movie`, `Rating`, `ChatMessage`,
`WatchlistEntry`, `Outing`, `OutingRsvp`, `TheaterVote`, `GroupWatch`
(+ `ImportResult` as a transient DTO). See `apps/api/prisma/schema.prisma`;
DB columns are snake_case via `@map`, Prisma models stay camelCase.

## The visibility rule (the load-bearing invariant)

Two views, one implementation:

- **Aggregate view** (`isRatingShared`) — the plain sharing switch (approved →
  all, selective → listed movies, none → nothing). Drives group averages,
  "N of M rated", library inclusion. Self is **not** short-circuited.
- **Self-inclusive view** (`isRatingVisible`) — the author always sees their own
  score (UI labels it "only you" when unshared).

Server enforcement lives in `CirclesService.visibleRatings` /
`.groupAverage`: the API filters rows through these functions **before
serialization**, so an unshared rating is never transmitted to another user.
Covered by `circles.service.spec.ts` and `shared/visibility.test.ts`.

## API surface (prefix `/api/v1`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/auth/register` | – | Create account, returns tokens |
| POST | `/auth/login` | – | Login, returns tokens |
| GET  | `/auth/me` | JWT | Current user |
| GET  | `/users/by-handle/:handle` | – | Public profile (invite landing) |
| GET  | `/circles` | JWT | Circles the user belongs to |
| GET  | `/circles/:circleId` | JWT | One circle with roster |
| GET  | `/circles/:circleId/movies/:tmdbId/ratings` | JWT | **Visibility-filtered** ratings |
| GET  | `/circles/:circleId/movies/:tmdbId/group-average` | JWT | Shared group average |
| GET  | `/circles/:circleId/chat?movieTmdbId=` | JWT | Chat history |
| GET  | `/ratings/me` | JWT | Own ratings |
| PUT  | `/ratings` | JWT | Upsert rating (1–10) |
| DELETE | `/ratings/:tmdbId` | JWT | Remove rating |
| GET  | `/movies/search?q=` | JWT | TMDB search |
| GET  | `/movies/:tmdbId` | JWT | Movie (cache-through TMDB) |
| GET  | `/friendships` | JWT | Relationship list |
| POST | `/friendships/request` | JWT | Send request |
| POST | `/friendships/:otherId/accept` | JWT | Accept request |
| GET  | `/watchlist` | JWT | Own watchlist |
| POST | `/watchlist` | JWT | Add |
| DELETE | `/watchlist/:tmdbId` | JWT | Remove |
| GET  | `/outings?circleId=` | JWT | Circle outings |
| POST | `/outings/:outingId/rsvp` | JWT | Set RSVP |
| POST | `/outings/:outingId/vote` | JWT | Toggle theater vote |

## Realtime (Socket.IO, namespace `chat`)

Handshake carries the JWT in `auth.token`. Events:

- `thread:join` `{ circleId, movieTmdbId }` — join a movie-thread room.
- `message:send` `{ circleId, movieTmdbId, body, tempId? }` — persist + broadcast.
- `message:ack` `{ tempId, message }` — sent back to author to reconcile the
  optimistic row.
- `message:new` `{ ...message }` — broadcast to the rest of the room.

## Outing tie-breaks

`OutingsService.leadingOption` sorts theater options by vote count, breaking
ties by `position` (insertion order) — matching the Flutter client.

## Additions in this build (logged-in web client + gaps)

New Prisma models: `OtpChallenge`, `OutingHype`, `NightVote`, `Notification`
(+ `User.phone`, `User.avatarColor`). Local dev DB is **Postgres via
`docker-compose.yml`** — same engine as prod, so the scalar-array columns
(`shared_movie_ids`, `voter_ids`) need no refactor.

New / changed API endpoints (all `/api/v1`):

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/otp/request` | Issue a phone OTP (dev returns `dev_code`) |
| POST | `/auth/otp/verify` | Verify → tokens, or `needs_profile` + signup token |
| POST | `/auth/complete-profile` | Claim handle for a new phone → tokens |
| POST | `/auth/refresh` | Exchange refresh token for a fresh pair |
| GET  | `/auth/me` | Full profile (now returns `AppUserDto`) |
| POST | `/circles` | Create a circle (creator = admin) |
| PATCH | `/circles/:id/sharing` | Update own `ratings_shared` (+ selective ids) |
| GET  | `/circles/:id/feed` | Group Feed: movies + visibility-correct aggregates |
| GET  | `/circles/:id/members` | Member `AppUserDto`s for avatars/names |
| POST | `/circles/:id/group-watch` | Record a co-watch |
| POST | `/outings/:id/vote-night` | Toggle a proposed-night vote (tie-break by position) |
| POST | `/outings/:id/hype` | Set/clear own hype (0 clears); `group_hype` recomputed |
| GET  | `/users/search?q=` | Handle/name search (Find Friends) |
| POST | `/imports/ratings` | Import an IMDb/Letterboxd ratings CSV → `ImportResultDto` |
| GET  | `/notifications` · `/notifications/unread-count` | List + badge |
| POST | `/notifications/:id/read` · `/notifications/read-all` | Mark read |

The web `/add/:handle` invite page now resolves the viewer's session client-side
and sends a friend request (or routes to `/login`), on top of the SSR preview.
CSV import parses IMDb/Letterboxd exports, matches local catalog first then TMDB
(when configured), commits matched rows as `imdb`/`letterboxd`-sourced ratings,
and reports unmatched titles + duplicates.

`OutingDto` gained `night_options`, `hypes`, `group_hype`. RSVP now emits an
`rsvp_change` notification to the rest of the circle. The web client (`apps/web`,
route `/app`) ports the prototype's screens as a real React app: the broken
"÷2 / 5.0" rating slider is fixed to a correct 1–10 scale, the sharing control
(none/approved/selective) is surfaced in the group header, RSVP exposes
going/maybe/can't-go, and chat is live over the Socket.IO gateway.

## Roadmap (from research)

1. Push notifications (FCM) — in-app notifications are done; FCM delivery is next.
2. CI running all Vitest suites + the Flutter test suite. 3. Crash reporting +
analytics. 4. Contacts-based friend discovery.

Done since the original roadmap: universal/app-link handling on `/add/:handle`
(now sends a friend request), CSV import feeding `ImportResult`, and the
dedicated React client for the logged-in app (`apps/web` route `/app`).
