# GCP Deploy Runbook

Manual, one-time setup required before `.github/workflows/deploy.yml` can be run. Nothing in this
document has been executed — it was written without a GCP project to test against (see
`docs/plans/ops-production-floor-handoff.md` for exactly what is and isn't verified). Follow it in
order; each step depends on the ones before it.

**Before you start:** pick a region based on your actual user geography (the workflow defaults to
`us-central1` as a placeholder — see `docs/PRODUCT_BLUEPRINT.md`'s own open question on this).
Replace `REGION` below with your choice everywhere it appears.

## 1. Project and billing

1. Create a GCP project (or pick an existing one): `gcloud projects create PROJECT_ID` (or via
   console.cloud.google.com).
2. Enable billing on it — Cloud Run/Cloud SQL/Artifact Registry all require an active billing
   account linked, even within the free tier.
3. Set it as your active project locally: `gcloud config set project PROJECT_ID`.

## 2. Enable required APIs

```
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iamcredentials.googleapis.com \
  cloudresourcemanager.googleapis.com
```

## 3. Cloud SQL instance (managed Postgres, with automated backups)

This is also where the "nightly DB backup" requirement from the product blueprint's ops-floor scope
gets satisfied — Cloud SQL's built-in automated backups + point-in-time recovery, not a bespoke
script (see the plan's Decision/judgment section for why: it's strictly better than anything
hand-rolled, and free of extra code to maintain).

```
gcloud sql instances create filmrave-db \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=REGION \
  --backup-start-time=03:00 \
  --enable-point-in-time-recovery \
  --retained-backups-count=7
```

`--tier=db-f1-micro` is the smallest/cheapest tier — appropriate for this project's current traffic
(per the blueprint's own Phase 0 framing); resize later with `gcloud sql instances patch` once
real usage data justifies it, not before.

Then:

```
gcloud sql databases create filmrave --instance=filmrave-db
gcloud sql users create filmrave --instance=filmrave-db --password=CHOOSE_A_STRONG_PASSWORD
```

Note the **instance connection name** printed by `gcloud sql instances describe filmrave-db
--format='value(connectionName)'` — it looks like `PROJECT_ID:REGION:filmrave-db`. You'll need this
exact string in two places below (a GitHub secret, and Cloud Run's own connector flag, already
wired into `deploy.yml`).

## 4. Artifact Registry (Docker image storage)

```
gcloud artifacts repositories create filmrave \
  --repository-format=docker \
  --location=REGION \
  --description="FilmRave API + web images"
```

Must match the `AR_REPO`/`GCP_REGION` values in `.github/workflows/deploy.yml` (`filmrave` /
whatever region you chose).

## 5. Secret Manager entries

Create each of these (`echo -n 'VALUE' | gcloud secrets create NAME --data-file=-`), using real
production values, not the local dev placeholders in `apps/api/.env.example`:

| Secret name | Value |
|---|---|
| `DATABASE_URL` | See §6 below — this is the one that needs the Cloud SQL **socket** connection string, not a plain host:port one |
| `JWT_SECRET` | A strong random secret — **not** the "Marvel characters" dev placeholder in `.env.example`; `env.validation.ts` will refuse to boot in production if it contains `change-me`, but generate a real random value regardless |
| `GOOGLE_CLIENT_ID` | Your production Google OAuth Web Client ID |
| `GOOGLE_CLIENT_SECRET` | Parked/unused by the current ID-token flow (see `.env.example`'s own comment) — create the secret anyway so `deploy.yml`'s `--set-secrets` reference resolves; safe to set to any placeholder value until the app actually reads it |
| `TMDB_API_KEY` | Your TMDB v3 API key |

Example for one:

```
echo -n 'your-real-value' | gcloud secrets create JWT_SECRET --data-file=-
```

## 6. The DATABASE_URL secret specifically — read this carefully

**Two different connection strings are needed, for two different consumers, and they are not the
same value:**

- **`DATABASE_URL` (the Secret Manager entry, used by Cloud Run at runtime)** — uses the Unix socket
  path Cloud Run's native Cloud SQL integration mounts inside the container:
  ```
  postgresql://filmrave:PASSWORD@localhost/filmrave?host=/cloudsql/PROJECT_ID:REGION:filmrave-db&schema=public
  ```
  **This `?host=` socket-path syntax is Prisma's long-documented Postgres connection-string format
  for Unix sockets — but it was not empirically verified against this project's exact installed
  `@prisma/client` version (6.19.3) in this session (no live Cloud SQL instance existed to test
  against). Before your first real deploy, confirm this syntax against Prisma's current docs for
  your installed version**, or test it directly: deploy once, check the API's `/health` endpoint
  (`db: true` means it connected) and its logs for a `PrismaClientInitializationError` if not.

- **`MIGRATE_DATABASE_URL` (a *separate* GitHub Actions secret, used only by the migration step)** —
  uses a plain TCP connection through the Cloud SQL Auth Proxy that `deploy.yml` starts as a
  background process in the CI job itself (the runner isn't Cloud Run, so it can't use the
  `/cloudsql/...` socket path — that only exists inside Cloud Run):
  ```
  postgresql://filmrave:PASSWORD@localhost:5432/filmrave?schema=public
  ```

Set the Secret Manager entry for the first one now (§5). The second one is a **GitHub Actions
secret**, not a GCP Secret Manager entry — set it in step 9.

## 7. Workload Identity Federation (GitHub Actions auth, no service-account keys)

You'll need your project *number* (distinct from the project *id* used everywhere else in this
doc) for the binding below:

```
gcloud projects describe PROJECT_ID --format='value(projectNumber)'
```

```
gcloud iam workload-identity-pools create github-pool \
  --location=global \
  --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global \
  --workload-identity-pool=github-pool \
  --display-name="GitHub OIDC" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"

gcloud iam service-accounts create filmrave-deployer \
  --display-name="FilmRave GitHub Actions deployer"

# Bind the deploy service account to ONLY this repo (replace with your actual GitHub org/repo)
gcloud iam service-accounts add-iam-policy-binding \
  filmrave-deployer@PROJECT_ID.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/ajay99511/Film_Rave"
```

Grant the deploy service account exactly what it needs (least privilege — resist the temptation to
grant `roles/owner` for convenience):

```
for ROLE in roles/run.admin roles/artifactregistry.writer roles/cloudsql.client roles/secretmanager.secretAccessor roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding PROJECT_ID \
    --member="serviceAccount:filmrave-deployer@PROJECT_ID.iam.gserviceaccount.com" \
    --role="$ROLE"
done
```

## 8. GitHub repo variables (non-secret)

Repo Settings → Secrets and variables → Actions → **Variables** tab:

| Variable | Value |
|---|---|
| `WEB_ORIGIN` | The web service's public URL, for the API's `CORS_ORIGINS` — see the bootstrapping note below, this can't be known before the first deploy |

## 9. GitHub repo secrets

Repo Settings → Secrets and variables → Actions → **Secrets** tab:

| Secret | Value |
|---|---|
| `GCP_PROJECT_ID` | Your GCP project id |
| `GCP_WIF_PROVIDER` | Full resource name from step 7: `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider` |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | `filmrave-deployer@PROJECT_ID.iam.gserviceaccount.com` |
| `CLOUDSQL_INSTANCE_CONNECTION_NAME` | From step 3: `PROJECT_ID:REGION:filmrave-db` |
| `MIGRATE_DATABASE_URL` | The proxy-shaped connection string from §6, second bullet |
| `GOOGLE_CLIENT_ID` | Same value as the Secret Manager entry — needed here too because it's also a `docker build --build-arg` for the web image (see `deploy.yml`'s comments on why `NEXT_PUBLIC_*` can't just be a Cloud Run runtime env var) |

## 10. The first deploy has a bootstrapping wrinkle — read before running

The API's CORS config needs the web service's URL (`WEB_ORIGIN`), and the web build needs the API's
URL (`NEXT_PUBLIC_API_BASE`, handled automatically by `deploy.yml` reading it back after the API
deploys). But **on the very first run ever, neither service exists yet**, so `WEB_ORIGIN` can't be
set correctly in advance.

Two clean options — pick one:
- **Run the workflow once, ignore that CORS will be too permissive/empty on this first pass** (the
  API deploys with whatever `WEB_ORIGIN` is set to, even if blank/wrong), then set `WEB_ORIGIN` to
  the real web URL the workflow just produced, and run the workflow a second time so the API
  redeploys with correct CORS. Simple, costs one extra run.
- **Manually deploy a placeholder web revision first** (`gcloud run deploy filmrave-web --image
  <any placeholder>` just to reserve the URL), read its URL, set `WEB_ORIGIN`, then run the real
  workflow. More steps, no wasted API redeploy.

Either way, this is a one-time cost — every deploy after the first has both URLs already stable and
known.

## 11. First run

Actions tab → "Deploy to Cloud Run" → Run workflow (leave `image_tag` blank to use the commit SHA).
Watch it run. If the migration step fails, nothing else runs — the previously-deployed revision (or
nothing, on the very first run) keeps serving; fix the migration issue and re-run.

After it succeeds: hit the API's `/health` endpoint (from the deploy job's log output, or
`gcloud run services describe filmrave-api --region REGION --format='value(status.url)')/health`)
and confirm `{"status":"ok","db":true,...}`.

## Rollback

Cloud Run keeps every deployed revision. To roll back:

```
gcloud run services update-traffic filmrave-api --region REGION --to-revisions=PREVIOUS_REVISION=100
```

**Caveat:** if the bad deploy included a migration that isn't backward-compatible with the previous
code (a contract-phase migration — see the main ops-floor plan's Decision 3), rolling back the
*code* this way is not enough; the database has already moved forward. This project's migrations so
far have all been additive/expand-only, which is exactly what keeps a plain traffic rollback safe —
keep it that way, or plan a real two-step rollback (data included) the day it isn't.
