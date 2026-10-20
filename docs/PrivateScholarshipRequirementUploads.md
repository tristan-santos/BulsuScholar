# Private Scholarship Requirement Uploads

## Deployment

1. Apply `supabase/migrations/20261020120000_private_scholarship_requirement_uploads.sql`.
2. Deploy the Railway backend.
3. Deploy the frontend, then reload the student session.

Do not run the legacy `storage-policies.sql` to fix this error. The browser now
uploads through the authenticated backend; student documents stay private.
Only `service_role` may execute the new append function.

## Behavior

- Uploads are bound to the signed-in student's saved scholarship application.
- Requirement type and count come from the application's grantor requirements,
  not client-supplied configuration. PDF/PNG content is checked, with a 10 MB
  per-file limit.
- All files in a batch are validated before Storage writes.
- A database transaction locks the application, checks its current lifecycle and
  remaining slots, appends references, runs the existing document/tracking
  workflow, and writes an audit event. Existing uploads are preserved.
- Confirmed transaction failures clean up newly uploaded objects. On an unknown
  commit outcome such as a timeout, objects are retained to avoid deleting files
  that may already be referenced. Refresh the application before retrying.
- Private previews and downloads authorize the owning student, assigned grantor,
  or administrator with student/scholarship/requirements permissions.

## Verification

- Backend tests: `py -3.12 -m unittest discover -s backend/tests -q`.
- Frontend: `npm run lint`, `npm run build`, `npm run test:frontend`.
- Isolated SQL execution: `scripts/test-private-requirement-rpc.mjs` accepts an
  installed PGlite module path. It never connects to production.
- Browser fixture: `/scripts/scholarship-requirement-fixture.html` on the local
  Vite server. It mocks every external request and contains no credentials.

The reported `/portal/data/query` 403 errors are separate authorization failures.
The inspected production student account is active, but the browser log does not
include the rejected query or response detail. If these persist after deployment
and signing in again, inspect that request's Payload (`table`) and Response
(`detail`) in DevTools. Do not remove authorization or reopen database/storage
grants to suppress a 403.
