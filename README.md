# Hysteria 2 Admin Panel

A Next.js-based administrative panel for managing [Hysteria 2](https://v2.hysteria.network/) proxy infrastructure. Provides real-time dashboards, multi-format client config generation, node inventory management, subscription endpoints, and optional LLM-assisted server config generation.

## Features

- **Dashboard** — real-time cards for total nodes, online nodes, active connections, bandwidth; nodes health table; activity feed. Polls the Hysteria Traffic Stats API and admin overview endpoints for live operational status.
- **Nodes management** — full inventory CRUD with search/filter by tag/status/provider, deployment modal with presets (Basic TLS, Obfuscated, High-throughput, Minimal), edit/rotate-auth/delete modals.
- **Client config generation** — per-user, per-node generation in four formats:
  - Official Hysteria2 YAML
  - `hysteria2://` URIs for quick-import into v2rayN / Nekoray
  - Clash Meta (mihomo) YAML with proxies, proxy-groups (select + url-test), rules
  - sing-box JSON with outbounds and selector
- **Subscription endpoint** — public token-authenticated endpoint (`GET /api/sub/hysteria2?token=X&tags=Y&format=base64|clash|singbox`) compatible with Clash Meta, Nekoray, v2rayN.
- **AI Config Assistant** — clean chat UI powered by any OpenAI-compatible LLM (Blackbox AI, OpenAI, Anthropic via gateway, etc.). Generates Hysteria2 server configurations from natural-language prompts with preset suggestions. Preview-only — admin must review before applying.
- **Agents** — background LLM task runner that routes all outbound HTTP through the managed Hysteria2 node's SOCKS5/HTTP proxy.
- **Sonner toasts** — real-time notifications for server lifecycle, node status changes, client connect/disconnect, and task updates.
- **Operator auth** — admin gating via the app's Prisma-backed operator accounts and session cookies.

## Requirements

- Node.js 20+
- PostgreSQL 14+
- A running Hysteria 2 server (the panel can optionally manage its process lifecycle)
- Admin operator account in the local database

## Getting Started

```bash
npm install
cp .env.example .env.local   # fill in values
npm run prisma:push
npm run setup:admin
npm run dev
```

Open http://localhost:3000/login to sign in with your operator credentials.

## Environment Variables

Create `.env.local` from `.env.example`:

```env
# --- PostgreSQL / Prisma ---
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hysteria2?schema=public

# --- Supabase (optional — for Realtime node updates on dashboard) ---
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# --- Hysteria 2 Traffic Stats API ---
HYSTERIA_TRAFFIC_API_BASE_URL=http://127.0.0.1:25000
HYSTERIA_TRAFFIC_API_SECRET=

# --- Hysteria egress (for agent outbound HTTP) ---
HYSTERIA_EGRESS_PROXY_URL=socks5://127.0.0.1:1080

# --- LLM provider (any OpenAI-compatible) ---
LLM_PROVIDER_BASE_URL=https://api.blackbox.ai/api/chat
LLM_PROVIDER_API_KEY=
LLM_MODEL=blackboxai/openai/gpt-4o
```

Initialize the PostgreSQL schema locally with:

```bash
npm run prisma:push
npm run prisma:generate
npm run setup:admin
```

`setup:admin` reads `ADMIN_USERNAME` and `ADMIN_PASSWORD` if provided; otherwise it creates an `admin` user with password `admin123`. It also seeds 3 demo nodes and 3 demo client users.

### Blackbox AI

The LLM layer is OpenAI-compatible, so [Blackbox AI](https://www.blackbox.ai) works out of the box. To use it:

```env
LLM_PROVIDER_BASE_URL=https://api.blackbox.ai/api/chat
LLM_PROVIDER_API_KEY=your-blackbox-api-key
LLM_MODEL=blackboxai/openai/gpt-4o
```

You can swap in OpenAI, Together, Groq, or any other OpenAI-compatible API by changing `LLM_PROVIDER_BASE_URL` and `LLM_MODEL`.

## Scripts

- `npm run dev` — development server (Turbopack)
- `npm run build` — production build
- `npm run start` — run production build
- `npm run lint` — ESLint
- `npm run prisma:generate` — generate Prisma Client
- `npm run prisma:migrate` — create and apply a development migration
- `npm run prisma:push` — sync the Prisma schema to PostgreSQL without a migration
- `npm run prisma:studio` — open Prisma Studio
- `npm run setup:admin` — seed the default admin operator

## Project Layout

```
app/
  (admin)/              — authenticated admin pages
    page.tsx            — dashboard (4-card layout, nodes health, activity feed)
    nodes/              — node inventory management
    configs/            — 3-panel client config generator
    ai/                 — Blackbox AI chat assistant
    agents/             — LLM agent task runner
  api/
    admin/              — admin CRUD + hysteria lifecycle
    hysteria/           — auth + traffic endpoints called by hysteria itself
    sub/hysteria2/      — public subscription endpoint (token-gated)
components/
  admin/                — dashboard, configs, nodes, ai, agents UIs
  ui/                   — shadcn-style primitives (Button, Card, Sonner)
lib/
  agents/               — LLM client, agent runner, tool registry
  auth/                 — admin session verification
  db/                   — Zod schemas + Prisma-backed CRUD
  supabase/             — Supabase client (Realtime only)
  hysteria/             — binary manager, config builder, client-config generator
  net/                  — proxy-aware undici dispatcher
```

## Architecture Notes

- **Database**: PostgreSQL via Prisma ORM. All data (operators, nodes, users, profiles, AI conversations, agent tasks, usage records) lives in PostgreSQL tables.
- **Realtime**: Supabase Realtime (optional) provides instant dashboard updates for node status via `postgres_changes` on the `nodes` table. Falls back to 5-second REST polling when Supabase env vars are not configured.
- **Auth**: Operator accounts in PostgreSQL, JWT tokens via `jose`, session cookies.
- All outbound HTTP from the panel (LLM API calls, web fetches from agents) is routed through the Hysteria 2 node's SOCKS5/HTTP port using `undici.ProxyAgent`.
- The panel acts as an HTTP Auth backend for Hysteria 2 (`/api/hysteria/auth`) — Hysteria calls it to validate client tokens against the panel's local user store.
- Subscription format is base64-encoded newline-separated `hysteria2://` URIs, compatible with standard clients.

## Supabase Realtime Setup (Optional)

If you want real-time node status updates on the dashboard (beyond the 5s polling fallback):

1. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`
2. Run the SQL in `prisma/supabase-realtime.sql` to enable Realtime + RLS on the `nodes` table

## Deployment

- Deploy to Vercel / Cloud Run / any Node 20 host.
- The panel does **not** manage a Hysteria 2 binary for production use. Run Hysteria 2 via systemd and point the panel at its Traffic Stats API (`HYSTERIA_TRAFFIC_API_BASE_URL`).

## License

See repository root.