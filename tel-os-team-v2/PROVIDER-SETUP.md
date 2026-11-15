# TEL OS2.5 operational email configuration

Work notifications use the existing verified Resend domain. Preserve RESEND_API_KEY and TEL_OS_SENDER_EMAIL for verification. Add plaintext TEL_OS_OPERATIONAL_EMAILS=enabled and TEL_OS_WORK_SENDER_EMAIL=notifications@techforeasylife.in. No Google OAuth or WhatsApp setup is needed for employees; they verify any normal email inside TEL OS.

Apply the three new schemas (chat read cursors, task-transfer approval and operational-email outbox). Existing legacy transfer tables without updated_at must be migrated first; the deploy script preserves the empty old table as task_transfer_requests_legacy_v24 and stops for a populated legacy table requiring a data-preserving migration. Existing operational outboxes need attempts and next_attempt_at columns before the current schema is used.

Set operational_email_enabled_at to the rollout UTC timestamp, operational_email_daily_start_date to the following Asia/Kolkata date and operational_email_daily_time to09:00. These settings prevent old invitation backfill and same-day catch-up task mail. Existing future meetings still receive their one-hour reminder.

Use a Cloudflare Cron trigger every minute. The Worker processes attendance/workflows only every fifth minute, and due email work each minute. Invitation and transfer API writes queue work durably and use waitUntil for immediate dispatch. SMTP/API acceptance is recorded only after a provider ID is confirmed. Uncertain sends are held for review; explicit429 rejections are safely retried after backoff.

The founder-only /api/operational-emails/status endpoint reports configuration and queue counts. Optional ?verify=domain performs a read-only domain check; restricted sending keys may lack domain-list permission even when sending works.

## Existing integrations

# TEL OS email notifications

The final release uses email only. No Google sign-in, OAuth client setup, phone number or WhatsApp setup is required.

## For every employee

1. Sign in using your individual TEL OS username and password.
2. Enter any email address you own.
3. Enter the eight-digit code received in that inbox. Check spam if needed.
4. Continue to the workspace. My account and Email notifications remain available to change your address later.

Verification codes use the already configured instant email service and expire in10minutes. If that service is unavailable, the existing Operations delivery queue supports a3hour code. Codes are never displayed in TEL OS and the address changes only after successful verification. Five code attempts and request cooldowns are enforced.

## Work notifications

The enabled TEL Operations Gmail job sends from techforeasylife.operations@gmail.com hourly. It sends exactly one consolidated personalised digest to each verified employee with new relevant updates, and no email when there is nothing new. Priority sections distinguish urgent, important and routine items. Founders receive wider organisational events and text summaries. No other employee's work is included. No work digests are sent through the instant verification service.

The existing instant verification settings RESEND_API_KEY and TEL_OS_SENDER_EMAIL were preserved. They do not need changing. Never paste provider secrets or verification codes into chat. Employees enter their own code inside TEL OS.

## Optional public website team publishing

The existing website admin's GitHub credential was rejected. Public Team reading remains available, while publishing stays disabled. Renew the GITHUB_TOKEN secret on tel-website-admin-api with repository Contents read/write access for a4ua-gng/techforeasylife-website to enable HR publishing. This is separate from employee email verification and notification delivery.
