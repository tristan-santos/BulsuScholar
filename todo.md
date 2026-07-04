# Supabase Transfer TODO

## 1. Verify Current Supabase Setup

Run these commands:

```powershell
npm.cmd run verify:supabase
npm.cmd run verify:auth
npm.cmd run build
```

Expected:

- Supabase tables are reachable.
- Database write/read/delete test passes.
- Storage upload/delete test passes.
- Build passes.

## 2. Create Admin Account With SQL

Run the SQL in:

```text
supabase/create-admin.sql
```

Paste it into:

```text
Supabase Dashboard -> SQL Editor
```

Then login with:

```text
User ID: admin_01
Password: Admin@123
```

After running the SQL, verify:

```powershell
npm.cmd run verify:auth
```

Expected:

```text
admins: reachable (1 rows)
```

## 3. Enable Email Confirmation

Go to:

```text
Supabase Dashboard -> Authentication -> Providers -> Email
```

Turn on:

```text
Confirm email
```

Save the setting.

## 4. Configure Auth Redirect URLs

Go to:

```text
Supabase Dashboard -> Authentication -> URL Configuration
```

Set Site URL:

```text
http://localhost:5173
```

Add Redirect URLs:

```text
http://localhost:5173
http://localhost:5173/*
http://127.0.0.1:5173
http://127.0.0.1:5173/*
http://localhost:5173/confirm-email
http://127.0.0.1:5173/confirm-email
http://localhost:5173/reset-password
http://127.0.0.1:5173/reset-password
```

Use this confirmation target in student signup:

```text
http://127.0.0.1:5173/confirm-email
```

In Supabase email templates, the confirmation button/link should use:

```text
{{ .ConfirmationURL }}
```

For Forgot Password, the reset email button/link should also use:

```text
{{ .ConfirmationURL }}
```

The app sends reset links to:

```text
http://127.0.0.1:5173/reset-password
```

## 5. Test Student Email Confirmation

Start the app:

```powershell
npm.cmd run dev
```

Open:

```text
http://127.0.0.1:5173/signup
```

Steps:

1. Register a student using a real email inbox.
2. Check the email inbox.
3. Open the Supabase confirmation email.
4. Click the confirmation link.
5. Return to the app login page.
6. Login using the student User ID and password.

## 6. Grantor Account Creation

Grantors do not self-register.

The admin creates grantor accounts. Do not use public grantor email confirmation.

Grantor account creation must create:

- Supabase Auth user if the grantor should use Supabase login and Forgot Password.
- `providers` row.
- `grantor_portals` row.

For development, a grantor row with an encrypted fallback password can log in through the app, but Forgot Password requires a Supabase Auth user.

## 7. Admin Email Confirmation Note

The SQL-created admin exists only in the `admins` table.

That means:

- Admin login works through the app fallback password.
- Supabase email confirmation does not apply to that SQL-only admin.
- Forgot Password does not work for that admin unless a Supabase Auth user also exists.

To test admin email confirmation:

1. Go to:

```text
Supabase Dashboard -> Authentication -> Users -> Add user
```

2. Create the user:

```text
Email: admin@bulsu.edu.ph
Password: Admin@123
Auto Confirm User: OFF
```

3. Make sure the `admins` table has the matching row:

```text
id: admin_01
email: admin@bulsu.edu.ph
```

4. Confirm the email from the inbox.
5. Login with:

```text
User ID: admin_01
Password: Admin@123
```

## 8. If Confirmation Email Does Not Arrive

Check:

```text
Supabase Dashboard -> Authentication -> Email Templates
```

Also check:

```text
Supabase Dashboard -> Authentication -> SMTP Settings
```

For reliable testing, configure SMTP using Resend or another email provider.

## 9. Test Student Forgot Password

Forgot Password is student-only in the login page.

Students created through `/signup` have Supabase Auth users.

The process is:

1. Student clicks `Forgot password?`.
2. The app opens a popup asking for Student ID.
3. The app finds the matching row in the `students` table.
4. The app reads the email saved on that student row.
5. Supabase sends the password recovery email to that email.
6. Student opens the email and clicks the reset link.
7. The link opens `/reset-password`.
8. Student enters a new password.

Important:

- Forgot Password only works if that student also exists in Supabase Auth.
- Students created through `/signup` should work.
- Students created only by SQL or seed data will not work unless you also create a matching Supabase Auth user with the same email.
- Admin and grantor Forgot Password is not included in this flow.

Steps:

1. Go to the login page.
2. Click `Forgot password?`.
3. Enter the Student ID.
4. Check the registered email inbox.
5. Open the Supabase password recovery email.
6. Click the reset link.
7. Confirm you land on:

```text
http://127.0.0.1:5173/reset-password
```

8. Enter a new password.
9. Return to login.
10. Login using the Student ID and new password.

## 10. Create Fresh Data

Use the app normally:

```text
Student registration: /signup
Grantor accounts: created by admin
Admin login: /
Seed data: /seed.html
```

Use the seed page only for demo/test data:

```text
http://127.0.0.1:5173/seed.html
```

## 11. RLS Plan

Current RLS is open so development works.

Before final submission, update RLS so:

- Students can only access their own data.
- Grantors can only access their own provider/grantor data.
- Admins can access and manage everything.
- Anonymous users cannot write/delete data.
- Storage uploads are limited to logged-in users.

Recommended beginner approach:

1. Finish all features first.
2. Test all dashboards.
3. Then lock down RLS.
4. Retest registration, login, uploads, and dashboards.

## 12. Fully Relational PostgreSQL Plan

Current tables are still Firebase-style:

```text
students
  id
  data jsonb
```

Later, convert to relational tables:

```text
students
admins
providers
courses
scholarship_programs
student_scholarships
scholarship_applications
announcements
soe_requests
soe_downloads
student_warnings
uploaded_documents
```

Example:

```sql
create table students (
  id text primary key,
  auth_user_id uuid references auth.users(id),
  email text not null unique,
  first_name text not null,
  middle_name text,
  last_name text not null,
  course text,
  year_level int,
  section text,
  status text,
  created_at timestamptz default now()
);
```

Do this after the current Supabase version works.

## 13. Update React Code For Relational Tables

Status: in progress

Added:

- `src/services/supabaseDataService.js` — direct Supabase reads/writes with relational column mapping
- `supabase/relational-migration.sql` — adds `first_name`, `email`, etc. columns and backfills from `data` jsonb

Migrated to `supabaseDataService`:

1. Student registration — `SignupPage.jsx` uses `upsertStudent()` and `recordExists()`
2. Login / forgot password — `LoginPage.jsx` uses `findAccountById()` and `getRecord()`
3. All dashboards and services now import from `supabaseDataService` instead of `supabaseDbCompat`

Run the migration in Supabase SQL Editor:

```text
supabase/relational-migration.sql
```

Remaining relational work:

- Split nested jsonb fields (scholarships, documents) into dedicated tables from item 12
- Replace remaining `setDoc()` calls with typed helpers like `upsertProvider()`

## 14. Fix Lint

Status: done

Run:

```powershell
npm.cmd run lint
```

Fixed files:

- `api/send-email.js` — Node globals in ESLint config
- `TablePagination.jsx` — pagination helpers moved to `src/utils/tablePaginationUtils.js`
- `AdminDashboard.jsx` — removed unused helpers
- `studentAccessService.js`
- `scholarshipTrackingService.js`
- `grantorSeed.js`
- `ConfirmEmailPage.jsx`

## 15. Final Test Checklist

Before considering the Supabase transfer complete, test:

1. Admin login works.
2. Student registration works.
3. Student email confirmation works.
4. Student login works.
5. Admin-created grantor account works.
6. Grantor login works.
8. Forgot Password sends reset email.
9. Reset Password works.
10. Student document upload works.
11. Admin sees student records.
12. Grantor sees grantor records.
13. Build passes.
14. Supabase verification passes.
15. Auth verification passes.

Run:

```powershell
npm.cmd run build
npm.cmd run verify:supabase
npm.cmd run verify:auth
npm.cmd run lint
```
