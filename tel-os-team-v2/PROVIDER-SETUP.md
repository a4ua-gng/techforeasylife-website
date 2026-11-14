# Connection setup

The app and backend are deployed at https://tel-os-team-v2.xtremedivyangshu.workers.dev. Provider keys are configured in Cloudflare Dashboard → Workers & Pages → tel-os-team-v2 → Settings → Variables and Secrets. Enter secrets there, never in GitHub or chat.

## Google

Create a Google Cloud web OAuth client. Register exactly:

`https://tel-os-team-v2.xtremedivyangshu.workers.dev/api/connections/google/callback`

Configure the consent screen and intended staff access. Required scopes are `openid email` only. Add secrets `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. No inbox access is requested and no Google access token is kept. Each staff member must connect their own account; TEL's existing connected Gmail cannot verify other people's accounts.

## WhatsApp Business

Use an authorised WhatsApp Business Cloud API account. Add `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME`, and `WHATSAPP_MEETING_TEMPLATE_NAME`. The authentication template sends a six-digit verification code; the meeting template uses three body parameters: meeting title, IST date/time, and meeting link. Both templates must be approved for the configured language `en_US`. `WHATSAPP_API_VERSION` optionally overrides v23.0.

The supplied employee PDF contained no phone numbers. Each member enters an international number and verifies it with the code actually received in WhatsApp. A Business API token is separate from a personal WhatsApp login.

## Turn on required connections

After validating both providers with real company accounts, open My connections as a founder and choose Require verified connections before work. Other members are then restricted to connection onboarding until both accounts are verified. Founders retain setup access, and receive in-app connection/disconnection alerts. Provider configuration alone does not verify individual accounts.

## Meeting notifications

TEL's connected Gmail meeting job is enabled and checks hourly. A delivery test reached TEL Gmail. It reads only the meeting outbox and sends individual meeting invitations/reminders; it does not read the inbox or send attendance reminders. Hourly polling means emails can be delayed. The app records delivery status and does not report an unconfirmed send as sent.

WhatsApp sends run through the five-minute Worker job once configured. API acceptance is recorded as accepted; this is not a read receipt. Disconnected accounts are skipped. Check a meeting's Notification delivery dialog for pending, blocked and review states.


## Existing website publishing credential

Live verification found that tel-website-admin-api's existing GitHub credential is rejected with401 Bad credentials. Public Team reading can continue from the public repository, but publishing stays blocked. Renew a scoped GitHub credential for a4ua-gng/techforeasylife-website with repository Contents read/write, then set the GITHUB_TOKEN secret on the **tel-website-admin-api** Worker. Use the normal name without a leading space; the new name takes precedence over the legacy misnamed secret. Keep the repository's branch protection and approval requirements in place. Never paste the token into chat. Refresh the Team editor and test a deliberate authorised update after renewal.
