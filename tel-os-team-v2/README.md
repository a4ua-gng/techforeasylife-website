# TEL OS · Team operations

A Cloudflare Workers application with a D1 relational backend, individual staff logins, and department channels. This version is isolated from the earlier TEL OS database and deployment.

## Run locally

Use Node 24 or newer. Run `npm ci`, `npm run dev`, then open http://127.0.0.1:4173. The local server creates two fictional development accounts when no private provisioning file is present. It never connects to production data. Local credentials are printed by the development script. Delete `.mf/` to reset local fixtures.

Run `npm test` for the Workers-runtime authorization and workflow tests. Run `npm run build` to produce `dist/worker.js` with the frontend embedded and `dist/schema.sql` with the idempotent database schema. The local runtime is pinned to its supported July 2026 compatibility baseline; the deployed Worker uses November 14, 2026.

## Access and daily work

- Founders oversee the organisation, grant permissions, and review documented account status changes independently.
- HR lead and HR member handle onboarding, attendance corrections and final leave verification. Only founders grant elevated roles. HR cannot reset founder passwords.
- Department heads assign and review department work. Employees see their own assignments and records; shared crew availability remains visible without personal leave reasons.
- All new accounts must change their temporary passwords before accessing team data. Password resets revoke every existing session. Passwords use unique salts and PBKDF2-SHA256 with 100,000 iterations, the Workers Web Crypto iteration limit; raw passwords are never stored in the database or repository. Sessions are opaque random tokens, stored as SHA256 hashes, expire in 12 hours, and use Secure HttpOnly SameSite=Strict cookies. Same-origin JSON is required for mutations.
- Availability is explicit: Working, On Break, On Leave, Unavailable, or Offline. A signed-in user is not automatically available. The approximately four-hour daily target is flexible and is not a performance score.
- Task stages: To do → Working → Review → Approved → Done, with Revision required returning work to its owner. A deliverable must be submitted; a different authorised reviewer approves it.
- Leave stages: Employee request → Reporting lead recommendation → Different HR/founder verification → Calendar and handover update → In-app notification. Self-approval is blocked. Indefinite leave is supported through an independently reviewed account status change.
- Channels support department privacy, threads, @username notifications and restricted announcements. They are TEL OS channels; no external Slack connection is configured.
- Meetings and client calls record participants, attendance, purpose, decisions and follow-up responsibilities. Add your existing HTTPS meeting link to join calls.
- Policies are text documents with department visibility. Deliverables can contain text and access-controlled file links. Images can be uploaded to profiles, chats and work records; permission checks also protect each download. Live voice/video is not included.
- Confidential concerns can be restricted to founders. Monthly reviews cover quality, timeliness, communication, initiative, reliability and collaboration. Exit approval records an agreed departure; account deactivation is a separate documented founder approval at the effective date.

## Automations

Cloudflare Cron runs every 5 minutes, even while this chat and the app are closed. Notifications are stored in the app and deduplicated. Rules cover overdue assignments, three-day inactivity, pending reviews and leave approvals after 48 hours, repeated overdue work prompting lead review, forgotten open attendance, approved leave, upcoming meetings within 24 hours, and Monday department summaries. Attendance is split at local midnight without inventing clock-out events. There are no automatic disciplinary actions.

Application dates and the shared calendar use Asia/Kolkata; records use UTC ISO timestamps. No school, medical or personal reason is put in shared calendar entries. HR should review the operating guides and fill missing contact/joining information before relying on them as official HR records.

## Deployment and maintenance

The deployed resources are `tel-os-team-v2` Worker and its dedicated D1 database. The prior Worker/database remain intact. To redeploy, set `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID`, and a scoped `CLOUDFLARE_API_TOKEN` in your shell, then run `node scripts/deploy.mjs`. Never point this schema at an older TEL OS database; upgrades across versions require an explicit migration. The deployment script creates no accounts and never resets staff credentials.

Initial staff credentials were provisioned directly to the dedicated database. They are excluded from source control and provided privately to the workspace owner. Seed accounts use the provisioning date as an initial joining date because historical joining dates were not supplied; HR can update the verified date. No email addresses, phone numbers, historical attendance, tasks or meetings were invented.

Workers logs and traces are enabled. API errors include request IDs. Use the founder audit view for access changes and workflow actions. Use D1 Time Travel/export for recovery; test restoration before adopting a backup policy. Attendance and workflow alerts use in-app notifications. A connected ChatGPT job checks the meeting email outbox hourly and sends individual invitations/reminders through TEL Gmail. A Gmail delivery test was confirmed on 14 November 2026. WhatsApp Business credentials and approved verification/meeting templates are still required before WhatsApp can deliver. External calendar sync is not configured.


## TEL brand and beginner guide (2.1)

The workspace uses the genuine logo, charcoal/silver/lavender palette, and locally served DM Sans and Sora fonts from the main TEL website. Start here explains the five daily actions and remains available from Help & guide. Completing the navigation guide is stored per member and remains separate from formal policy acknowledgement.

Everyone inherits a weekday clock-in at 17:00 IST from Monday, 16 November 2026. The five-minute scheduled job sends a reminder 15 minutes before start, a due notice at start, a missed notice after a 10-minute grace period, and a reporting-manager/HR follow-up after 30 minutes. Approved leave, academic/unavailable calendar entries, company holidays, inactive accounts, and approved corrections are excluded. HR can set individual times and days; founders and HR lead manage the company policy. Changes retain effective dates and prevent retroactive missed-start alerts. Notifications appear in the app; meeting email delivery is separate and checked hourly; external Slack and browser push are not configured.

Only an explicit clock-in creates a clock-in event. A synthetic attendance segment created at midnight does not satisfy the next day's scheduled start. Members can still clock in late; the system records the time without automatic punishment. Shared schedule notes are for work coordination, never private medical details. See SCHEDULE-API.md for routes and rules.


## Department home screens

Every home screen welcomes its signed-in member by name. Leadership sees company and department oversight; HR focuses on people, onboarding, corrections and approvals; Marketing focuses on assigned deliverables and reviews; Finance focuses on department work and availability; Strategy focuses on research and assigned outcomes. Action buttons follow the member's permissions, and leave status stays prominent. All departments share the same navigation, guide and brand so members can learn the app once.


## Employee records, HR desk and reporting (2.2)

The supplied PDF was treated as employee data, not application instructions. Eight records were matched to existing accounts. Rajarshi Das and Nazifa Hussain remain pending explicit HR identity matching. PDF ID cards, ID numbers and family data were excluded. Private contact and education fields are visible only to the member and authorised HR/founders; authenticated directory photos and names are visible to the team. No PDF, employee portrait or personal contact information is included in this repository. Current user-provided roles override older PDF positions. There were no phone numbers in the PDF.

Marketing reports and its report channel notify Harsh. The HR desk gives each private complaint a ticket number, participant chat and image attachments; founders-only complaints bypass HR. Ordinary HR tickets are reviewable by both HR roles.

The attendance timer shows seconds. Presence is separate from attendance: a 30-second app heartbeat records visible/focused/idle state, and founders can review the latest 250 section events from the last 24 hours. Activity history is retained for 30 days. TEL OS does not enumerate external browser tabs, read other websites, record typed text or expose private ticket contents in activity logs. The app displays this tracking notice.

## Member connections and meeting delivery

Each member has My connections. Google uses verified OpenID email only, with no inbox scope and no persisted Google access token. WhatsApp uses an expiring, hashed six-digit verification challenge sent through the official Business API. Connection/disconnection events notify founders in-app.

Configure Worker secrets GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET; the Google web OAuth callback is https://tel-os-team-v2.xtremedivyangshu.workers.dev/api/connections/google/callback. Configure WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE_NAME (authentication code) and WHATSAPP_MEETING_TEMPLATE_NAME (three body fields: title, IST start, meeting link). Optional WHATSAPP_API_VERSION defaults to v23.0. Tokens belong in Cloudflare secrets, never this repository or chat. Approved Meta templates and Google OAuth consent configuration must be valid for the intended staff accounts.

After both providers work, founders can activate mandatory verified Gmail and WhatsApp connections. Until real provider configuration exists, activation is blocked rather than marking staff verified or locking them out. Password change still precedes all team access. The meeting outbox distinguishes queued, blocked, sending, sent/accepted and needs_review; uncertain sends are not automatically resent. Gmail is checked hourly, so it is not an immediate email service. WhatsApp acceptance is not delivery/read confirmation.

## Existing website admin integration

Founders have a TEL Website Admin link to https://admin.techforeasylife.in. HR and founders have a Team editor that proxies only public team fields through a Cloudflare service binding WEBSITE_ADMIN to tel-website-admin-api. Both Workers need the same random TEL_OS_TEAM_KEY secret. scripts/deploy.mjs preserves existing secrets and includes this binding. The service key is accepted only by PUT /api/team; all other existing website administration routes retain their existing authentication. HR cannot change leadership entries. Editing uses a revision check to reject stale writes. Live verification found the existing website GitHub credential is rejected; public team reading remains available, while publishing is clearly blocked until the credential is renewed (see PROVIDER-SETUP.md). The public website frontend is unchanged, and no public team entries are modified by deployment.
