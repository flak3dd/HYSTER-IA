# Mailer Configuration Task
Current working directory: /Users/adminuser/vsc/blackboxai-hysteria2-sonner-1

## Task Overview
Configure the mailer tool (Go IMAP migrator) and app SMTP/IMAP features.

## Steps to Complete (Approved Plan Breakdown)

### 1. Setup Go Module & Dependencies [PENDING]
- Create `mailer/go.mod`
- Run `cd mailer && go mod tidy` (resolve imports: go-imap/v2, enmime, oauth2)
- Fix: Multiple main packages warning (rename mail-migrator-xoauth2-folders.go → migrator.go or ignore)

### 2. Configure Mailer Tool [PENDING]
- Edit `mailer/config.json`: Replace OAuth placeholders (awaiting user creds)
- Edit `mailer/client.yaml`: Hysteria2 proxy (awaiting server details)
- Test: `cd mailer && go run config.go`

### 3. App Integration [PENDING]
- Add `.env.local`: MAIL_ACCOUNTS_FILE=mailer/accounts.txt
- Implement missing `/api/admin/mail/*` routes if needed
- Test UI: `npm run dev` → /admin/mail

### 4. Verification [PENDING]
- Run Go migrator → check migrated_attachments/
- App mail tests pass

## Progress
- [x] Analyzed files & plan approved
- [ ] Steps 1-4 complete

*Next: User provides OAuth creds to proceed.*

