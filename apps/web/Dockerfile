# syntax=docker/dockerfile:1.7
#
# Multi-stage build for Cloud Run, using Next.js's standalone output mode
# (next.config.ts: output: 'standalone') — Next's own documented pattern for
# a minimal, self-contained server bundle. Because outputFileTracingRoot is
# already pinned to the monorepo root (existing config, not new), the
# standalone output mirrors the full repo-relative path: the real entry
# point ends up at .next/standalone/apps/web/server.js, not at the
# standalone root — verified locally this session via a real `next build`.
# Static assets and public/ are deliberately NOT included in standalone
# output (Next's own documented behavior) and must be copied separately.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/web apps/web
# @filmrave/shared's package.json points `main`/`exports` at dist/ — Next's
# `transpilePackages` recompiles it from source, but Node module resolution
# still needs that dist/ entry file to exist to *locate* the package at all.
# Caught by a real `docker build` this session ("Module not found:
# Can't resolve '@filmrave/shared'") before this build step was added.
RUN pnpm --filter @filmrave/shared build

# NEXT_PUBLIC_* values are inlined into the client JS bundle at `next build`
# time — setting them as Cloud Run *runtime* env vars (as the API's secrets
# are) would have no effect at all, since by then the bundle is already
# built. They must be build args instead. Neither value is secret (an API
# base URL, a Google OAuth *client* id — not the client secret).
ARG NEXT_PUBLIC_API_BASE
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE}
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_CLIENT_ID}
ENV NEXT_PUBLIC_DATA_SOURCE=http
RUN pnpm --filter @filmrave/web build
# apps/web/public doesn't exist in this repo (no static assets committed
# yet) — caught by a real `docker build` this session, where the runtime
# stage's COPY of it failed outright. Guarantee it exists (empty is fine)
# rather than assume; harmless once real assets are added later.
RUN mkdir -p apps/web/public

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
WORKDIR /repo/apps/web
# Next's standalone server reads $PORT natively and binds 0.0.0.0 by
# default — both already match Cloud Run's contract with no extra flags.
CMD ["node", "server.js"]
