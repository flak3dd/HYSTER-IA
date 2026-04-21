# Hysteria 2 Admin Panel

A Next.js-based administrative panel for managing [Hysteria 2](https://v2.hysteria.network/) proxy infrastructure. Provides real-time dashboards, multi-format client config generation, node inventory management, subscription endpoints, and optional LLM-assisted server config generation.

## Features

- **Dashboard** — real-time cards for total nodes, online nodes, active connections, bandwidth; nodes health table; activity feed. Uses Firestore `onSnapshot` for instant node status updates and polls the Hysteria Traffic Stats API for live client counts.
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
- **Firebase Auth** — admin gating via session cookie + `admin: true` custom claim.

## Requirements

- Node.js 20+
- Firebase project (Firestore + Authentication)
- A running Hysteria 2 server (the panel can optionally manage its process lifecycle)
- Admin user with `admin: true` custom claim

## Getting Started

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev
```

Open http://localhost:3000/login to sign in (after setting the admin custom claim on your Firebase user).

## Environment Variables

Create `.env.local` from `.env.example`:

```env
# --- Firebase (client) ---
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# --- Firebase (server / admin SDK) ---
FIREBASE_SERVICE_ACCOUNT_JSON=       # stringified JSON

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
  db/                   — Firestore schemas (Zod) + CRUD
  hysteria/             — binary manager, config builder, client-config generator
  net/                  — proxy-aware undici dispatcher
  firebase/             — admin + client SDK singletons
```

## Architecture Notes

- All outbound HTTP from the panel (LLM API calls, web fetches from agents) is routed through the Hysteria 2 node's SOCKS5/HTTP port using `undici.ProxyAgent`. Strategy lives at `lib/net/proxy.ts`.
- The panel acts as an HTTP Auth backend for Hysteria 2 (`/api/hysteria/auth`) — Hysteria calls it to validate client tokens against Firestore.
- Firestore `onSnapshot` on the `nodes` collection powers instant status change toasts and the "live" badge on the dashboard.
- Subscription format is base64-encoded newline-separated `hysteria2://` URIs, compatible with standard clients.

## Deployment

- Next.js + Firebase: deploy to Vercel / Cloud Run / any Node 20 host.
- The panel does **not** manage a Hysteria 2 binary for production use. Run Hysteria 2 via systemd and point the panel at its Traffic Stats API (`HYSTERIA_TRAFFIC_API_BASE_URL`).

## License

See repository root.
