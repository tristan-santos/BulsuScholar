# Security cutover status (2026-09-22)

## Current live state

- On September 23, 2026, the public configuration reported that Maintenance Mode was **disabled** and student signup was enabled.
- Direct `anon` and `authenticated` table privileges remain revoked, and the `bulsuscholar` Storage bucket remains private.
- The backend exposes the new pending-account endpoints, but migrations `20260922170000` and `20260922180000` are not in production migration history. Production email confirmation still activates a student immediately, and `approve_pending_student_account` does not exist in production.
- Keep this deployment mismatch in mind when diagnosing portal errors. Do not restore broad browser table privileges to make a page work.

## Production containment already performed

- Maintenance Mode was enabled during the security containment operation, but has since been disabled.
- Direct `anon` and `authenticated` privileges were revoked from all existing `public` tables. An anonymous REST read of `students` returned HTTP 401 afterward.
- The four permissive `BulsuScholar storage ...` object policies were removed and the `bulsuscholar` bucket is private. Anonymous users cannot read or write bucket objects.
- The public maintenance message was corrected from the obsolete data-reset wording to: "BulsuScholar is temporarily unavailable while access controls are being updated."
- A local Storage backup was made before the bucket change: 48 objects, 16,670,365 bytes, with a SHA-256 manifest in `C:\Users\santo\BulsuScholar-storage-backup-20260922-175157`.
- A recoverable **database** backup and nonproduction restore were not independently verified here. Confirm them in the Supabase dashboard before applying additional production migrations.

Do not turn off Maintenance Mode or re-run the old permissive `supabase/security-hardening.sql`. A database backup does not include Storage file contents. Keep the backup outside the repository and restrict access to it because it contains student documents.

## Prepared locally, not deployed

- `20260922170000_revoke_unsafe_direct_access.sql` records the emergency privilege and Storage-policy cutover for other environments.
- `20260922180000_require_manual_student_account_approval.sql` changes email confirmation to keep students pending and adds a service-role approval transition with a restricted decision log.
- Backend login and session checks reject pending students. A full-admin-only pending-account list and approval endpoint are present. The confirmation page now tells students to wait for approval.
- Backend unit tests, frontend lint, and frontend production build passed locally. These do not validate the new SQL on staging.

## Gates before reopening

1. Verify a database restore point and test the migrations on a staging copy. Do not apply the manual-approval migration to production before staging transaction and role tests.
2. Replace the frontend's generic direct-table CRUD and direct Storage upload/download paths with backend routes that enforce role, ownership, and record lifecycle. The current security cutover deliberately makes those paths fail. Do not restore broad client grants as a shortcut.
3. Complete manual rejection cleanup, Welcome/Rejected email retry handling, document-review separation, and the Pending tab in Student Management.
4. Complete roster conflict resolution, grantor scope, atomic FIFO waitlist, student OTP with pre-token gating, lost-email recovery, and signed SOE. None of these are safe to claim complete yet.
5. Run anonymous and each-role authorization tests, SQL transaction tests, backend tests, frontend lint/build, and browser smoke tests against the matched frontend/backend/database release.
6. Verify service-role access still works, direct anonymous data and Storage access remains denied, and only then disable Maintenance Mode from the root portal.

Do not run `npm run tapos` until the release is approved: that command commits and pushes all staged work.

## Deferred whole-system validation checkpoint

Run this complete checkpoint only after the frontend, backend, and database migrations are deployed as one matched staging release:

1. Verify anonymous users cannot read or alter private tables, call privileged RPCs, subscribe to private Realtime changes, or access private Storage objects.
2. Test student signup, email confirmation, pending login denial, full-admin approval, rejection cleanup, Welcome/Rejected email delivery status, and clean signup restart.
3. Test active and archived student, grantor, reviewer, full-admin, and root login/session boundaries, including failed-login lockout and recovery.
4. Test zero, one, and multiple roster matches; roster conflict resolution; authoritative assignment; archival; withdrawal cooldown; and preservation of ordinary applications.
5. Test required-document modes and exceptions, correction/resubmission, review decisions, tracking pause/resume, roster completion, and signed-SOE Step 10/Finish Step 11.
6. Test location scope and grantor classification, waitlist capacity/FIFO offers/expiry, slot concurrency, and one final scholarship commitment.
7. Test inbox, support conversations, lost-email recovery, announcements, reports, file upload/download/preview/delete, Realtime refresh, and light/dark responsive UI.
8. Run SQL transaction/security tests, backend tests and compilation, frontend lint/build, and authenticated browser checks for every role before disabling Maintenance Mode.
