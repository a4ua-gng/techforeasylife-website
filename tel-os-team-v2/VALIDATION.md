# TEL OS2.4 verification ·15November2026 IST

116 runtime tests pass in Miniflare/workerd with D1. Six email checks cover non-Gmail ownership verification, no code exposure, private queued fallback, five-attempt concurrency/expiry limits, provider failures, duplicate-address rejection and the actual email-only API gate. Existing attendance, privacy, private IC, uploads, department fanout, founder summaries and website revision protections remain covered.

The browser email flow exercises an isolated instant-email provider: email-only onboarding, blocked unverified routes/APIs, a non-Gmail address, an incorrect code followed by the delivered code, workspace access after verification, existing profile-photo controls and375px layout. No real verification code is entered by an assistant; fixture codes are synthetic and never logged.

The live instant verification sender configuration is preserved. Work notifications continue through the authorised Operations Gmail hourly digest with an at-most-once receipt ledger. The job never sends empty check-ins, includes no other employee's work, and does not change the instant email service settings.

Seven private identity cards, employee portraits and existing account credentials remain in their protected data store. Source scans exclude private credentials, contacts, cards and database fixtures. The public website content is unchanged.
