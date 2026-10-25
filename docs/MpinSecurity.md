# Optional MPIN and Role-Based Downloads

## Behavior

- Login remains User ID and password. Existing email verification and Root login codes remain in place.
- MPIN is optional and OFF by default. Enable, change, disable and recovery controls are in Student Profile, Grantor Profile, Admin Profile and Root's Cycle & Settings.
- Students always receive fresh 24-character mixed file passwords for sensitive downloads. When MPIN is ON, verify the six-digit MPIN first, then save the separate file password.
- Student application submissions, withdrawal and acceptance of waitlist offers require MPIN when ON.
- Authorized staff student-document previews/downloads have no MPIN or added encryption. Original files that were already encrypted remain encrypted.
- Staff reports/file inventories require MPIN when ON but receive no added file encryption.
- Grantor announcement creation/continuation and application approvals require MPIN when ON. Existing resource ownership and role restrictions are unchanged.

## Security

The API, not the browser switch, decides whether MPIN is required. Salted PBKDF2-HMAC-SHA256 (600,000 iterations) hashes use a server-side pepper derived from `PORTAL_EMAIL_CODE_SECRET`. MPINs, recovery codes and file passwords are not stored in plaintext or logged. Keep this secret stable; rotating it requires users to reset their MPINs through verified recovery.

Action proofs expire after two minutes and are consumed once. They are bound to actor, session, route, operation digest and MPIN generation. Settings changes invalidate older proofs. Versioned state writes prevent concurrent requests from overwriting attempt counters. Five failed MPIN attempts lock MPIN operations for 15 minutes, independently of login lockout.

Setup/recovery uses registered-email verification: 10-minute validity, five attempts, 60-second resend cooldown and five sends/hour. Root instead re-verifies its existing 10-digit code without creating another Root session. Codes are bound to the current session and consumed on setup/reset.

Append-only MPIN security events appear in Root Logs & Audit. Download records identify `authorized-original` for staff instead of falsely claiming encryption. CSV formula escaping, signed originals and preview-approval separation remain intact.

MPIN is an optional action-confirmation control, not a replacement for login or a claim of phishing-resistant MFA. Staff plaintext download copies must be handled carefully. Preview access cannot prevent screenshots or extraction by an authorized viewer.

## Deployment

1. Apply `supabase/migrations/20261025040250_optional_mpin_role_download_policy.sql` after the existing protected-download audit migration.
2. Confirm the three new tables have RLS and no browser grants, and only `service_role` can execute `mpin_transaction`.
3. Verify Railway has a stable `PORTAL_EMAIL_CODE_SECRET` of at least 32 characters and working Brevo configuration. Never place this secret in frontend variables.
4. Deploy backend and frontend in a controlled release window. Old student clients generating 32-character download passwords must refresh to the new frontend.
5. Test with controlled Student, Grantor, reviewer, Full Admin and Root accounts. Verify email delivery, setup/recovery, ON/OFF behaviors and staff download permissions.
6. Run live Supabase advisors and authenticated staging tests before treating this change as production verified. No production migration or real email delivery was performed during local implementation.

## Local Evidence

- Backend: `py -3.12 -m unittest discover -s backend/tests -q`.
- Frontend: `npm run test:frontend`, `node --experimental-vm-modules scripts/test-romel-frontend.mjs`, `npm run lint`, `npm run build`.
- SQL: `node scripts/test-mpin-migration.mjs <path-to-pglite-dist/index.js>` uses isolated PostgreSQL/PGlite; it is not a live Supabase test.
- UI: start Vite on port 5175, then run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-mpin-browser.ps1`.
- Browser fixture transport and identities are synthetic. Actual UI components and request orchestration are exercised, but these checks do not prove deployed permission settings or email delivery.
