# Security Policy

> **Maintainer:** Ajay Elika ([@ajay99511](https://github.com/ajay99511)) — ajayelika99511@gmail.com

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security problems.**

Report vulnerabilities privately through GitHub Security Advisories:

1. Go to the **Security** tab of this repository.
2. Click **Report a vulnerability** (GitHub Private Vulnerability Reporting).
3. Fill in the advisory form with the details below.

### What to include

- A description of the vulnerability and its impact.
- Steps to reproduce (a minimal proof-of-concept if possible).
- Affected version(s) / commit, and environment details.
- Any relevant logs, stack traces, or screenshots.

### What to expect

- **Acknowledgement:** within **3 business days**.
- **Initial assessment:** within **7 business days**, including whether the
  report is accepted, needs more information, or is declined (with reasoning).
- **Fix & disclosure:** we aim to ship a fix for accepted, valid reports within
  **90 days**. We will coordinate a disclosure timeline with you and credit you
  in the release notes unless you prefer to remain anonymous.

## Scope

FilmRave CS is the **client/server monorepo** powering FilmRave — it contains
a NestJS API, Next.js web client, and shared typed contract. Areas of
particular interest:

- Authentication or authorization bypass (JWT, session handling).
- Circle visibility rule enforcement — data leaking across circles.
- SQL injection, NoSQL injection, or ORM abuse (Prisma).
- Insecure Socket.IO event handling or WebSocket hijacking.
- Server-side request forgery (SSRF) or open redirects.
- Exposure of environment variables, secrets, or API keys.
- Dependency vulnerabilities in production packages.

Out of scope: denial-of-service attacks requiring significant resources, and
reports against unsupported or pre-release versions.
