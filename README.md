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
- **AI Config Assistant** — clean chat UI powered by OpenRouter (supports Anthropic Claude, OpenAI GPT, Google Gemini, and more). Generates Hysteria2 server configurations from natural-language prompts with preset suggestions. Preview-only — admin must review before applying.
- **AI Workflow Assistant** — advanced natural language workflow orchestration system with:
  - Session management with loading and resuming capabilities
  - 10 pre-built workflow templates for common operations
  - Step-by-step progress visualization with timeline tracking
  - Workflow export/import for sharing and backup
  - Analytics dashboard with usage metrics and insights
  - Function discovery UI for browsing backend capabilities
  - Workflow scheduling with cron expression support
- **ShadowGrok** — autonomous C2 operations powered by xAI Grok with:
  - 12 specialized C2 tools for implant management, task execution, and operations
  - Natural language operation planning and orchestration
  - Real-time tool execution with audit logging
  - Safety guardrails with approval workflows for high-risk operations
  - OPSEC risk assessment before sensitive actions
  - Multi-phase operation planning with automatic tool chaining
  - Danger Mode support for development/testing environments
- **OSINT Module** — comprehensive domain enumeration and intelligence gathering:
  - Certificate Transparency (crt.sh) subdomain discovery
  - Complete DNS enumeration (A, AAAA, MX, NS, TXT, CNAME, SOA)
  - Wildcard DNS detection
  - WHOIS lookup integration
  - DNS brute force capabilities
- **Threat Intelligence** — multi-source threat analysis and IOC correlation:
  - VirusTotal API v3 integration (IP, domain, URL, hash analysis)
  - Abuse.ch feeds (MalwareBazaar, URLhaus, ThreatFox)
  - AlienVault OTX pulse-based threat intelligence
  - Detection percentages and reputation scoring
- **Agents** — background LLM task runner that routes all outbound HTTP through the managed Hysteria2 node's SOCKS5/HTTP proxy.
- **Sonner toasts** — real-time notifications for server lifecycle, node status changes, client connect/disconnect, and task updates.
- **Operator auth** — admin gating via the app's Prisma-backed operator accounts and session cookies.
- **UI Optimization** — buttery smooth experience with:
  - Unified animation system with smooth transitions
  - Page transitions with fade effects
  - Component-level animations (AnimatedCard, AnimatedBadge, LoadingDots)
  - Micro-interactions for buttons, cards, and list items
  - Zustand unified state management
  - SSE real-time updates with auto-reconnect
  - Optimistic UI updates for instant feedback
  - Performance utilities (memoization, debouncing, throttling)
  - Request optimization with caching and deduplication
  - Virtual scrolling for large lists
  - Comprehensive skeleton screens
  - Error boundaries with reload functionality
  - Enhanced loading states (LoadingOverlay, InlineLoading, ButtonLoading)
  - Enhanced toast notifications (success, error, warning, info, loading)
  - Keyboard shortcuts system
  - Progressive image loading with fallback

## Requirements

- Node.js 20+
- PostgreSQL 14+
- A running Hysteria 2 server (the panel can optionally manage its process lifecycle)
- Admin operator account in the local database

## Getting Started

### Quick Start (5 minutes)

For the fastest way to get started, see [QUICKSTART.md](./QUICKSTART.md) or run the automated setup script:

**Linux/macOS:**
```bash
./scripts/setup.sh
```

**Windows:**
```batch
scripts\setup.bat
```

### Manual Install

```bash
npm install
cp .env.example .env.local   # fill in values
npm run prisma:push
npm run setup:admin
npm run dev
```

Open http://localhost:3000/login to sign in with your operator credentials.

### Documentation

- **[QUICKSTART.md](./QUICKSTART.md)** - Get started in 5 minutes
- **[INSTALL.md](./INSTALL.md)** - Comprehensive installation guide with Docker deployment, production setup, and troubleshooting

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

# --- LLM provider (OpenRouter recommended) ---
OPENROUTER_API_KEY=your-openrouter-api-key
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet

# Alternative: Direct OpenAI (fallback)
LLM_PROVIDER_BASE_URL=https://api.openai.com/v1
LLM_PROVIDER_API_KEY=
LLM_MODEL=gpt-4o

# --- OSINT & Threat Intelligence API Keys ---
REDIS_URL=redis://localhost:6379  # Optional: for rate limiting and caching
VIRUSTOTAL_API_KEY=               # Required: for VirusTotal threat intelligence
ALIENVAULT_OTX_KEY=               # Required: for AlienVault OTX threat intelligence
HUNTER_API_KEY=                   # Optional: for email harvesting (future feature)
SHODAN_API_KEY=                   # Optional: for network mapping (future feature)
CENSYS_API_ID=                    # Optional: for network mapping (future feature)
CENSYS_API_SECRET=                # Optional: for network mapping (future feature)

# --- ShadowGrok (xAI Grok) Configuration ---
SHADOWGROK_ENABLED=false          # Enable ShadowGrok autonomous C2 operations
XAI_API_KEY=                      # Required: xAI Grok API key for ShadowGrok
XAI_BASE_URL=https://api.x.ai/v1 # xAI Grok API endpoint
XAI_MODEL=grok-4.20-reasoning     # Model to use for ShadowGrok operations
SHADOWGROK_REQUIRE_APPROVAL=true  # Require approval for high-risk operations
SHADOWGROK_MAX_TOOL_ROUNDS=15     # Maximum tool execution rounds per operation
SHADOWGROK_RISK_THRESHOLD=70      # Risk score threshold for requiring approval

# --- Email Service Configuration ---
MAIL_FROM=noreply@example.com     # Default from address for emails
RESEND_API_KEY=                   # Resend API key (alternative email service)
MYSMTP_API_KEY=                   # my.smtp.com API key
MYSMTP_API_URL=https://my.smtp.com/api/v1  # my.smtp.com API endpoint
```

Initialize the PostgreSQL schema locally with:

```bash
npm run prisma:push
npm run prisma:generate
npm run setup:admin
```

`setup:admin` reads `ADMIN_USERNAME` and `ADMIN_PASSWORD` if provided; otherwise it creates an `admin` user with password `admin123`. It also seeds 3 demo nodes and 3 demo client users.

### AI Provider Configuration

The LLM layer uses OpenRouter by default, which provides access to multiple AI models through a single API:

**OpenRouter (Recommended):**
```env
OPENROUTER_API_KEY=your-openrouter-api-key
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
```

OpenRouter supports many models including:
- `anthropic/claude-3.5-sonnet` - Anthropic Claude 3.5 Sonnet
- `openai/gpt-4o` - OpenAI GPT-4o
- `google/gemini-pro-1.5` - Google Gemini Pro 1.5
- `meta-llama/llama-3.1-70b-instruct` - Meta Llama 3.1 70B
- And many more at [openrouter.ai/models](https://openrouter.ai/models)

**Alternative: Direct OpenAI:**
```env
LLM_PROVIDER_BASE_URL=https://api.openai.com/v1
LLM_PROVIDER_API_KEY=your-openai-api-key
LLM_MODEL=gpt-4o
```

**Alternative: Blackbox AI:**
```env
LLM_PROVIDER_BASE_URL=https://api.blackbox.ai/api/chat
LLM_PROVIDER_API_KEY=your-blackbox-api-key
LLM_MODEL=blackboxai/openai/gpt-4o
```

The system automatically prefers OpenRouter configuration if available, falling back to legacy LLM configuration if not.

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
    ai/                 — AI chat assistant (OpenRouter-powered)
    agents/             — LLM agent task runner
    workflow/           — AI Workflow Assistant with orchestration
    osint/              — OSINT domain enumeration and intelligence gathering
    threat/             — threat intelligence multi-source analysis
  api/
    admin/              — admin CRUD + hysteria lifecycle
    hysteria/           — auth + traffic endpoints called by hysteria itself
    sub/hysteria2/      — public subscription endpoint (token-gated)
    workflow/           — workflow session management, analytics, scheduling
    osint/              — OSINT API endpoints (domain enumeration)
    threatintel/        — threat intelligence API endpoints
components/
  admin/                — dashboard, configs, nodes, ai, agents, workflow, osint, threat UIs
  ui/                   — shadcn-style primitives (Button, Card, Sonner, Dialog)
lib/
  agents/               — LLM client, agent runner, tool registry
  auth/                 — admin session verification
  db/                   — Zod schemas + Prisma-backed CRUD
  supabase/             — Supabase client (Realtime only)
  hysteria/             — binary manager, config builder, client-config generator
  workflow/             — workflow engine, intent analyzer, function registry
  osint/                — domain enumeration, DNS queries, WHOIS lookups
  threatintel/          — VirusTotal, Abuse.ch, AlienVault OTX integrations
  infrastructure/       — rate limiting, caching, proxy agent, HTTP client
  net/                  — proxy-aware undici dispatcher
```

## Architecture Notes

- **Database**: PostgreSQL via Prisma ORM. All data (operators, nodes, users, profiles, AI conversations, agent tasks, usage records, workflow sessions, scheduled workflows, OSINT tasks) lives in PostgreSQL tables.
- **AI Integration**: OpenRouter-powered LLM integration supporting multiple AI models (Claude, GPT-4, Gemini, etc.) for AI chat, workflow orchestration, and autonomous operations.
- **Realtime**: Supabase Realtime (optional) provides instant dashboard updates for node status via `postgres_changes` on the `nodes` table. Falls back to 5-second REST polling when Supabase env vars are not configured.
- **Auth**: Operator accounts in PostgreSQL, JWT tokens via `jose`, session cookies.
- **Workflow System**: AI-powered orchestration engine with intent analysis, function registry, and response generation. Supports session persistence, template-based workflows, progress tracking, and scheduled execution.
- **OSINT Module**: Domain enumeration and intelligence gathering with certificate transparency integration, DNS enumeration, WHOIS lookups, and optional DNS brute force. Includes rate limiting, caching, and proxy routing for operational security.
- **Threat Intelligence**: Multi-source IOC analysis with VirusTotal, Abuse.ch feeds, and AlienVault OTX integration. Features detection percentages, reputation scoring, and comprehensive threat analysis.
- **Infrastructure**: Rate limiting with Redis/memory backend, in-memory caching with TTL, and Hysteria2 proxy routing for all external HTTP requests.
- All outbound HTTP from the panel (LLM API calls, web fetches from agents, OSINT/threat intel API calls) is routed through the Hysteria 2 node's SOCKS5/HTTP port using `undici.ProxyAgent`.
- The panel acts as an HTTP Auth backend for Hysteria 2 (`/api/hysteria/auth`) — Hysteria calls it to validate client tokens against the panel's local user store.
- Subscription format is base64-encoded newline-separated `hysteria2://` URIs, compatible with standard clients.

## ShadowGrok Autonomous C2 Operations

ShadowGrok is an autonomous C2 operations system powered by xAI's Grok API, enabling natural language control of complex red team operations.

### Capabilities

- **12 Specialized C2 Tools**: Implant generation, deployment, task execution, traffic analysis, and operations orchestration
- **Natural Language Operations**: Describe operations in plain language, ShadowGrok plans and executes them autonomously
- **Safety Guardrails**: Built-in approval workflows for high-risk operations, OPSEC risk assessment, and comprehensive audit logging
- **Real-time Execution**: Streaming tool execution with live progress updates and detailed logging

### Available Tools

- `generate_stealth_implant_config` - Generate stealthy implant configurations with anti-analysis features
- `compile_and_deploy_implant` - Compile and deploy implants to target nodes
- `send_c2_task_to_implant` - Execute commands on live implants (recon, exfiltration, persistence)
- `query_implant_status` - Query real-time implant status and health
- `trigger_kill_switch` - Execute kill switches with proper confirmation
- `analyze_traffic_and_suggest_evasion` - Analyze traffic patterns and recommend evasion techniques
- `orchestrate_full_operation` - Plan multi-phase operations with automatic tool chaining
- `run_panel_command` - Execute panel commands (with approval)
- `update_node_config` - Dynamically update Hysteria2 node configurations
- `query_hysteria_traffic_stats` - Fetch live traffic statistics
- `list_active_implants` - List and query active implants
- `assess_opsec_risk` - Assess operational security risk before actions

### Safety Features

- **Approval Workflows**: High-risk operations require explicit admin approval
- **OPSEC Assessment**: Automatic risk scoring before sensitive operations
- **Audit Logging**: Complete audit trail of all tool executions and approvals
- **Rate Limiting**: Configurable limits on tool execution rounds and concurrent operations
- **Timeout Protection**: Automatic timeout for long-running operations

### Configuration

Enable ShadowGrok by setting `SHADOWGROK_ENABLED=true` and providing your xAI API key:

```bash
SHADOWGROK_ENABLED=true
XAI_API_KEY=your-xai-api-key
XAI_MODEL=grok-4.20-reasoning
SHADOWGROK_REQUIRE_APPROVAL=true
```

### Usage Example

```
User: "Deploy a maximum stealth implant to Node-07 with Spotify traffic blending, run recon, then establish persistence and report back."

ShadowGrok autonomously:
1. Calls generate_stealth_implant_config with Windows, maximum stealth, Spotify profile
2. Calls compile_and_deploy_implant to build and deploy the implant
3. Calls send_c2_task_to_implant with recon tasks
4. Calls query_implant_status to verify deployment
5. Provides comprehensive operation report
```

### Security Considerations

- ShadowGrok is disabled by default. Enable only after reviewing safety configurations.
- All operations are logged to `shadowgrok_executions` and `shadowgrok_tool_calls` tables.
- High-risk tools (kill switches, panel commands) require approval even when auto-approve is enabled.
- Review the `shadowgrok_approvals` table regularly for pending approvals.
- Keep xAI API keys secure and rotate them regularly.

## Supabase Realtime Setup (Optional)

If you want real-time node status updates on the dashboard (beyond the 5s polling fallback):

1. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`
2. Run the SQL in `prisma/supabase-realtime.sql` to enable Realtime + RLS on the `nodes` table

## Deployment

- Deploy to Vercel / Cloud Run / any Node 20 host.
- The panel does **not** manage a Hysteria 2 binary for production use. Run Hysteria 2 via systemd and point the panel at its Traffic Stats API (`HYSTERIA_TRAFFIC_API_BASE_URL`).

## License

See repository root.