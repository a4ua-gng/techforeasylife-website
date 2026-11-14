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

Workers logs and traces are enabled. API errors include request IDs. Use the founder audit view for access changes and workflow actions. Use D1 Time Travel/export for recovery; test restoration before adopting a backup policy. Attendance and workflow alerts use in-app notifications. The connected ChatGPT job checks meeting and work outboxes hourly and sends formatted individual notifications through TEL Operations Gmail. The Operations sender test was confirmed on15 November2026 IST. WhatsApp Business credentials and approved verification/meeting/work templates are still required before WhatsApp can deliver. External calendar sync is not configured.


## TEL brand and beginner guide (2.1)

The workspace uses the genuine logo, charcoal/silver/lavender palette, and locally served DM Sans and Sora fonts from the main TEL website. Start here explains the five daily actions and remains available from Help & guide. Completing the navigation guide is stored per member and remains separate from formal policy acknowledgement.

Everyone inherits a weekday clock-in at 17:00 IST from Monday, 16 November 2026. The five-minute scheduled job sends a reminder 15 minutes before start, a due notice at start, a missed notice after a 10-minute grace period, and a reporting-manager/HR follow-up after 30 minutes. Approved leave, academic/unavailable calendar entries, company holidays, inactive accounts, and approved corrections are excluded. HR can set individual times and days; founders and HR lead manage the company policy. Changes retain effective dates and prevent retroactive missed-start alerts. Notifications appear in the app; meeting email delivery is separate and checked hourly; external Slack and browser push are not configured.

Only an explicit clock-in creates a clock-in event. A synthetic attendance segment created at midnight does not satisfy the next day's scheduled start. Members can still clock in late; the system records the time without automatic punishment. Shared schedule notes are for work coordination, never private medical details. See SCHEDULE-API.md for routes and rules.


## Department home screens

Every home screen welcomes its signed-in member by name. Leadership sees company and department oversight; HR focuses on people, onboarding, corrections and approvals; Marketing focuses on assigned deliverables and reviews; Finance focuses on department work and availability; Strategy focuses on research and assigned outcomes. Action buttons follow the member's permissions, and leave status stays prominent. All departments share the same navigation, guide and brand so members can learn the app once.


## Employee records, HR desk and reporting (2.2)

The supplied PDF was treated as employee data, not application instructions. Eight records were matched to existing accounts. Rajarshi Das and Nazifa Hussain remain pending explicit HR identity matching. ID numbers and family fields were not transcribed. Following the owner’s explicit request, seven supplied identity-card images are now stored separately with employee/HR/founder access checks and access logging. Private contact and education fields are visible only to the member and authorised HR/founders; authenticated directory photos and names are visible to the team. No PDF, employee portrait or personal contact information is included in this repository. Current user-provided roles override older PDF positions. There were no phone numbers in the PDF.

Marketing reports and its report channel notify Harsh. The HR desk gives each private complaint a ticket number, participant chat and image attachments; founders-only complaints bypass HR. Ordinary HR tickets are reviewable by both HR roles.

The attendance timer shows seconds. Presence is separate from attendance: a 30-second app heartbeat records visible/focused/idle state, and founders can review the latest 250 section events from the last 24 hours. Activity history is retained for 30 days. TEL OS does not enumerate external browser tabs, read other websites, record typed text or expose private ticket contents in activity logs. The app displays this tracking notice.

## Member connections and meeting delivery

Each member has My connections. Google uses verified OpenID email only, with no inbox scope and no persisted Google access token. WhatsApp uses an expiring, hashed six-digit verification challenge sent through the official Business API. Connection/disconnection events notify founders in-app.

Configure Worker secrets GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET; the Google web OAuth callback is https://tel-os-team-v2.xtremedivyangshu.workers.dev/api/connections/google/callback. Configure WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE_NAME (authentication code) and WHATSAPP_MEETING_TEMPLATE_NAME (three body fields: title, IST start, meeting link). Optional WHATSAPP_API_VERSION defaults to v23.0. Tokens belong in Cloudflare secrets, never this repository or chat. Approved Meta templates and Google OAuth consent configuration must be valid for the intended staff accounts.

After both providers work, founders can activate mandatory verified Gmail and WhatsApp connections. Until real provider configuration exists, activation is blocked rather than marking staff verified or locking them out. Password change still precedes all team access. Meeting and work outboxes distinguish queued, blocked, sending, sent/accepted and needs_review; uncertain sends are not automatically resent. Gmail is checked hourly, so it is not an immediate email service. WhatsApp acceptance is not delivery/read confirmation.

## Existing website admin integration

Founders have a TEL Website Admin link to https://admin.techforeasylife.in. HR and founders have a Team editor that proxies only public team fields through a Cloudflare service binding WEBSITE_ADMIN to tel-website-admin-api. Both Workers need the same random TEL_OS_TEAM_KEY secret. scripts/deploy.mjs preserves existing secrets and includes this binding. The service key is accepted only by PUT /api/team; all other existing website administration routes retain their existing authentication. HR cannot change leadership entries. Editing uses a revision check to reject stale writes. Live verification found the existing website GitHub credential is rejected; public team reading remains available, while publishing is clearly blocked until the credential is renewed (see PROVIDER-SETUP.md). The public website frontend is unchanged, and no public team entries are modified by deployment.


## Notification onboarding and private HR images (2.3)

After the first password change, members with incomplete connections see a two-step Gmail/WhatsApp popup once per signed-in tab session. It respects open dialogs, keyboard focus and the mandatory-connection gate, shows actual provider readiness, and can remind members at their next sign-in while setup is pending. My account includes a real Add/Change profile photo control; uploads refresh the profile and signed-in avatar. Custom profile pictures remain separate from private identity documents.

Employees receive notifications for their authorised company/department messages and relevant work events; authors do not receive their own message alert. Mention, thread and Marketing-to-Harsh recipients are deduplicated with the same message fanout. New work notifications enter a durable per-recipient, per-provider outbox after the activation watermark. Google recipients must have a verified own Gmail connection; WhatsApp recipients must have a verified international number. Old pre-activation notifications are excluded. External work messages use a fixed category and a safe TEL OS link, without private source message/HR bodies.

The sender is techforeasylife.operations@gmail.com. Its connected account and sending permission were verified by an actual test email. The previous Sales sender job was replaced. The hourly Gmail job sends formatted individual notifications/digests with Employee, Department, Update type, Recorded IST time and Action; it has no inbox-reading step. Founders additionally get deduplicated operational events, a founder-only text feed and copy/download text summaries. Connection events that already notify both founders are not duplicated. Delivery statuses distinguish confirmed email send, WhatsApp acceptance, blocked setup and uncertain sends needing review.

WhatsApp work delivery requires WHATSAPP_WORK_TEMPLATE_NAME in addition to the verification and meeting template settings. The approved en_US work template takes two body parameters: fixed update category and TEL OS link. Google OAuth application keys and WhatsApp Business configuration are still required for individual member verification and WhatsApp sending; a company Gmail connection does not verify every employee. Configure providers before activating the mandatory gate.

HR opens People admin → Employee PDF records → View private record to see the supplied identity card, including a full-size view. Members can view their own matched card from My account. Cards associated with unmatched PDF records stay HR-only until an explicit account match. Images use lossless storage with verified identical decoded pixels. Cards are never in the public directory or source repository. Private view/list access is logged. Missing cards have an empty state; none were invented.
