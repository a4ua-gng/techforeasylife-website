# TEL OS · Team operations

Production: https://tel-os-team-v2.xtremedivyangshu.workers.dev

Cloudflare Workers + a dedicated D1 database provide real employee accounts, department workspaces, attendance, tasks, leave, meetings, private HR tickets, image uploads and founder oversight. The public TEL website content is unchanged.

## Current release: TeMark, announcements and private support (2.8.0)

Marketing is displayed as TeMark throughout the workspace; saved department identifiers stay compatible with existing accounts and permissions. Phone date filters stack without overlapping, founder text summaries use compact aligned controls, and Home lists Today’s tasks for you. The Home HR shortcut has an X and an account setting to restore it.

HR and founders can draft, publish, edit and archive in-app announcements. Staff see only their authorised audience. Popups are dismissible per member and revision, defer while typing or in chat, and remain available in Announcements history. Publishing does not send emails or chat notices.

New private HR tickets let the sender choose specific founders and whether HR may read them. The same access applies to lists, reviews, chat and images. Unselected founders cannot read these tickets or their audit metadata. Existing tickets retain their prior access rules. The reviewer choices are shown before submission and alongside the ticket.

Team Calendar has Month and Agenda views, Today/date navigation, category filters and My items. It uses existing scoped meetings, task deadlines, approved leave, shared availability and holidays. Private leave reasons are excluded. Existing event details and availability actions remain available.

Optional Ask TEL offers guided app help, contextual buttons and fresh personal task, meeting and work-status answers. It uses role-aware allowed routes and a small in-memory conversation; it makes no external model calls, reads no private HR/chat contents and performs no work changes. Hide and restore preferences remain per account/browser.

Home brings together a welcoming Your work today timeline, personal tasks, upcoming meetings, a live attendance card and a prominent Contact HR shortcut. Founders, TeMark (Marketing) and HR use distinct department layouts and accents. Team right now separates signed-in status from clocked-in work and breaks.

Company attendance is flexible: members choose when to begin, aim for around four active hours, pause for breaks and clock out when finished. Fixed-start lateness notices are suppressed. Existing attendance and schedule history remain intact, and an authorised fixed policy can still be configured explicitly.

Chat uses a contextual thread pane on desktop and a full thread view on phones, with grouped messages, local image previews/removal and a keyboard-aware composer. Enter sends and Shift+Enter inserts a line break; IME, account/channel/thread drafts, unread dots and upload retries remain supported. Chat produces no notification-centre entries or emails.

HR control panel is restricted to HR and founders. It combines work presence, recorded attendance, manual meeting rosters, correction history, task deadlines and one-day extensions, with links to existing staff, leave and confidential support tools. An owning, participating department lead can record attendance for their department; HR/founders can review and correct. Call-provider joins are not inferred. Legacy attendance checkboxes use the same audited path.

After activation, an unfinished task missing its IST end-of-day deadline receives one extra calendar day. The assignee is notified. If it remains unfinished after that day, the assignee, current authorised reviewer and HR receive a follow-up; TeMark leads receive TeMark follow-ups only. Submitted work awaiting review, approved work and completed tasks are excluded. Original dates are retained. Historical overdue work is not backfilled.

New urgent assignments use a durable immediate Resend queue. Approved urgent handovers use one urgent transfer email. Current verified unique notification addresses are required; no employee contact fallback is used.

Maintenance is an access gate only. Full mode pauses every account, including founders, without changing passwords or attendance; the ordinary mode can preserve already-open work sessions. Founders and members with an open work or break session retain access. Blocked members keep their accounts and sessions; no clock-in time is reset or attendance forced closed. Existing background work continues.

Chat uses persistent unread dots beside channel names, with no chat emails or Notification-centre entries. Enter sends a chat message or thread reply; Shift+Enter inserts a line break. Drafts survive refreshes and thread polling.

Online means signed in to a valid session. Working means clocked in and not on a break. Switching tabs or being idle does not show Away. The founder view retains actual app heartbeat times separately. Ask TEL occupies reserved header space, can be hidden, and can be restored from My account; preferences stay separate for each account in the browser.

Employees receive their own unfinished-task plan at09:00IST on eligible workdays, starting the day after activation. Empty plans and approved leave, unavailable/exam periods, holidays and nonworking days are skipped. Meeting invitations are queued immediately and reminders are scheduled one hour before the meeting, including existing future meetings. A meeting created less than one hour ahead receives one combined invitation.

An assignee may request a task handover. The current assigned reviewer must approve before ownership changes. Approval assigns the task immediately, with a targeted in-app notice and email to the new owner. The original requester and reviewer retain private handover notes; these notes are excluded from emails and the target's view. Finished work still requires independent review.

Operational emails use Resend from TEL Operations at notifications@techforeasylife.in, with replies directed to the Operations Gmail address. Recipients must have a current, unique, explicitly verified email in TEL OS; any normal email provider works. The durable outbox, atomic claims, stable provider idempotency keys, rate gate and confirmed provider IDs prevent duplicate and falsely successful sends. Uncertain sends require review; explicit rate-limit rejections are safely deferred. Worker email checks run every minute; existing attendance and workflow checks remain every five minutes.

All ChatGPT scheduled jobs, including the Gmail verification fallback, are paused. Verification continues through the existing instant Resend sender. Existing instant verification credentials and OTP sender are preserved. Employees verify an eight-digit code before accessing work APIs; Google sign-in and phone/WhatsApp onboarding remain disabled. No inbox is read.

## Daily work and access

Department Home screens welcome members by name. Marketing reports directly to Harsh. Humaira and Himan administer HR records; private ticket access follows the sender’s selected founder and HR choices. Tasks require formal submission and independent review. Leave uses reporting-lead recommendation followed by separate HR/founder verification.

Flexible attendance is the company default. An explicit fixed policy supports pre-start, due, grace and manager/HR follow-ups, with approved leave, academic availability, holidays and corrections exempt. Attendance shows seconds and supports breaks, resume, clock-out and local-midnight accounting. Work status is distinct from app presence.

Channels show unread indicators only to their authorised company/department members and founders. Employees can change their own profile picture and add permission-checked images to chats, tasks, meetings and private tickets.

Imported employee PDF profiles are matched to existing accounts only after identity confirmation; unmatched records remain for private HR review. Seven supplied identity-card images are private to the matched employee and authorised HR/founders, with access logging. Unmatched cards stay HR-only until matching. Original decoded pixels were preserved with lossless storage. No identity numbers were transcribed. No employee contacts, PDF documents, portraits, identity images, credentials or live database fixtures are included in source.

Activity monitoring records TEL OS sections, app visibility/focus and presence only. It cannot enumerate other tabs or read other websites/typed text. The app discloses recording and retains activity events for30days.

Individual password changes precede all team access. Passwords use unique salts and PBKDF2-SHA256; sessions are random opaque tokens stored as hashes with Secure HttpOnly SameSite cookies. Password resets revoke sessions. Private APIs enforce roles and same-origin writes. Founders retain setup access; ordinary members must verify their email before work APIs.

## Run and verify

Use Node24+. Run npm ci, npm test, npm run build. npm run dev serves an isolated local D1 database at127.0.0.1:4173. Without private provisioning files, the dev script creates fictional local fixtures. Browser-email-only-check.mjs uses a separate isolated runtime and mocked email provider; it sends no real mail.

Deployment uses scripts/deploy.mjs with scoped Cloudflare credentials and the dedicated TEL OS database. It preserves existing secret and plain-text bindings, configures email-only mode, and does not reset users or passwords. Logs/traces and a minute Cron Trigger are enabled; attendance/workflow checks run every fifth minute. Existing website Team publishing uses a separate service binding and remains paused until its pre-existing GitHub credential is renewed. See PROVIDER-SETUP.md and VALIDATION.md.
