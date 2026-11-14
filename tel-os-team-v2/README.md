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
- Policies are text documents with department visibility. Deliverables can contain text and access-controlled file links. Native file hosting and live voice/video are not included.
- Confidential concerns can be restricted to founders. Monthly reviews cover quality, timeliness, communication, initiative, reliability and collaboration. Exit approval records an agreed departure; account deactivation is a separate documented founder approval at the effective date.

## Automations

Cloudflare Cron runs every 15 minutes, even while this chat and the app are closed. Notifications are stored in the app and deduplicated. Rules cover overdue assignments, three-day inactivity, pending reviews and leave approvals after 48 hours, repeated overdue work prompting lead review, forgotten open attendance, approved leave, upcoming meetings within 24 hours, and Monday department summaries. Attendance is split at local midnight without inventing clock-out events. There are no automatic disciplinary actions.

Application dates and the shared calendar use Asia/Kolkata; records use UTC ISO timestamps. No school, medical or personal reason is put in shared calendar entries. HR should review the operating guides and fill missing contact/joining information before relying on them as official HR records.

## Deployment and maintenance

The deployed resources are `tel-os-team-v2` Worker and its dedicated D1 database. The prior Worker/database remain intact. To redeploy, set `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID`, and a scoped `CLOUDFLARE_API_TOKEN` in your shell, then run `node scripts/deploy.mjs`. Never point this schema at an older TEL OS database; upgrades across versions require an explicit migration. The deployment script creates no accounts and never resets staff credentials.

Initial staff credentials were provisioned directly to the dedicated database. They are excluded from source control and provided privately to the workspace owner. Seed accounts use the provisioning date as an initial joining date because historical joining dates were not supplied; HR can update the verified date. No email addresses, phone numbers, historical attendance, tasks or meetings were invented.

Workers logs and traces are enabled. API errors include request IDs. Use the founder audit view for access changes and workflow actions. Use D1 Time Travel/export for recovery; test restoration before adopting a backup policy. Email/SMS/Slack delivery and external calendar sync require a separately configured integration. This release sends in-app notifications only.
