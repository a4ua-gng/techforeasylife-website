# TEL OS2.5 operational email configuration

Work notifications use the existing verified Resend domain. Preserve RESEND_API_KEY and TEL_OS_SENDER_EMAIL for verification. Add plaintext TEL_OS_OPERATIONAL_EMAILS=enabled and TEL_OS_WORK_SENDER_EMAIL=notifications@techforeasylife.in. No Google OAuth or WhatsApp setup is needed for employees; they verify any normal email inside TEL OS.

Apply the three new schemas (chat read cursors, task-transfer approval and operational-email outbox). New handovers use task_handover_requests, a separate table from legacy task_transfer_requests, so existing deployments and approval history remain compatible during rollout. Existing operational outboxes need attempts and next_attempt_at columns before the current schema is used.

Set operational_email_enabled_at to the rollout UTC timestamp, operational_email_daily_start_date to the following Asia/Kolkata date and operational_email_daily_time to09:00. These settings prevent old invitation backfill and same-day catch-up task mail. Existing future meetings still receive their one-hour reminder.

Use a Cloudflare Cron trigger every minute. The Worker processes attendance/workflows only every fifth minute, and due email work each minute. Invitation and transfer API writes queue work durably and use waitUntil for immediate dispatch. SMTP/API acceptance is recorded only after a provider ID is confirmed. Uncertain sends are held for review; explicit429 rejections are safely retried after backoff.

The founder-only /api/operational-emails/status endpoint reports configuration and queue counts. Optional ?verify=domain performs a read-only domain check; restricted sending keys may lack domain-list permission even when sending works.

## Existing website integration

Preserve the WEBSITE_ADMIN service binding and TEL_OS_TEAM_KEY secret. HR can maintain public Team entries through the existing admin service; only founders can edit leadership entries. Public website content and private employee records remain separate. If that service requires credential renewal, renew its GITHUB_TOKEN secret with repository Contents access only; never put a token in source or chat.

## Rollout verification

Use the checked-in build and automated tests. Confirm /api/health and the founder-only operational email status, keep the previous Worker version available for rollback, and verify the live user flows without posting dummy chat, changing real attendance or emailing test events to employees.
