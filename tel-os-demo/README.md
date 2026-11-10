# TEL OS 0.1 · Employee Operations Demo

Isolated Cloudflare Worker + D1 employee portal prototype for **TEL / TeMark**. It does not change the existing public TEL website.

## Included

- Role-based login (Founder, HR, Team Lead, Employee); no public registration
- PBKDF2 hashed passwords, 12-hour HttpOnly Secure cookie sessions, login attempt limits, first-login password reset
- HR-created unique accounts, human-reviewed suspension/reactivation and session revocation
- Clock-in, pause, resume and clock-out with persisted D1 attendance records
- Personal task assignment and manager-only final approval
- Team presence based on portal heartbeat, not personal activity surveillance
- Meeting objectives, manual official call logs, school/exam leave and HR approvals
- Transparent **rule-based** overdue-task flags. No AI/WhatsApp integration is active.

## Files

- `worker.js`: Cloudflare Worker backend. The `"__INJECT_HTML__"` literal must be replaced at build time with JSON-encoded contents of `app.html`.
- `app.html`: Responsive no-dependency employee dashboard.
- `schema.sql`: D1 schema, indexes and demo client categories.

## Deployment setup

1. Create a new D1 database called `tel-os-demo` and run `schema.sql`.
2. Seed only a controlled founder account using a unique temporary password, a random 16-byte hex salt, and PBKDF2-SHA256 with 100,000 iterations. Never commit passwords, API keys or password hashes.
3. Deploy an ES module Worker called `tel-os-demo` with a `DB` D1 binding to the new database.
4. Bind the Worker to a dedicated `*.workers.dev` subdomain. Do not point TEL's live domain at this prototype.
5. On first login, change the temporary password. HR can then create additional accounts.
6. Before deploying to real employee use, review authentication, authorizations, scheduling, rate limits, database backups, audit trail, privacy notices, data retention, legal compliance and incident response.

## Security / limitations

This **demo** is not a production-ready HR or payroll system. It does not auto-detect WhatsApp calls, monitor personal devices, create payroll entries, run AI models, calculate legal compliance, or automatically flag three missed shifts. Scheduled student shifts and approved-leave exclusions must be added before automated absence reviews. No minor overtime or out-of-hours emergency duties. The application does not assert legal compliance without professional review.

User-entered task and employee data are persisted to the demo database. **Use fictional sample records only for testing.**
