# TEL OS · Mission Control

**Black, white and purple student-aware operations system for TEL and TeMark.** This folder contains the application's actual Cloudflare Worker backend, D1 schema and responsive UI. It is separate from the existing public TEL website and the fictional design preview.

**Deployment:** https://tel-os-main.xtremedivyangshu.workers.dev/

**Current status:** Main Worker is deployed and the D1 database is connected. **Founder account has not been activated**. First-time setup requires a private Cloudflare secret before the application can be used with real accounts. Browser login integration testing on the public endpoint and a professional privacy/security review are still required before any real employee data is added.

## First-time Founder activation

1. Sign in to the Cloudflare account that owns Worker **`tel-os-main`**. Go to **Workers & Pages → tel-os-main → Settings → Variables and Secrets**.
2. Add a **Secret** (not a plaintext source-code variable) named **`SETUP_CODE`**. Set its value to a fresh, private random string at least 32 characters long. The same value will be entered in the one-time Founder setup form. Do **not** commit or share this code in GitHub or a WhatsApp group.
3. Open the deployment link above. Choose **First-time Founder setup** and enter the setup code, Founder name, login ID, and a unique password of 12+ characters. Tick the under-18 box when appropriate.
4. After the account has been created, **delete the SETUP_CODE secret** from Cloudflare and verify that setup is disabled. Additional Founder accounts can only be issued by an existing Founder via HR Control.
5. Sign in. Create an HR account under HR Control. HR creates individual accounts for employees, team leaders and managers. The first-login temporary password must be changed immediately.

If the Cloudflare account is shared with developers, have a trusted account owner oversee the secret and setup. Never use a common password for multiple employees.

## Implemented modules

- **Role-based sign-in:** Founder, HR, Team Leader and Employee. PBKDF2 password hashes, secure HttpOnly SameSite cookies, first-login reset and HR suspension/reactivation.
- **Mission Control:** tasks, team presence, notifications, attention items and operational summaries.
- **Attendance:** clock in, breaks, resume, clock out, daily hours and human-reviewed corrections.
- **Assignments:** work briefs, assignees, deadlines, submission links, quality review, revision requests and final manager approval.
- **Student availability:** school/exam days, shared calendar, approved leave and shift rosters.
- **Handovers:** requests, manager approval, reassignment and accountability trail.
- **Meetings and client calls:** purpose/agenda and manually recorded work call outcomes.
- **HR Command:** account provisioning, activation, suspension, employee directory and audit history.
- **Workload & reports:** delivery tracking, estimated capacity, overdue assignments and HR follow-ups for three unexplained missed scheduled shifts. Never auto-punishes approved school/exam leave.
- **Confidential concerns:** restricted employee reports, including Founder-only submissions.
- **Documents:** official HTTPS link register and announcements.
- **Exit requests:** handover plans and HR review.
- **Emergency coverage:** adult-only proposed roster with ₹500+ allowance and the assigned adult's explicit accept/decline response. This is not an automatic payroll system.

## Not included yet

No covert device monitoring, keystroke tracking, reading personal WhatsApp, automatic call interception, genuine AI analysis, automatic payroll transfer or actual WhatsApp/email push-notification integration. Current notifications are internal, with human-reviewed rule-based flags. Other important production work remains: legal/HR review for minors, formal parental/guardian and privacy requirements where applicable, backups, data retention, accessibility, security penetration testing, recovery policy, account-owner 2FA, and production browser integration testing.

## Deployment and development

Source files: `worker.js`, `app.html`, `schema.sql`, `build.mjs`, `test.mjs`.

Use `node build.mjs` to create `dist/index.mjs`, the ES module Worker. The Cloudflare Worker binds its D1 database as `DB` (database name **`tel-os-main`**). Configure the `SETUP_CODE` Secret through Cloudflare for first-time setup. Do not place credentials in version control. The deployed Worker uses Cloudflare's Workers runtime and D1 prepared statements. For future releases, test on a staging Worker and apply versioned D1 migrations first.

Run `node test.mjs` locally for representative mock-D1 checks (Node 22 with built-in `node:sqlite`). The test uses fictional accounts and in-memory SQLite, not actual employee information.

**Safety:** TEL is student-run. Work sessions, required breaks, weekly rest, schedule boundaries and any engagement of employees under 18 require local legal review. Do not assume a four-hour target automatically satisfies labour law. Employment decisions and leave disputes must be reviewed by people rather than AI or unattended automation.