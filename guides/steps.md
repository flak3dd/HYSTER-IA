HYSTER-IA Complete Detailed Instruction Guide
(Full End-to-End Usage – Updated May 2026)
This guide follows the logical workflow from fresh install to full operation.
1. Setup & Installation
Prerequisites

Node.js 20+
PostgreSQL 14+ (15+ recommended)
Git
Optional: Docker, Redis, Hysteria 2 server

Step-by-Step

Clone the repositoryBashgit clone https://github.com/flak3dd/HYSTER-IA.git
cd HYSTER-IA
Run automated setup (recommended)Bashchmod +x scripts/setup.sh
./scripts/setup.sh
Manual setupBashnpm install
cp .env.example .env.local
Configure .env.local (critical variables)
DATABASE_URL
OPENROUTER_API_KEY (recommended)
XAI_API_KEY (for ShadowGrok)
HYSTERIA_EGRESS_PROXY_URL
VIRUSTOTAL_API_KEY, ALIENVAULT_OTX_KEY
SHADOWGROK_ENABLED=true and SHADOWGROK_REQUIRE_APPROVAL=true

Initialize databaseBashnpm run prisma:push
npm run prisma:generate
npm run setup:admin
Start the applicationBashnpm run devOpen → http://localhost:3000/login

Default Login: admin / admin123 → Change password immediately in Settings.

2. Hysteria 2 Node Management
(See the previous detailed guide I provided — it is already comprehensive.)

3. Prepare Email List

Navigate to Admin → Mail → Email Lists.
Click Upload CSV or manually add emails.
Recommended CSV columns: email,first_name,job_title,department,company.
Click Enrich with Hunter.io (if HUNTER_API_KEY is set).
Use filters/tags (e.g., “IT Staff”, “Finance”, “High Value”).
Save the list.

AI Prompt (Workflow Assistant):
textAnalyze the uploaded email list and suggest segmentation for phishing campaigns (IT, Finance, Executives).

4. Create Phishing Campaign

Go to Mail → Campaigns → New Campaign.
Select email list.
Choose or generate templates using AI.
Configure:
Sender (spoofing / custom SMTP)
Rate limiting (30–100 emails/hour)
Proxy routing (Hysteria 2)
Tracking (opens, clicks, downloads)

Launch campaign.

Recommended AI Prompts:
textGenerate 4 high-deliverability phishing templates for {{Industry}} company targeting IT staff with beacon delivery.
textCreate a complete campaign using the uploaded list with IT Helpdesk theme and low spam score.
Monitor real-time stats in the campaign dashboard. Successful executions auto-register beacons.

5. Build Beacon / Implant

Navigate to Beacons → Build New.
Configure:
Target OS (Windows, Linux, macOS)
Packing (UPX + Custom, compression level 1–9)
Jitter (e.g., 30–120 minutes)
Persistence method
C2 Node (Hysteria 2)

Click Build.
Download binary or generate hosted payload link.

AI Prompt:
textBuild a stealth Windows beacon with 45-90 min jitter, UPX level 7, scheduled task persistence, and strong OPSEC.

6. Deploy & Get Beacon Active

Deliver payload via phishing campaign or manual method.
Victim executes the file.
Beacon checks in → appears in Beacons dashboard as Online.
Open beacon detail modal for host info, screenshot, and quick actions.


7. Post-Exploitation (After Beacon Active)
Phase 0 – Triage

Take screenshot
Run Quick Recon
Check OPSEC Score

Full Checklist:

Credential Harvesting (LSASS, browser, DPAPI)
Privilege Escalation
Install Persistence
AD Recon + BloodHound import
Pathfinder analysis
Lateral Movement (SMB, WinRM, WMI, etc.)
Data Collection & Exfil
Cleanup

Powerful ShadowGrok Prompt:
textBeacon {{BeaconID}} is active. Execute full OPSEC-aware post-exploitation workflow with approval gates: triage → credentials → escalation → persistence → AD recon → lateral movement.

8. Use AI Assistants Throughout

AI Config Assistant → Hysteria 2 server configs
AI Workflow Assistant → Orchestrate campaigns, maintenance, etc.
ShadowGrok → Autonomous C2 operations (enable in .env)

Example Prompts:
textCreate a daily maintenance workflow: check all nodes, rotate keys on unhealthy ones.
textPlan a full domain compromise starting from current beacon with minimal noise.

9. Monitor & Maintain

Use the main Dashboard for real-time overview.
Check Audit Logs regularly.
Run OPSEC Scorer before high-risk actions.
Rotate API keys and auth credentials.
Monitor bandwidth and node health.


10. Final Cleanup

Remove persistence from beacons.
Export collected data and BloodHound graphs.
Run cleanup workflow.
Self-destruct non-critical beacons.
Delete campaign artifacts.

Final AI Prompt:
textExecute full operation cleanup: remove all persistence, clear logs, export data, and safely retire beacons.

Legal & Ethical Note
This platform cont