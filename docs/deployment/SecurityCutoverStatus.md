# Security cutover status (2026-09-22)

## Production containment already performed

- Maintenance Mode is enabled in the production `portal` configuration.
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
