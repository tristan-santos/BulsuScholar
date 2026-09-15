# BulsuScholar Deployment Checklist

Use this after every Vercel or Railway redeploy.

## 1. Vercel Environment Variables

Required frontend variables:

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
```

Expected:
- Frontend calls Railway, not localhost.
- Supabase login/signup can initialize.
- Existing grantor/admin encrypted passwords can still be checked.

## 2. Railway Environment Variables

Required backend variables:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
EMAIL_PROVIDER=brevo
BREVO_API_KEY=
BREVO_SENDER_NAME=BulsuScholar
BREVO_SENDER_EMAIL=no-reply@bulsuscholar.com
BREVO_REPLY_TO_EMAIL=support@bulsuscholar.com
DOCUMENT_SCAN_ALLOWED_ORIGINS=https://bulsuscholar.com
DOCUMENT_SCAN_ALLOWED_ORIGIN_REGEX=
FRONTEND_URL=https://bulsuscholar.com
ENFORCE_PORTAL_ACTOR_HEADERS=true
ENABLE_SCHOLARSHIP_CHOICE=true
WEB_CONCURRENCY=1
UVICORN_KEEP_ALIVE=30
OPENAI_API_KEY=
OPENAI_HELP_MODEL=gpt-5-mini
```

Expected:
- Backend can write to Supabase using the service role key.
- The canonical production frontend passes CORS.
- Email health reports Brevo as configured while authentication mail is delivered by Supabase SMTP.

Railway runtime:
- Connect the repository root and use the root `Dockerfile`.
- Keep the Railway build and start commands empty so the Dockerfile command is used.
- Use one replica in the Singapore/Southeast Asia region.
- Set the deployment health-check path to `/health` and restart policy to `ON_FAILURE`.
- Do not set `PORT`; Railway injects it at runtime.
- The Dockerfile installs `tesseract-ocr` for PNG/JPG OCR and `poppler-utils` for scanned PDF fallback.

Expected:
- Image uploads for application forms do not fail with `tesseract is not installed or it's not in your PATH`.
- PDF scans still work through `pdfplumber`.

## 3. Supabase SQL

Run these in Supabase SQL Editor, in order:

```txt
supabase/schema.sql
supabase/relational-migration.sql
supabase/security-hardening.sql
supabase/migrations/20260915133000_preserve_archived_grantor_scholars.sql
supabase/migrations/20260915150000_roster_confirmation_and_grantor_decisions.sql
supabase/migrations/20260915151000_database_advisor_cleanup.sql
supabase/migrations/20260915152000_allow_authoritative_roster_transitions.sql
supabase/migrations/20260915153000_fix_archive_notification_ids.sql
```

For an existing production database, apply only migrations that are not already recorded as applied. Do not rerun the base schema files over production data.

Required tables:
- `students`
- `pending_students`
- `providers`
- `admins`
- `grantor_portals`
- `grantor_portal_scholars`
- `grantor_portal_applications`
- `grantor_portal_announcements`
- `scholarship_applications`
- `soe_requests`
- `soe_downloads`
- `student_warnings`
- `studentNotifications`
- `grantorNotifications`
- `student_document_usage`
- `systemLogs`

Expected:
- No `PGRST205` table/schema-cache errors.
- `studentNotifications` and `grantorNotifications` can be read by the frontend.
- `student_document_usage` blocks reused COR documents.

## 4. Supabase Auth URLs

Set in Supabase Dashboard:

```txt
Site URL: https://bulsuscholar.com
Redirect URLs:
https://bulsuscholar.com/confirm-email
https://bulsuscholar.com/reset-password
```

Expected:
- Confirm account email redirects to the deployed site.
- Forgot password email redirects to the deployed site.

## 5. Backend Health

Open:

```txt
https://api.bulsuscholar.com/
https://api.bulsuscholar.com/health
https://api.bulsuscholar.com/deployment/health
https://api.bulsuscholar.com/email/health
```

Expected:
- `/` shows backend information, not plain `Not Found`.
- `/health` shows Supabase server config is present.
- `/deployment/health` status is `ok`.
- `/deployment/health` has no missing tables.
- `/email/health` shows Brevo is configured.

## 6. Document Scan

From the deployed Vercel frontend:
- Upload COR PDF.
- Confirm COR fields are detected.
- Upload COG PDF after COR.
- Confirm COG identity check passes when name/student number match.
- Confirm GWA autofills.
- Confirm COG final grade debug logs show collected final grades.

Expected:
- Browser does not show CORS errors.
- Requests go to `https://api.bulsuscholar.com/scan-document`.

## 7. Student Signup

Test:
- New student ID.
- New email.
- New CP number starting with `09`.
- COR PDF not reused.
- COG PDF valid when required.
- Terms accepted.

Expected:
- Supabase Auth account is created.
- Student row is created in `students`.
- Document usage row is created in `student_document_usage`.
- Student receives an inbox notification.
- Admin receives a system notification/log.

## 8. Grantor Workflows

Test:
- Create announcement.
- Archive announcement.
- Unarchive announcement.
- Add scholar roster.
- Duplicate roster warning.
- Review application.
- Complete current stage.
- Reject application.

Expected:
- Backend workflow endpoints return `ok: true`.
- Grantor inbox receives relevant notifications.
- Student inbox receives archive/unarchive/rejection/stage notifications.

## 9. Student Scholarship Flow

Test:
- Student matched from grantor roster sees the scholarship.
- Student applies from announcement.
- Student cannot apply to another grantor while one active application exists.
- Archived/frozen application blocks next steps and SOE.
- Unarchived application restores access.

Expected:
- Scholarship control center reflects the correct grantor/application.
- Inbox number changes dynamically.
- Mark all as read works.

## 10. Reports

Test:
- Admin student management report preview.
- Pagination in report modal.
- Export PDF.
- Export Excel.

Expected:
- Preview data matches the current filtered table.
- PDF uses the BulSU template without `Content Starts Here`.
- PDF column is `Grantor`, not `Current Stage`.
- Excel downloads all filtered rows.

## 11. Common Production Errors

`CORS policy`
- Check Railway `DOCUMENT_SCAN_ALLOWED_ORIGINS`.
- Check Railway `DOCUMENT_SCAN_ALLOWED_ORIGIN_REGEX`.
- Redeploy Railway.

`missing_supabase_server_config`
- Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Railway.
- Redeploy Railway.

`PGRST205`
- Run missing Supabase SQL.
- Run `notify pgrst, 'reload schema';`
- Wait a few seconds, then test again.

`Password decryption failed`
- Add the same `VITE_PASSWORD_SECRET` used locally to Vercel.
- If old accounts used another key, add it to `VITE_PASSWORD_LEGACY_SECRETS`.

`Backend is unavailable`
- Check the Railway deployment and service logs.
- Open `/deployment/health`.
- Confirm Vercel `VITE_BACKEND_API_URL`.

## Priority 2-4 Production Pass

1. Run `supabase/priority-two-four.sql` once in the Supabase SQL Editor. It is idempotent and may be rerun after schema changes.
2. Confirm Vercel has `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_STORAGE_BUCKET`, `VITE_BACKEND_API_URL`, `VITE_DOCUMENT_SCAN_API_URL`, `VITE_APP_URL`, and `VITE_PUBLIC_SITE_URL`.
3. Confirm Railway has `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_URL`, `DOCUMENT_SCAN_ALLOWED_ORIGINS`, `ENFORCE_PORTAL_ACTOR_HEADERS=true`, email settings, and optional OpenAI settings.
4. Keep `WEB_CONCURRENCY=1` until workflow concurrency has been load-tested. Raise it only when the hosting memory limit and Supabase connection usage are known.
5. In Supabase Auth, set the site URL to `https://bulsuscholar.com` and allow its `/confirm-email` and `/reset-password` routes. Keep the Vercel aliases in the redirect allow-list for deployment diagnostics.
6. Confirm the `bulsuscholar` bucket policies permit authenticated uploads and the application-required preview/download reads. Match the application limit of 10 MB and the supported PDF/image/spreadsheet MIME types.
7. Run `npm run verify:deployment` from a shell containing the production environment values. This checks backend health routes and production CORS without writing data or sending email.
8. Manually test one student, one grantor, and one admin session. Verify own-record isolation, grantor ownership filtering, audit logs, and inbox delivery.

### Access Compatibility Note

Student requests include their Supabase bearer token. Existing legacy admin and grantor accounts still use signed-in portal identity headers until those accounts are fully migrated to Supabase Auth. `ENFORCE_PORTAL_ACTOR_HEADERS=true` rejects missing or mismatched role/owner identity, but the final security target is Supabase Auth for every role plus database RLS policies.
