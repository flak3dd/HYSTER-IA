# Environment Variables Audit Report

**Date:** 2026-05-08
**Scope:** Full codebase audit of process.env usage

## Summary


| Status                                             | Count |
| -------------------------------------------------- | ----- |
| ✅ Properly configured                              | 45    |
| ⚠️ Missing from schema                             | 15    |
| 🔧 Direct process.env usage (should use serverEnv) | 8     |
| ❌ Inconsistent naming                              | 1     |


---

## Missing from lib/env.ts Schema

These env vars are used in code but NOT validated in the schema:

### AI/Debug

- `AI_DEBUG_LOG_LEVEL` - lib/ai/debug-logger.ts:44
- `AI_DEBUG_CONSOLE` - lib/ai/debug-logger.ts:47

### Infrastructure

- `REDIS_URL` - lib/ai/startup.ts:29, lib/infrastructure/rate-limiter.ts:32

### Security/C2

- `KILL_SWITCH_CONFIRM_CODE` - lib/c2/kill-switch.ts:60
- `HYSTERIA_ADMIN_API_URL` - lib/c2/kill-switch.ts:191
- `CREDENTIAL_VAULT_KEY` - lib/post-exploitation/credential-vault.ts:16

### Deployment

- `DEPLOY_SSH_KEY` - lib/c2/kill-switch.ts:208, lib/implants/build-deploy.ts:256,313
- `DEPLOY_SSH_USER` - lib/c2/kill-switch.ts:209, lib/implants/build-deploy.ts:314
- `DEPLOY_REMOTE_DIR` - lib/implants/build-deploy.ts:315
- `IMPLANT_DEFAULT_PASSWORD` - lib/implants/build-deploy.ts:129

### Email

- `SMTP_HOST` - app/api/admin/mail/tunnel-script/route.ts:69
- `SMTP_PORT` - app/api/admin/mail/tunnel-script/route.ts:70
- `SMTP_SECURE` - app/api/admin/mail/tunnel-script/route.ts:71
- `SMTP_USER` - app/api/admin/mail/tunnel-script/route.ts:72
- `SMTP_PASS` - app/api/admin/mail/tunnel-script/route.ts:73
- `MYSMTP_API_KEY` - lib/mailer/mysmtp.ts:34
- `MYSMTP_API_URL` - lib/mailer/mysmtp.ts:35

### Threat Intel

- `ALIENVAULT_OTX_KEY` - lib/threatintel/alienvault.ts:101

### Logging

- `LOG_LEVEL` - lib/logger.ts:7

### Admin Setup

- `ADMIN_USERNAME` - scripts/setup-admin.js:21
- `ADMIN_PASSWORD` - scripts/setup-admin.js:22

---

## Inconsistent Naming Issues

### NEXT_PUBLIC_BASE_URL vs NEXT_PUBLIC_APP_URL

**Issue:** Some files use `NEXT_PUBLIC_BASE_URL`, others use `NEXT_PUBLIC_APP_URL`

**Locations using NEXT_PUBLIC_BASE_URL:**

- lib/grok/tool-executor.ts:1235 - `process.env.NEXT_PUBLIC_BASE_URL`
- lib/implants/build-deploy.ts:143 - `process.env.NEXT_PUBLIC_BASE_URL`

**Locations using NEXT_PUBLIC_APP_URL:**

- components/admin/infrastructure/overview.tsx
- components/admin/nodes/deploy-modal.tsx
- lib/ai/tools.ts
- lib/grok/tool-executor.ts:1371

**Recommendation:** Standardize on `NEXT_PUBLIC_APP_URL`

---

## Direct process.env Usage (Should Use serverEnv)

These files access `process.env` directly instead of using the `serverEnv()` helper:

1. **lib/ai/llm.ts:46** - `process.env.AI_DEBUG` (also uses serverEnv().AI_DEBUG)
2. **lib/auth/jwt.ts:6** - `process.env.JWT_SECRET`
3. **lib/auth/jwt.ts:10** - `process.env.JWT_REFRESH_SECRET`
4. **lib/grok/tool-executor.ts:1371** - `process.env.NEXT_PUBLIC_APP_URL`
5. **lib/grok/tool-executor.ts:1430-1445** - Various provider keys (has fallback logic)
6. **scripts/setup-admin.js:16,21,22** - Admin setup vars
7. **lib/db.ts:10,19,22** - NODE_ENV checks (acceptable)
8. **lib/logger.ts:3,7** - LOG_LEVEL, NODE_ENV

---

## Issues Found

### Critical

1. **JWT secrets have weak fallbacks** in lib/auth/jwt.ts
  ```typescript
   process.env.JWT_SECRET || 'your-secret-key-change-in-production'
  ```
   This is a security risk if env vars are not set.
2. **CREDENTIAL_VAULT_KEY has weak fallback**
  ```typescript
   process.env.CREDENTIAL_VAULT_KEY || 'default-change-me-in-production'
  ```
3. **NEXT_PUBLIC_APP_URL inconsistency** - Some components use window.location.origin as fallback which causes localhost issues

### Warnings

1. **lib/ai/debug-logger.ts** uses env vars not in schema
2. **Multiple SMTP configurations** (MYSMTP, SMTP_*, Resend) - potential confusion
3. **Test files** directly manipulate process.env (acceptable for tests)

---

## Recommendations

1. **Add all missing env vars to lib/env.ts schema**
2. **Standardize on NEXT_PUBLIC_APP_URL** and remove NEXT_PUBLIC_BASE_URL usage
3. **Remove weak fallbacks** for security-critical keys (JWT, credentials)
4. **Create strict validation** for production deployments
5. **Add env var documentation** to README

---

## Files Fixed ✅

### High Priority (Completed)

- ✅ lib/env.ts - Added all 15 missing env vars to schema
- ✅ lib/auth/jwt.ts - Now uses serverEnv() with strict validation (no weak fallbacks)
- ✅ lib/grok/tool-executor.ts - Fixed to use serverEnv() for panelUrl
- ✅ lib/implants/build-deploy.ts - Now uses serverEnv() for all env vars

### Non-Critical (Completed)

- ✅ lib/post-exploitation/credential-vault.ts - Now uses serverEnv()
- ✅ lib/c2/kill-switch.ts - Now uses serverEnv()
- ✅ lib/ai/debug-logger.ts - Now uses serverEnv()
- ✅ lib/ai/startup.ts - Now uses serverEnv()
- ✅ lib/infrastructure/rate-limiter.ts - Now uses serverEnv()
- ✅ lib/ai/llm.ts - Consistent AI_DEBUG usage (uses serverEnv only)

### Intentionally Left (Acceptable process.env usage)

- lib/logger.ts - Foundational module, uses process.env directly (acceptable pattern)
- lib/threatintel/alienvault.ts - Optional API key with fallback (acceptable pattern)
- lib/mailer/mysmtp.ts - Optional API key with fallback (acceptable pattern)
- app/api/admin/mail/tunnel-script/route.ts - Optional SMTP config (acceptable pattern)
- Test files - Direct process.env manipulation is standard practice

