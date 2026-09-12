# syntax=docker/dockerfile:1.7
#
# Multi-stage build for Cloud Run. The `deps`/`build` stages need the whole
# workspace (pnpm resolves @filmrave/shared via a workspace symlink); the
# final `runtime` stage needs none of that — `pnpm deploy` (pnpm's own
# recommended tool for exactly this monorepo-Docker scenario, see
# https://pnpm.io/cli/deploy) materializes a self-contained, production-only
# directory for @filmrave/api alone, with all workspace symlinks resolved
# into real files, so `runtime` never needs to see the rest of the repo.
#
# `--legacy` on the deploy step: pnpm v10's non-legacy deploy path requires
# `inject-workspace-packages=true` workspace-wide, which would change how
# every other pnpm command resolves workspace deps repo-wide — a bigger,
# unrelated change for a Dockerfile-only need. `--legacy` keeps this scoped
# to the one command that needs it.
#
# `prisma generate` runs a SECOND time after deploy, against the deployed
# schema path. Caught by a real `docker build && docker run` this session:
# `pnpm deploy`'s own fresh install re-triggers @prisma/client's postinstall
# hook, which regenerates a client that doesn't match what the build stage's
# earlier `prisma generate` produced — the deployed image crashed at startup
# with "Named export 'PrismaClient' not found" (an ESM/CJS mismatch from
# that second, uncontrolled regeneration) until this explicit re-generate
# was added to make the *last* generate the deployed, correct one.

FROM node:22-alpine AS base
RUN corepack enable
# Prisma's query engine links against OpenSSL; alpine doesn't ship it.
RUN apk add --no-cache openssl
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @filmrave/shared build
# Regenerated here, inside the same alpine/musl environment the runtime
# stage uses — Prisma's default `binaryTargets = ["native"]` then correctly
# resolves to the alpine-compatible engine, not the host machine's.
RUN pnpm --filter @filmrave/api exec prisma generate
RUN pnpm --filter @filmrave/api build
RUN pnpm --filter=@filmrave/api deploy --prod --legacy /prod/api
RUN pnpm --filter @filmrave/api exec prisma generate --schema=/prod/api/prisma/schema.prisma

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /prod/api /repo
WORKDIR /repo
# Cloud Run injects $PORT; the app already reads it via ConfigService
# (apps/api/src/main.ts) and binds all interfaces by default (Nest/Express
# `app.listen(port)` with no host argument already binds 0.0.0.0).
CMD ["node", "dist/main.js"]
