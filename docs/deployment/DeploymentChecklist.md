# BulsuScholar Production Finalization

Use this checklist for the final production pass. Complete the sections in order.
Do not put Supabase service keys, Brevo keys, SMTP credentials, database URLs, or
provider tokens in Git, Vercel browser variables, screenshots, or chat.

## Verified Baseline - 2026-09-15

- `https://bulsuscholar.com` serves the current Vercel frontend.
- The deployed frontend bundle uses `https://api.bulsuscholar.com` and contains no
  Render or old Vercel production fallback.
- `www.bulsuscholar.com` and the old Vercel hostname redirect permanently to the
  apex domain.
- Railway `/health` and `/deployment/health` return `status: ok`.
- Railway reaches Supabase and all 16 deployment table checks pass.
- Railway reports Brevo configured with `no-reply@bulsuscholar.com` and the support
  reply-to address.
- Brevo code, both DKIM records, and DMARC resolve publicly.
- The production academic cycle is `2026-2027`, `1ST` semester.
- The lifecycle migrations through
  `20260915153000_fix_archive_notification_ids.sql` are applied.

Still pending:

- Verify the new Brevo sender in the Brevo Senders page.
- Save and test Supabase Custom SMTP through Brevo.
- Install the final Confirm Signup and Reset Password templates.
- Finish Cloudflare Email Routing for `support@bulsuscholar.com`; no public MX
  record currently resolves.
- Remove the broad Railway CORS regex. It currently resolves as
  `https://.*\.com` and must be empty.
- Configure `ROOT_DATABASE_URL` with a restricted Supabase pooler role if the root
  SQL Console is required for launch.
- Commit and deploy the local semantic-button and email-template changes.

## 1. Brevo Sender

In Brevo, open **Settings -> Senders, Domains & Dedicated IPs -> Senders**.

Required sender:

```txt
Name: BulsuScholar
Email: no-reply@bulsuscholar.com
```

Confirm that the sender is verified and uses the authenticated
`bulsuscholar.com` domain. Keep the Gmail sender only until production tests pass.
Then remove it so new messages cannot accidentally use the free-mail identity.

In Brevo transactional settings, disable click/link rewriting for authentication
messages. Supabase confirmation and recovery URLs must arrive unchanged.

## 2. Supabase Custom SMTP

In **Supabase -> Authentication -> SMTP Settings**, enable Custom SMTP:

```txt
Sender name: BulsuScholar
Sender email: no-reply@bulsuscholar.com
Host: smtp-relay.brevo.com
Port: 587
Username: <Brevo SMTP login>
Password: <Brevo SMTP key, not the API key>
```

The Brevo API key remains in Railway. The Brevo SMTP key belongs only in
Supabase Auth.

In **Authentication -> Providers -> Email**:

- Keep email/password signup enabled.
- Require email confirmation.
- Do not enable automatic confirmation.

In **Authentication -> URL Configuration**:

```txt
Site URL: https://bulsuscholar.com

Redirect URLs:
https://bulsuscholar.com/*
https://bulsuscholar.com/confirm-email
https://bulsuscholar.com/reset-password
```

## 3. Authentication Email Templates

Install both templates from `docs/email/SupabaseEmailTemplates.md` under
**Supabase -> Authentication -> Email Templates**.

```txt
Confirm Signup subject: Confirm your BulsuScholar account
Reset Password subject: Reset your BulsuScholar password
```

Keep every `{{ .ConfirmationURL }}` and `{{ .Email }}` variable exactly as
written. Save each template separately.

## 4. Cloudflare Support Mail

In **Cloudflare -> bulsuscholar.com -> Email -> Email Routing**:

1. Enable Email Routing.
2. Add and verify the existing Gmail inbox as a destination.
3. Create the route `support@bulsuscholar.com` to that verified Gmail address.
4. Allow Cloudflare to add its required MX and sender-policy DNS records.
5. Confirm the Email Routing dashboard reports the route as active.
6. Send a message from a different mailbox to `support@bulsuscholar.com` and
   confirm it arrives in Gmail.

Do not replace Brevo DKIM or DMARC records while enabling routing.

## 5. Railway Variables

Required production values:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
EMAIL_PROVIDER=brevo
BREVO_API_KEY=
BREVO_SENDER_NAME=BulsuScholar
BREVO_SENDER_EMAIL=no-reply@bulsuscholar.com
BREVO_REPLY_TO_EMAIL=support@bulsuscholar.com
FRONTEND_URL=https://bulsuscholar.com
DOCUMENT_SCAN_ALLOWED_ORIGINS=https://bulsuscholar.com
DOCUMENT_SCAN_ALLOWED_ORIGIN_REGEX=
ENFORCE_PORTAL_ACTOR_HEADERS=true
ENABLE_SCHOLARSHIP_CHOICE=true
WEB_CONCURRENCY=1
UVICORN_KEEP_ALIVE=30
ROOT_SESSION_SECRET=
ROOT_DATABASE_URL=
OPENAI_API_KEY=
OPENAI_HELP_MODEL=gpt-5-mini
```

Delete `DOCUMENT_SCAN_ALLOWED_ORIGIN_REGEX` or set it to an empty value. Do not
use `https://.*\.com`; that permits unrelated `.com` sites to pass the regex.

`ROOT_DATABASE_URL` must be the Supabase session-pooler URL for a dedicated,
least-privilege diagnostics role. Do not use the service-role key or expose the
database URL to Vercel. Until configured, the root SQL Console remains unavailable.

Railway runtime:

- Repository root uses the root `Dockerfile`.
- Build and Start commands remain empty.
- Health-check path is `/health`.
- Use one replica initially.
- Do not define `PORT`; Railway injects it.

## 6. Vercel Variables

Required Production and Preview values:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SUPABASE_STORAGE_BUCKET=bulsuscholar
VITE_APP_URL=https://bulsuscholar.com
VITE_PUBLIC_SITE_URL=https://bulsuscholar.com
VITE_BACKEND_API_URL=https://api.bulsuscholar.com
VITE_DOCUMENT_SCAN_API_URL=https://api.bulsuscholar.com
VITE_PASSWORD_SECRET=
VITE_PASSWORD_LEGACY_SECRETS=
VITE_ENABLE_SCHOLARSHIP_CHOICE=true
```

Do not add Brevo, SMTP, Supabase service-role, root-session, database, Railway, or
Vercel provider secrets to a `VITE_*` variable.

## 7. Final Deployment Order

1. Finish Brevo sender, Supabase SMTP/templates, Cloudflare routing, and Railway
   variable corrections.
2. Run all local verification commands.
3. Review the Git diff and ensure no generated files or secrets are staged.
4. Commit the semantic-button and final email-template changes to `main`.
5. Push `main`.
6. Wait for Railway first; verify backend health and OpenAPI.
7. Wait for Vercel; verify the apex domain serves the new asset bundle.
8. Run authenticated browser workflows only after both deployments are current.
9. Test maintenance mode last, then immediately turn it off.

Local verification:

```powershell
python -m compileall backend -q
python -m unittest discover -s backend/tests -p "test_*.py"
node scripts/test-scholarship-choice-policy.mjs
node scripts/test-grantor-reapplication-policy.mjs
npm.cmd run lint
npm.cmd run build
```

Production verification:

```txt
https://api.bulsuscholar.com/health
https://api.bulsuscholar.com/deployment/health
https://api.bulsuscholar.com/email/health
https://api.bulsuscholar.com/config/public
https://api.bulsuscholar.com/openapi.json
```

Expected:

- Health and deployment status are `ok`.
- No required tables fail.
- Frontend URL is `https://bulsuscholar.com`.
- Brevo is configured with sender and reply-to values present.
- CORS contains only the intended production/local development origins.
- OpenAPI includes notification inbox routes and the latest lifecycle workflows.
- OpenAPI does not expose a generic unauthenticated `/email/send` route.

## 8. Authentication Tests

Use a new email address that has never registered before.

1. Create a student account and accept the Terms and Conditions.
2. Confirm the account cannot enter the dashboard before email verification.
3. Verify the Confirm Signup email appears in Brevo Transactional Logs.
4. Check sender name, sender address, layout, mobile rendering, and spam placement.
5. Confirm the button opens `https://bulsuscholar.com/confirm-email`.
6. Confirm the pending student is promoted after verification.
7. Request a password reset.
8. Verify the reset email and its button open
   `https://bulsuscholar.com/reset-password`.
9. Confirm an invalid, expired, or reused link fails clearly.

## 9. Portal Workflow Tests

Student:

- Signup, confirmation, login, profile upload/replacement, shared COR/ROG/ID/profile
  detection, multiple pending applications, withdrawal, invitations, materials,
  SOE/default/custom form downloads, tracking through completion, and inbox actions.
- Confirm application-specific Other Requirements do not leak across scholarships.

Grantor:

- Inbox list/read/delete, announcement creation, active-scholarship republishing,
  slot addition, applicant document visibility, admin-decision confirmation, Invite
  Back, and archived-account restrictions.

Admin:

- Inbox list/read/delete, student/grantor/application review, material review,
  preserved archived-grantor scholars, grantor archive/restore, and all six report
  previews plus PDF/CSV downloads.

Root:

- Fixed-password and permanent-code login, Overview, Health, Data Explorer, files,
  reports, administrators, support, logs, settings, branding, integration status,
  session logout, and SQL presets when `ROOT_DATABASE_URL` is configured.

Lifecycle cases:

- Rejected applications reapply only after the same-grantor cooldown.
- Manual archives remain invitation-only.
- Archived grantor scholars choose Keep or Change without losing the original slot.
- Replacement commitment releases the original slot exactly once.
- Restoring a grantor follows the stored archive-choice behavior.
- Grantor confirmation advances the stored tracking step without stranding stage 6.

## 10. Reports and Interface

- Central reports start unfiltered and filter inside the preview.
- Section reports inherit the section's active tab/search/filter state.
- Previewed PDF and downloaded PDF are the same blob.
- PDF and CSV contain the same canonical rows and columns.
- Export every matching row, not only the visible page.
- Verify semantic buttons in light/dark mode and desktop/mobile layouts:
  positive green, destructive/cancel red, and neutral gray/light-outline.
- Verify loading overlay, toasts, nested modals, backdrop dismissal, and discard
  confirmation layering.
- Confirm there are no browser console errors or failed production network requests.

## 11. Release Decision

The release is ready only when:

- Supabase confirmation and reset emails are delivered through Brevo.
- `support@bulsuscholar.com` receives forwarded mail.
- Railway CORS is restricted and every health endpoint passes.
- Root SQL works, or the SQL Console is explicitly excluded from launch scope.
- All local checks pass with zero errors.
- Student, grantor, admin, and root smoke tests pass.
- Browser traffic uses only the apex domain, custom API, Supabase, and required Brevo
  delivery infrastructure.
- Maintenance mode is off and student signup is set to the intended release state.
