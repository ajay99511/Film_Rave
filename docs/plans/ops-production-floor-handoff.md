# Handoff: Ops/Production Floor (CI, Structured Logging, Security, Dockerfiles, GCP Deploy Readiness)

**Plan:** `docs/plans/ops-production-floor.md`  ·  **Status:** Complete for the "configs, CI, and
code" scope the user set. All 7 slices done; typecheck/lint/test clean (51/51 tests); both
Dockerfiles verified with real `docker build` + `docker run` against a real Postgres, catching and
fixing three genuine bugs along the way (details below). `deploy.yml` and the runbook are correct
by design and careful review but — as the plan itself said from the start — cannot be functionally
verified without a real GCP project, which was never in scope for this pass.

## Summary

The repo now has: a required CI gate (typecheck/lint/test/build on every PR), working lint for the
two packages that couldn't run it at all before, GCP-Cloud-Logging-shaped structured JSON logging
with per-request correlation ids, `helmet` security headers (with the one cross-origin interaction
that would have actually broken this API's frontend proactively fixed, not left to chance), an
exhaustive ratings-visibility test matrix with a real anti-vacuous-test check performed (not just
described), and Dockerfiles for both apps that build and run correctly against a live database —
verified for real, which surfaced and fixed three bugs that would otherwise have only shown up on a
real Cloud Run deploy. A deploy workflow and a GCP setup runbook exist, ready for the user's first
real deploy once they provision a GCP project.

## Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| A PR with a deliberate failure is blocked by a required check | **Partial** | `ci.yml` written and YAML-validated; the plan's own bar for this ("open a real throwaway PR") requires the user's say-so to push — not done this session, flagged as the one thing only the user can close |
| `pnpm lint` succeeds across all three packages | Met | `pnpm lint` → exit 0, all three packages, confirmed repeatedly through the session as new files were added |
| API log lines are single-line JSON with `severity`/`message`, shared correlation id per request | Met | Verified twice: a standalone `pino` config-shape check, then — better — real `docker run` output showing exactly `{"severity":"INFO",...,"message":"..."}` lines from the actual running container |
| `helmet` headers present on every response | Met | Real `docker run` + curl against a live container: `X-Content-Type-Options: nosniff` and the full helmet header set confirmed present |
| Ratings-visibility matrix covers every `{none,approved,selective}×{member,non-member}×{self,other}` combination and fails if weakened | Met | 8 new table-driven test cases added; the anti-vacuous check was actually performed (not just planned) — see "Verification performed" |
| `docker build` succeeds for both apps; images start, bind `$PORT`, answer health/readiness | Met | Both images built and run for real against the local docker-compose Postgres; `/health` returned `{"status":"ok","db":true,...}` for the API, `HTTP 200` from web's marketing page |
| GCP runbook + `deploy.yml` exist, runbook is unambiguous to a first-time reader | Met (as far as it can be) | Both written; a genuine self-review read-through was done and found one real gap (missing `PROJECT_NUMBER` lookup command), fixed. Cannot be functionally run — no GCP project exists |
| Nightly backup documented as Cloud SQL config, not a bespoke script | Met | Runbook §3: exact `gcloud sql instances create` flags (`--backup-start-time`, `--enable-point-in-time-recovery`, `--retained-backups-count`) |

## Changes

| File | Change |
|---|---|
| `apps/api/eslint.config.mjs`, `packages/shared/eslint.config.mjs`, `packages/shared/tsconfig.eslint.json` (new) | Flat ESLint configs (typescript-eslint recommended-type-checked); the extra tsconfig lets type-checked linting see `*.test.ts` files the build tsconfig excludes |
| `apps/api/package.json`, `packages/shared/package.json` | Added `eslint`/`typescript-eslint` devDependencies (version-aligned with apps/web's existing `^9.19.0`); apps/api also gained `helmet`, `nestjs-pino`, `pino`, `pino-http`, `pino-pretty` |
| `apps/api/src/config/env.validation.ts` | Fixed a real `no-base-to-string` lint error (imprecise `String(unknown)` coercion); replaced the `console.warn` with a hand-written GCP-shaped JSON line (DI isn't available at that point in bootstrap) |
| `apps/api/src/notifications/notifications.service.ts` | Fixed an eslint-vs-tsc disagreement the hard way, not the easy way — see Surprises |
| `apps/api/src/outings/outings.service.spec.ts`, `apps/api/src/outings/public-outings.service.spec.ts` | Small fixes for genuine (not suppressed) lint errors: replaced `as never` casts with the real `RsvpStatus` enum |
| `apps/api/src/common/circle-access.guard.spec.ts` (new) | 4 tests: member passes, non-member/missing-user/missing-circleId all 403 |
| `apps/api/src/circles/circles.service.spec.ts` | +8 table-driven tests: the full ratings-visibility matrix |
| `apps/api/src/logging/logging.module.ts` (new) | `nestjs-pino` wiring, GCP severity/message field mapping (prod only), per-request correlation id from `X-Cloud-Trace-Context`, pino-pretty in dev |
| `apps/api/src/app.module.ts` | Registers `LoggingModule` |
| `apps/api/src/main.ts` | `app.useLogger()`, `helmet()` with `crossOriginResourcePolicy: 'cross-origin'` (see Deviations), boot line now goes through the structured logger |
| `apps/api/Dockerfile` (new) | Multi-stage, `pnpm deploy --legacy` for a pruned prod-only final stage, Prisma regenerated against the deployed path (see Surprises — this is the fix for a real crash) |
| `apps/web/Dockerfile` (new) | Multi-stage, Next.js standalone output, builds `@filmrave/shared` first (real bug fix), `NEXT_PUBLIC_*` as build args |
| `apps/web/next.config.ts` | Added `output: 'standalone'` |
| `.dockerignore` (new) | Standard excludes |
| `.github/workflows/ci.yml` (new) | Required PR/push gate: install → build shared → typecheck → lint → test → build both apps |
| `.github/workflows/deploy.yml` (new) | Manual-trigger deploy: migrate (via Cloud SQL Auth Proxy) → deploy API → read its URL → build web with that URL baked in → deploy web. WIF auth, Secret Manager references, no long-lived keys |
| `docs/GCP_DEPLOY_RUNBOOK.md` (new) | Full manual GCP setup, in order, including the first-deploy CORS/URL bootstrapping wrinkle |
| `docs/plans/ops-production-floor.md` (new) | The plan this implements |

**Commits:** none yet — left for the user's explicit commit step, matching how this session has
worked throughout (each completed, verified unit gets its own commit once reviewed).

## Verification performed

- `pnpm typecheck` / `pnpm lint` / `pnpm test` — run repeatedly through every slice, clean at the
  end: **51/51 tests**, 0 typecheck errors, 0 lint errors across all three packages
- **Real anti-vacuous-test check for the ratings-visibility matrix**, exactly as the plan demanded:
  temporarily inverted the `Approved` and `Selective` branches in `packages/shared/src/visibility.ts`,
  rebuilt the shared package, reran the suite — **7 tests went red**, including both new matrix
  cells specifically targeting those branches — then reverted and confirmed all 51 pass again
- **Real structured-logging verification**, twice: a standalone `pino` script using the exact
  production formatter config (confirmed the JSON shape), then superseded by real output from the
  actual running Docker container showing the same shape live
- **Real helmet+CORS functional verification** (the plan's own fallback for "no browser available"):
  a scripted CORS preflight (`OPTIONS` with `Origin` + `Access-Control-Request-Method/Headers`)
  against the running API container returned a fully correct `204` with
  `Access-Control-Allow-Origin`, `-Credentials`, `-Methods`, `-Headers` all present alongside every
  helmet header including the corrected `Cross-Origin-Resource-Policy: cross-origin`
- **Real `docker build` + `docker run` for both apps**, against the actual local docker-compose
  Postgres (reachable via the shared Docker network): API's `/health` returned
  `{"status":"ok","db":true,...}`; web served its marketing page at `HTTP 200`. This caught and
  fixed three real bugs — see Surprises below, each one a genuine defect a `docker build`-only
  check (no `run`) would have missed entirely
- `pnpm --filter=@filmrave/api deploy --prod --legacy <dir>` — run directly on the host (no Docker
  needed for this part) before ever putting it in the Dockerfile, which is how the `--legacy` flag
  requirement and the Prisma-regeneration bug were found cheaply, before burning Docker build time
  on them repeatedly
- `next build` with `output: 'standalone'` — run directly, output structure inspected to get the
  Dockerfile's `COPY` paths exactly right rather than guessed
- Both workflow YAML files parsed and structurally validated with a real YAML parser (no
  `actionlint` available in this environment) — caught and fixed one real syntax error (an unquoted
  colon inside a step name broke the deploy workflow's YAML entirely)
- Image size sanity check: API 445MB, web 244MB — neither absurd, matching the plan's own
  no-hard-budget "eyeball" standard

**Not verified — be aware before treating this as fully done:**
- **`ci.yml` has not run against real GitHub Actions.** Its structure and syntax are validated, and
  every command in it is one this session already ran successfully locally (typecheck/lint/test/
  build), but the actual CI environment (runner OS, caching behavior, `pnpm/action-setup`) was never
  exercised. Open a real PR (even a throwaway one) to close this — the plan flagged this as needing
  your authorization, not mine to do unilaterally.
- **`deploy.yml` and the runbook are entirely unexecuted.** No GCP project exists for this session to
  test against — this was explicit, agreed scope from the start ("configs, CI, and code only... I
  don't have your GCP credentials"), not a gap that crept in. Treat the whole deploy path as a
  first-draft to be debugged during your actual first deploy, most likely at exactly the two places
  already flagged in the runbook itself: the Prisma Cloud SQL socket connection-string syntax
  (§6, explicitly marked unverified) and the CORS/URL bootstrapping order on the very first run
  (§10).
- **`pnpm lint`'s `next lint` step is a deprecated command** (Next.js says so in its own output,
  removal planned for Next 16). It still works today; not fixed here per the plan's own Non-goals
  (out of scope, not blocking).

## Deviations from the plan

| Plan said | I did | Why | Affects |
|---|---|---|---|
| eslint/typescript-eslint as **root** `package.json` devDependencies | Added them to `apps/api/package.json` and `packages/shared/package.json` individually instead | Matches the existing convention exactly (`apps/web` already declares its own `eslint`); avoids relying on pnpm's root-hoisting behavior for `.bin` resolution, which is a real, if usually-fine, source of cross-platform inconsistency I didn't want to introduce speculatively. pnpm's lockfile still dedupes identical version ranges to one resolved version regardless of which package.json declares them, so the plan's actual goal (one shared resolved eslint version) is still met. | None functionally. |
| `pnpm deploy --prod` (no flag mentioned) in the Dockerfile | Used `pnpm deploy --prod --legacy` | Empirically discovered: pnpm v10's non-legacy deploy path requires `inject-workspace-packages=true` set workspace-wide in `.npmrc`, which would change how *every* pnpm command in the repo resolves workspace dependencies — a bigger, unrelated change for a Dockerfile-only need. `--legacy` scopes the fix to the one command that needs it. Found and fixed by actually running the command, not by reading docs in advance. | None outside the Dockerfile. Flagged with a comment in the file itself. |
| (implicit) `prisma generate` once, in the build stage, is sufficient | Added a **second** `prisma generate` call, explicitly targeted at the deployed path, after `pnpm deploy` | `pnpm deploy`'s own fresh install re-triggers `@prisma/client`'s postinstall hook, silently regenerating a *different*, broken client after the build stage's correct one — the deployed container crashed at startup with an ESM/CJS mismatch until this was added. Found via a real `docker build && docker run`, not anticipated in the plan. | Adds ~4 seconds to the API image build. Worth understanding if this Dockerfile is ever restructured — the ordering (deploy, *then* regenerate) is load-bearing, not arbitrary. |
| `NEXT_PUBLIC_*` values reach the deployed web app somehow (not specified precisely) | Wired them as Docker **build args**, not Cloud Run runtime env vars, and restructured `deploy.yml` to deploy the API first, read its URL back, and only then build the web image | Next.js inlines `NEXT_PUBLIC_*` values into the client bundle at `next build` time — setting them as Cloud Run runtime env vars (as the plan's original sketch implied by treating them like the API's secrets) would have silently done nothing. This is a real, non-obvious Next.js behavior the plan's design section didn't work through at this level of detail. | This is a genuine architectural correction, not a cosmetic one — a deploy following the plan's original implicit ordering would have shipped a web app pointed at nothing. Worth the plan's author's attention specifically. |
| Helmet defaults, verified via a "real functional check" (browser or curl substitute) | Did the curl-preflight substitute for real, against a real running container (not a mock), **and** proactively set `crossOriginResourcePolicy: 'cross-origin'` before ever running that check | The plan anticipated *checking* for a helmet/CORS conflict; I additionally reasoned about which specific helmet default (`Cross-Origin-Resource-Policy: same-origin`) would definitely break a deliberately-cross-origin API, and fixed it proactively rather than waiting to discover it empirically first. The later real Docker verification confirmed the fix is correct. | None negative — this is strictly more rigorous than the plan asked for, not a shortcut. |

## Decisions I made

- **`apps/web/public/` doesn't exist in this repo at all.** Rather than invent placeholder assets
  (out of scope — this is ops work, not frontend work) or silently skip the Dockerfile's `COPY` of
  it (which would have broken the build, as it did on the first attempt), I added a one-line
  `mkdir -p apps/web/public` in the build stage so the copy is always valid, empty or not. Cheap to
  overrule: delete that line once real static assets exist and are committed with their own
  directory.
- **Web's `GOOGLE_CLIENT_ID` build-arg is sourced from a GitHub *secret*, not a *variable***, even
  though OAuth client IDs aren't actually sensitive (they're public-facing by design). Slightly more
  conservative than strictly necessary; harmless, and avoids a footgun if someone later assumes
  "secret" always means sensitive in this repo's GitHub config. Cheap to move to a variable if
  preferred.
- **`ci.yml` runs everything in one sequential job**, not parallel jobs, exactly as the plan
  specified and justified (small monorepo, parallel jobs would need artifact-passing for the shared
  package's `dist/`, not worth it at this scale). No deviation — noted here only because it's a
  deliberate choice worth the reviewer knowing was considered, not an oversight.

## Surprises and findings

- **Three real, load-bearing bugs were caught and fixed by actually running `docker build` +
  `docker run`, not just `docker build`:**
  1. The API image crashed at startup (`SyntaxError: Named export 'PrismaClient' not found`) —
     traced to `pnpm deploy`'s fresh install re-triggering Prisma's postinstall hook and silently
     producing a broken client. Fixed with an explicit second `prisma generate` targeted at the
     deployed path.
  2. The web image failed to build at all (`Module not found: Can't resolve '@filmrave/shared'`) —
     the Dockerfile never built the shared package before building web. Fixed with one added
     `RUN pnpm --filter @filmrave/shared build` step.
  3. The web image's runtime `COPY` step failed outright because `apps/web/public/` doesn't exist in
     this repo. Fixed with a defensive `mkdir -p`.

  None of these three would have been caught by a `docker build`-only check, or by static review —
  all three needed an actual running container to surface. This is the concrete argument for why the
  plan insisted on real verification over "it should work" reasoning, borne out in practice.
- **A fourth, purely architectural issue was caught by reasoning, not by running anything**: the
  original plan's implicit approach to `NEXT_PUBLIC_*` env vars would have shipped a web app that
  silently pointed at no API at all, discoverable only after a real deploy (which was never going to
  happen this session anyway) — potentially the most expensive bug of the four to have shipped,
  since it would have looked like a successful deploy right up until a user tried to sign in.
- **`Outing.movieTmdbId` still has no Prisma relation to `Movie`** (noted in a previous session's
  handoff, unrelated to this plan, not touched here) — still true, still a small follow-up worth
  doing deliberately.
- Docker Desktop's availability was intermittent at the *start* of this session's work on this plan
  (as it had been for the earlier feature work), but came up and stayed up for the entire Slice 6
  verification — worth knowing it's not a hard environment limitation, just something to check each
  time.

## Risks and what to watch

- **Highest remaining risk: the Prisma Cloud SQL socket connection-string syntax (runbook §6) is
  unverified.** If it's wrong, the API will deploy successfully (Cloud Run doesn't validate the
  connection string) but crash or 503 on every DB-touching request, visible immediately via
  `/health` returning `db: false`. Cheap to detect on the first real deploy, explicitly flagged in
  the runbook so it isn't a mystery when it happens.
- **The CORS/URL bootstrapping order on the very first deploy (runbook §10)** is a real, inherent
  chicken-and-egg problem for two mutually-referential Cloud Run services, not a bug — but it's easy
  to trip over if the runbook isn't read carefully first. Flagged explicitly with two concrete
  workarounds.
- **`ci.yml` as a required check is not yet enforced** — creating the workflow file doesn't turn on
  GitHub's branch-protection requirement by itself; that's a manual one-time click in repo settings,
  called out in the plan but easy to forget precisely because there's no file to point to as
  "not done yet."
- **The eslint fix surfaced real, if small, lint debt** (9 errors across a handful of files) rather
  than zero — all fixed genuinely (real type-assertion corrections, a real coercion-safety fix, one
  narrowly-scoped and justified rule override for vitest-mock patterns), none suppressed to force a
  green exit code. Worth a skim of the diff specifically on `notifications.service.ts` and the two
  test files with `as never` removed, since those are exactly the kind of fix that's easy to get
  subtly wrong under a "just make lint pass" mindset — see Review guidance.

## Rollback

Every change here is additive or narrowly-scoped (new files, or small edits to `main.ts`/
`app.module.ts`/`env.validation.ts`/two test files/`next.config.ts`). No schema, no migration, no
data touched anywhere in this plan. To roll back any piece: revert the specific file(s) — nothing
here has a dependency on anything else in this plan being present (e.g., Dockerfiles work whether or
not `deploy.yml` exists; structured logging works whether or not helmet is wired).

## Follow-ups not done

- Open a real (even throwaway) PR to verify `ci.yml` against actual GitHub Actions — the one
  verification step this session structurally could not do without the user's say-so.
- Enable GitHub's branch-protection "required status check" for the CI workflow — a manual repo
  settings step, not a file.
- Do the actual GCP setup (`docs/GCP_DEPLOY_RUNBOOK.md`) and run `deploy.yml` for real — the entire
  point of this plan's "configs only" scope was to make this the next, separate step.
- Verify/correct the Prisma Cloud SQL socket connection-string syntax against the installed
  `@prisma/client` version's current docs before or during that first real deploy.
- Add the missing `Outing → Movie` Prisma relation (carried over from a previous session's handoff,
  still not done, still unrelated to this plan).
- Migrate off the deprecated `next lint` command before Next.js 16 removes it — not urgent, it works
  today.
- `pnpm audit` / Dependabot / Renovate for dependency vulnerability scanning — explicitly named as a
  good near-term addition in the plan's own open questions, not bundled into this pass.

## Review guidance

Look hardest at **`apps/api/Dockerfile`'s two `prisma generate` calls** and the comment explaining
why both exist — it's the least obvious piece of this entire change, it's the one that actually
crashed the container until fixed, and if anyone "simplifies" this Dockerfile later by removing the
second generate call because it looks redundant, the API will break again in exactly the same way,
silently, until the next real deploy.

Second: **`.github/workflows/deploy.yml`'s step ordering** (migrate → deploy API → read its URL →
build web → deploy web) — it looks like it could be reordered or parallelized for speed, and it
specifically can't be, for two independent reasons (migration-before-traffic-shift safety, and the
build-arg dependency on the API's URL). Both reasons are in the file's own comments, but this is
exactly the kind of ordering that survives a first read and then quietly gets "optimized" away in a
later PR by someone who didn't see this handoff.
