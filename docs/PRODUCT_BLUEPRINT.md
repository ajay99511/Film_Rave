# FilmRave — Product & Engineering Blueprint

| Field | Value |
|---|---|
| **Document type** | Product Requirements + Strategy + Technical Design (unified blueprint) |
| **Status** | `DRAFT — v1.0` |
| **Author** | Founding engineer (with AI-assisted market research) |
| **Created** | 2026-07-23 |
| **Last updated** | 2026-07-23 |
| **Repository** | `FilmRaveCs` monorepo (`apps/api`, `apps/web`, `packages/shared`) |
| **Audience** | Founder, future collaborators, future investors doing technical diligence |
| **Review cadence** | Revisit after every phase gate (see §9) and at minimum monthly |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Vision & Problem Statement](#2-vision--problem-statement)
3. [Market Research & Competitive Landscape](#3-market-research--competitive-landscape)
4. [Strategic Framework: The Two-Loop Model](#4-strategic-framework-the-two-loop-model)
5. [Product Principles](#5-product-principles)
6. [Current State of the System](#6-current-state-of-the-system)
7. [Feature Inventory, Scoring & Verdicts](#7-feature-inventory-scoring--verdicts)
8. [Non-Goals & Anti-Features](#8-non-goals--anti-features)
9. [Phased Roadmap](#9-phased-roadmap)
10. [System Architecture](#10-system-architecture)
11. [Data Model Deep Dive](#11-data-model-deep-dive)
12. [Critical User Flows](#12-critical-user-flows)
13. [Identity, Trust & Verification Strategy](#13-identity-trust--verification-strategy)
14. [Growth Model & Distribution](#14-growth-model--distribution)
15. [Metrics & Success Criteria](#15-metrics--success-criteria)
16. [Risks & Mitigations](#16-risks--mitigations)
17. [Open Questions](#17-open-questions)
18. [Appendix A — Research Sources](#appendix-a--research-sources)
19. [Appendix B — Glossary](#appendix-b--glossary)

---

## 1. Executive Summary

FilmRave is a **private, group-first social network built around movies**. Where
Letterboxd is a public diary read by strangers and IMDb is a reference database,
FilmRave is the digital layer over something people already do in real life:
watch movies with the same small group of friends, argue about them afterward,
and plan the next one together.

The codebase is substantially further along than a prototype. A NestJS API with
a 13-model PostgreSQL schema already implements circles (private friend
groups), 1–10 ratings with per-member sharing controls, watchlists, per-movie
group chat over WebSockets, movie outings with RSVP / theater voting / night
voting / a group "hype" meter, CSV import from IMDb and Letterboxd, phone-OTP
authentication (dev mode), and in-app notifications. A Next.js web client
mirrors the domain with a local-storage backend for offline demos. **Nothing in
this document requires a schema rewrite or an architectural pivot.** The work
ahead is sequencing, polish, and one strategic addition — not rework.

The central strategic claim, supported by the market evidence in §3:

> **FilmRave has two loops. The single-player ratings/watchlist loop retains
> users (the Letterboxd lesson). The shareable movie-outing loop acquires them
> (the Partiful lesson). The highest-leverage missing piece is making the
> outing page publicly shareable so non-users can RSVP without an account.
> Phone verification and contact gathering — originally imagined as the
> foundation — are in fact late-stage trust features that would act as pure
> friction at launch scale, and should be deferred.**

The rest of this document justifies that claim, scores every feature, lays out
a four-phase roadmap with explicit gates, documents the architecture and data
model as they exist today, and defines the metrics that decide when each phase
is done.

---

## 2. Vision & Problem Statement

### 2.1 The problem

Movie-watching is one of the most social activities humans do, yet the software
around it is aggressively single-player or anonymously public:

- **Discovery is solitary.** You scroll a streaming home screen alone, or read
  reviews from strangers whose taste you cannot calibrate against.
- **Group planning happens in the wrong tool.** "Who's in for Dune on Friday?"
  is a 40-message WhatsApp thread with no structure: no RSVP state, no vote on
  which theater, no memory of what the group has already seen together.
- **Opinions evaporate.** The post-movie argument — the best part of watching
  together — lives in a group chat and is unfindable two weeks later. Nobody
  remembers that Priya gave *Oppenheimer* a 9 and Arjun a 4.
- **Anticipation has no home.** Between a trailer drop and opening night there
  is real collective excitement ("hype") among friends, and no product
  captures, displays, or acts on it.

### 2.2 The vision

FilmRave is **the group memory and group planner for movie friendships**:

1. **A personal film ledger** — everything you've watched and rated, portable
   in (CSV import from IMDb/Letterboxd) and yours to keep.
2. **A circle** — your actual friends, not followers. Small, private, and the
   unit around which everything else is organized.
3. **A planning surface** — outings with structured RSVP, theater votes, night
   votes, and a hype meter, replacing the chaotic group-chat thread.
4. **A shared history** — what the circle watched together, who rated what,
   and the per-movie conversations that went with it.

### 2.3 Who it is for

| Persona | Description | Primary loop |
|---|---|---|
| **The Organizer** | The friend who always plans the movie night; today they herd cats in WhatsApp | Outings: create, share, tally votes |
| **The Cataloguer** | Rates everything, may already have a Letterboxd/IMDb history | Ratings + watchlist + CSV import |
| **The Passenger** | Comes to movie night when invited, rarely initiates | Tap RSVP on a shared link, argue in chat afterward |

The Passenger persona is the majority of any friend group and the reason
account-free RSVP (§7, F-06) matters so much: the product must deliver value
to them **before** it asks them to sign up.

### 2.4 The one-sentence positioning

> *Letterboxd is where you perform your taste for strangers; FilmRave is where
> you plan, watch, and argue about movies with the friends you actually have.*

---

## 3. Market Research & Competitive Landscape

This section summarizes the external research that drives every prioritization
decision later in the document. Full source links are in Appendix A.

### 3.1 Letterboxd — the retention proof

Letterboxd is the canonical success in this space and its trajectory is the
single most important data set available to FilmRave:

- Growth from **~1M users (2019) → 3M (2021) → 10M (2023) → 17M+ (2024)**,
  with annual reviews growing from under 300K (2012) to nearly **100M (2024)**
  — a 3,300% increase in engagement volume.
- Half its users are **under 35**; the 16–24 bracket is the largest segment.
  Industry executives now speak of "the Letterboxd generation," and for A24's
  *The Brutalist*, nearly half the opening-weekend audience reportedly first
  heard of the film on the app.
- Crucially, Letterboxd's founders positioned it **against** algorithmic,
  data-driven platforms (IMDb) and critic-gatekept ones (Rotten Tomatoes). The
  core loop — log a film, rate it, keep a diary — is fully satisfying **with
  zero friends on the platform**. The social graph compounds the value; it
  does not bootstrap it.

**Lesson for FilmRave:** the single-player ledger (rate, log, watchlist) is
not a side feature. It is the retention foundation, and it already exists in
the codebase. Do not bury it under social chrome.

### 3.2 Partiful — the acquisition proof

Partiful, the Gen-Z event/RSVP app, is the best available model for FilmRave's
outing feature:

- Grew to **2M+ users at ~400% annually with essentially zero paid
  marketing**, adding ~5M users in the first half of 2025 alone.
- The growth mechanism is structural, not promotional: **every invite link is
  a growth loop**. A host shares a link into an existing group chat; every
  recipient sees the product; and — this is the critical design decision —
  **guests can RSVP without installing anything or creating an account**.
- Viral moments (lookalike contests with thousands of RSVPs) worked because
  screenshots of Partiful pages circulated on other social networks, each one
  an advertisement.

**Lesson for FilmRave:** the outing model already in the schema (`Outing`,
`OutingRsvp`, `TheaterVote`, `NightVote`, `OutingHype`) is FilmRave's
Partiful-shaped asset — a loop that Letterboxd conspicuously lacks. But the
loop only spins if the outing page is **link-shareable and guest-accessible**.
Today it is locked behind circle membership. Unlocking it is the single
highest-leverage build item in this document.

### 3.3 The cold-start literature — how networks actually boot

Andrew Chen's cold-start framework (and the broader literature summarized in
Appendix A) gives FilmRave its sequencing logic:

- **Single-player utility first.** Pinterest, Instagram, and Dropbox all
  attracted users with a solo tool and layered the network on afterward. A
  social product that is worthless until your friends join usually dies before
  they do.
- **The atomic network.** The goal is not "many users"; it is **one stable,
  self-sustaining engaged network** — for FilmRave, literally one friend
  group of 4–8 people using it for a real movie night. Then a second adjacent
  group, then a third. Product decisions should optimize for making a single
  circle succeed, not for global scale mechanics (feeds, trending,
  recommendations) that require density FilmRave will not have for months.
- **Contact-book import** is a scale-stage weapon (it worked for LinkedIn once
  the network was big enough that imported contacts produced matches). At
  zero density, scraping a user's contacts yields an empty "friends on
  FilmRave" list, a scary permission prompt, and a privacy liability — cost
  without benefit.

### 3.4 Phone verification — the friction data

The original FilmRave concept placed mandatory phone verification at the
foundation. The 2025–2026 industry data argues strongly for deferral:

- SMS OTP flows lose **roughly 20–30% of legitimate users** at the
  verification step (submit number → app-switch to Messages → find code →
  return → type six digits before expiry; every hop leaks users).
- Direct cost is **$0.05–$0.08 per successful verification** (Twilio Verify,
  US tier), before fraud.
- **OTP-pumping fraud** commonly represents 10–20% of traffic on unprotected
  global signup flows — an attack in which bots trigger SMS sends to
  premium-rate numbers, turning your signup form into their revenue stream.
- The trust benefit phone numbers provide (one-human-one-account, spam
  resistance) matters when strangers can contact each other. In a
  private-circles product where **every connection is an explicit mutual
  invite**, strangers cannot contact you, and the benefit largely evaporates
  at small scale.

**Lesson for FilmRave:** keep the OTP code (it is well-built: hashed codes,
attempt caps, single-use, TTL), but make phone **optional at launch** and
mandatory only when abuse actually appears. The schema already agrees — both
`phone` and `email` on `User` are nullable, so this is a configuration
decision, not a migration.

### 3.5 Cautionary tales

- **Movies Anywhere** (Disney-backed) shut down its "Watch Together"
  synchronized viewing and "Screen Pass" social features for lack of use —
  evidence that heavyweight, synchronous social movie features underperform
  their engineering cost.
- The consumer-app post-mortem literature ("Virality Isn't Retention" —
  covering Partiful, Noplace, Ditto) is unanimous: viral loops fill the top of
  the funnel, but products die when there is nothing durable underneath.
  Partiful itself retains because hosting is a recurring real-life behavior.
  FilmRave's durable underneath is the ratings ledger and the circle history.
- The graveyard of small movie-social apps (Flick, Miru, FlickMate, Filmate,
  and dozens of "swipe to match a movie" apps) shows a pattern: apps built
  around a **single gimmick** (matching, swiping) with no retention ledger and
  no growth loop plateau at trivial scale. FilmRave should read this as: the
  moat is the *combination* — ledger + circle + outing — not any one feature.

### 3.6 Competitive positioning map

```
                        PUBLIC / STRANGERS
                              ▲
                              │
              IMDb ●          │          ● Letterboxd
        (reference DB)        │       (public diary, 17M+)
                              │
                              │
   UTILITY ◄──────────────────┼──────────────────► SOCIAL
   (solo tool)                │              (network effects)
                              │
        JustWatch ●           │     ★ FILMRAVE
   (where-to-stream)          │  (private circles,
                              │   real-life outings)
              Partiful ●      │
        (events, not movies)  │
                              ▼
                       PRIVATE / FRIENDS
```

FilmRave's quadrant — **private + social, anchored to real-life plans** — is
the least contested. Letterboxd cannot easily move there (its DNA and its 17M
users are public-performance); Partiful is category-agnostic and has no movie
ledger. The overlap zone is FilmRave's wedge.

---

## 4. Strategic Framework: The Two-Loop Model

Every feature decision in §7 derives from this model. It is worth stating
precisely.

### 4.1 The retention loop (single-player)

```
   ┌─────────────────────────────────────────────────┐
   │                                                 │
   │   Watch a movie (real life)                     │
   │        │                                        │
   │        ▼                                        │
   │   Log + rate it in FilmRave  ◄── CSV import     │
   │        │                          seeds this    │
   │        ▼                          with history  │
   │   Ledger grows → identity value                 │
   │   ("my taste, my history")                      │
   │        │                                        │
   │        ▼                                        │
   │   Watchlist suggests the next watch             │
   │        │                                        │
   └────────┘  (loop closes at the next movie)       │
   └─────────────────────────────────────────────────┘
```

Properties: works with **zero friends**, compounds over time (the ledger only
gets more valuable), and is proven at 17M-user scale by Letterboxd. This loop
is FilmRave's floor — the reason a user opens the app on a random Tuesday.

### 4.2 The growth loop (multiplayer)

```
   ┌──────────────────────────────────────────────────────────┐
   │                                                          │
   │   Organizer creates an Outing (movie + circle)           │
   │        │                                                 │
   │        ▼                                                 │
   │   Shares the outing LINK into WhatsApp / iMessage        │
   │        │                                                 │
   │        ▼                                                 │
   │   4–8 friends open it — ★ EXPOSURE EVENT ★               │
   │   (each open is a non-user seeing the product)           │
   │        │                                                 │
   │        ▼                                                 │
   │   Guest RSVPs + votes WITHOUT an account (F-06)          │
   │        │                                                 │
   │        ▼                                                 │
   │   Post-movie: "rate it? keep your history?" → signup     │
   │        │                                                 │
   │        ▼                                                 │
   │   New user becomes an Organizer for THEIR other circle   │
   │        │                                                 │
   └────────┘  (loop closes with a new atomic network)        │
   └──────────────────────────────────────────────────────────┘
```

Properties: every use of the feature is distribution (the Partiful mechanism);
the conversion ask comes **after** value delivery, not before; and each
converted guest is a potential organizer for a disjoint friend group, which is
exactly how atomic networks tile outward.

### 4.3 How the loops reinforce each other

The outing loop generates *moments* (a group watched a movie together — a
`GroupWatch` row); the ledger loop captures them (everyone rates it; the
comparison table on the movie card becomes the conversation piece). The ledger
loop, in turn, makes the next outing better (the group's collective watchlist
and hype scores tell the Organizer what to plan). Neither loop alone is
defensible; together they are the product.

### 4.4 The strategic sequence

```
Phase 0            Phase 1              Phase 2               Phase 3
─────────          ─────────            ─────────             ─────────
Harden the         Open the             Add trust &           Scale-stage
solo ledger   →    growth loop     →    liveness         →    features
(rate/log/         (guest RSVP,         (real SMS OTP,        (contacts,
 watchlist/        share links,         push notifs,          recs, native
 import)           invite pages)        release alerts)       mobile, feed?)
```

Each phase has explicit entry/exit gates defined in §9. The discipline this
document asks for: **do not pull Phase 2–3 work forward because it feels
foundational.** The research says it is not.

---

## 5. Product Principles

Short, opinionated rules that resolve future feature debates without
re-litigating strategy. When a new idea appears, test it against these.

1. **Circles, not audiences.** Every social surface is scoped to a circle of
   real friends. No public profiles, no follower counts, no global feed. If a
   feature's value depends on strangers seeing your content, it belongs to
   Letterboxd, not FilmRave.
2. **Value before identity.** A person must be able to receive value (view an
   outing, RSVP, vote) before FilmRave asks them for an account, and receive
   an account before FilmRave asks for a phone number. Friction is spent only
   where it buys something.
3. **The link is the app.** Every meaningful object (outing, invite, movie
   card within a circle) should have a shareable URL that renders usefully for
   a logged-out viewer. Distribution happens in other people's group chats.
4. **Annotate, don't replace.** FilmRave's chat is a per-movie annotation
   layer, not a messenger. The group already has WhatsApp; competing with it
   is unwinnable and unnecessary.
5. **Own the data contract.** TMDB metadata is cached locally; user data is
   exportable; imports are first-class. Users arrive with history and could
   leave with it — that confidence is itself a retention feature.
6. **One atomic network at a time.** Optimize every decision for making a
   single 4–8 person circle succeed completely, rather than making 10,000
   hypothetical users partially happy.
7. **Boring reliability over novel features.** An outing page that loads in
   400ms and never loses an RSVP beats any new feature. The bar is "would I
   stake my own movie night on it?"

---

## 6. Current State of the System

An honest audit of what exists in the repository as of 2026-07-23, so that the
roadmap in §9 is grounded in reality rather than aspiration.

### 6.1 Monorepo layout

```
FilmRaveCs/
├── apps/
│   ├── api/                    # @filmrave/api — NestJS 11, ESM
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # 13 models + 7 enums (see §11)
│   │   │   └── seed.ts
│   │   └── src/
│   │       ├── auth/           # JWT + phone OTP (argon2-hashed codes)
│   │       ├── users/          # profile, handle lookup
│   │       ├── friendships/    # request/accept, pairwise status
│   │       ├── circles/        # groups, membership, roles, sharing prefs
│   │       ├── movies/         # TMDB search + get-or-fetch cache
│   │       ├── ratings/        # upsert 1..10, visibility enforcement
│   │       ├── watchlist/      # add/remove/list
│   │       ├── outings/        # RSVP, theater/night votes, hype
│   │       ├── chat/           # REST history + Socket.IO gateway
│   │       ├── notifications/  # in-app, typed payloads, read state
│   │       ├── imports/        # IMDb/Letterboxd CSV parse + confirm
│   │       └── common/         # CurrentUser decorator, CircleAccessGuard
│   └── web/                    # @filmrave/web — Next.js 15 App Router
│       └── src/
│           ├── app/
│           │   ├── (marketing)/    # landing, about, download (SSR)
│           │   ├── login/
│           │   ├── add/[handle]/   # friend-invite landing page
│           │   └── app/            # logged-in shell
│           ├── components/app/     # MovieCard, LogMovieModal, outing UI,
│           │                       # NotificationsPanel, ImportRatingsModal…
│           └── lib/
│               ├── http/backend.ts # real API client
│               ├── local/          # localStorage backend + seed (demo mode)
│               └── backend/types.ts# shared contract
└── packages/
    └── shared/                 # @filmrave/shared — typed DTO contract
```

Stack: **pnpm workspaces · Node ≥22 · NestJS 11 · Prisma 6 · PostgreSQL ·
Socket.IO · Next.js 15 · React 19 · Tailwind 4 · Vitest**. A Flutter app
shares the same 13-model domain (the schema comments reference
`lib/data/models`); the web package notes that the logged-in app may be served
by Flutter web until a dedicated React client is justified.

### 6.2 What is genuinely done

| Area | Evidence | Quality notes |
|---|---|---|
| Domain schema | `prisma/schema.prisma`, 13 models | Clean, composite PKs, cascade deletes, snake_case mapping; comments document invariants |
| Movie catalog | `movies.service.ts` | TMDB search + `getOrFetch` cache-through; keys/base URL via config; graceful 503 when unconfigured |
| Auth (dev) | `auth.service.ts` | OTP: argon2-hashed codes, 5-attempt cap, 5-min TTL, single-use consumption; JWT access+refresh; legacy email/password path retained |
| Ratings | `ratings.service.ts` + `CircleAccessGuard` | 1–10 invariant in service; visibility (none/approved/selective) enforced in app code by design |
| Outings | `outings.service.ts` (+ spec) | RSVP, theater & night voting with insertion-order tie-break, hype average |
| Chat | `chat.gateway.ts` | Per-(circle, movie) rooms over Socket.IO; REST history with index support |
| Imports | `imports/csv.ts` (+ spec) | IMDb/Letterboxd CSV parsing, staged unmatched rows, confirm step, `source` provenance on ratings |
| Notifications | `notifications.service.ts` | Six typed notification kinds with JSON deep-link payloads |
| Web demo mode | `lib/local/*` | Full localStorage backend + seed data — the app demos with no server |

### 6.3 What is scaffolded but not production-ready

- **SMS delivery.** OTP codes are logged/returned as `dev_code` in non-prod.
  No Twilio/Vonage/WhatsApp provider is wired. (Deliberately deferred — §13.)
- **Push notifications.** Notifications are in-app only; there is no Web Push
  or FCM/APNs delivery, so "tickets on sale" and RSVP changes are only seen
  on next open.
- **Public/guest surfaces.** The only logged-out deep link is
  `/add/[handle]` (friend invite). Outings have **no public URL** — the
  growth loop of §4.2 is therefore closed today.
- **Release-date intelligence.** `ticketsOnSaleDate` is a manually-set string;
  nothing watches TMDB for release-date changes or emits alerts automatically.
- **Test coverage.** Three spec files exist (`circles`, `outings`, `csv`) —
  good targets, thin coverage overall.
- **Ops.** No rate limiting, no structured request logging/tracing, no CI
  visible in the repo, no deployment manifests.

### 6.4 Assessment

The codebase is a **coherent v0.8 of the right product**. The domain model
anticipates almost everything in this document (hype, votes, group watches,
import provenance, selective sharing) — which is precisely why the correct
move now is sequencing and completion, not redesign. The two structural gaps
are (a) the guest-accessible outing page and (b) production trust plumbing
(SMS, push, rate limits) — and the strategy in §4 says (a) comes first.

---

## 7. Feature Inventory, Scoring & Verdicts

### 7.1 Scoring rubric

Each feature is scored 1–10 on five axes, then given a weighted composite.
Weights reflect the Phase 0–1 objective (one thriving atomic network + an open
growth loop), per §4.

| Axis | Weight | Question it answers |
|---|---|---|
| **Traction** (T) | 30% | Does this acquire users or open a loop? |
| **Retention** (R) | 30% | Does this bring an existing user back? |
| **Trust** (U) | 15% | Does this make the product feel safe/reliable? |
| **Effort-inverse** (E) | 15% | 10 = nearly free given current code; 1 = major build |
| **Strategic fit** (S) | 10% | Does it reinforce the two-loop model and §5 principles? |

`Composite = 0.30·T + 0.30·R + 0.15·U + 0.15·E + 0.10·S`

### 7.2 Scorecard

| ID | Feature | T | R | U | E | S | Comp | Phase | Verdict |
|----|---------|---|---|---|---|---|------|-------|---------|
| F-01 | Movie search / cards / detail (TMDB) | 5 | 9 | 8 | 10 | 9 | **7.8** | 0 ✅ | Done — table stakes, keep |
| F-02 | Personal ratings (1–10) | 4 | 10 | 7 | 10 | 10 | **7.8** | 0 ✅ | Done — retention core |
| F-03 | Watchlist | 4 | 9 | 6 | 10 | 9 | **7.2** | 0 ✅ | Done — closes solo loop |
| F-04 | CSV import (IMDb / Letterboxd) | 6 | 8 | 7 | 9 | 9 | **7.5** | 0 ✅ | Done — kills cold start for Cataloguers |
| F-05 | Circles (private groups, roles, sharing prefs) | 7 | 8 | 8 | 9 | 10 | **8.1** | 0 ✅ | Done — the atomic-network container |
| F-06 | **Guest-accessible shareable outing page** | 10 | 6 | 6 | 6 | 10 | **8.6** | **1 🔨** | **Build next — highest composite, opens the growth loop** |
| F-07 | Outings: RSVP + theater/night votes + hype | 8 | 8 | 6 | 9 | 10 | **8.1** | 0 ✅ | Done — differentiator; F-06 exposes it |
| F-08 | Friend requests via handle / invite link | 7 | 6 | 7 | 9 | 8 | **7.1** | 0 ✅ | Done — right v1 graph mechanic |
| F-09 | Friends' ratings on the movie card | 5 | 9 | 7 | 8 | 10 | **7.5** | 1 🔨 | Surface prominently — this *is* the recommendation feature for now |
| F-10 | In-app notifications | 4 | 7 | 7 | 9 | 8 | **6.5** | 0 ✅ | Done — sufficient for Phase 0–1 |
| F-11 | Web push for RSVP/outing events | 5 | 8 | 7 | 6 | 8 | **6.7** | 2 🔨 | Build in Phase 2; outing-scoped only, never engagement spam |
| F-12 | Phone OTP with real SMS (Twilio/WhatsApp) | 2 | 3 | 9 | 6 | 6 | **4.4** | 2 ⏳ | Code done, delivery deferred — optional at launch (§13) |
| F-13 | "Tickets on sale" / release-date alerts | 6 | 8 | 6 | 5 | 9 | **6.8** | 2 🔨 | High delight; needs a TMDB release-date watcher job |
| F-14 | Group watch history (`GroupWatch`) | 3 | 7 | 6 | 9 | 9 | **6.2** | 1 🔨 | Schema done — give it a UI ("our 14 movies together") |
| F-15 | Contact-book gathering & matching | 5 | 3 | 3 | 4 | 4 | **3.8** | 3 ⏳ | Defer — no matches at low density, high permission/privacy cost |
| F-16 | Chat enrichment (typing, reactions, media) | 2 | 4 | 5 | 5 | 3 | **3.6** | 3 ⏳ | Stop at basic chat — annotation layer, not a messenger (§5.4) |
| F-17 | Recommendation engine (algorithmic) | 3 | 5 | 4 | 2 | 4 | **3.7** | 3 ⏳ | Needs rating density that won't exist for months; F-09 substitutes |
| F-18 | Public profiles / global feed / followers | 4 | 3 | 2 | 3 | 1 | **3.0** | ✖ | **Anti-feature** — head-on Letterboxd competition, breaks §5.1 |
| F-19 | Synchronized watch-together streaming | 3 | 2 | 3 | 1 | 2 | **2.3** | ✖ | **Anti-feature** — Movies Anywhere killed this for lack of use |
| F-20 | Native mobile app (Flutter, already partial) | 6 | 8 | 7 | 4 | 7 | **6.4** | 3 🔨 | Real, but only after web loops are proven — mobile web + PWA first |

### 7.3 Reading the scorecard

Three observations the table makes visually obvious:

1. **The top of the composite ranking is dominated by things already built**
   (F-01…F-05, F-07, F-08). This is the audit's happy conclusion: past effort
   landed on the right features. The product debt is not missing features but
   an unopened loop.
2. **F-06 is the outlier** — the highest composite score (8.6) of anything
   *not* built. It converts F-07, an internal feature, into a distribution
   channel. Its build cost is moderate (a public route, a guest-RSVP token
   model, an OG-image card for link previews) and touches no existing tables
   destructively (see §12.3).
3. **The originally-foundational features rank near the bottom.** Phone SMS
   (F-12: 4.4) and contacts (F-15: 3.8) score low not because they are bad
   but because their *timing* is wrong: their trust payoff arrives at a scale
   FilmRave has not reached, while their friction cost is charged immediately.

### 7.4 Feature narratives (selected)

**F-06 — Guest-accessible outing page (the keystone).** An outing gains a
public URL (`/o/[slug]`). A logged-out visitor sees the movie poster, date
options, theater options, who's already going (first names/avatars), and the
hype meter — and can RSVP and vote by entering just a display name, held in a
signed guest-session cookie. After the outing date passes, the guest is
prompted: *"Rate the movie — create your free ledger."* That prompt is the
funnel from Passenger → user, and the page itself (rich OG card in WhatsApp
link previews) is the advertisement. Partiful's entire 400%-growth engine is
this exact shape. Design details in §12.3; risks (spam, enumeration) in §16.

**F-09 — Friends' ratings on the card.** With even 4 friends on the platform,
the movie card's killer row is not the TMDB average — it is *"Priya 9 · Arjun
4 · you haven't seen it."* This is the recommendation engine at friend-group
scale: zero ML, total trust, already computable from existing tables
(`Rating` × `CircleMember` filtered by `ratingsShared`). It should be the most
visually prominent element on every card inside a circle context.

**F-13 — Release-date alerts.** The `tickets_on_sale` notification type and
`ticketsOnSaleDate` column already exist; what's missing is a scheduled job
that re-fetches TMDB release dates for movies present on any watchlist or
outing and emits notifications on change. This is the "anticipation has no
home" wedge from §2.1 — high delight, and a legitimate reason to send a push
(F-11), which is why both land together in Phase 2.

**F-15 — Contacts, honestly assessed.** The end-state vision ("verification
via mobile number and gathering contacts") is right *for the end state*. At
scale, contact matching is the strongest friend-graph builder known. But the
mechanism requires density: importing 300 contacts to find 0 matches is a
negative-value experience that also costs the scariest permission on the
phone. The gate in §9 (Phase 3 entry) makes this concrete: build contacts
when ≥20% of new signups would find at least one existing match — measurable
from invite-graph overlap — and ship it with hashed-number matching rather
than raw upload, per §16.

---

## 8. Non-Goals & Anti-Features

Explicitly out of scope, with reasons — so future-you doesn't relitigate them
in a weak moment:

| Non-goal | Why not |
|---|---|
| Public profiles, followers, global/trending feeds (F-18) | Competes with Letterboxd's 17M-user public network from zero; breaks the private-circle trust promise (§5.1); moderation burden of public content is a company-sized problem |
| Synchronized streaming / watch-together (F-19) | Disney-scale Movies Anywhere shut this down for lack of use; enormous engineering cost; FilmRave's outings are about *physical* or at least *planned* co-watching, not virtual sync |
| Full-featured messenger (F-16 beyond basics) | WhatsApp/iMessage own this; FilmRave chat is per-movie annotation (§5.4) |
| Ticketing/showtime purchase integration | Fandango-class BD problem; link out instead; revisit only if outings volume proves demand |
| Algorithmic recommendations (F-17, near-term) | Needs density; friends' ratings (F-09) outperform ML at friend-group scale anyway |
| TV shows / episode tracking | Doubles catalog complexity (seasons, episodes, progress) before the movie loop is proven; the schema's `Movie(tmdbId)` key leaves room to add a media-type dimension later |
| Monetization mechanics | Pre-traction monetization distorts every design decision; Letterboxd monetized (Pro/Patron) *after* the community existed |
| Mandatory phone verification at signup | 20–30% funnel loss for a trust benefit that private circles don't yet need (§3.4, §13) |

---

## 9. Phased Roadmap

Each phase has an **objective**, a **scope list** (by feature ID), an **exit
gate** (measurable), and an explicit **not-yet list**. Time estimates assume a
single founding engineer with AI assistance; they are for sequencing honesty,
not deadlines.

### Phase 0 — "Stake Your Own Movie Night On It" (now → ~3 weeks)

> **Objective:** the existing feature set becomes reliable enough that you run
> your *own real friend group's* movie nights on it, end to end, with zero
> workarounds. Dogfooding is the phase — the first atomic network is yours.

Scope:
- Harden F-01…F-05, F-07, F-08, F-10: fix every papercut that dogfooding
  reveals; empty states, error states, loading states on every screen.
- F-09: promote friends' ratings to the top of the movie card in circle
  context.
- F-14: minimal group-history UI ("movies this circle watched," from
  `GroupWatch`).
- Ops floor: rate limiting on auth + OTP endpoints (`@nestjs/throttler`),
  structured logging, a smoke-test CI (typecheck + lint + vitest on push),
  deploy API + web to a real host with managed Postgres, nightly DB backup.
- Test spine: service-level tests for ratings visibility (the
  `CircleAccessGuard` + selective-sharing matrix is the most correctness-
  critical logic in the app) and outing vote tallies.

Exit gate: **your circle completes 3 real outings and 30+ ratings through the
app without anyone falling back to WhatsApp for the plan itself.**

Not yet: any new surface area, SMS, push, guests.

### Phase 1 — "Open the Loop" (~3–5 weeks)

> **Objective:** the growth loop of §4.2 spins for the first time — an
> organizer in a circle you are *not* in runs an outing via a shared link.

Scope:
- **F-06 in full** (design in §12.3): public outing route, guest RSVP/vote
  with signed guest sessions, OG-image link previews, guest→user upgrade flow
  that preserves the guest's RSVP and post-movie rating prompt.
- Circle invite links (extend the existing `/add/[handle]` pattern to
  circle-scoped invites with expiring tokens).
- Post-outing moment: the day after `Outing.status → done`, prompt all
  attendees to rate; render the comparison table; write the `GroupWatch` row
  automatically.
- Abuse floor for public surfaces: per-IP rate limits on guest actions,
  unguessable slugs, organizer ability to lock/close an outing.

Exit gate: **≥5 circles you did not seed complete an outing; ≥25% of guests
who RSVP'd convert to accounts within 7 days of the outing.**

Not yet: SMS, push, contacts, native app.

### Phase 2 — "Trust & Liveness" (~4–6 weeks)

> **Objective:** the product earns the right to interrupt people, and identity
> hardens because strangers-at-the-edges now exist (guests).

Scope:
- F-12: wire a real OTP provider (Twilio Verify or WhatsApp OTP — WhatsApp is
  markedly cheaper in South-Asian markets, relevant given likely early user
  geography). Phone stays **optional**: offered at signup, required only for
  organizer accounts if abuse data demands it.
- F-11: Web Push (VAPID) for a strict allowlist of events: RSVP changes on
  your outing, outing reminders, tickets-on-sale. No engagement-bait
  notifications, ever (§5.7 and the trust axis both say so).
- F-13: release-date watcher job — re-fetch TMDB dates for movies on any
  watchlist/outing (daily cron), diff, emit `tickets_on_sale` notifications.
- Account settings: data export (JSON/CSV of ratings + watchlist — the §5.5
  promise), account deletion (cascades already modeled).

Exit gate: **push opt-in ≥40% among organizers; OTP completion ≥85% among
those who attempt it; release alerts fire correctly for 3 consecutive weekly
release cycles.**

### Phase 3 — "Density Features" (gated, not scheduled)

> **Objective:** deploy the scale-stage weapons only when density makes them
> pay.

Scope (each item has its own entry gate):
- F-15 contacts matching — **gate:** projected match rate ≥20% for new
  signups; ship with client-side E.164 normalization + hashed matching.
- F-20 native mobile — **gate:** mobile-web DAU ≥60% of total and PWA
  limitations (push on iOS, contact access) measurably hurt conversion; the
  existing Flutter domain models make this a port, not a rewrite.
- F-17 recommendations — **gate:** median active circle has ≥100 distinct
  rated movies.
- F-16 chat polish — **gate:** chat DAU/circle-DAU ≥50% (i.e., people are
  actually living in the chat).

---

## 10. System Architecture

### 10.1 Current architecture (as-built)

```
                                   ┌──────────────────────────────┐
                                   │           TMDB API           │
                                   │   (search / movie detail /   │
                                   │      release dates)          │
                                   └──────────────▲───────────────┘
                                                  │ cache-through
                                                  │ (MoviesService)
┌──────────────┐   HTTPS/JSON   ┌─────────────────┴────────────────┐
│  Next.js 15  │◄──────────────►│         NestJS 11 API            │
│  web client  │                │  ┌────────────────────────────┐  │
│              │   Socket.IO    │  │ Modules: auth · users ·    │  │
│  (marketing  │◄──────────────►│  │ friendships · circles ·    │  │
│   SSR pages  │   (chat rooms  │  │ movies · ratings ·         │  │
│   + app      │    per circle+ │  │ watchlist · outings ·      │  │
│   shell)     │    movie)      │  │ chat · notifications ·     │  │
└──────┬───────┘                │  │ imports                    │  │
       │                        │  └────────────────────────────┘  │
       │ demo mode:             │  Guards: JwtAuthGuard,           │
       │ lib/local/* backend    │  CircleAccessGuard (visibility)  │
       │ (localStorage, seeded) └─────────────────┬────────────────┘
       │                                          │ Prisma 6
┌──────▼───────┐                ┌─────────────────▼────────────────┐
│ Flutter app  │  same typed    │           PostgreSQL             │
│ (13-model    │  contract      │   13 tables · composite PKs ·    │
│  domain twin)│  (@filmrave/   │   cascade deletes · JSONB        │
└──────────────┘   shared)      │   notification payloads          │
                                └──────────────────────────────────┘
```

Notable as-built decisions worth preserving:

- **Typed contract package** (`@filmrave/shared`) keeps web, API, and (by
  mirroring) Flutter agreeing on DTO shapes — snake_case on the wire,
  camelCase in code.
- **Visibility in the application layer, on purpose.** The schema comment
  states it: rating visibility (`none | approved | selective`) is enforced by
  `CircleAccessGuard` + `RatingsService` rather than DB row-level security, so
  aggregate and self views share one code path. Correct trade-off at this
  scale; §16 records the test obligation it creates.
- **Cache-through movie catalog.** `Movie` rows are hydrated from TMDB on
  first touch and never re-fetched (`update: {}` on the upsert). Phase 2's
  release-date watcher must change this to a *refreshing* cache for
  yet-unreleased films.
- **Swappable web backend** (`lib/http/backend.ts` vs `lib/local/backend.ts`)
  gives a zero-server demo mode — genuinely useful for showing the product,
  and it enforces interface discipline on the client.

### 10.2 Phase 1–2 additions (delta architecture)

```
   NEW in Phase 1                       NEW in Phase 2
┌─────────────────────┐            ┌──────────────────────────┐
│ /o/[slug] public    │            │  Scheduler (cron)        │
│ outing route (SSR + │            │  ├─ release-date watcher │
│ OG image gen)       │            │  └─ outing reminders     │
│                     │            ├──────────────────────────┤
│ Guest sessions:     │            │  Web Push (VAPID)        │
│ signed cookie, no   │            │  subscriptions table +   │
│ user row until      │            │  send-on-notification    │
│ upgrade             │            ├──────────────────────────┤
│                     │            │  SMS/WhatsApp OTP        │
│ GuestRsvp rows      │            │  provider adapter behind │
│ (nullable userId on │            │  existing AuthService    │
│ OutingRsvp — see    │            │  (interface already      │
│ §12.3)              │            │   shaped for it)         │
└─────────────────────┘            └──────────────────────────┘
```

No message queue, no microservices, no Redis are required through Phase 2. A
single API process with an in-process cron (`@nestjs/schedule`) and Postgres
is sufficient far beyond the traction levels this document plans for; adding
infrastructure before the gates demand it violates §5.7.

---

## 11. Data Model Deep Dive

### 11.1 Entity-relationship overview

```
 User ───────────────┬──────────────────────────────────────────┐
  │ 1:N              │ 1:N                                      │ 1:N
  ▼                  ▼                                          ▼
 Friendship      CircleMember ──── N:1 ──► Circle          Notification
 (pairwise,      (role, ratings-            │ 1:N               (typed,
  status enum)    Shared prefs,             ├──► ChatMessage     JSONB
                  sharedMovieIds)           ├──► Outing          payload)
                                            └──► GroupWatch
 User ──1:N──► Rating ◄──N:1── Movie          Outing 1:N ──► OutingRsvp
 User ──1:N──► WatchlistEntry ◄──N:1── Movie  Outing 1:N ──► OutingHype
                                              Outing 1:N ──► TheaterVote
 OtpChallenge (standalone,                    Outing 1:N ──► NightVote
   phone + hashed code)
```

### 11.2 Model-by-model commentary

| Model | Key | Commentary |
|---|---|---|
| `User` | cuid | `phone` and `email` both nullable — the schema already encodes the "phone optional" strategy of §13; `handle` unique for invite links |
| `OtpChallenge` | cuid | Hashed code, attempt counter, TTL, single-use `consumedAt` — a correct OTP record; only the SMS transport is missing |
| `Circle` / `CircleMember` | cuid / (circleId,userId) | Roles (`admin`/`member`) + the three-state `ratingsShared` + `sharedMovieIds[]` for selective mode — the privacy heart of the product |
| `Friendship` | (userId,otherId) | Four-state pairwise status; note it stores *directional* rows — the service layer owns keeping both directions consistent |
| `Movie` | tmdbId (natural key) | Cache of TMDB; natural key means no join indirection anywhere; `releaseDate` as string `YYYY-MM-DD` is fine for display but the Phase 2 watcher should compare as dates |
| `Rating` | (userId,movieTmdbId) | One rating per user per movie (upsert semantics); `source` enum preserves import provenance — valuable and rare |
| `WatchlistEntry` | (userId,movieTmdbId) | Minimal and right |
| `ChatMessage` | cuid | Scoped to (circle, movie) — chat is annotation, matching §5.4; indexed for history pagination |
| `Outing` | cuid | (circle, movie, status, ticketsOnSaleDate); Phase 1 adds a public `slug` and a `lockedAt` (see §12.3) |
| `OutingRsvp` / `OutingHype` | (outingId,userId) | Phase 1 needs guest participation — recommended: a separate `GuestRsvp` table rather than nullable `userId` (keeps the composite PK honest) |
| `TheaterVote` / `NightVote` | (outingId,optionId) | `voterIds[]` array pattern — simple and adequate at circle scale (≤~20 voters); would be a join table at larger scale, deliberately not needed |
| `GroupWatch` | (circleId,movieTmdbId) | The shared-history atom; Phase 1 writes it automatically on outing completion |
| `Notification` | cuid | Six types; JSONB `data` for deep links; `readAt` state; indexed (userId, createdAt) |

### 11.3 Schema changes implied by this document (all additive)

1. `Outing.slug String @unique` + `Outing.lockedAt DateTime?` (Phase 1, F-06).
2. `GuestRsvp` table: `(outingId, guestToken)` PK, `displayName`, `status`,
   `createdAt`, optional `claimedByUserId` for the upgrade flow (Phase 1).
3. `PushSubscription` table: `(userId, endpoint)` with keys (Phase 2, F-11).
4. `Movie.releaseDateCheckedAt DateTime?` for the watcher (Phase 2, F-13).
5. Nothing else. Every other feature in Phases 0–2 runs on the existing 13
   models — the strongest possible evidence that the original modeling was
   sound and rework risk is low.

---

## 12. Critical User Flows

### 12.1 Onboarding (Phase 0–1 form)

```
Landing / shared link
  │
  ├── "Continue with email"  ──► handle + display name ──► in
  │        (existing legacy path — keep as default)
  │
  └── "Continue with phone"  ──► OTP (dev now, real in Ph.2) ──► in
           (offered, never required, until §13 triggers)

First-run, in order of screen priority:
  1. "Import your ratings?"  (IMDb / Letterboxd CSV — F-04)
  2. "Rate 5 movies you've seen recently"  (search-driven, skippable)
  3. "Start a circle or join with an invite link"
```

Rationale: steps 1–2 charge the single-player battery before any social ask;
step 3 is skippable because a solo ledger user is a successful user
(Letterboxd lesson, §3.1).

### 12.2 The outing lifecycle (core loop, mostly built)

```
Organizer picks movie ──► creates Outing in circle
        │
        ▼
Adds theater options + night options ──► shares (in-app now; link in Ph.1)
        │
        ▼
Members RSVP (going/maybe/can't) · vote theaters · vote nights · set hype
        │                                    │
        ▼                                    ▼
Tallies visible live               Group hype = avg(member hype)
        │
        ▼
Outing happens (real life) ──► organizer marks done
        │
        ▼
GroupWatch row written · next-day rating prompts to attendees
        │
        ▼
Movie card now shows the circle's comparison table ──► chat thread ignites
```

### 12.3 Guest RSVP & upgrade (F-06 — the Phase 1 build)

```
Guest receives link in WhatsApp: filmrave.app/o/dune-fri-x7k2
  │
  ▼
SSR page (no auth): poster · date/theater options · attendee avatars ·
hype meter · rich OG card already shown in the chat preview
  │
  ▼
Taps "I'm going" ──► name prompt (just a display name)
  │                      │
  │                      ▼
  │        Signed guest cookie minted (guestToken, outing-scoped)
  │        GuestRsvp row written · votes allowed with same token
  ▼
Organizer sees "Sam (guest)" in the tally alongside members
  │
  ▼   (day after outing date)
Guest revisits link ──► "How was it? Rate it — keep your movie history"
  │
  ▼
Signup (email or phone) ──► GuestRsvp.claimedByUserId set ──►
rating written to their new ledger ──► prompted to join the circle
```

Design constraints: slugs must be unguessable (no sequential IDs); guest
actions rate-limited per IP + per token; the organizer can lock the outing
(freezes guest writes); guests see first names/avatars only — no handles, no
ledgers — preserving §5.1 privacy for members.

### 12.4 CSV import (built — F-04)

```
Upload CSV (IMDb or Letterboxd export)
  ──► parse (imports/csv.ts) ──► match rows to TMDB ids
  ──► matched: staged with source=imdb|letterboxd
  ──► unmatched: staged as sample rows for manual confirm
  ──► user confirms ──► ratings upserted with provenance ──►
      `rating_imported` notification
```

This flow is FilmRave's answer to "why would a Letterboxd user even try
this?" — they arrive with their history intact in minutes, and (per §5.5)
could export it back out. Zero-lock-in confidence is a feature.

---

## 13. Identity, Trust & Verification Strategy

This section resolves the document's one major departure from the original
concept, so the reasoning is on record.

**Original concept:** phone-number verification and contact gathering as the
foundation ("proper verification via mobile number and gathering contacts").

**Revised strategy:** identity hardening is a *ladder* users climb as their
exposure grows, not a wall at the door.

| Rung | Identity requirement | Unlocks | When required |
|---|---|---|---|
| 0 | None (signed guest cookie) | View outing, RSVP, vote | Never — permanent guest tier |
| 1 | Email **or** phone + handle | Ledger, watchlist, circles, chat | On wanting persistence |
| 2 | Verified phone (real OTP) | — initially nothing; later: organizer tools if abuse appears | Phase 2+, triggered by abuse data, not by default |
| 3 | Contacts permission | Friend matching | Phase 3, gated on match-rate ≥20% |

Why the ladder beats the wall, in evidence order: (a) SMS OTP costs 20–30% of
the signup funnel (§3.4) — at launch, every single user is precious and
personally invited, i.e., already trusted; (b) private circles mean strangers
cannot reach members, removing the main threat phone verification guards
against; (c) OTP fraud (pumping) is a real cost the moment an SMS endpoint is
public, so *delaying* SMS also delays an attack surface; (d) the codebase
loses nothing — the OTP implementation is complete and correct, and flipping
it to "required" later is a config change plus a provider adapter.

The trust FilmRave *does* need at launch is different and cheaper: rate
limits, unguessable public slugs, organizer lock controls, and the social
trust inherent in invite-only circles. Those ship in Phases 0–1.

---

## 14. Growth Model & Distribution

### 14.1 The tiling model

Growth is modeled as **atomic networks tiling outward through shared
members**, not as individual signups:

```
  Circle A (yours) ──── member also in friend-group B ────► Circle B
       │                                                        │
       └── guest at A's outing has their own group C ──────► Circle C
```

Every person belongs to several real-life friend groups; each converted guest
is a bridge to a disjoint circle. The unit of acquisition is therefore **the
completed outing**, and the north-star growth question is: *how many new
circles did last month's outings spawn?*

### 14.2 Channel strategy (in priority order)

1. **The outing link itself** (Phase 1+) — primary channel, cost ≈ 0,
   Partiful-proven. Everything about the public page (speed, OG card beauty,
   one-tap RSVP) is growth work.
2. **Letterboxd-adjacent communities** (Phase 1+) — the CSV import is the
   hook: "bring your Letterboxd history into a private version for your real
   friends." Film subreddits, Discords, film-club campus groups. Organic
   posts, not ads.
3. **The Organizer as evangelist** — one Organizer converts a whole circle;
   onboarding, docs, and any future referral mechanics should target the
   Organizer persona specifically.
4. **Not** app-store optimization, paid installs, or influencer spend —
   pre-density, these buy users into an empty room and burn money against
   principle §5.6.

### 14.3 Seasonal leverage

Movie hype is calendar-driven. Release tentpoles (a Dune, an Avengers, an
Indian mass-release Friday) create natural outing spikes; the Phase 2
release-alert system (F-13) exists partly to let FilmRave *ride* these
calendar moments — an alert is both a retention touch and a prompt to start
an outing, feeding §14.1.

---

## 15. Metrics & Success Criteria

### 15.1 North-star metric

> **Completed group outings per week** — an outing that reached `done` with
> ≥3 RSVP'd attendees.

Chosen because it sits at the intersection of both loops: it requires
acquisition (people showed up), engagement (they planned in-app), and it
*causes* retention (post-watch ratings, group history, chat). Vanity-resistant:
you cannot inflate it without real humans watching a real movie together.

### 15.2 Metric tree

```
Completed outings / week  (north star)
├── Acquisition
│   ├── Outing links shared / outing created
│   ├── Guest page views / link shared          (link CTR in group chats)
│   ├── Guest RSVP rate                          (target ≥50% of viewers)
│   └── Guest → account conversion, 7-day       (target ≥25% — Ph.1 gate)
├── Activation
│   ├── New user rates ≥5 movies in week 1       (target ≥60%)
│   ├── CSV import completion rate               (of those who start it)
│   └── New user joins/creates a circle, week 1
├── Retention
│   ├── W4 retention of circle members           (target ≥40%)
│   ├── Ratings per active user per month
│   └── Circles with ≥2 outings                  (repeat-usage of the core)
└── Trust / quality
    ├── OTP completion rate (when attempted)     (target ≥85% — Ph.2 gate)
    ├── Push opt-in among organizers             (target ≥40% — Ph.2 gate)
    ├── p95 public outing page load              (target <800ms)
    └── RSVP write failures                      (target ~0 — §5.7)
```

### 15.3 Instrumentation note

Phase 0 should add a minimal event log (a Postgres `events` table is enough —
no analytics vendor needed yet): `outing_created`, `link_shared`,
`guest_viewed`, `guest_rsvped`, `guest_converted`, `rating_created`,
`import_completed`, `circle_created`. Every gate in §9 is computable from
these eight events; do not ship Phase 1 without them, because the gates are
otherwise unmeasurable.

---

## 16. Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | **Growth loop doesn't spin** — outing links get shared but guests don't RSVP | Medium | High | Obsess over the guest page (speed, OG card, one-tap RSVP with zero fields beyond a name); instrument every funnel step (§15.3); iterate on the page, not on new features |
| R-2 | **Virality without retention** — guests convert but churn (the Partiful cautionary tale) | Medium | High | The rating-prompt-after-outing is the bridge into the ledger loop; watch W4 retention of converts specifically; if it lags, invest in ledger delight (F-09 prominence, import nudges), not more virality |
| R-3 | **Public outing pages attract abuse** (spam RSVPs, slug scraping, scripted votes) | Medium | Medium | Unguessable slugs, per-IP + per-token rate limits, organizer lock, guest writes capped per outing; SMS-verification for organizers is the *escalation* path (§13 rung 2), armed but not fired |
| R-4 | **Ratings-visibility bug leaks a private rating** — the most trust-destroying possible failure, and enforcement is app-layer by design | Low | Severe | The §9 Phase 0 test spine: an exhaustive matrix test over (none/approved/selective × member/non-member × self/other) around `CircleAccessGuard` + `RatingsService`; any future change to these files requires the matrix to pass |
| R-5 | **TMDB dependency** (terms, pricing, availability) | Low | Medium | Cache-through design already keeps served data local; comply with TMDB attribution requirements on all public pages; the natural-key schema would survive a provider migration with an ID-mapping table |
| R-6 | **OTP cost/fraud when SMS goes live** | Medium | Medium | Provider-level protections (Twilio Verify fraud guard), per-phone and per-IP throttles (attempt caps already in code), WhatsApp OTP where cheaper; phone remains optional so the endpoint is low-traffic |
| R-7 | **Contacts feature becomes a privacy liability** (Phase 3) | Medium | High | Hash-based matching (normalized E.164 → salted hash), never store raw contact books server-side, explicit consent copy, deletion path; and the §9 gate means it only ships when it demonstrably pays |
| R-8 | **Solo-founder bandwidth** — the roadmap stalls mid-phase | High | High | Phases are cut so each ends in a *usable* product (Phase 0 is already one); exit gates prevent half-built sprawl; anti-features list (§8) is the guard against scope creep |
| R-9 | **Flutter/web client divergence** — two clients drift from the shared contract | Medium | Medium | `@filmrave/shared` is the single contract source; per the web package's own note, keep the logged-in app on **one** client (Flutter web or React — pick one per platform) until traction justifies two |
| R-10 | **Building for scale too early** (queues, microservices, ML) | Medium | Medium | §10.2's explicit "no Redis, no queue through Phase 2" line; principle §5.7; the gates in §9 are the only trigger for infrastructure |

---

## 17. Open Questions

Decisions deliberately left open, with the information that would close them:

1. **Which client owns the logged-in experience per platform?** The web
   package description says Flutter web serves the app until a React client
   is justified; the React components in `apps/web` suggest momentum the
   other way. Close by: picking one for Phase 0 dogfooding and measuring the
   papercuts. (Recommendation: whichever you personally fix fastest — R-8
   dominates.)
2. **Guest votes: RSVP-only or full voting?** Letting guests vote theaters/
   nights maximizes the page's usefulness but increases abuse surface. Close
   by: launch RSVP + night-vote for guests, theater-vote members-only, and
   watch abuse metrics.
3. **Email delivery** (magic links vs password for rung-1 identity). The
   legacy password path exists; magic links would be less friction but add a
   mail provider dependency. Close by: Phase 1 signup-funnel data.
4. **TV shows.** Ruled out in §8 for now; the question is what user signal
   would reopen it. Proposed trigger: search-log analysis showing ≥15% of
   failed searches are TV titles.
5. **Monetization shape** (Letterboxd-style Pro tier vs organizer tools vs
   nothing for a long time). Explicitly parked until the north-star metric
   has a trend line worth protecting.
6. **Geographic focus.** Early users' geography (likely India + US given
   context) affects OTP channel choice (WhatsApp vs SMS), release calendars,
   and theater-data ambitions. Close by: looking at the first 100 real users.

---

## Appendix A — Research Sources

Market and growth evidence cited in §3–§4:

**Letterboxd:**
- [Variety — Letterboxd year-end growth report](https://variety.com/vip/letterboxd-year-end-report-growth-1236277320/)
- [TheWrap — How a grassroots social network is revolutionizing film fandom](https://www.thewrap.com/letterboxd-social-media-platform-film-fans/)
- [NoGood — Letterboxd marketing strategy: a masterclass in community](https://nogood.io/blog/letterboxd-marketing/)
- [YouScan — How Letterboxd is reshaping film culture](https://youscan.io/blog/how-letterboxd-is-reshaping-film-culture/)
- [TIME100 Most Influential Companies 2026 — Letterboxd](https://time.com/collection/time100-most-influential-companies/2026/letterboxd/)

**Partiful / event loops:**
- [CNBC — Meet Partiful, the Gen-Z party-planning staple](https://www.cnbc.com/2025/04/19/meet-partiful-the-gen-z-party-planning-staple-thats-taking-on-apple.html)
- [Sacra — Partiful valuation, funding & growth data](https://sacra.com/c/partiful/)
- [NoGood — Partiful marketing strategy](https://nogood.io/blog/partiful-marketing-strategy/)
- [Consumer App Lab — Virality isn't retention: lessons from Partiful, Noplace, Ditto](https://consumerapplab.substack.com/p/virality-isnt-retention-lessons-from)

**Cold-start theory:**
- [Andrew Chen — How to solve the cold-start problem for social products](https://andrewchen.com/how-to-solve-the-cold-start-problem-for-social-products/)
- [Sachin Rekhi — A primer on network effects from The Cold Start Problem](https://www.sachinrekhi.com/p/andrew-chen-the-cold-start-problem)

**Phone verification friction & cost:**
- [Security Boulevard — The true cost of SMS OTP in 2026](https://securityboulevard.com/2026/05/the-true-cost-of-sms-otp-for-ecommerce-in-2026-and-how-passkeys-cut-it-by-80-percent/)
- [Message Central — OTP API pricing 2026 (USA)](https://www.messagecentral.com/blog/otp-api-pricing-usa)
- [DEV — What SMS OTP actually costs beyond the Twilio invoice](https://dev.to/ilyahye/what-sms-otp-actually-costs-you-beyond-the-twilio-invoice-3571)

**Cautionary tales:**
- [TechCrunch — Movies Anywhere shutting down social features](https://techcrunch.com/?p=2494376)

## Appendix B — Glossary

| Term | Meaning in this document |
|---|---|
| **Atomic network** | The smallest self-sustaining engaged network — for FilmRave, one real friend group (4–8 people) using it for actual movie nights |
| **Circle** | FilmRave's private friend group; the container for chat, outings, sharing prefs, and group history |
| **Guest** | A person interacting with a public outing page via a signed token, with no account |
| **Hype** | A member's 1–10 excitement score for an outing's movie; group hype is the average |
| **Ledger** | A user's personal history of ratings + watchlist — the single-player retention asset |
| **Organizer** | The persona who creates outings and drags the circle onto the platform |
| **Outing** | A planned group movie event: movie + circle + RSVP + theater/night votes + hype |
| **Passenger** | The majority persona who joins when invited; served by guest access before signup |
| **Tiling** | Growth by adjacent atomic networks: converted guests founding circles for their other friend groups |
| **Two-loop model** | The strategy frame of §4: single-player ledger loop (retention) × shareable outing loop (acquisition) |

---

*End of document. Next scheduled revision: at the Phase 0 exit gate.*
