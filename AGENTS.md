<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

### Services Overview

This is a **Next.js 16 full-stack app** (Hysteria 2 Admin Panel / "dPanel") with PostgreSQL as its primary data store. Redis is optional (rate limiting/caching degrades gracefully without it).

### Starting the Dev Environment

1. **PostgreSQL** must be running on `localhost:5432` before the app starts. Start it with:
   ```
   pg_ctlcluster 16 main start
   ```
2. **Dev server**: `npm run dev` (Turbopack, port 3000).
3. **Admin credentials** (seeded by `npm run setup:admin`): `admin` / `admin123`.

### Key Commands

| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Lint | `npm run lint` |
| Unit tests (no DB needed) | `npm test -- tests/unit/` |
| Full tests (needs PostgreSQL) | `npm test` |
| Generate Prisma client | `npm run prisma:generate` |
| Push schema to DB | `npm run prisma:push` |
| Seed admin + demo data | `npm run setup:admin` |

### Gotchas

- The `.env.local` file is required; copy from `.env.example`. The only mandatory variable for core functionality is `DATABASE_URL`.
- `npm run prisma:push` and `npm run prisma:generate` use a wrapper script at `scripts/run-prisma.js` that loads env via `@next/env`.
- ESLint reports ~600+ pre-existing `@typescript-eslint/no-explicit-any` errors; these are not from your changes.
- Integration tests (shadowgrok, opsec suites) need both PostgreSQL **and** Redis plus properly configured API keys; unit tests work without external services.
- The app routes all external HTTP through a Hysteria proxy by default; if `HYSTERIA_EGRESS_PROXY_URL` is unset or unreachable, external-calling features (AI, OSINT, threat intel) will fail but the core UI/CRUD still works.
