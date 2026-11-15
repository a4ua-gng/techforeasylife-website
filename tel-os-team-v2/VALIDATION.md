# TEL OS2.5.0 verification ·15November2026 IST

162 automated tests pass in the actual Miniflare/workerd runtime with D1. Coverage includes per-user unread cursors, thread privacy, Enter/IME handling, session-based Online status, independent Working status, transfer authorization and concurrency, new-owner access only after approval, private handover notes, operational-email cutover, verified-recipient checks, provider idempotency, rate limits, uncertain confirmations, reschedules and daily workday exclusions.

35 isolated browser checks pass across chat, presence, optional-helper preferences, task-transfer approval, existing email verification and navigation. Mobile checks cover375px chat,320–1440px helper placement and mobile-keyboard visibility. No real employee received a test message. Provider tests use synthetic local fixtures and a mocked Resend service.

The connected Resend account confirms techforeasylife.in is verified for sending. The work sender uses notifications@techforeasylife.in with Operations Gmail as reply-to. Existing OTP credentials and sender remain separate. The old broad Gmail digest job now handles requested verification codes only.

Production validation uses scripts/browser-release-v25-check.mjs with a short-lived authorised founder session. It performs read-only checks plus local browser preference changes; it does not post test chat, change attendance, transfer real tasks or send dummy email. The temporary session is revoked afterward.

The old empty transfer table is retained under a legacy backup name before the current approval schema is created. Current accounts, passwords, employee records and task ownership are preserved. Private data and fixtures are excluded from GitHub source.
