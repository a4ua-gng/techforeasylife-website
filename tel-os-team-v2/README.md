# TEL OS · Team operations

Production: https://tel-os-team-v2.xtremedivyangshu.workers.dev

Cloudflare Workers + a dedicated D1 database provide real employee accounts, department workspaces, attendance, tasks, leave, meetings, private HR tickets, image uploads and founder oversight. The public TEL website content is unchanged.

## Current release: email only (2.4)

Every employee can verify any normal email address using an eight-digit email code. Google sign-in and phone/WhatsApp onboarding are disabled. The existing instant verification sender and credentials are preserved. Codes expire in10minutes for instant delivery; the hourly Operations queue supports3hour codes when instant delivery is unavailable. Codes are never returned to the client. Verification is scoped to the logged-in requester, rate limited and capped at five attempts. Duplicate active verified addresses are rejected. Only successful verification updates the notification address.

The notification sender is techforeasylife.operations@gmail.com. Its enabled hourly job sends exactly one consolidated personalised digest per employee with newly claimed relevant events, and no empty check-ins. The D1 receipt ledger prevents automatic repeats and uncertain sends require review. Verification codes are separate from work digests. No inbox-reading step or work-digest delivery through the instant email provider is configured. Founders get wider company events and a copyable/downloadable text overview.

## Daily work and access

Department Home screens welcome members by name. Marketing reports directly to Harsh. Humaira and Himan administer HR records, ordinary private tickets and ticket chats; founders-only complaints bypass HR. Tasks require formal submission and independent review. Leave uses reporting-lead recommendation followed by separate HR/founder verification.

Weekday clock-in defaults to17:00IST from16November2026. Five-minute Cron checks handle pre-start, due, grace and manager/HR follow-ups; approved leave, academic availability, holidays and corrections are exempt. Attendance shows seconds and supports breaks, resume, clock-out and local-midnight accounting. Work status is distinct from app presence.

Channels notify their authorised company/department members and founders without duplicate mention/thread alerts. Employees can change their own profile picture and add permission-checked images to chats, tasks, meetings and private tickets.

Eight employee PDF profiles were matched; two remain for HR identity review. Seven supplied identity-card images are private to the matched employee and authorised HR/founders, with access logging. Two unmatched cards stay HR-only until matching. Original decoded pixels were preserved with lossless storage. No identity numbers were transcribed. No employee contacts, PDF documents, portraits, identity images, credentials or live database fixtures are included in source.

Activity monitoring records TEL OS sections, app visibility/focus and presence only. It cannot enumerate other tabs or read other websites/typed text. The app discloses recording and retains activity events for30days.

Individual password changes precede all team access. Passwords use unique salts and PBKDF2-SHA256; sessions are random opaque tokens stored as hashes with Secure HttpOnly SameSite cookies. Password resets revoke sessions. Private APIs enforce roles and same-origin writes. Founders retain setup access; ordinary members must verify their email before work APIs.

## Run and verify

Use Node24+. Run npm ci, npm test, npm run build. npm run dev serves an isolated local D1 database at127.0.0.1:4173. Without private provisioning files, the dev script creates fictional local fixtures. Browser-email-only-check.mjs uses a separate isolated runtime and mocked email provider; it sends no real mail.

Deployment uses scripts/deploy.mjs with scoped Cloudflare credentials and the dedicated TEL OS database. It preserves existing secret and plain-text bindings, configures email-only mode, and does not reset users or passwords. Logs/traces and a five-minute Cron Trigger are enabled. Existing website Team publishing uses a separate service binding and remains paused until its pre-existing GitHub credential is renewed. See PROVIDER-SETUP.md and VALIDATION.md.
