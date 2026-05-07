# HYSTER-IA — Step-by-Step Build & Deployment Guide

Complete end-to-end operational guide from fresh install to live C2 management.
Updated May 2026.

---

## Table of Contents

1. [Setup & Installation](#1-setup--installation)
2. [Hysteria 2 Node Creation](#2-hysteria-2-node-creation)
3. [Client Config Generation & Distribution](#3-client-config-generation--distribution)
4. [Implant / Beacon Building](#4-implant--beacon-building)
5. [Payload Deployment](#5-payload-deployment)
6. [Beacon Monitoring & C2 Operations](#6-beacon-monitoring--c2-operations)
7. [Post-Exploitation Framework](#7-post-exploitation-framework)
8. [AI Assistants](#8-ai-assistants)
9. [OSINT & Threat Intelligence](#9-osint--threat-intelligence)
10. [Infrastructure Monitoring & Maintenance](#10-infrastructure-monitoring--maintenance)
11. [Cleanup & OpSec](#11-cleanup--opsec)

---

## 1. Setup & Installation

### Prerequisites

- Node.js 20+
- PostgreSQL 14+ (15+ recommended)
- Git
- Optional: Docker, Redis, running Hysteria 2 server

### Automated Setup (Recommended)

```bash
git clone https://github.com/flak3dd/HYSTER-IA.git
cd HYSTER-IA
chmod +x scripts/setup.sh
./scripts/setup.sh
```

### Manual Setup

```bash
npm install
cp .env.example .env.local
# Edit .env.local with your credentials
npm run prisma:push
npm run prisma:generate
npm run setup:admin
npm run dev
```

Open http://localhost:3000/login and sign in with the admin credentials created during setup.

### Critical Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Session signing key |
| `XAI_API_KEY` | xAI Grok for ShadowGrok & AI assistants |
| `OPENROUTER_API_KEY` | Alternative LLM provider |
| `HYSTERIA_TRAFFIC_API_BASE_URL` | Live node stats (e.g., `http://127.0.0.1:25000`) |
| `HYSTERIA_TRAFFIC_API_SECRET` | Stats API authentication |
| `HYSTERIA_EGRESS_PROXY_URL` | SOCKS5/HTTP proxy for agent outbound traffic |
| `VIRUSTOTAL_API_KEY` | Threat intelligence feeds |
| `SHADOWGROK_ENABLED` | Enable autonomous C2 (`true` / `false`) |
| `SHADOWGROK_REQUIRE_APPROVAL` | Gate high-risk ops behind approval (`true`) |

---

## 2. Hysteria 2 Node Creation

Nodes are the backbone of the platform. Each node is a Hysteria 2 server instance that can serve as a proxy, C2 channel, or redirector.

### Access

Navigate to **Admin → Nodes** (`/admin/nodes`).

### Create a New Node

1. Click **+ Add Node** (top right).
2. Select a **Deployment Preset**:
   - **Basic TLS** — Standard TLS certificate, balanced performance
   - **Obfuscated** — Strong QUIC obfuscation + masquerading (recommended for C2)
   - **High-throughput** — BBR congestion control, high bandwidth limits
   - **Minimal** — Low-resource footprint for small VPS
3. Fill the form:
   - **Node Name** — e.g., `redirector-us-east-01`
   - **Server Address** — IP or domain
   - **Listen Port** — Default `443`
   - **Provider** — AWS, DigitalOcean, Hetzner, Vultr, Azure, etc.
   - **Tags** — e.g., `c2`, `redirector`, `high-speed`, `stealth`
   - **Authentication** — Password or TLS certificate
   - **Traffic Stats API** — Enable for real-time bandwidth / connection graphs
4. Click **Deploy / Save**.

### Traffic Stats API (Live Monitoring)

Enable real-time metrics by setting in `.env.local`:

```env
HYSTERIA_TRAFFIC_API_BASE_URL=http://your-hysteria-server:25000
HYSTERIA_TRAFFIC_API_SECRET=your-secret-key
```

This enables:
- Real-time bandwidth graphs (upload / download)
- Active connection counts
- Health status indicators (green / yellow / red)

### Node Management Actions

From the nodes table or detail modal:
- **Edit** — Update configuration
- **Rotate Auth** — Regenerate password or certificate
- **Restart** — If process lifecycle management is enabled
- **Delete** — Remove node from inventory
- **Generate Configs** — Produce client configs for this node

---

## 3. Client Config Generation & Distribution

### Generate Client Configs

1. Select one or more nodes (checkboxes in the table).
2. Click **Generate Configs**.
3. Choose output format:
   - **Official Hysteria 2 YAML** — Native client
   - **hysteria2:// URI** — Quick-import into v2rayN / Nekoray
   - **Clash Meta YAML** — Full proxy groups and rules
   - **sing-box JSON** — Outbounds with selector
4. Copy or download the config bundle.

### Subscription Endpoint

Distribute configs via the public token-authenticated endpoint:

```
https://your-panel-domain/api/sub/hysteria2?token=YOUR_USER_TOKEN&tags=high-speed&format=clash
```

Supported formats: `yaml`, `clash`, `singbox`, `base64`.

---

## 4. Implant / Beacon Building

Navigate to **Admin → Implants** (`/admin/implants`) or **Admin → Beacons** (`/admin/beacons`).

### Build a New Beacon

1. Click **Build New**.
2. Configure:
   - **Target OS** — Windows, Linux, macOS
   - **Architecture** — x64, x86, ARM64
   - **C2 Node** — Select the Hysteria 2 node for callback
   - **Jitter** — Random callback interval (e.g., 30–120 minutes)
   - **Persistence** — Scheduled task, registry run key, systemd service, etc.
   - **Packing** — UPX compression level (1–9), custom packer, or none
   - **Evasion** — String obfuscation, sandbox detection, AMSI bypass (Windows)
3. Click **Build**.
4. Download the binary or generate a **hosted payload link**.

### AI Prompt (Config Assistant)

```
Build a stealth Windows beacon with 45-90 min jitter, UPX level 7,
scheduled task persistence, and strong OPSEC for evasion.
```

---

## 5. Payload Deployment

### Delivery Methods

- **Phishing Campaign** — Via Mail module (`/admin/mail`)
  - Upload email list (CSV)
  - Select beacon payload as attachment or hosted link
  - Configure sender spoofing, rate limiting, proxy routing
- **Manual Delivery** — Direct file transfer, USB, etc.
- **Redirector Chain** — Stage through an obfuscated redirector node

### Track Execution

The platform automatically registers a beacon when the implant successfully checks in.

---

## 6. Beacon Monitoring & C2 Operations

### Dashboard

Navigate to **Admin → Beacons** (`/admin/beacons`).

- **Summary Cards** — Total beacons, online, last check-in, active tasks
- **Beacon Table** — Hostname, username, OS, IP, status, last seen
- **Filters** — By OS, status (online / offline / stale), tags

### Beacon Detail Modal

Click any beacon row to open:
- **Host Info** — System details, user context, network adapters
- **Screenshot** — Live desktop capture
- **Quick Actions**:
  - Shell command execution
  - File upload / download
  - Screenshot
  - Kill beacon
- **Task Queue** — Pending and completed tasks
- **Timeline** — Activity history

### Real-Time Updates

Beacons dashboard auto-refreshes via SSE (Server-Sent Events) for live status changes.

---

## 7. Post-Exploitation Framework

Once a beacon is active, use the full post-exploitation toolkit.

### Phase 0 — Triage

1. **Screenshot** — Visual confirmation of access
2. **Quick Recon** — System info, running processes, network connections
3. **OPSEC Score** — Assess operational safety before aggressive actions

### Credential Harvesting

- LSASS memory dump
- Browser credential extraction
- DPAPI decryption
- Credential vault storage

### Privilege Escalation

- Token impersonation
- UAC bypass techniques
- Kernel exploit assessment

### Persistence

- Registry run keys
- Scheduled tasks
- WMI event subscriptions
- Service installation
- DLL hijacking

### Active Directory Reconnaissance

- BloodHound data collection and import
- Pathfinder attack-path analysis
- User / group enumeration
- Trust mapping

### Lateral Movement

- SMB remote execution
- WinRM remote management
- WMI command execution
- DCOM lateral movement
- Pass-the-Hash authentication
- Kerberoasting
- AS-REP roasting

### Data Exfiltration

- File collection and compression
- Secure tunnel via Hysteria 2 node
- Bandwidth-throttled transfer

### AI-Assisted Post-Exploitation

Use **ShadowGrok** for autonomous orchestration:

```
Beacon {{BeaconID}} is active. Execute full OPSEC-aware
post-exploitation workflow: triage → credentials →
escalation → persistence → AD recon → lateral movement.
```

ShadowGrok will:
1. Assess OPSEC score
2. Execute each phase with approval gates (if enabled)
3. Log all actions to the audit trail
4. Report findings per phase

---

## 8. AI Assistants

The platform includes three AI assistants for different operational roles. All assistants support multi-turn conversations with tool calling and structured telemetry.

### AI Assistant (`/admin/ai`)

Multi-tool AI assistant for infrastructure management with 25+ specialized tools.

**Key Capabilities:**

| Tool | Purpose |
|------|---------|
| `generate_config` | Generate Hysteria2 configs and optionally apply to nodes via SSH |
| `apply_node_config` | Push existing config profile to remote node via SSH |
| `list_nodes` / `update_node` / `create_node` / `delete_node` | Node inventory management |
| `list_profiles` | List available config profiles |
| `deploy_node` | Deploy new VPS with Hysteria2 (Azure, AWS, Hetzner, etc.) |
| `analyze_traffic` | Traffic stats and anomaly detection |
| `troubleshoot` | Run diagnostic checks |
| `security_analysis` | Security posture assessment |
| `performance_optimization` | Performance bottleneck analysis |
| `incident_response` | Automated incident handling |

**Complete Azure Deployment Workflow**

Full end-to-end: deploy to Azure, generate config, and apply:

**Step 1 — Deploy Azure Node (MUST specify resourceGroup):**
```
deploy_node with provider="azure", resourceGroup="hysteria-rg-eastus",
region="eastus", name="hysteria-east-01"
```

**Step 2 — Check Deployment Status:**
```
get_deployment_status for the deployment ID from step 1
```

**Step 3 — Generate and Apply Config:**
```
Generate a stealth Hysteria 2 config with port 443 and masquerade,
then apply it to the newly deployed Azure node using SSH.
```

**CRITICAL:** Azure deployments REQUIRE the `resourceGroup` parameter. The service principal cannot list resource groups, so auto-discovery fails. Always provide an existing resource group name.

**Method 1: Generate and Apply Config in One Step (Recommended)**

Use `generate_config` with `applyToNodes` to generate AND push the config in a single operation:

```
Generate a high-performance Hysteria 2 config with salamander obfuscation
and apply it to nodes node-1, node-2, node-3 using SSH key.
```

**Required for Method 1:**
- `applyToNodes`: Array of node IDs to apply config to
- `sshPrivateKey`: SSH private key (PEM format) for node access
- `restartService`: true (default) — restarts hysteria-server after applying

**Method 2: Apply Existing Config Profile to Nodes**

Use `apply_node_config` when you have a saved profile and want to push it to existing nodes:

```
Apply the "production-obfuscated" profile to all nodes in the "au-east" region.
```

**Required for Method 2:**
- `nodeId`: Target node ID
- `profileId`: Config profile ID to apply
- `sshPrivateKey`: SSH private key for node access
- `restartService`: true (default) — restarts service after applying

**Deploy Node to Azure (REQUIRES resourceGroup):**

```
Deploy a new Hysteria2 node to Azure eastus with resourceGroup="hysteria-rg-eastus",
name="hysteria-node-east-01", and obfuscated config.
```

**Azure Deployment — CRITICAL:**
- `provider`: Must be `"azure"`
- `resourceGroup`: **REQUIRED** — The service principal cannot auto-discover resource groups. You MUST explicitly provide one.
- `region`: `eastus`, `westeurope`, or `australiaeast` (must match resource group location)
- `name`: Descriptive node name
- `size`: `Standard_B1s` (default) or specify larger

**Pre-created Resource Groups:**
- `hysteria-rg-eastus` (region: eastus)
- `hysteria-rg-westeurope` (region: westeurope)
- `hysteria-rg-australiaeast` (region: australiaeast)

**Example deployment command:**
```
deploy_node with provider="azure", resourceGroup="hysteria-rg-eastus",
region="eastus", name="hysteria-east-01", tags=["c2", "azure", "eastus"]
```

**Node Management:**

```
List all nodes with status "stopped" and set them to "running" with the
"standard-tls" profile applied.
```

**Response includes:**
- Generated config YAML (preview)
- Step-by-step execution status for each node
- SSH connection results
- Service restart confirmation
- Database update status

### AI Workflow Assistant (`/admin/workflow`)

Orchestrates multi-step operational workflows with natural language.

**Example prompts:**

```
Create a daily maintenance workflow: check all nodes,
rotate keys on unhealthy ones, and generate a health report.
```

```
Plan a full domain compromise starting from the current
beacon with minimal noise and high OPSEC.
```

Features:
- Session save / resume
- 10 pre-built templates
- Step-by-step progress timeline
- Cron scheduling support
- Workflow export / import
- Tool execution with progress events

### ShadowGrok (`/admin/ai` — ShadowGrok tab)

Autonomous C2 operations powered by xAI Grok.

**Capabilities:**
- 12 specialized C2 tools (beacon management, tasking, ops)
- Natural language operation planning
- Multi-phase operation chaining
- OPSEC risk assessment before sensitive actions
- Approval workflows for high-risk operations
- Real-time audit logging

**Enable in `.env.local`:**

```env
SHADOWGROK_ENABLED=true
XAI_API_KEY=your-xai-key
SHADOWGROK_REQUIRE_APPROVAL=true
SHADOWGROK_RISK_THRESHOLD=70
```

### AI Assistant Robustness Features

The AI Assistant has been hardened for production use:

- **Idempotency**: Same request with same `clientMessageId` returns cached result
- **Request Timeouts**: 120-second default timeout with abort signal propagation
- **Max Tool Rounds**: 15-round limit with graceful termination message
- **Conversation Ownership**: Strict authorization checks per conversation
- **Structured Telemetry**: Request ID, duration, providers, models, outcome logged
- **Deterministic Send Flow**: Client message ID-based message tracking
- **In-Flight UI Protection**: All prompt surfaces disabled during active requests
- **Session Recovery**: Active conversation restored from sessionStorage on reload

**Environment Variables:**

```env
XAI_API_KEY=your-xai-key          # Primary LLM (xAI Grok)
OPENROUTER_API_KEY=optional       # Fallback provider
AZURE_OPENAI_ENDPOINT=optional    # Azure OpenAI fallback
LOG_LEVEL=info                    # AI telemetry logging
```

---

## 9. OSINT & Threat Intelligence

### OSINT Module (`/admin/osint`)

Pre-engagement domain and infrastructure reconnaissance:
- **Certificate Transparency (crt.sh)** — Subdomain discovery
- **DNS Enumeration** — A, AAAA, MX, NS, TXT, CNAME, SOA records
- **Wildcard Detection** — Identify wildcard DNS setups
- **WHOIS Lookup** — Registration details
- **DNS Brute Force** — Dictionary-based subdomain enumeration

### Threat Intelligence (`/admin/threat`)

Multi-source threat analysis:
- **VirusTotal API v3** — IP, domain, URL, file hash reputation
- **Abuse.ch Feeds** — MalwareBazaar, URLhaus, ThreatFox
- **AlienVault OTX** — Pulse-based IOC correlation
- **IOC Database** — Store and query indicators of compromise

---

## 10. Infrastructure Monitoring & Maintenance

### Dashboard (`/admin`)

Real-time operational overview:
- Node health (online / offline / stale)
- Bandwidth usage (per node and aggregate)
- Active beacon count and status
- Recent activity feed
- Audit log summary

### Analytics (`/admin/analytics`)

Historical metrics:
- Node uptime trends
- Bandwidth consumption over time
- Beacon check-in patterns
- Campaign performance (if mail module used)
- Tool usage statistics

### Infrastructure Page (`/admin/infrastructure`)

- **Traffic Analysis** — Deep packet inspection summaries
- **Health Checks** — ICMP, TCP, HTTP endpoint monitoring
- **Resource Usage** — CPU, memory, disk per node

### Maintenance Best Practices

1. **Rotate credentials** monthly (node auth, API keys)
2. **Monitor bandwidth** to avoid provider abuse flags
3. **Review audit logs** after every operation
4. **Check OPSEC scores** before high-risk actions
5. **Update implants** when new evasion techniques are added

---

## 11. Cleanup & OpSec

### Operation Cleanup Workflow

1. **Remove persistence** from all beacons
2. **Export collected data** (credentials, files, BloodHound graphs)
3. **Clear logs** on compromised hosts
4. **Self-destruct non-critical beacons**
5. **Delete campaign artifacts** (emails, payloads, configs)
6. **Rotate node authentication**
7. **Archive operation record** for reporting

### AI Cleanup Prompt

```
Execute full operation cleanup: remove all persistence,
clear logs, export data, rotate node credentials, and
safely retire beacons {{BeaconID1}}, {{BeaconID2}}.
```

---

## Quick Reference: Page Routes

| Feature | Route |
|---------|-------|
| Dashboard | `/admin` |
| Nodes | `/admin/nodes` |
| Beacons | `/admin/beacons` |
| Implants | `/admin/implants` |
| AI Assistants | `/admin/ai` |
| Workflow | `/admin/workflow` |
| OSINT | `/admin/osint` |
| Threat Intel | `/admin/threat` |
| Mail / Campaigns | `/admin/mail` |
| Infrastructure | `/admin/infrastructure` |
| Analytics | `/admin/analytics` |
| Settings | `/admin/settings` |

---

*End of guide. For troubleshooting, see `INSTALL.md` and `QUICKSTART.md`.*
