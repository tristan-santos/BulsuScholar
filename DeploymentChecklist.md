# BulsuScholar Deployment Checklist

Use this after every Vercel or Render redeploy.

## 1. Vercel Environment Variables

Required frontend variables:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SUPABASE_STORAGE_BUCKET=bulsuscholar
VITE_APP_URL=https://bulsu-scholar.vercel.app
VITE_PUBLIC_SITE_URL=https://bulsu-scholar.vercel.app
VITE_BACKEND_API_URL=https://bulsuscholar.onrender.com
VITE_DOCUMENT_SCAN_API_URL=https://bulsuscholar.onrender.com
VITE_RESEND_API_ENDPOINT=https://bulsuscholar.onrender.com/email/send
VITE_PASSWORD_SECRET=
VITE_PASSWORD_LEGACY_SECRETS=
```

Expected:
- Frontend calls Render, not localhost.
- Supabase login/signup can initialize.
- Existing grantor/admin encrypted passwords can still be checked.

## 2. Render Environment Variables

Required backend variables:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
RESEND_FROM_EMAIL=BulsuScholar <onboarding@resend.dev>
DOCUMENT_SCAN_ALLOWED_ORIGINS=https://bulsu-scholar.vercel.app
DOCUMENT_SCAN_ALLOWED_ORIGIN_REGEX=https://.*\.vercel\.app
FRONTEND_URL=https://bulsu-scholar.vercel.app
```

Use `BulsuScholar <onboarding@resend.dev>` only for testing. For production, verify your domain in Resend first, then change this to something like `BulsuScholar <noreply@your-verified-domain.com>`.

Expected:
- Backend can write to Supabase using the service role key.
- Vercel production and preview deployments pass CORS.
- Email endpoint can use Resend.

## 3. Supabase SQL

Run these in Supabase SQL Editor, in order:

```txt
supabase/schema.sql
supabase/relational-migration.sql
supabase/security-hardening.sql
```

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
Site URL: https://bulsu-scholar.vercel.app
Redirect URLs:
https://bulsu-scholar.vercel.app/confirm-email
https://bulsu-scholar.vercel.app/reset-password
```

Expected:
- Confirm account email redirects to the deployed site.
- Forgot password email redirects to the deployed site.

## 5. Backend Health

Open:

```txt
https://bulsuscholar.onrender.com/
https://bulsuscholar.onrender.com/health
https://bulsuscholar.onrender.com/deployment/health
https://bulsuscholar.onrender.com/email/health
```

Expected:
- `/` shows backend information, not plain `Not Found`.
- `/health` shows Supabase server config is present.
- `/deployment/health` status is `ok`.
- `/deployment/health` has no missing tables.
- `/email/health` shows Resend is configured.

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
- Requests go to `https://bulsuscholar.onrender.com/scan-document`.

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
- Check Render `DOCUMENT_SCAN_ALLOWED_ORIGINS`.
- Check Render `DOCUMENT_SCAN_ALLOWED_ORIGIN_REGEX`.
- Redeploy Render.

`missing_supabase_server_config`
- Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Render.
- Redeploy Render.

`PGRST205`
- Run missing Supabase SQL.
- Run `notify pgrst, 'reload schema';`
- Wait a few seconds, then test again.

`Password decryption failed`
- Add the same `VITE_PASSWORD_SECRET` used locally to Vercel.
- If old accounts used another key, add it to `VITE_PASSWORD_LEGACY_SECRETS`.

`Backend is unavailable`
- Check Render is awake and deployed.
- Open `/deployment/health`.
- Confirm Vercel `VITE_BACKEND_API_URL`.
