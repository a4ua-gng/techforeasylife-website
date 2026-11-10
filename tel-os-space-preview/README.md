# TEL OS · Monochrome Mission Control (v0.2)

A black-and-white, space-inspired interactive preview of TEL's student workforce OS.

**Live preview:** https://tel-os-space-preview.xtremedivyangshu.workers.dev/

## Implemented in the interactive demo

- Role switching between Founder, HR, Team Leader and Employee
- Attendance: clock in, pause, resume, clock out, and correction requests
- Task creation, assignments, deliverable review and client work tracking
- Crew presence and work-call register
- Student leave and HR approval
- Shared 14-day availability calendar, examination commitments, published shifts
- Assignment handovers and manager review
- Rule-based notification centre
- Draft document and SOP catalogue
- Workload planning and departmental reports
- Example grievance and employee exit workflows

## Real use restrictions

This is a **fictional local-storage preview**, not a secure employee-management deployment. There are no real logins, remote data synchronization, confidential grievance storage, WhatsApp integrations, payroll calculations or AI monitoring. Do not enter real student profiles, private employee records, passwords, client assets or secrets.

For production, implement server-side authentication and role permissions, proper access audits and logging, secure D1 storage, protected employee information, explicit monitoring disclosures, manager approvals, scheduled rest periods and student-employment legal review. School and examination commitments must be respected. No background surveillance.

## Architecture

This branch contains the standalone design preview. It is hosted as a Cloudflare Worker separate from TEL's public website. The original production homepage is unchanged.
