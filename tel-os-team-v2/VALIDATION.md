# TEL OS2.7 verification ·16November2026 IST

221 integrated Workers/D1 tests pass. The suite covers flexible attendance, unchanged active/break timers across maintenance, session/login gates, audited manual meeting rosters, HR privacy, one-day deadline grace and escalation, current verified email recipients, role changes, urgent queues, provider rate limits/idempotency and uncertain-send review. Existing attendance, task review, transfers, private images and email verification are included.

Local Chromium checks cover14 comprehensive chat flows,6 prior chat regressions,13 flexible Home/Attendance/Guide flows across five roles, and existing presence/helper/transfer/email flows. Chat checks include320/375/393px, keyboard pan, landscape, image upload retries, draft retention, Enter/IME, unread dots and generic dialogs. New Home checks exercise actual clock-in, ticking time, break, resume and clock-out in an isolated database.

All provider tests use synthetic fixtures with outbound email blocked or mocked. The sole requested real Resend sender test was confirmed delivered to its owner-specified recipient. No dummy employee task, meeting, chat, attendance or welcome message was created in production for testing.

Maintenance hotfix and integrated worker passed9 targeted runtime checks,14 authentication regressions and a375px browser check. Maintenance never updates clock-in/out, passwords or existing login sessions; founders and open work/break sessions keep access and background jobs continue.

Additive schemas preserve existing users, records, outboxes and the prior Worker version. SQL trigger bodies are applied as complete statements. Private files, credentials, live employee fixtures, PDFs and portraits are excluded from GitHub source. Production rollout preserves every existing binding and both separate email senders.

Production checks use scripts/browser-release-v27-check.mjs with a short-lived founder session, read-only records APIs and local browser preferences. It does not send real chat or transfer tasks. That session is revoked after testing.
