# Plan: Ops/Production Floor (CI, Structured Logging, Security Hardening, GCP Deploy Readiness)

**Tier:** Foundational overall (new hosting platform, CI/CD pipeline, secrets model, deployment
architecture) — but composed of slices at different tiers; each slice states its own tier and is
held to that bar, not the ceiling. See §4.

**Author / date:** planning session, 2026-09-09

**Status:** Draft — ready for implementation review

**Source:** `docs/PRODUCT_BLUEPRINT.md` §9 Phase 0 ("Ops floor: rate limiting… structured logging, a
smoke-test CI, deploy API+web to a real host with managed Postgres, nightly DB backup" + "Test
spine: service-level tests for ratings visibility… the most correctness-critical logic in the
app"). Rate limiting is already done (confirmed in discovery); everything else in that line is this
plan's scope.

**User decisions already made, not re-litigated here:**
- Hosting: **Google Cloud** — Cloud Run (both apps, containers) + Cloud SQL (managed Postgres).
  Deliberately GCP, not "a cloud."
- Scope of this pass: **configs, CI, and code only**. No live deployment — I have no GCP
  credentials/project for this user. The deliverable is a repo that deploys correctly the moment a
  GCP project exists and secrets are wired, plus a runbook for that manual setup. The deploy
  *workflow file* is written and correct; it is not *run*.
- Error tracking (Sentry etc.): explicitly deferred, not in scope.

---

## 1. Problem and outcome

**Outcome:** The product can be operated with the confidence a real user base requires — every
change is gated by an automated check before it reaches `main`, a production incident can be
diagnosed from logs without SSH-ing anywhere, the app's own byte-for-byte deploy artifact is
reproducible from source, and the single most trust-destroying failure class this codebase could
have (a private rating leaking to the wrong person) has a test suite that would catch it before
merge. Today none of this exists except rate limiting and a bare health check — the team is
flying blind on every push.

**Users / actors:**
- **The maintainer** (you) — gains a CI gate on every PR, structured logs that are actually
  searchable in Cloud Logging once deployed, and a documented, repeatable path to a real GCP
  deployment instead of "it works on my machine."
- **A future contributor** — gains a green-checkmark contract: if CI is green, typecheck/lint/tests
  pass and both apps build, without having to run four commands locally first.
- **End users** — indirectly protected: the ratings-visibility matrix is the concrete mechanism
  that keeps a private rating from ever reaching someone it wasn't shared with.

**Domain context:** This is infrastructure/process work, not a product feature — there is no new
domain entity. The "invariant" this plan protects is a process invariant: *no code that fails
typecheck, lint, or tests reaches `main` unreviewed*, and a security invariant already stated
elsewhere in the codebase (rating visibility) now gets a proof-by-test at the matrix level the
blueprint calls for.

**Acceptance criteria:**
- [ ] A PR that fails typecheck, lint, or any test is blocked from merging by a required GitHub
      Actions check (verified by opening a throwaway PR with a deliberate type error and observing
      the check fail red).
- [ ] `pnpm lint` succeeds (exit 0) across all three packages, including `apps/api` and
      `packages/shared`, which currently cannot run it at all.
- [ ] A log line emitted by `apps/api` in production is a single JSON object on one stdout line,
      containing GCP Cloud Logging's expected `severity` and `message` fields, and every log line
      within one HTTP request shares one correlation id.
- [ ] `helmet` (or equivalent) security headers are present on every API response (verified via a
      response header check, e.g. `X-Content-Type-Options: nosniff` present).
- [ ] A ratings-visibility matrix test exists covering every combination of
      `{none, approved, selective} × {member, non-member} × {self, other}` for both `RatingsShared`
      modes' effect on `isRatingVisible`/`CirclesService.visibleRatings`, and fails if the
      visibility rule is weakened.
- [ ] `docker build` succeeds locally for both `apps/api` and `apps/web`, producing images that
      start, bind `$PORT`, and answer their health/readiness endpoint when run with
      `docker run -e PORT=8080 -p 8080:8080 <image>` against a reachable Postgres.
- [ ] A GCP setup runbook exists (`docs/GCP_DEPLOY_RUNBOOK.md`) precise enough that the user can
      go from "no GCP project" to "first successful deploy" without guessing a single step, and a
      `deploy.yml` GitHub Actions workflow exists that, once the runbook's prerequisites are met,
      deploys both apps to Cloud Run on manual trigger.
- [ ] Nightly backup configuration is documented as exact `gcloud`/console settings to enable on
      the Cloud SQL instance — not a bespoke backup script, per the build-vs-config judgment in §4.

**Non-goals:**
- Actually creating any GCP resource, running `gcloud`, or deploying — explicitly out of scope per
  the user's own instruction this pass.
- Error tracking / crash reporting (Sentry or similar) — explicitly deferred.
- A Kubernetes/GKE setup, service mesh, or multi-region topology — nothing about this app's current
  traffic justifies that complexity; Cloud Run's scale-to-zero single-region model is the right
  size (see §4, Essentialism Triage).
- Terraform/Pulumi IaC — the runbook documents `gcloud` commands directly; introducing a full IaC
  tool for one project/one environment is premature (see §4, abstraction gates).
- Migrating `apps/web`'s lint off the deprecated `next lint` command — noted as a finding (§9), not
  fixed here, since it currently works and isn't blocking anything until Next 16.
- Fixing the `nestjs-pino` choice's philosophical alternative (Winston, plain `console.log` JSON) in
  exhaustive detail beyond the decision record in §3 — one library is chosen and justified, not
  bake-off tested.

**Constraints:**
- No GCP credentials available to me this session — everything GCP-side is documented, not executed.
- Must not break any currently-passing check: `pnpm typecheck` and `pnpm test` are clean today
  (39/39 tests, confirmed this session) and must remain so throughout.
- pnpm workspaces; Vitest (not Jest); Node ≥22 (per root `package.json` `engines`).

**Assumptions (load-bearing, flagged for verification):**
- The user will actually create a GCP project, enable billing, and follow the runbook before the
  `deploy.yml` workflow is ever run — until then it is inert (no schedule trigger, manual
  `workflow_dispatch` only), so its correctness can't be verified end-to-end this pass. **Verify
  by:** the user running it once, after runbook setup, as an explicit follow-up outside this plan.
- GitHub Actions is an acceptable CI host (implied by the existing GitHub remote + this session's
  own push access) — not re-asked, but flagged as the one platform choice made by inference rather
  than explicit user statement.

## 2. Current state

**What exists today** (verified this session, not assumed):
- `@nestjs/throttler` global 100/min + tighter `@Throttle` on auth/OTP routes — **done**, not
  touched by this plan.
- `GET /health` (`apps/api/src/health/health.controller.ts`) — `@SkipThrottle`, checks
  `SELECT 1`, returns `{status:'ok', db, uptime_s, timestamp}` on 200, throws
  `ServiceUnavailableException` (503) with `{status:'degraded', ...}` on DB failure. Excluded from
  the `/api/v1` prefix in `main.ts`. **Reusable as-is** as the Cloud Run health signal — no changes
  needed.
- `apps/api/src/config/env.validation.ts` — fail-fast on missing `DATABASE_URL`/`JWT_SECRET`/
  `GOOGLE_CLIENT_ID`; warns (non-fatal) if `TMDB_API_KEY` is absent; rejects the placeholder
  `JWT_SECRET` in production. **Pattern to extend**, not replace, for any new required env var.
- `apps/api/src/main.ts` — reads `PORT` via `ConfigService.get('PORT') ?? 4000` (not in the
  required-vars list, so Cloud Run's injected `PORT` works without any env.validation change),
  `app.set('trust proxy', 1)`, `app.setGlobalPrefix('api/v1', {exclude: ['health']})`, CORS via
  `CORS_ORIGINS` env var with `credentials: true`. **No `helmet` or any security-headers middleware
  present** — confirmed by reading the file fresh this session.
- `docker-compose.yml` — Postgres 16 for local dev only, comment explicitly says prod uses managed
  Postgres. No Dockerfile anywhere in the repo for either app.
- **Lint is broken for 2 of 3 packages, for two different reasons**, root-caused this session:
  - `apps/web` — **actually works** (`next lint` → "No ESLint warnings or errors", verified by
    running it). Has its own `eslint` devDependency (`^9.19.0`) and a flat
    `eslint.config.mjs` using `@eslint/eslintrc`'s `FlatCompat` to load `next/core-web-vitals` +
    `next/typescript`. Not broken; not touched by this plan except as the version-alignment
    reference for the other two packages.
  - `apps/api` and `packages/shared` — **both fail identically**: their `package.json` `lint`
    scripts call bare `eslint "src/**/*.ts"` / `eslint src`, but neither package (nor the root)
    declares `eslint` as a dependency anywhere, and neither has an `eslint.config.*` file at all.
    The lockfile only contains `eslint`'s *plugins* (`eslint-config-next`,
    `eslint-import-resolver-*`, etc. — transitive deps of `apps/web`'s `eslint-config-next`), never
    the `eslint` package itself. This is two missing things per package (dependency + config), not
    one.
- No structured logging: `apps/api` uses Nest's default `Logger` (plain text to stdout) plus two
  direct `console.*` calls (`env.validation.ts:31` a `console.warn` for missing `TMDB_API_KEY`,
  `main.ts:38` a `console.log` on boot) — both currently carry an eslint-disable comment implying
  they were deliberate one-offs, not a pattern to scale.
- Ratings-visibility test coverage: `packages/shared/src/visibility.test.ts` already unit-tests the
  **pure** predicate functions (`isRatingShared`/`isRatingVisible`) directly — covering the
  none/approved/selective × self/other logic at the pure-function level. `apps/api/src/circles/
  circles.service.spec.ts` has 3 tests for `CirclesService.visibleRatings` using a hand-mocked
  `PrismaService`, covering: unshared hidden from another member, self always sees own, non-member
  rejected. **Gap**: nothing tests the *wiring* — that `visibleRatings` actually calls the shared
  predicate correctly across the full matrix once real Prisma-shaped data (member lookup, rating
  lookup, `CircleAccessGuard`'s own membership gate) is involved, and nothing tests
  `CircleAccessGuard` in isolation at all.
- `apps/api/src/common/circle-access.guard.ts` — a `CanActivate` gate requiring
  `req.user.userId` + `req.params.circleId`, checking `CircleMember` exists; throws
  `ForbiddenException` otherwise. Pure boundary logic, no visibility-mode awareness of its own (that
  lives in the services it guards) — so its test scope is "is a non-member ever let through,"
  distinct from the ratings-visibility matrix itself.
- No `.dockerignore` anywhere in the repo.
- `.github/CODEOWNERS` exists (prior commit); `.github/workflows/` does not exist.
- `GOOGLE_CLIENT_SECRET` is already in `apps/api/.env.example` (parked, unused by the current
  ID-token verification flow, explicitly commented as "in case we later add the authorization code
  flow") — relevant to the Secret Manager inventory in §3 even though the app doesn't read it today.

**Reusable as-is:** `/health`, `env.validation.ts`'s pattern, `apps/web`'s eslint setup as the
version/style reference, `.env.example` files as the source of truth for what secrets exist.

**Must not break:** the 39 currently-passing tests, `pnpm typecheck` (clean today), `apps/web`'s
already-working lint, the local `docker-compose.yml` dev flow (`pnpm db:migrate && pnpm db:seed`
against it must keep working unchanged).

**Prior art / history:** none specific to CI/ops — this is genuinely new ground for the repo.

## 3. Design

**Approach in one paragraph:** Fix the two broken lint setups first (small, unblocks everything
else that gates on lint), then add a GitHub Actions CI workflow that runs install → typecheck →
lint → test → build as required PR checks. In parallel, wire `nestjs-pino` for structured,
GCP-Cloud-Logging-shaped JSON logs with a per-request correlation id, add `helmet`, and write the
ratings-visibility matrix test. Then add multi-stage Dockerfiles for both apps sized for Cloud Run
(`$PORT`, `0.0.0.0`, minimal final image), and a `deploy.yml` workflow (manual trigger) that builds,
pushes to Artifact Registry, runs `prisma migrate deploy` against Cloud SQL via the Cloud SQL Auth
Proxy, and deploys both Cloud Run services using Workload Identity Federation (no long-lived
service-account keys). A separate runbook document covers everything on the GCP console/`gcloud`
side that has no business being code: project creation, Cloud SQL instance + automated-backup
settings, Secret Manager entries, IAM bindings, WIF setup.

**Contracts:**

*New/changed files* (structure specified; exact content written during execution, not here):

| File | Purpose |
|---|---|
| `packages/shared/eslint.config.mjs` (new) | Flat config, `typescript-eslint` recommended + the package's own `tsconfig.json` for type-aware rules |
| `apps/api/eslint.config.mjs` (new) | Flat config, `typescript-eslint` recommended, NestJS-appropriate (allow decorators, `@Injectable` classes, etc.) |
| root `package.json` | Adds `eslint` + `typescript-eslint` as **root** devDependencies pinned to the same major version as `apps/web`'s (`^9.19.0` line), so all three packages share one resolved ESLint version — avoids the exact "which eslint" ambiguity that caused this gap |
| `.github/workflows/ci.yml` (new) | PR + push-to-main pipeline: install (pnpm, cached) → build `@filmrave/shared` → typecheck (all) → lint (all) → test (all) → build `apps/api` and `apps/web`. See stage-ordering decision below. |
| `.github/workflows/deploy.yml` (new) | `workflow_dispatch`-only (manual trigger, not on push) — build+push Docker images to Artifact Registry, run `prisma migrate deploy` against Cloud SQL, deploy both Cloud Run services. Auths via Workload Identity Federation, references GCP Secret Manager secrets by name, never embeds a value. |
| `apps/api/Dockerfile` (new) | Multi-stage: deps → build (incl. `@filmrave/shared`) → slim runtime. Listens on `$PORT`, `0.0.0.0`. |
| `apps/web/Dockerfile` (new) | Multi-stage, Next.js `output: 'standalone'` (requires a `next.config` check/edit — see Slice 6), listens on `$PORT`, `0.0.0.0`. |
| `.dockerignore` (new, root) | `node_modules`, `.git`, `**/.next`, `**/dist`, `docs/`, etc. |
| `apps/api/src/logging/` (new module) | `nestjs-pino` wiring: `LoggerModule.forRootAsync`, GCP-shaped field mapping, request-id middleware/interceptor |
| `apps/api/src/main.ts` | Add `app.use(helmet())`; swap Nest's bootstrap logger for the pino logger (`app.useLogger(app.get(Logger))`); replace the one remaining `console.log` boot line with the structured logger |
| `apps/api/src/config/env.validation.ts` | Replace the one `console.warn` with the structured logger (can't use Nest's DI logger inside a plain `validate` function called by `ConfigModule.forRoot` before the app exists — resolve this ordering concretely in Slice 3, don't hand-wave it) |
| `apps/api/src/common/circle-access.guard.spec.ts` (new) | Isolated guard tests: member passes, non-member 403, missing circleId/userId 403 |
| `apps/api/src/circles/circles.service.spec.ts` | Extended with the full ratings-visibility matrix (new `describe` block, additive to existing tests) |
| `docs/GCP_DEPLOY_RUNBOOK.md` (new) | Manual GCP setup steps, in order, including Cloud SQL backup settings |
| `apps/web/next.config.ts` (or `.mjs`, whichever exists) | Add `output: 'standalone'` — verify current file/format during Slice 6 discovery, don't assume |

**Data model changes:** none — this plan touches no Prisma schema, no migration.

**Flow — CI (main path):** PR opened/updated → GitHub Actions triggers `ci.yml` → pnpm install
(cached by lockfile hash) → `pnpm --filter @filmrave/shared build` (dist must exist before
api/web typecheck against it, matching this session's own established pattern) → `pnpm typecheck`
→ `pnpm lint` → `pnpm test` → `pnpm --filter @filmrave/api build` (nest build) →
`pnpm --filter @filmrave/web build` (next build) → all green → PR mergeable (branch protection
rule, configured by the user in GitHub's UI — **not** something a workflow file can set for itself;
call this out as a manual one-time step in the runbook, not code).

**Flow — deploy (manual, future, not run this pass):** user runs `workflow_dispatch` on
`deploy.yml` → build+tag Docker images (git SHA tag) → push to Artifact Registry → Cloud SQL Auth
Proxy connects, `prisma migrate deploy` runs against Cloud SQL → on success, `gcloud run deploy` for
both services with the new image tag, env vars sourced from Secret Manager references → on
migration failure, the workflow **stops before touching Cloud Run** (old revision keeps serving) —
this ordering (migrate-then-deploy, not deploy-then-migrate) is deliberate, see Decision 3.

**Cross-cutting:**
- **Authz:** N/A — no new user-facing authorization surface. `deploy.yml`'s GCP auth is
  machine-to-machine (WIF), covered in Decision 4.
- **Validation:** N/A for CI/Docker; env.validation.ts's existing pattern is reused, not redesigned.
- **Observability:** this plan *is* the observability work — see Decision 1/2.
- **Performance:** Docker image size matters for Cloud Run cold-start; multi-stage builds strip
  dev dependencies and build tooling from the final image (budget: unspecified hard number, but
  "final stage installs `--prod` only" is the concrete mechanism, verified by `docker images` size
  sanity-check in Slice 6, not a formal budget).
- **Accessibility/i18n:** N/A, no UI.

## 4. Design judgment

**Must be right now:**
- The structured-log field shape (targeting GCP Cloud Logging's `severity`/`message`/trace
  contract) — retrofitting a log format after dashboards/alerts are built on it is expensive. Decide
  once, correctly, now (Decision 1).
- The DB connectivity pattern for Cloud Run → Cloud SQL (Unix socket via the built-in Cloud Run
  connector, not a hand-rolled proxy sidecar) — this shapes the `DATABASE_URL` format the app must
  accept, a contract the Prisma datasource and the deploy workflow both depend on (Decision 2).
- Migration-before-traffic-shift ordering in the deploy workflow (Decision 3) — get this backwards
  and a bad migration can go live before anyone notices.

**Should be there at ship:**
- `helmet` security headers — cheap, standard, no reason to defer.
- The ratings-visibility matrix — explicitly named by the blueprint as the highest-priority test
  debt; cheap now, painful the day a real visibility regression ships unnoticed.
- CI as a **required** check (branch protection) — a CI workflow that runs but isn't required to
  pass is decoration, not a gate. This is a one-time manual GitHub setting, documented in §8, not
  something `ci.yml` itself can enforce.

**Deferred, with a seam:**
- Sentry/error tracking — the seam is that `nestjs-pino`'s error-level logs already carry full
  stack traces in Cloud Logging; adding Sentry later is an additional sink, not a rework.
- Terraform/IaC — the seam is that the runbook's `gcloud` commands are individually re-runnable and
  idempotent-ish (documented per-command); converting them to Terraform later is a translation, not
  a redesign, once there's a second environment or a second engineer who'd benefit from IaC's
  audit trail.
- A staging environment / multi-environment Cloud Run setup — the seam is that `deploy.yml`
  parameterizes the environment name even though only "production" is wired today (see Decision 5
  Alternatives); adding staging later means adding a second `workflow_dispatch` input value, not a
  new workflow file.

**Explicitly not doing:**
- GKE/Kubernetes — Cloud Run is the right size for this traffic level (see engineering-standards'
  own "boiling the ocean"/premature-scale failure mode); revisit only if Cloud Run's own request
  concurrency limits are actually hit.
- A bespoke backup script — Cloud SQL's built-in automated backups + point-in-time recovery is
  strictly better (managed, tested by Google, zero code) than anything hand-rolled; the plan
  documents the exact settings to flip on, not a cron job (this is the Abstraction Decision
  Procedure's Gate 4 failing outright: a bespoke mechanism would *add* complexity over the existing
  platform answer, not reduce it).
- Long-lived GCP service-account JSON keys in GitHub Secrets — Workload Identity Federation is
  GCP's current best practice specifically to avoid this (Decision 4); a JSON key would be simpler
  to wire today and meaningfully worse for the lifetime of the repo.

**Abstraction decisions:**

| Tempting generalization | Evidence of variation | Decision | Reason |
|---|---|---|---|
| Multi-cloud-agnostic logging format (support GCP and AWS CloudWatch shapes) | One target platform (GCP), no second one named or planned | Target GCP's field shape only | Gate 1 fails — no second case |
| A generic "deploy to any environment" workflow with full environment-matrix support | One environment (production) exists; staging is a future seam, not a current case | Single-environment `deploy.yml`, with an environment-name input left as the seam (see Deferred) | Gate 1 fails for the matrix; the seam costs one parameter, not a redesign |
| A custom CLI wrapper around `gcloud`/`docker` for "deploy commands" | Every deploy step is already a single well-documented CLI invocation | Plain `gcloud`/`docker` commands in the workflow YAML | Gate 4 fails — a wrapper adds a layer without reducing total complexity for one workflow file |

**One-way doors:**
- **GCP as the hosting platform.** Already decided by the user, not re-opened here. Consequence:
  every other decision in this plan (Cloud Run's contract, Cloud SQL's connection model, Secret
  Manager, Artifact Registry) inherits from this choice. Reversing it later means rewriting the
  Dockerfiles' env assumptions and the entire deploy workflow — a real but bounded cost, since the
  application code itself (Nest/Next/Prisma) has no GCP-specific code, only the deploy plumbing does.
- **The structured-log field names.** Two-way in theory (logs are just text), but expensive to
  reverse once Cloud Logging-based alerts/dashboards are built on specific field names. Treated as
  effectively one-way for planning purposes — get Decision 1 right now.
- **Workload Identity Federation over service-account keys.** One-way in the sense that it's simply
  the correct choice with no real downside once set up; documented as a decision record anyway
  because the runbook must get its setup exactly right (WIF misconfiguration is a common
  source of confusing auth failures).

**Decision records:**

> **Decision 1: Structured logging via `nestjs-pino`, with a custom formatter emitting GCP Cloud
> Logging's expected field shape (`severity`, `message`, `logging.googleapis.com/trace`).**
> **Context:** Cloud Run ingests stdout and forwards it to Cloud Logging; if the stdout line is JSON
> with the right field names, Cloud Logging parses it into structured, filterable, severity-colored
> log entries with request-trace correlation in its UI. If not, every line is dumped as a raw
> unstructured text blob under `textPayload` — technically "logged," practically useless for
> debugging.
> **Alternatives:**
> - *Nest's default `Logger`, left as plain text.* Rejected — fails the acceptance criterion
>   outright; this is the status quo the plan exists to fix.
>   *Winston (`nest-winston`).* Rejected — also a fine, widely-used choice, but `pino` is
>   measurably faster (lower serialization overhead, relevant on Cloud Run's per-request billing
>   model) and `nestjs-pino` specifically has first-class Nest interceptor/middleware integration
>   for the correlation-id requirement below; no concrete advantage of Winston surfaced for this
>   app's needs to justify picking the less common of two otherwise-equivalent options.
> - *Hand-rolled `console.log(JSON.stringify(...))` wrapper, no library.* Rejected — reinvents
>   request-context propagation (the correlation id needs to be threaded through every log call
>   within a request without every call site passing it manually), which `nestjs-pino`'s
>   `Logger`/`PinoLogger` DI integration already solves via Nest's request-scoped providers.
> **Consequences:** One new runtime dependency (`nestjs-pino`, `pino-http`). Every existing
> `this.logger.log(...)`/`new Logger(...)` call site in the codebase (grep during Slice 3) keeps
> working unchanged — `nestjs-pino` provides a drop-in `Logger` implementation, so no call-site
> rewrite is needed, only the bootstrap wiring in `main.ts` and the module registration. Reversal:
> swap the `LoggerModule` registration for a different one; call sites are unaffected either way.

> **Decision 2: Cloud Run ↔ Cloud SQL connectivity via the built-in Unix-socket connector, not a
> proxy sidecar container or public IP.**
> **Context:** Cloud Run has a native `--add-cloudsql-instances` flag that mounts a Unix socket at
> `/cloudsql/PROJECT:REGION:INSTANCE` inside the container, authenticated via the service's own IAM
> identity — no separate proxy process to manage, no public IP/password exposed to the internet.
> **Alternatives:**
> - *Cloud SQL Auth Proxy as a manually-run sidecar.* Rejected — Cloud Run's native integration is
>   strictly simpler for a single-container-per-service setup (which is what both apps are) and is
>   Google's own current recommendation for Cloud Run specifically; a sidecar is the right answer on
>   GKE, not here.
> - *Public IP + password, IP-allowlisted.* Rejected outright on security grounds — exposes the DB
>   to the internet behind only a password, and Cloud Run's outbound IPs aren't static without
>   additional networking (a Serverless VPC Connector), making allowlisting impractical anyway.
> **Consequences:** `DATABASE_URL` at deploy time takes the form
> `postgresql://USER:PASSWORD@localhost/DBNAME?host=/cloudsql/PROJECT:REGION:INSTANCE&schema=public`
> (Prisma supports the `?host=` socket-path query param on its Postgres connector — verify this
> exact param name against the installed Prisma version during Slice 7, since Prisma's socket-URL
> syntax has changed across major versions and must be confirmed against `@prisma/client@^6.3.0`,
> not assumed from memory). No schema.prisma change is needed — the existing `url`/`directUrl`
> datasource fields already accept any valid Postgres connection string; this is purely an
> environment-variable-value concern for the deploy workflow/Secret Manager, confirmed by reading
> `schema.prisma`'s datasource block this session (plain `env("DATABASE_URL")`/`env("DIRECT_URL")`,
> no hardcoded assumptions about connection shape).

> **Decision 3: The deploy workflow runs `prisma migrate deploy` *before* shifting Cloud Run traffic
> to the new revision, and aborts the deploy if migration fails.**
> **Context:** A migration that fails partway, or a migration that's technically valid but
> incompatible with the *currently running* old code (a genuine risk with in-place schema changes),
> must never leave the app serving against a half-migrated or newly-incompatible schema.
> **Alternatives:**
> - *Deploy new revision first, migrate after.* Rejected — the new code could start serving
>   requests against a schema it expects but that doesn't exist yet, a worse failure window than
>   migrating first (assuming, per this codebase's own established discipline this session, that
>   migrations are additive/expand-first — which every migration in this repo has been so far).
> - *Run migrations as a one-off `gcloud run jobs execute` separate from the deploy workflow
>   entirely (fully manual, disconnected step).* Rejected — reintroduces the exact "forgot to run
>   the migration" human-error class a CI/CD pipeline exists to remove; keeping it as an automated
>   step *within* the same workflow, gated before the deploy step, is strictly safer while costing
>   nothing extra to build.
> **Consequences:** A migration failure blocks the entire deploy (old revision keeps serving,
> nothing rolls out) — correct default. If a migration is ever intentionally
> backward-incompatible (contract-phase of expand/backfill/contract), that specific deploy needs a
> deliberate two-step manual process instead of this automated path; document that as an explicit
> exception in the runbook rather than silently building generality for it now (no evidence this
> repo has needed it yet — Gate 1 of the abstraction procedure).

> **Decision 4: GitHub Actions authenticates to GCP via Workload Identity Federation (WIF), never a
> downloaded service-account JSON key.**
> **Context:** `deploy.yml` needs GCP credentials to push images and deploy. The traditional
> approach (a service-account key JSON pasted into a GitHub Secret) is a long-lived credential that,
> if ever leaked (a common class of real-world incidents), grants standing access until manually
> rotated.
> **Alternatives:** *Service-account JSON key in a GitHub Secret.* Rejected — Google's own current
> guidance actively discourages this path for new setups; WIF tokens are short-lived and scoped to
> the specific GitHub repo/workflow, so a leaked CI log or compromised Actions run has a far smaller
> blast radius and no standing credential to rotate.
> **Consequences:** More setup steps in the runbook (creating a Workload Identity Pool + Provider,
> configuring the trust relationship to this specific GitHub repo) than a key would need — a
> one-time cost paid once, in the runbook, documented precisely so it's not re-derived. `deploy.yml`
> uses `google-github-actions/auth` with `workload_identity_provider` + `service_account` inputs,
> not `credentials_json`.

## 5. Risks and failure modes

| Risk | Likelihood | Impact | Mitigation / early signal |
|---|---|---|---|
| Fixing eslint for apps/api/shared surfaces a large pre-existing lint-violation backlog, ballooning this slice | Medium | Medium | Slice 1 explicitly budgets for `--fix`-then-triage; if the backlog is large, the fallback is enabling rules incrementally (warn, not error, for pre-existing violations) rather than blocking CI on a full historical cleanup — this is a stop-and-ask trigger (§9) if it happens |
| `nestjs-pino`'s request-scoped logger interacts badly with the existing Socket.IO gateway (`chat.gateway.ts`), which isn't a normal HTTP request/response cycle | Medium | Low | Socket.IO events aren't `pino-http`-wrapped automatically; the gateway keeps using a plain injected `Logger` (works identically, just without an HTTP-request-scoped correlation id) — scoped out explicitly, not silently broken (see Slice 3 acceptance) |
| Docker image build fails on a pnpm-workspace-specific issue (workspace `file:`/`workspace:*` protocol not resolving inside a clean Docker build context) | Medium | Medium | Slice 6's acceptance criterion is a real local `docker build`, not just writing the Dockerfile — this is caught before it's called done |
| The Prisma socket-URL query-param syntax assumed in Decision 2 is wrong for the installed Prisma version | Low | Medium | Flagged explicitly as unverified-from-memory in Decision 2; Slice 7 must confirm against Prisma's own docs for the installed version before finalizing the runbook's `DATABASE_URL` example |
| CI becomes a required check but nobody sets the GitHub branch-protection rule, so it silently doesn't gate anything | Medium | Medium | Documented as an explicit manual step in §8, called out as easy to forget precisely because it's outside the repo (no file to point to) |

**Blast radius:** Every change here is either additive (new files: workflows, Dockerfiles,
eslint configs, one new test file) or narrowly scoped (main.ts logger/helmet wiring,
env.validation.ts's one console.warn). Nothing touches business logic, the Prisma schema, or any
existing passing test's assertions. Worst case, a broken CI workflow file blocks merges until fixed
— annoying, not destructive, and trivially revertible (delete/fix the YAML).

**Worst realistic failure:** the ratings-visibility matrix test is written but subtly wrong (tests
the wrong thing, or has a bug that makes it vacuously pass) — this would be worse than no test,
because it creates false confidence in exactly the highest-severity invariant in the app. Mitigation:
each matrix cell's test must include at least one assertion that would fail if the visibility rule
were deliberately broken (verified during self-review by mentally flipping the implementation and
confirming the test would catch it — not just asserting a value that happens to be true either way).

## 6. Implementation slices

Ordered so CI-unblocking work comes first (nothing else here matters if CI can't run), then the
cheap/independent hardening (logging, security headers, tests), then the higher-effort Docker/deploy
work last, since it's the least urgent (no live deploy is happening this pass anyway) and benefits
most from CI already existing to catch mistakes in it.

### Slice 1 — Fix eslint for `apps/api` and `packages/shared`
- **Intent:** `pnpm lint` succeeds across the whole workspace, unblocking every later slice that
  gates on it.
- **Changes:** root `package.json` (add `eslint`, `typescript-eslint` devDependencies, versions
  aligned with `apps/web`'s `^9.19.0`); new `apps/api/eslint.config.mjs`; new
  `packages/shared/eslint.config.mjs`. Run `--fix` first; triage any remaining violations
  (fix genuinely, or scope a rule down with a one-line justification comment — never blanket-disable
  a rule file-wide to make the count go to zero).
- **Acceptance:** `pnpm lint` exits 0 for all three packages.
- **Verify:** `pnpm lint`
- **Rollback:** revert the new config files and the devDependency additions; scripts return to
  their current (broken) state, net neutral.
- **Risk retired:** whether this is a one-line fix or a real backlog (see Risks table) — learned
  immediately, before any CI workflow is written around an assumption it'll just work.

### Slice 2 — CI workflow (`.github/workflows/ci.yml`)
- **Intent:** Every PR and push to `main` gets an automated correctness gate.
- **Changes:** `.github/workflows/ci.yml` — triggers on `pull_request` and `push: branches: [main]`;
  steps: checkout → setup pnpm (with the version pinned in root `package.json`'s `packageManager`
  field) → setup Node (≥22, matching `engines`) → `pnpm install --frozen-lockfile` (cached by
  lockfile hash) → `pnpm --filter @filmrave/shared build` → `pnpm typecheck` → `pnpm lint` →
  `pnpm test` → `pnpm --filter @filmrave/api build` → `pnpm --filter @filmrave/web build`. Single
  job, sequential steps (not parallel jobs) — justified by this being a small monorepo where the
  whole pipeline runs in well under a few minutes; splitting into parallel jobs would add
  matrix/artifact-passing complexity (the shared-package build output would need to move between
  jobs) for a speed gain not worth it at this scale (Gate 4 of the abstraction procedure again).
- **Acceptance:** pushing a branch with a deliberate `pnpm typecheck` failure shows a red X on the
  PR; fixing it and pushing again shows green.
- **Verify:** open a real (throwaway) PR against this repo with an intentional type error, observe
  the Actions run fail, fix it, observe it pass. This is the one slice in this plan that's verified
  against the *real* GitHub Actions environment, not just locally — genuinely can't be verified any
  other way.
- **Rollback:** delete the workflow file.
- **Risk retired:** whether the CI environment (Actions' Ubuntu runner, pnpm caching, Node version)
  actually reproduces local results — the biggest "works on my machine" risk in this whole plan,
  retired early and cheaply.

### Slice 3 — Structured logging (`nestjs-pino`) + request correlation id
- **Intent:** every API log line is structured JSON with a correlation id, ready for Cloud Logging.
- **Changes:** add `nestjs-pino`, `pino-http` deps to `apps/api`. New
  `apps/api/src/logging/logging.module.ts` (or similar) registering `LoggerModule.forRootAsync`
  with: `pinoHttp.messageKey: 'message'`, a `formatters.level` mapping pino's numeric levels to GCP
  severity strings (`trace/debug`→`DEBUG`, `info`→`INFO`, `warn`→`WARNING`, `error`→`ERROR`,
  `fatal`→`CRITICAL`), and a `genReqId`/request-id hook that reads an incoming
  `X-Cloud-Trace-Context` header when present (Cloud Run sets this) to populate
  `logging.googleapis.com/trace` as `projects/${GOOGLE_CLOUD_PROJECT}/traces/${traceId}` — falling
  back to a generated UUID under a plain `requestId` field when `GOOGLE_CLOUD_PROJECT` isn't set
  (local dev). `main.ts`: `app.useLogger(app.get(Logger))` to replace Nest's bootstrap logger;
  replace the `console.log` boot line with the injected logger. `env.validation.ts`'s
  `console.warn` — **resolve concretely, don't hand-wave**: `validate()` runs synchronously before
  Nest's DI container exists, so it cannot inject the pino logger; the correct fix is a plain
  `process.stdout.write(JSON.stringify({severity:'WARNING', message: '...'}) + '\n')` at that one
  call site (matching the target log shape without needing DI), not a `console.warn` left as-is and
  not a forced Nest-logger dependency where none can exist yet — this is a real, small piece of
  design, not deferred to "figure it out during execution."
- **Acceptance:** running the API locally and hitting any endpoint produces one JSON line per log
  event on stdout with `severity`/`message` keys; two log lines from the same request share the same
  trace/request-id field; the Socket.IO gateway's existing `Logger` calls still work (plain, no
  request-scoping — confirmed not broken, not silently regressed).
- **Verify:** `pnpm --filter @filmrave/api dev`, hit an endpoint with curl, inspect stdout by eye
  for valid JSON with the right keys; `pnpm test` still green (no test asserts on log format today,
  so this is a smoke check, not a new automated test — note this honestly rather than inventing a
  log-format test with no real consumer yet).
- **Rollback:** revert the logging module registration and `main.ts` changes; Nest's default logger
  returns.
- **Risk retired:** whether `nestjs-pino`'s field-remapping actually produces the exact shape Cloud
  Logging expects — checked by eye against GCP's documented structured-logging field contract,
  the cheapest place to catch a mismatch (before any real deploy exists to check it against).

### Slice 4 — Security headers (`helmet`)
- **Intent:** standard security headers on every API response.
- **Changes:** add `helmet` dependency; `app.use(helmet())` in `main.ts`, placed before the CORS
  middleware (order matters — verify no conflict with the existing CORS config's `credentials: true`
  during this slice, since some helmet defaults can interact with cross-origin credentialed
  requests; if a conflict surfaces, configure the specific helmet sub-middleware rather than
  disabling it wholesale).
- **Acceptance:** a response from any API route includes `X-Content-Type-Options: nosniff` and
  helmet's other default headers; the existing web app's authenticated flows (login, circle
  actions) still work against the API locally — a real functional check, not just a header
  inspection, since this is exactly the kind of change that can silently break a working CORS setup.
- **Verify:** `curl -I http://localhost:4000/api/v1/health` (headers present); manually exercise
  Google sign-in + one authenticated API call from `apps/web` running locally against this API to
  confirm CORS still works end-to-end.
- **Rollback:** remove the one `app.use(helmet())` line.
- **Risk retired:** the CORS/helmet interaction risk, retired with a real functional check rather
  than assumed safe.

### Slice 5 — Ratings-visibility matrix + `CircleAccessGuard` tests
- **Intent:** close the blueprint's own named highest-priority test gap.
- **Changes:** `apps/api/src/common/circle-access.guard.spec.ts` (new) — member passes, non-member
  403, missing `circleId`/`userId` on the request 403. `apps/api/src/circles/circles.service.spec.ts`
  — new `describe('CirclesService.visibleRatings matrix')` block covering, for
  `visibleRatings(circleId, movieId, requesterId)`, the full cross product of: rating author's
  `ratingsShared` ∈ {none, approved, selective (with the movie both included and excluded from
  `sharedMovieIds`)} × requester relationship to the rating ∈ {is the author (self), is a different
  member, is not a member at all} — every cell asserts the *specific* expected visibility outcome,
  and at least one assertion per cell would fail if the corresponding branch in
  `isRatingShared`/`isRatingVisible` were inverted (self-review check per §5's stated mitigation,
  not just "assert something").
- **Acceptance:** the new tests pass against current code, and — as a deliberate one-time sanity
  check during this slice, not left in the codebase — temporarily flipping one branch in
  `packages/shared/src/visibility.ts` (e.g. inverting the `Selective` case's boolean) causes at
  least one new test to fail, then revert the deliberate break.
- **Verify:** `pnpm --filter @filmrave/api test -- circles`, plus the manual flip-and-confirm-red
  step described above (not committed, just a verification action taken during this slice).
- **Rollback:** remove the new test file and the new describe block; no production code changed.
- **Risk retired:** the "worst realistic failure" named in §5 — a vacuous test — is explicitly
  guarded against by this slice's own acceptance criterion.

### Slice 6 — Dockerfiles + `.dockerignore`
- **Intent:** both apps build into Cloud-Run-shaped container images, verified locally.
- **Changes:** root `.dockerignore`. `apps/api/Dockerfile` — multi-stage: a `deps` stage installing
  the full workspace (needed because pnpm workspaces resolve `@filmrave/shared` via a workspace
  link), a `build` stage running `pnpm --filter @filmrave/shared build` then
  `pnpm --filter @filmrave/api build`, a slim final stage copying only `apps/api/dist`,
  `apps/api/node_modules` (production-only, `pnpm install --prod --filter @filmrave/api...`), and
  the built `@filmrave/shared/dist` — `EXPOSE` is documentation-only on Cloud Run (it reads `$PORT`
  at runtime, doesn't use `EXPOSE`), `CMD ["node", "dist/main.js"]`. `apps/web/Dockerfile` —
  Next.js's standard `output: 'standalone'` multi-stage pattern (check/add `output: 'standalone'`
  to whatever Next config file currently exists — confirm its exact filename/format first, don't
  assume `.mjs` vs `.ts`), final stage runs the standalone server, reading `$PORT`
  (Next's standalone server already respects `PORT` env var natively — confirm this during the
  slice rather than assuming).
- **Acceptance:** `docker build -f apps/api/Dockerfile .` and `docker build -f apps/web/Dockerfile .`
  both succeed locally; running the resulting API image with `-e PORT=8080 -e DATABASE_URL=...
  -e JWT_SECRET=... -e GOOGLE_CLIENT_ID=... -p 8080:8080` against the local docker-compose Postgres
  answers `GET /health` with 200; running the web image similarly serves the marketing page.
- **Verify:** the `docker build`/`docker run` commands above, run for real, output inspected.
- **Rollback:** delete the Dockerfiles; nothing else depends on them yet.
- **Risk retired:** the single biggest "will this even work" unknown in the whole plan — a
  pnpm-workspace monorepo Docker build is a well-known source of subtle breakage (workspace
  protocol resolution, wrong working directory, missing files in the build context) — retired with
  a real local build+run, not just written and assumed correct.

### Slice 7 — `deploy.yml` workflow + GCP setup runbook
- **Intent:** the moment the user has a GCP project, one documented path exists from "nothing" to
  "deployed," with no step requiring guesswork.
- **Changes:** `.github/workflows/deploy.yml` (`workflow_dispatch` trigger only) implementing the
  flow in §3's "Flow — deploy" section, using WIF (Decision 4) and the socket-based `DATABASE_URL`
  (Decision 2, **with the exact Prisma connection-string param name confirmed against the installed
  `@prisma/client` version's own documentation before writing the workflow — this is called out
  explicitly because Decision 2 flagged it as unverified from memory**). `docs/GCP_DEPLOY_RUNBOOK.md`
  covering, in order: project creation + billing, enabling required APIs (Cloud Run, Cloud SQL
  Admin, Artifact Registry, Secret Manager, IAM Credentials), Cloud SQL instance creation with
  **automated backups + point-in-time recovery enabled at creation** (the nightly-backup
  requirement — exact flags/console settings specified, not "enable backups" vaguely), Artifact
  Registry repo creation, Secret Manager entries for each of `DATABASE_URL`, `JWT_SECRET`,
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TMDB_API_KEY`, the Workload Identity Pool/Provider +
  service account + IAM role bindings for GitHub Actions, and the two `gcloud run deploy` invocations'
  exact required flags (`--add-cloudsql-instances`, `--set-secrets`, `--port`).
- **Acceptance:** a careful human reading of the runbook alone (no other context) can enumerate
  every `gcloud`/console step needed, in the right order, with no step referencing something not
  yet created. This is checked by a self-review read-through (§9-style adversarial pass), not an
  automated test — there is nothing to execute this pass.
- **Verify:** self-review re-read of the runbook as a first-time reader; `deploy.yml` is syntactically
  valid (`actionlint` or GitHub's own workflow syntax check, if available locally — confirm tooling
  during the slice) but **cannot be functionally verified** without a real GCP project, which is out
  of scope this pass — state this honestly in the handoff rather than claiming it "works."
- **Rollback:** delete both files; nothing else depends on them.
- **Risk retired:** none new — this slice converts design decisions already retired (§4) into their
  concrete artifacts, and is ordered last because it's the least urgent (no live deploy happening)
  and benefits from every earlier slice (CI, Dockerfiles) already being proven.

## 7. Verification

**Test strategy:**
| What | Level | Why this level |
|---|---|---|
| eslint fix | Command exit code | Config/tooling correctness, not logic |
| CI pipeline | Real GitHub Actions run against a throwaway PR | The only way to verify a CI environment actually reproduces local results |
| Structured logging shape | Manual stdout inspection | No automated consumer of the log format exists yet to assert against; noted honestly, not faked with a brittle format-matching test |
| Ratings-visibility matrix | Unit (hand-mocked Prisma), matching existing convention | Logic-and-wiring risk, no DB needed |
| `CircleAccessGuard` | Unit | Pure boundary-check logic |
| Dockerfiles | Real local `docker build` + `docker run` | Only way to catch workspace-resolution/runtime issues |
| `deploy.yml` | Syntax check only, no functional run | No GCP project exists this pass — stated as a real limitation, not glossed over |

**Edge cases to cover:** empty `sharedMovieIds` array under `selective` mode (must resolve to
not-visible, not throw); a rating author who is no longer a circle member (the `visibleRatings`
query already scopes to current members — confirm this edge case is covered or explicitly
out-of-scope, don't assume); Docker build with an empty `pnpm-lock.yaml` cache (cold-cache build
path, not just warm-cache).

**Non-functional checks:** Docker image size sanity-check (`docker images`, eyeball for "not
absurd" — e.g. hundreds of MB not multiple GB — no hard budget set, matching this plan's honest
non-goal of not inventing a number nobody asked for).

## 8. Rollout

**Migration order:** N/A — no data migration in this plan.

**Feature flag:** N/A — CI/logging/Docker changes aren't user-facing toggleable behavior.

**Staged rollout:** N/A this pass (no live deploy). Once the user does deploy for real (outside this
plan's scope), Cloud Run's own traffic-splitting (`--no-traffic` + gradual `gcloud run services
update-traffic`) is the natural staged-rollout mechanism — noted for the runbook, not built now.

**Rollback:** every slice's rollback is "revert the added files" (see each slice) — nothing in this
plan is destructive or hard to undo, since nothing here touches persisted data.

**Monitoring:** once deployed (future, out of scope), Cloud Run's built-in request/latency/error-rate
metrics plus Cloud Logging's structured logs (this plan's Slice 3 output) are the monitoring
surface — no new monitoring *code* needed, since GCP provides both natively for any container
running on Cloud Run.

**Comms:** none needed — no external consumer of anything this plan changes.

## 9. Stop-and-ask triggers

The implementor must stop and ask rather than decide alone if:
- Slice 1's lint fix uncovers a large pre-existing violation backlog (dozens+ of errors) rather than
  a handful — the plan assumes a small cleanup; a large one is a scope/time decision for the user,
  not something to silently expand into or silently suppress with blanket rule-disables.
- The Prisma Unix-socket connection-string syntax (Decision 2) doesn't match what's documented for
  the installed `@prisma/client` version — don't guess a syntax; find the exact current
  documentation for that version before writing it into the runbook/workflow.
- `helmet`'s defaults break the existing CORS-credentialed flow in a way that isn't a simple
  sub-middleware config fix (Slice 4) — this touches live auth behavior, not something to route
  around by disabling security headers wholesale.
- Next.js's standalone output mode (Slice 6) requires changes beyond adding `output: 'standalone'`
  to the config (e.g. if any current `apps/web` code is incompatible with standalone bundling) —
  surface it rather than quietly reworking unrelated web app code to fit.
- Any acceptance criterion in this plan turns out to be untestable as written given real constraints
  discovered during execution.

## 10. Open questions

| Question | Owner | Blocks? | Default if unanswered |
|---|---|---|---|
| Exact GCP region for Cloud Run/Cloud SQL (latency to expected user geography — blueprint's own Open Question #6 notes India+US as likely early markets) | User | No — affects the runbook's example region, not the workflow's correctness | Use `us-central1` as the documented example, callout that the user should pick based on actual user geography before their first real deploy |
| Whether GitHub Actions should also run on a nightly schedule (not just PR/push) as an extra "main is still green" signal | User | No | Not added — PR/push coverage is sufficient for this stage; nightly-schedule is trivial to add later (one `on:` trigger line) if wanted |
| Whether the user wants CI to also run `pnpm audit`/dependency vulnerability scanning as part of this pass | User | No | Not included — a real, valuable addition, but not named in the blueprint's Phase 0 ops-floor list; flagged as a good near-term follow-up (§11) rather than silently bundled in |

## 11. Out of scope follow-ups

- `pnpm audit` / Dependabot / Renovate for dependency vulnerability scanning in CI.
- A staging Cloud Run environment (seam already left in `deploy.yml`'s design, per §4 Deferred).
- Migrating `apps/web` off the deprecated `next lint` command before Next 16 forces the issue.
- Sentry or equivalent error tracking (explicitly deferred by the user).
- Terraform/Pulumi conversion of the runbook's `gcloud` commands, once a second environment or
  second engineer makes IaC's audit trail worth its overhead.
- Load testing / a formal performance budget for the Cloud Run services, once real traffic exists to
  size against.
