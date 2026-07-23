# @filmrave/web

FilmRave web client — **Next.js (App Router)**. Scope is deliberately the
**public surface** where SSR pays off: marketing and the invite-landing page.
The logged-in app is served by Flutter web until a dedicated React client is
justified.

## Setup

```bash
cp .env.example .env.local     # NEXT_PUBLIC_API_BASE
pnpm --filter @filmrave/shared build
pnpm dev                       # http://localhost:3000
```

## Routes

| Path            | Rendering | Purpose |
|-----------------|-----------|---------|
| `/`             | Static    | Marketing home |
| `/about`        | Static    | How it works |
| `/download`     | Static    | Store links |
| `/add/[handle]` | SSR       | Invite landing — fetches the public profile, emits rich OG metadata, deep-links `filmrave://add/:handle` |

Styling: Tailwind v4 with the "Midnight Marquee" tokens in `globals.css`.
