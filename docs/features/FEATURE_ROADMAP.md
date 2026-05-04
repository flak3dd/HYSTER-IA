# D-Panel Ops - Feature Implementation Roadmap

## Current Status Summary

| Phase | Feature | Status | Backend | Frontend |
|-------|---------|--------|---------|----------|
| **Infrastructure** | Nodes/VPS | ✅ **Complete** | Full CRUD API + Deployment | Interactive UI |
| **Infrastructure** | Protocols/Transport | ✅ **Complete** | Hysteria2 Config API | Config editor |
| **Infrastructure** | Client Configs | 🟡 **Partial** | Schema ready | Scaffold UI |
| **Weaponize** | Profiles | ✅ **Complete** | Full CRUD + Apply to nodes | Interactive UI |
| **Deliver** | Mail Ops | ✅ **Complete** | SMTP/IMAP/POP3 | Interactive UI |
| **Deliver** | Agents | ✅ **Complete** | LLM tasks + DB | Interactive UI |
| **Operate** | AI Assistant | ✅ **Complete** | Chat + Conversations | Interactive UI |
| **Recon** | OSINT | ✅ **Complete** | Full API integration | Interactive UI |
| **Recon** | Network Mapping | 🔴 **Scaffold** | None | Static mock data |
| **Recon** | Threat Intel | ✅ **Complete** | Multi-source API integration | Interactive UI |
| **Weaponize** | Payloads | 🔴 **Scaffold** | None | Static mock data |
| **Weaponize** | LotL Arsenal | 🔴 **Scaffold** | None | Static mock data |
| **Operate** | Team Coordination | 🔴 **Scaffold** | None | Static mock data |
| **Operate** | Anti-Forensics | 🔴 **Scaffold** | None | Static mock data |
| **Report** | Analytics | 🔴 **Scaffold** | None | Static mock data |
| **Report** | Reports | 🔴 **Scaffold** | None | Static mock data |

---

## Phase 1: Core Infrastructure Hardening (Week 1)

### 1.1 Traffic Stats API Integration
**Priority: High | Effort: Medium**

Current dashboard polls `/api/admin/overview` but traffic stats integration needs completion.

- [ ] Implement traffic stats collector service
- [ ] Connect to Hysteria2 traffic API (`:25000`)
- [ ] Real-time bandwidth charts in dashboard
- [ ] Per-user traffic breakdown

**Files to modify:**
- `lib/infrastructure/traffic-stats.ts` (new)
- `app/api/admin/overview/route.ts`
- `components/admin/dashboard/overview.tsx`

### 1.2 Config Audit Strength Testing
**Priority: Medium | Effort: Low**

The Config Audit page exists but needs actual audit logic.

- [ ] Implement password strength checker
- [ ] TLS configuration validator
- [ ] Obfuscation effectiveness scoring
- [ ] Security best practices checklist

**Files to modify:**
- `lib/config/audit.ts` (new)
- `app/admin/config-audit/page.tsx`
- `app/api/admin/config/audit/route.ts` (new)

---

## Phase 2: Reconnaissance Suite (Week 2-3) ✅ **COMPLETED**

### 2.1 OSINT Integration
**Priority: High | Effort: High | Status: ✅ Complete**

Transform static scaffold into functional intelligence gathering.

#### Domain Enumeration ✅ **Complete**
- [x] Subdomain discovery (crt.sh, certificate transparency)
- [x] DNS enumeration with wildcard detection
- [x] WHOIS lookup integration
- [x] DNS brute force (optional)
- [x] Comprehensive enumeration API

#### Social Media Analysis
- [ ] Twitter/X API integration
- [ ] LinkedIn profile discovery
- [ ] Social graph visualization

#### Email Harvesting
- [ ] Hunter.io / Apollo.io API integration
- [ ] Pattern-based guessing (firstname.lastname@domain.com)
- [ ] Email validation service

#### Dark Web Monitoring
- [ ] Tor proxy integration for .onion sites
- [ ] Pastebin monitoring API
- [ ] Breach database alerts (HaveIBeenPwned)

**New files:**
- `lib/osint/domain-enum.ts`
- `lib/osint/social-media.ts`
- `lib/osint/email-harvest.ts`
- `lib/osint/darkweb-monitor.ts`
- `app/api/admin/osint/[module]/route.ts`
- `components/admin/osint/osint-dashboard.tsx`

### 2.2 Network Mapping
**Priority: Medium | Effort: High**

Passive and active network reconnaissance.

- [ ] Shodan API integration
- [ ] Censys API integration
- [ ] Masscan wrapper for authorized scanning
- [ ] Service banner grabbing
- [ ] Network topology visualization

**New files:**
- `lib/recon/shodan.ts`
- `lib/recon/censys.ts`
- `lib/recon/masscan-wrapper.ts`
- `components/admin/network/network-map.tsx`

### 2.3 Threat Intelligence ✅ **Complete**
**Priority: Medium | Effort: Medium | Status: ✅ Complete**

IOC feed aggregation and correlation.

- [x] MISP integration (deferred - P2)
- [x] AlienVault OTX API
- [x] Abuse.ch feeds (MalwareBazaar, URLhaus, ThreatFox)
- [x] VirusTotal API v3
- [x] Custom IOC matching engine

**New files:**
- `lib/threatintel/misp.ts` (deferred)
- `lib/threatintel/alienvault.ts` ✅
- `lib/threatintel/abusech.ts` ✅
- `lib/threatintel/virustotal.ts` ✅

**Note**: Phase 2 core features (Domain Enumeration and Threat Intelligence) were completed in April 2026. See `PHASE2_IMPLEMENTATION_SUMMARY.md` for detailed implementation information. Social Media Analysis and Dark Web Monitoring were intentionally deferred due to complexity and risk considerations.

---

## Phase 3: Weaponization Arsenal (Week 3-4)

### 3.1 Dynamic Payload Generation
**Priority: High | Effort: High**

Real payload generation vs current mock templates.

#### Supported Formats
- [ ] Windows EXE (Go/C++ with Hysteria2 client)
- [ ] Linux ELF (static binary)
- [ ] macOS Universal Binary
- [ ] PowerShell script (obfuscated)
- [ ] Python payload (cross-platform)

#### Features
- [ ] Config embedding (YAML/JSON inside binary)
- [ ] Obfuscation options
- [ ] Code signing integration
- [ ] Build pipeline with Docker

**New files:**
- `lib/payloads/generator.ts`
- `lib/payloads/builders/windows.ts`
- `lib/payloads/builders/linux.ts`
- `lib/payloads/builders/macos.ts`
- `lib/payloads/builders/powershell.ts`
- `lib/payloads/builders/python.ts`
- `app/api/admin/payloads/build/route.ts`
- `components/admin/payloads/payload-builder.tsx`

### 3.2 Living-off-the-Land (LotL) Arsenal
**Priority: Medium | Effort: Medium**

Command generation and execution tracking.

- [ ] PowerShell command library (encoded, bypass execution policy)
- [ ] WMIC system info extraction
- [ ] Certutil download/encode operations
- [ ] Bitsadmin file transfer
- [ ] Schtasks persistence
- [ ] LOLBAS project integration

**New files:**
- `lib/lotl/commands.ts`
- `lib/lotl/techniques.ts`
- `components/admin/lotl/technique-browser.tsx`

---

## Phase 4: Delivery & Operations (Week 4-5)

### 4.1 Mail Operations Enhancement
**Priority: Medium | Effort: Medium**

Extend current mail test functionality.

- [ ] Email template editor with HTML preview
- [ ] Attachment handling
- [ ] Tracking pixel injection
- [ ] Link click tracking
- [ ] Bounce handling
- [ ] Rate limiting and queue management

**Files to modify:**
- `components/admin/mail/mail-test-view.tsx`
- `lib/mailer/templates.ts` (new)
- `lib/mailer/tracking.ts` (new)

### 4.2 Team Coordination
**Priority: Low | Effort: High**

Multi-operator campaign management.

- [ ] Campaign creation and assignment
- [ ] Role-based access (Lead, Operator, Observer)
- [ ] Task assignment and tracking
- [ ] Shared note-taking
- [ ] Real-time chat/updates
- [ ] Operation timeline

**New files:**
- `lib/campaigns/campaign.ts`
- `lib/campaigns/assignments.ts`
- `app/api/admin/campaigns/route.ts`
- `components/admin/coordination/campaign-dashboard.tsx`

### 4.3 Anti-Forensics Toolkit
**Priority: Low | Effort: Medium**

Evidence control modules.

- [ ] Log wiping (Windows Event Log, Syslog)
- [ ] Secure file deletion (DoD 5220.22-M, Gutmann)
- [ ] Timestamp manipulation (MAC times)
- [ ] Memory artifact cleanup
- [ ] Registry cleaning

**New files:**
- `lib/forensics/log-wipe.ts`
- `lib/forensics/file-shred.ts`
- `lib/forensics/timestamp.ts`
- `lib/forensics/memory-wipe.ts`
- `lib/forensics/registry-clean.ts`

---

## Phase 5: Reporting & Analytics (Week 5-6)

### 5.1 Behavioral Analytics
**Priority: Medium | Effort: High**

Replace mock analytics with real data processing.

- [ ] User behavior baselining
- [ ] Network traffic anomaly detection
- [ ] Endpoint activity monitoring
- [ ] MITRE ATT&CK technique mapping
- [ ] Alert correlation engine

**New files:**
- `lib/analytics/behavioral.ts`
- `lib/analytics/anomaly-detection.ts`
- `lib/analytics/mitre-mapping.ts`
- `components/admin/analytics/analytics-dashboard.tsx`

### 5.2 Automated Reporting
**Priority: Medium | Effort: Medium**

Client deliverable generation.

- [ ] Executive Summary (PDF)
- [ ] Technical Findings (DOCX)
- [ ] Vulnerability Assessment (XLSX)
- [ ] Compliance Report (PDF/JSON)
- [ ] Timeline Analysis (visual timeline)
- [ ] Custom report templates

**New files:**
- `lib/reports/generator.ts`
- `lib/reports/templates/executive.ts`
- `lib/reports/templates/technical.ts`
- `app/api/admin/reports/generate/route.ts`

---

## Phase 6: Advanced Features (Week 7+)

### 6.1 IMAP XOAUTH2 Migration
**Priority: Low | Effort: Medium**

Gmail/Outlook account migration via OAuth.

- [ ] OAuth2 flow for Gmail
- [ ] OAuth2 flow for Outlook
- [ ] Email import with metadata preservation
- [ ] Folder structure replication

**New files:**
- `lib/mail-migration/oauth.ts`
- `lib/mail-migration/importer.ts`
- `app/admin/mail/migrator/page.tsx` (existing but empty)

### 6.2 Implant/Agent Management
**Priority: High | Effort: Very High**

Currently in `implant/` directory - needs full implementation.

- [ ] Implant beacon protocol
- [ ] Command & control channel
- [ ] Task queue management
- [ ] File exfiltration
- [ ] Screenshot/keylog capture
- [ ] Credential harvesting

**Existing files to extend:**
- `implant/` (investigate current state)

### 6.3 Multi-Protocol Transport
**Priority: Medium | Effort: High**

Currently only Hysteria2 - add alternatives.

- [ ] Shadowsocks protocol support
- [ ] VMess/V2Ray integration
- [ ] Trojan (HTTPS camouflage)
- [ ] Protocol fallback chains

**New files:**
- `lib/transport/shadowsocks.ts`
- `lib/transport/vmess.ts`
- `lib/transport/trojan.ts`

---

## Technical Debt & Infrastructure

### Database Schema Updates Required

```sql
-- OSINT modules
CREATE TABLE osint_tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- domain, email, social, darkweb
  target TEXT NOT NULL,
  status TEXT NOT NULL,
  results JSONB,
  created_at TIMESTAMP,
  completed_at TIMESTAMP
);

-- Campaign management
CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  lead_operator_id TEXT,
  created_at TIMESTAMP
);

-- Payload builds
CREATE TABLE payload_builds (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  config JSONB NOT NULL,
  download_url TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMP
);
```

### Environment Variables to Add

```bash
# OSINT APIs
HUNTER_API_KEY=
SHODAN_API_KEY=
CENSYS_API_ID=
CENSYS_API_SECRET=
VIRUSTOTAL_API_KEY=
MISP_URL=
MISP_API_KEY=

# Payload signing
CODE_SIGN_CERT_PATH=
CODE_SIGN_KEY_PATH=

# Threat intel
ALIENVAULT_OTX_KEY=
```

---

## Implementation Priority Matrix

| Feature | User Value | Complexity | Risk | Priority |
|---------|------------|------------|------|----------|
| OSINT Integration | High | High | Low | **P0** |
| Payload Generation | High | High | Medium | **P0** |
| Traffic Stats API | High | Medium | Low | **P1** |
| Threat Intel Feeds | Medium | Medium | Low | **P1** |
| Network Mapping | Medium | High | Low | **P2** |
| Team Coordination | Medium | High | Medium | **P2** |
| Automated Reporting | Medium | Medium | Low | **P2** |
| Analytics Engine | Medium | High | Medium | **P3** |
| Anti-Forensics | Low | Medium | Medium | **P3** |
| LotL Arsenal | Low | Low | Low | **P3** |
| IMAP Migration | Low | Medium | Low | **P4** |
| Multi-Protocol | Medium | High | High | **P4** |

---

## Success Metrics

- **P0 Features**: 100% functional with real API integrations
- **P1 Features**: Core functionality working, may have limited API integrations
- **P2 Features**: Basic CRUD + at least one external integration
- **P3 Features**: Static → Interactive UI, mock → real data
- **Test Coverage**: 70%+ for all new modules
- **Documentation**: API docs + user guide for each feature

---

## Notes

- All new features must use existing auth middleware (`verifyAdmin`)
- Database changes require Prisma migrations
- External API calls should be rate-limited and cached
- Consider webhook support for long-running OSINT tasks
- Keep agent/implant code isolated for security review
