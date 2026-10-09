# BulsuScholar Production Deployment Checklist

Follow this list from top to bottom. Do not skip a STOP instruction. This is a
production database and login change, not just a frontend update. Keep passwords,
service-role keys, SMTP keys, and database URLs out of Git, screenshots, and chat.

## Where You Are Now

These were checked on 2026-09-22; check again if time has passed:

- [x] The grantor Auth migration finished: 1 grantor migrated and verified.
  **Do not run `migrate:grantor-auth -- --execute` again.**
- [ ] Maintenance Mode was off at the last check.
- [ ] The production Supabase database did not have `login_security_state` or
  `portal_recovery_challenges`. The three SQL files below were not recorded in
  its migration history.
- [ ] Railway was still running older backend code. Its OpenAPI document did
  not contain `POST /auth/login`, so the new local frontend received 405.
- [ ] The new source files were still uncommitted. Clicking **Redeploy** on the
  old Railway deployment will not include them.

If a check below disagrees with this snapshot, stop and investigate before
running SQL or pushing code.

## 1. Protect Production

1. Open `https://bulsuscholar.com/root` and log in with the root account.
2. In the left menu, open **Settings**. Under **Portal controls**, turn
   **Maintenance Mode** on. Save, then click **Confirm Change** in the dialog.
3. Open **Overview** and confirm **System status** says **Maintenance**. Normal
   student, grantor, and admin activity should now be blocked; root stays open.
   If the setting does not save or the status stays **Operational**, **STOP**.
4. In the Supabase Dashboard, open the **BULSUScholar** project, then
   **Database -> Backups**. Confirm that you have a usable backup or restore
   point. If you do not, **STOP** and arrange a backup before changing SQL.
   A daily backup may predate the grantor Auth conversion. Supabase database
   backups do not include the file contents in Storage.

Do not run `supabase/reset-all-data-except-root.sql`. That file deletes data and
is unrelated to this deployment. [Supabase backup guidance](https://supabase.com/docs/guides/platform/backups)

## 2. Check The Local Code

In VS Code, open **Terminal -> New Terminal**. Make sure PowerShell is in the
`BulsuScholar` folder, then run these one at a time:

```powershell
python -m compileall backend -q
python -m unittest discover -s backend/tests -p "test_*.py"
node scripts/test-scholarship-choice-policy.mjs
node scripts/test-grantor-reapplication-policy.mjs
npm.cmd run lint
npm.cmd run build
```

Each command must finish without an error. A Vite warning about large chunks is
not a failed build. If a command fails, **STOP** and fix it before deployment.
The SQL files have been syntax-parsed, but have **not** been run against a local
Postgres instance in this workspace. Test them in a safe staging database if
one is available.

## 3. Apply The Database Files In Order

Do this only after Steps 1 and 2. The files are in `supabase/migrations/`:

1. `20260918120000_preserve_tracking_during_document_compliance.sql`
2. `20260918123000_add_tracking_finish_stage.sql`
3. `20260918130000_automatic_roster_and_login_security.sql`
4. `20260923120000_student_profile_document_verification.sql`
5. `20260923124643_scholarship_roster_workflow.sql`
6. `20260924024322_scope_reporting_announcements_waitlist.sql`

For **each file, in that order**:

1. In VS Code, open the file and copy its **entire** contents.
2. In the same production Supabase project, open **SQL Editor -> New query**.
3. Paste the contents. Check the filename and project again. Never paste the
   root-preserving reset SQL here.
4. Click **Run** once. Wait for a success result before moving to the next file.
5. Write down the filename and time of the successful run.

If Supabase reports an error, times out, or the result is unclear, **STOP**.
Do not immediately run that file a second time: earlier statements may already
have taken effect. Save the error message and inspect the database first.

**Migration-history warning:** This repository's older local migration
versions already differ from the versions recorded in the production project.
Do not run `supabase db push` or `supabase migration repair` blindly. Running
SQL in the Dashboard also does not record these filenames as migrations. Keep
your run log and reconcile migration history separately before using `db push`
in the future. [Supabase migration guidance](https://supabase.com/docs/guides/deployment/database-migrations)

## 4. Confirm The Database Is Ready

In **Supabase -> SQL Editor -> New query**, run this read-only check:

```sql
select
  to_regclass('public.login_security_state') is not null as login_security_ready,
  to_regclass('public.portal_recovery_challenges') is not null as recovery_ready,
  to_regprocedure('public.record_portal_login_attempt(uuid,text,text,boolean)')
    is not null as login_rpc_ready,
  to_regprocedure('public.assign_authoritative_roster_scholarship(text,text,text)')
    is not null as roster_rpc_ready,
  to_regclass('public.student_profile_revisions') is not null as profile_revision_ready,
  to_regclass('public.roster_import_batches') is not null as roster_import_ready,
  to_regclass('public.scholarship_waitlist_entries') is not null as waitlist_ready,
  to_regprocedure('public.reserve_or_waitlist_scholarship(text,text,text,text,text)')
    is not null as waitlist_rpc_ready;
```

All eight values must be `true`. If any is `false`, **STOP**. The successful
grantor Auth conversion is a separate step; it did not install these SQL objects.

## 5. Check Email Recovery Settings

Recovery is how locked students and grantors regain access. Before opening the
portal, check these existing settings; do not replace working secrets casually.

1. In **Supabase -> Authentication -> SMTP Settings**, confirm Custom SMTP is
   enabled with the verified `no-reply@bulsuscholar.com` sender and Brevo SMTP
   credentials. The SMTP password is **not** the Brevo API key.
2. In **Authentication -> Email Templates**, confirm the Reset Password and
   Confirm Signup templates are installed from
   `docs/email/SupabaseEmailTemplates.md`.
3. In **Authentication -> URL Configuration**, confirm the Site URL is
   `https://bulsuscholar.com` and the Redirect URLs allow
   `https://bulsuscholar.com/*`. The reset link includes a one-time `challenge`
   query parameter.
4. Confirm Railway's `FRONTEND_URL` is `https://bulsuscholar.com`.

If a reset email does not arrive or its link changes unexpectedly, keep
Maintenance Mode on and fix email delivery before testing lockout.

## 6. Review And Push The Source

Railway deploys the GitHub `main` branch, not files only saved on this computer.
Vercel also builds from Git. In VS Code:

1. Open **Source Control** in the left sidebar. Review every changed file.
2. Stage only the source, migration, test, script, and documentation changes
   intended for this release. **Do not use Stage All without reviewing.**
3. Never stage `.env`, service-role keys, local backups, or generated `dist/`.
4. In PowerShell, check the staged file names and whitespace:

   ```powershell
   $git = 'C:\Program Files\Git\cmd\git.exe'
   & $git status --short
   & $git diff --cached --name-only
   & $git diff --check
   ```

5. If the staged list is correct, enter a commit message in Source Control,
   click **Commit**, then **Sync Changes** or **Push**. If Git says your branch
   is behind, **STOP** and resolve that before pushing. Do not force-push.
6. Run `& $git rev-parse --short HEAD` and note the new commit ID. Confirm the
   same commit appears on GitHub's `main` branch. If Git is installed somewhere
   else, use that location for `$git`.

Do **not** click Railway's **Redeploy** on an older deployment. That rebuilds
old code. [Railway GitHub deployment guidance](https://docs.railway.com/deployments/github-autodeploys)

## 7. Verify Railway Before Login

1. In Railway, open **sparkling-acceptance -> BulsuScholar -> production ->
   Deployments**. Wait for the deployment from the **new GitHub commit** to show
   **Success**. If no build starts, check whether GitHub autodeploy is enabled
   for `main`; use **Deploy Latest Commit**, not Redeploy Old Deployment.
2. Open its build and runtime logs if it fails. Keep Maintenance Mode on.
3. In PowerShell, run:

   ```powershell
   Invoke-RestMethod https://api.bulsuscholar.com/health
   Invoke-RestMethod https://api.bulsuscholar.com/deployment/health
   $spec = Invoke-RestMethod https://api.bulsuscholar.com/openapi.json
   $null -ne $spec.paths.'/auth/login'.post
   $null -ne $spec.paths.'/auth/session'.get
   $null -ne $spec.paths.'/auth/recovery/request'.post
   $null -ne $spec.paths.'/auth/recovery/complete'.post
   ```

The health results must be healthy and **all four** route checks must print
`True`. If `/auth/login` still prints `False`, Railway is still serving the
wrong commit or URL. **Do not test passwords or turn Maintenance Mode off.**

### 7A. Configure The Waitlist Expiry Job

Do this after Railway has deployed the new backend, even when the waitlist
capacity will remain `0` initially.

1. In PowerShell, generate one secret and keep the printed value private:

   ```powershell
   $bytes = New-Object byte[] 36
   [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
   $cronSecret = [Convert]::ToBase64String($bytes)
   $cronSecret
   ```

2. In the existing Railway API service, open **Variables**, add
   `CRON_SECRET`, paste that value, and deploy the variable change.
3. In the same Railway project, create another service from this same GitHub
   repository. Name it `waitlist-expiry`. It must use the repository
   `Dockerfile` and the same deployed commit as the API.
4. In the new service, add these variables:
   - `CRON_SECRET`: the exact same value used by the API service.
   - `BACKEND_API_URL`: `https://api.bulsuscholar.com`.
5. Set its **Start Command** to:

   ```text
   python -m backend.waitlist_expiry_job
   ```

6. Open the service's **Cron Schedule** setting and enter `*/5 * * * *`.
   Save it. The worker should start every five minutes, call the protected API,
   print one JSON result, and exit successfully.
7. Use **Run now** once. Open its logs and confirm the output contains
   `"ok":true`. A `401`, `403`, timeout, or missing-secret message is a failed
   setup. A Cloudflare `403` with `error code: 1010` means the deployed worker
   is missing the application `User-Agent` from the current
   `backend.waitlist_expiry_job` implementation. Deploy the latest worker
   version before testing the secret again. Keep Maintenance Mode on until it
   succeeds.
8. Run `Invoke-RestMethod https://api.bulsuscholar.com/deployment/health` and
   confirm `environment.hasCronSecret` is `True`.

## 8. Verify Vercel

1. In Vercel, open the project serving `bulsuscholar.com`, then **Deployments**.
2. Wait for the deployment from the same new GitHub commit to be **Ready** and
   assigned to the production domain.
3. In **Project Settings -> Environment Variables**, confirm
   `VITE_BACKEND_API_URL=https://api.bulsuscholar.com`. Never put
   `SUPABASE_SERVICE_ROLE_KEY` or other server secrets in a `VITE_*` variable.
4. Open `https://bulsuscholar.com` in a private browser window. Maintenance
   should still be visible. Check the browser console for errors unrelated to
   blocked maintenance requests.

Pushing a production-branch commit normally triggers Vercel deployment; verify
the actual deployment instead of assuming it happened. [Vercel Git deployment guidance](https://vercel.com/docs/git)

## 9. Reopen And Test The Portal

Do this only when Steps 4, 5, 7, and 8 pass. While Maintenance Mode is on, the
normal portals are blocked, so the following is a controlled **post-release**
test, not a pre-release test.

1. In the root portal, open **Settings -> Portal controls**. Turn Maintenance
   Mode off, save, and confirm.
2. Immediately test a known student account, grantor account, normal admin,
   and root. Use a private window to avoid stale browser sessions.
3. Test a new student with one roster match: email confirmation should assign
   the scholarship. They should still need COR, ROG, Student ID, and Student
   Application Profile before tracking reaches **Finish**.
4. Test a safe, disposable student/grantor account with wrong passwords until
   it locks. Request recovery by User ID, use the email link, change the
   password, and verify login works again. Do not lock a real user's account.
5. Confirm a locked admin requires a root-admin unblock, not email recovery.
6. Confirm an active roster scholar cannot withdraw or apply elsewhere; an
   individually archived scholar gets the 24-hour cooldown. A whole-grantor
   archive should keep scholars under admin servicing.
7. Check announcements, uploads/downloads, inbox, reports, and support from
   each relevant role. Check mobile and dark mode if those are release-critical.

If any core workflow fails, **turn Maintenance Mode back on immediately** and
keep the error message, affected route, and time for diagnosis. Do not rerun
the grantor Auth migration or all SQL files as a troubleshooting shortcut.

## 10. Final Checks

- [ ] Railway and Vercel show the new commit and healthy deployments.
- [ ] All four new auth routes appear in production OpenAPI.
- [ ] All four SQL readiness checks returned `true`.
- [ ] Supabase recovery and signup emails arrive through Brevo.
- [ ] `support@bulsuscholar.com` forwards to the intended mailbox if support
  email is part of this release; configure it in Cloudflare Email Routing.
- [ ] Railway's `DOCUMENT_SCAN_ALLOWED_ORIGIN_REGEX` is blank, not
  `https://.*\.com`.
- [ ] Student, grantor, admin, and root smoke tests passed.
- [ ] Maintenance Mode is off only after those tests passed.

The root SQL Console and `ROOT_DATABASE_URL` are optional. If enabled later,
use a dedicated least-privilege database role, not the service-role key.
# Numbers 8-10: Security, History, and Signed SOE

Complete these steps after the Number 7 migration and while Maintenance Mode is enabled.

1. Create a Supabase database backup and separately copy the Storage bucket. Write down the backup time and restore point.
2. In PowerShell, generate two different secrets:
   ```powershell
   -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
   ```
   Run it twice. Add the first value to Railway as `PORTAL_EMAIL_CODE_SECRET` and the second as `PUBLIC_RECOVERY_CODE_SECRET`. Do not add either value to Vercel or commit them.
3. Confirm Railway still has `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and `FRONTEND_URL`.
4. Apply `supabase/migrations/20260924125213_security_history_signed_soe.sql` on staging after `20260924024322_scope_reporting_announcements_waitlist.sql`.
5. In Supabase, run Security and Performance Advisors. Confirm the new tables have RLS enabled and `anon`/`authenticated` have no table privileges.
6. Confirm these new private tables exist: `portal_email_challenges`, `portal_verified_sessions`, `public_recovery_tickets`, `public_recovery_messages`, `public_recovery_attachments`, `student_history_events`, and `signed_soe_submissions`.
7. Deploy the backend. Open `/openapi.json` and confirm these paths exist: `/auth/email-verification/complete`, `/support/recovery/tickets`, `/student/history`, `/student/applications/{application_id}/signed-soe`, and `/root/recovery-tickets`.
8. Test one recent student login. It should open normally. Temporarily set a staging account's meaningful activity older than 30 days and confirm login stops at **Email verification** without exposing Auth tokens to the browser before the code succeeds.
9. Test code expiry, three wrong attempts, resend delay, old-code invalidation, five-send limit, and Brevo delivery. Restore the staging account afterward.
10. Open two normal tabs and confirm login/logout is shared. Confirm an Incognito window and second device keep independent sessions. Delete a test `auth.sessions` row and confirm protected backend calls are rejected.
11. While signed out, open `/help`, create a Lost email access ticket, keep its secret link, attach evidence, and verify a different/edited link cannot read it.
12. As root, review the evidence, reject one test request, and approve another with an unused email. Confirm nothing changes before the requester enters the code sent to the proposed email. After confirmation, verify Auth/profile email match, login failures are reset, and old sessions no longer work.
13. As a student, open `/student-dashboard/history`. Compare the first page against known application and document records. Confirm cycle/type filters and related-page links work and no internal reviewer notes appear.
14. Use an ordinary committed application with office signing complete. Upload PDF, PNG, and JPEG test files; reject unsupported/oversized files. Confirm a valid upload marks **Upload Signed SOE** as Submitted, completes Finish, and shows the next-semester message.
15. As an admin with Requirements permission, preview the file and reopen it with a reason. Confirm the student returns to Upload Signed SOE, receives a notice, and can submit a new version while the original remains in history.
16. Confirm an authoritative-roster scholar is exempt from Upload Signed SOE. Change the staging academic cycle and verify completed history remains while current-cycle requirements restart at document upload.
17. Deploy the frontend only after backend checks pass. Test student, grantor, admin, and root pages at desktop/mobile widths in light/dark mode and inspect the browser console.
18. Re-test roster import, Request Materials, waitlist expiry, reports, announcements, inbox, document review, password lockout/recovery, and private downloads.
19. Record migration counts, Railway/Vercel deployment IDs, release owner, rollback point, and unresolved issues. Disable Maintenance Mode only when every required check passes.
