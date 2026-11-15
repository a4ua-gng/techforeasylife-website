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
