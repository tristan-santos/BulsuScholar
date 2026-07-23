# Debug Python Migration

Use this checklist to test the parts of BulsuScholar that now depend on the FastAPI backend. Test in order. If one section fails, fix that first before moving to the next section.

## 1. Check The Hosted Backend - Checked

Open this in the browser:

```txt
https://bulsuscholar.onrender.com/health
```

Expected:
- Render returns backend health JSON.
- `supabaseServerConfigured` is `true`.
- No CORS errors when called from the Vercel frontend.

If this fails:
- Check Render deploy logs.
- Confirm Render environment variables are set.
- Redeploy the backend after changing environment variables.

## 2. Check Backend Health - Checked

Open this in the browser:

```txt
https://bulsuscholar.onrender.com/health
```

Expected:

```json
{"status":"ok"}
```

If this fails:
- The Render service is sleeping, still deploying, or crashed.
- Required backend environment variables are missing.
- Python crashed during startup.

## 3. Check Environment Variables - Checked

Frontend `.env` should have:

```env
VITE_BACKEND_API_URL=https://bulsuscholar.onrender.com
VITE_DOCUMENT_SCAN_API_URL=https://bulsuscholar.onrender.com
VITE_RESEND_API_ENDPOINT=https://bulsuscholar.onrender.com/email/send
VITE_APP_URL=https://bulsu-scholar.vercel.app
VITE_PUBLIC_SITE_URL=https://bulsu-scholar.vercel.app
VITE_PASSWORD_SECRET=
```

Backend environment should have:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DOCUMENT_SCAN_ALLOWED_ORIGINS=https://bulsu-scholar.vercel.app
FRONTEND_URL=https://bulsu-scholar.vercel.app
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

Expected:
- Frontend requests go to `https://bulsuscholar.onrender.com`.
- Backend write endpoints do not return `missing_supabase_server_config`.
- Browser does not show CORS errors.
- Existing grantor/admin encrypted passwords can still be verified. If login shows `Password decryption failed`, Vercel's `VITE_PASSWORD_SECRET` does not match the secret used when the password was saved.

If CORS fails:
- Confirm frontend runs on `https://bulsu-scholar.vercel.app`.
- Confirm `DOCUMENT_SCAN_ALLOWED_ORIGINS=https://bulsu-scholar.vercel.app`.
- Redeploy or restart the Render backend after changing env values.

## 4. Start The Frontend - Checked

Use the hosted Vercel frontend:

```txt
https://bulsu-scholar.vercel.app
```

Expected:
- Vercel opens the production frontend.
- Browser console has no startup errors.

## 5. Use The Network Tab - Checked

Open DevTools:
- Go to `Network`.
- Filter by `bulsuscholar.onrender.com`.
- Keep the Render logs visible if a backend request fails.

For every migrated feature, check:
- Request endpoint.
- Request payload.
- Response status.
- Response JSON.
- Python terminal traceback if any.

Common backend error meanings:
- `missing_supabase_server_config`: backend cannot read `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`.
- `CORS policy`: allowed origins are wrong or backend needs restart.
- `404`: frontend is calling the wrong endpoint.
- `500`: check Python terminal traceback.
- `Workflow request failed`: open Network response JSON for the real reason.

## 6. Document Scan Debug - Checked

Test:
1. Open signup.
2. Upload COR first.
3. Upload COG second.

Expected after COR:
- Student number autofills.
- Name autofills correctly.
- Course autofills if readable.
- Year/section autofill if readable.
- Console shows `[BulsuScholar] COR document scan`.

Expected after COG:
- COG identity matches COR/form identity.
- GWA autofills from the printed GWA.
- Console shows `[BulsuScholar] COG document scan`.

Check these console fields:
- `Autofill fields gathered`
- `Raw OCR preview`
- `Identity source fields`
- `Identity comparison`
- `COG identity mismatch reason`
- `GWA extraction debug`

Backend endpoint:

```txt
POST /scan-document
```

If COR/COG mismatches even when correct:
- Check if expected name came from COR or form.
- Check if scanned COG name is empty.
- Check if student numbers differ after normalization.
- Send the console output for `Identity comparison`.

## 7. GWA Extraction Debug - Checked

Test:
1. Upload a COG with printed `General Weighted Average`.
2. Confirm GWA autofills.

Expected:
- GWA uses the printed GWA only.
- It does not compute from all subject grades.
- Console `GWA extraction debug` shows the matched rule.

If GWA is empty:
- Check `Raw OCR preview` if the GWA text is readable.
- Check `matchedRule`.
- Check whether identity failed first, because failed identity blocks GWA autofill.

## 8. Grantor Duplicate Checking - Checked

Test:
1. Log in as grantor.
2. Go to Scholars.
3. Add a scholar manually with the same student data as an existing row.
4. Import a CSV with duplicate rows.

Expected:
- Duplicate rows are detected.
- Duplicate rows are highlighted.
- Duplicate students are not imported.
- Warning message explains duplicate prevention.

Backend endpoints:

```txt
POST /grantor/evaluate-scholar-duplicate
POST /grantor/find-scholar-duplicate
```

If duplicate checking fails:
- Check if request reaches Python.
- Check candidate row data in Network payload.
- Check existing roster rows in Network payload.
- Check backend response `score`, `fields`, and `isDuplicate`.

## 9. Early Grantor Roster Match During Signup - Checked

Test:
1. Add a test student to a grantor roster.
2. Create a student account using matching student number/name/address.
3. Finish signup.

Expected:
- Student is matched against grantor roster.
- Matching scholarship is attached automatically.
- Student sees the matched scholarship in scholarship control center.

Backend endpoint:

```txt
POST /grantor/find-matching-scholars
```

If no match appears:
- Check student profile payload.
- Check grantor scholar roster payload.
- Confirm scholar is not archived.
- Confirm name and address fields are present.

## 10. Student Apply From Announcement - Checked

Test:
1. Open a student announcement that allows application.
2. Click `Apply Now`.

Expected:
- Student scholarship list updates.
- A `scholarship_applications` row is created.
- Student receives an application submitted inbox item.
- Grantor receives a new application inbox item.
- Button/state changes to applied or pending.

Backend endpoint:

```txt
POST /workflows/scholarship/apply
```

If apply fails:
- Check eligibility reason in toast or Network response.
- Check missing document requirement response.
- Check GWA requirement response.
- Check if `student`, `scholarship`, `application`, and `notifications` are present in payload.

## 11. Student Apply From Scholarship Control Center - checked

Test:
1. Open student scholarship control center.
2. Apply or continue application for a matched scholarship.

Expected:
- Same behavior as the old React flow.
- Student scholarship state is preserved.
- Application row is created/updated.

Backend endpoint:

```txt
POST /workflows/scholarship/apply
```

If it fails:
- Check if the same student already has an application row.
- Check if required documents are missing.
- Check backend response details.

## 12. Scholarship Eligibility Rules - checked

Test from UI where applicable, or with API client:

```txt
POST /scholarships/validate-documents
POST /scholarships/check-gwa
POST /scholarships/check-eligibility
POST /scholarships/recommend
```

Expected:
- Missing COR/COG blocks application when required.
- Minimum GWA blocks application when student GWA does not qualify.
- Recommendation endpoint returns ranked placeholders without crashing.

If eligibility looks wrong:
- Check the announcement required document flags.
- Check student uploaded document URLs.
- Check student `gwa`.
- Check grantor/profile minimum GWA.

## 13. Grantor Application Review Modal - checked

Test:
1. Log in as grantor.
2. Open Applications.
3. Open an applicant review modal.
4. Click `Complete Current Stage`.

Expected:
- Current stage progresses.
- Student scholarship tracking updates.
- `scholarship_applications` row updates.
- Button is disabled if the stage is out of grantor reach.
- Student receives progress inbox item.
- If final screening creates a scholar row, the roster updates.

Backend endpoint:

```txt
POST /workflows/admin/review
```

If it fails:
- Check current stage in payload.
- Check student ID/application ID.
- Check if grantor is allowed to complete that stage.
- Check Python terminal for Supabase update errors.

## 14. Grantor Scholar Roster Create - checked

Test:
1. Add one scholar manually.
2. Import multiple scholars from CSV.

Expected:
- Rows insert under the correct grantor.
- `parent_id` is saved correctly.
- Realtime table updates still work.
- Duplicate rows are blocked.

Backend endpoint:

```txt
POST /workflows/grantor/scholars/create
```

If rows do not appear:
- Check Supabase table `grantor_portal_scholars`.
- Confirm `parent_id` is the grantor account/provider ID.
- Check response `ok`.

## 15. Grantor Scholar Roster Update - checked

Test:
1. Edit a scholar.
2. Archive one scholar.
3. Select multiple scholars and archive/unarchive.

Expected:
- Updated values save.
- Archive status changes.
- Table moves rows between active/archived tabs.

Backend endpoints:

```txt
POST /workflows/grantor/scholars/update
POST /workflows/grantor/scholars/update-many
```

If updates fail:
- Check row `id`.
- Check `parent_id`.
- Check update payload.

## 16. Grantor Profile Update - checked

Test:
1. Open grantor profile.
2. Change profile fields.
3. Change minimum GWA.
4. Change profile photo.
5. Toggle applications open/closed.

Expected:
- Profile updates persist after refresh.
- Minimum GWA saves and is used by application eligibility.
- Profile photo metadata saves.
- Application open/close toggle persists.

Backend endpoint:

```txt
POST /workflows/grantor/profile/update
```

If it fails:
- Check provider/grantor ID.
- Check whether file upload succeeded before profile metadata save.
- Check backend response for Supabase config or update errors.

## 17. Grantor Password Change Request - 

Test:
1. Open grantor profile.
2. Click `Request to Change Password`.

Expected:
- Request is saved.
- Grantor receives inbox/status feedback.
- Existing forgot-password flow is unchanged.

Backend endpoint:

```txt
POST /workflows/grantor/password/request
```

If it fails:
- Check provider ID.
- Check notification payload.
- Check Supabase write response.

## 18. Grantor Announcement Create

Test:
1. Open grantor Announcements.
2. Click create announcement.
3. Add title, subtitle, content, image(s), date range.
4. Toggle application open.
5. Add minimum GWA.
6. Select required documents.
7. Add optional other requirement if needed.
8. Publish.

Expected:
- Announcement row is created.
- Images are preserved.
- Application window is saved.
- Required document flags are saved.
- Minimum GWA is saved.
- Grantor inbox item is created.
- Student inbox broadcast is created if that flow is enabled.

Backend endpoint:

```txt
POST /workflows/grantor/announcements/create
```

If publish fails:
- Check image upload first.
- Check announcement payload.
- Check required documents payload.
- Check notification payload.

## 19. Grantor Announcement Update And Archive

Test:
1. Archive an announcement.
2. Confirm student announcement button becomes unavailable when archived/expired.
3. Confirm expired date ranges archive correctly.

Expected:
- Announcement status updates.
- Archived announcement moves to archived tab.
- Student view shows gray unavailable card/button.

Backend endpoint:

```txt
POST /workflows/grantor/announcements/update
```

If archive fails:
- Check announcement ID.
- Check status/archive payload.
- Check date range values.

## 20. Student Inbox Notifications

Test:
1. Trigger a student inbox event.
2. Open student inbox.
3. Mark all as read.
4. Delete one message.

Expected:
- Dynamic unread badge changes.
- Mark all as read sets `read/readAt`.
- Delete removes the row.

Backend endpoints:

```txt
POST /notifications/student/create
POST /notifications/student/update
POST /notifications/student/delete
```

If badge is wrong:
- Check unread query/listener in frontend.
- Check notification rows have correct `studentId`.
- Check `read` field value.

## 21. Grantor Inbox Notifications

Test:
1. Publish an announcement.
2. Receive a student application.
3. Request password change.
4. Mark grantor messages read.
5. Delete one grantor inbox item.

Expected:
- Grantor inbox receives relevant messages.
- Mark read/delete works.
- Notification icon count updates.

Backend endpoints:

```txt
POST /notifications/grantor/create
POST /notifications/grantor/update
POST /notifications/grantor/delete
```

If messages go to the wrong grantor:
- Check `grantorId` in payload.
- Check provider/account ID mapping.
- Check notification table row.

## 22. Custom Email Sending

Test:
1. Trigger a custom app email, such as SOE/material email if available.
2. Do not test Supabase Auth confirm/forgot here; those remain Supabase.

Expected:
- Request goes to Python.
- Email sends if `RESEND_API_KEY` is configured.
- Supabase confirm account still uses Supabase Auth.
- Supabase forgot password still uses Supabase Auth.

Backend endpoint:

```txt
POST /email/send
```

If email fails:
- Check `RESEND_API_KEY`.
- Check sender domain/from email.
- Check Network response JSON.

## 23. SOE And Material Request - Student Side

Test:
1. Student requests SOE/material.
2. Student downloads application form.
3. Student saves SOE expense presets.
4. Student finalizes SOE download.

Expected:
- `soe_requests` updates.
- `soe_downloads` updates.
- Student scholarship download marker saves.
- Cooldown fields update when expected.

Backend endpoint:

```txt
POST /workflows/materials/update
```

If it fails:
- Check inserts/updates/upserts arrays in payload.
- Check target table names.
- Check student ID and request number.

## 24. SOE And Material Request - Admin Side

Test:
1. Admin resets SOE cooldown.
2. Admin approves/rejects material request.
3. Admin marks downloaded material compliant/non-compliant.

Expected:
- Same database changes as old React flow.
- Student status updates correctly.
- Request/download rows stay linked.

Backend endpoint:

```txt
POST /workflows/materials/update
```

If it fails:
- Check request ID.
- Check download ID.
- Check update target table.
- Check backend response result list.

## 25. Admin Grantor-Student Matching

Test:
1. Open admin dashboard grantor/student matching views.
2. Check active recipient counts.
3. Select a student with grantor roster match.

Expected:
- Matching lookup is loaded from Python.
- Counts match the data.
- Student scholarship list still finds grantor roster matches.
- If Python backend is unavailable, browser fallback prevents a blank dashboard.

Backend endpoint:

```txt
POST /admin/match-grantor-students
```

If counts are wrong:
- Check student profiles payload.
- Check grantor roster payload.
- Check exact student number first.
- Check name/address fields.

## 26. Reports - CSV

Test:
1. Open admin reports.
2. Export a CSV report.

Expected:
- CSV downloads.
- Columns match previous frontend report.
- Row counts match current filters.

Backend endpoint:

```txt
POST /reports/csv
```

If CSV is wrong:
- Check request headers/rows.
- Check filename.
- Compare old frontend row count with backend output.

## 27. Reports - PDF

Test:
1. Open admin reports.
2. Export a PDF report.

Expected:
- PDF downloads.
- Template background uses `public/Templates/FORMATTED_REPORT.pdf`.
- Title, summary, and table data render.

Backend endpoint:

```txt
POST /reports/pdf
```

If PDF fails:
- Check that `reportlab` and `pypdf` are installed.
- Check the template file exists.
- Check Python terminal traceback.

## 28. Logs Scaffold

Test with API client only for now:

```txt
POST /logs/build
POST /logs/create
```

Expected:
- `/logs/build` returns a structured log payload.
- `/logs/create` writes a log only if backend Supabase env is configured.

Note:
- Logs are prepared for later admin redesign.
- Do not expect every UI action to create logs yet.

## 29. Regression Checks

After backend features work, confirm these old flows are still unchanged:
- Supabase account confirmation email.
- Supabase forgot-password email.
- Login/logout.
- Existing storage uploads.
- Student profile document viewing.
- Grantor realtime roster display.
- Student/grantor/admin page navigation.
- Dark mode/light mode.

## 30. Signup Security And Inbox Hardening

Run this after the normal signup scan flow is working.

### 30A. Required Supabase SQL

Implemented file:
- `supabase/security-hardening.sql`

Setup:
1. Open Supabase SQL Editor.
2. Run `supabase/security-hardening.sql`.
3. Confirm these tables exist:
   - `studentNotifications`
   - `grantorNotifications`
   - `student_document_usage`
   - `systemLogs`
4. Confirm the notification 404 errors disappear after the tables exist.

### 30B. Unique Email And CP Number

Goal:
- One normalized email per student/account.
- One normalized CP number per student/account.

Implemented:
- Frontend precheck blocks duplicate email and CP number.
- Python signup finalization checks duplicate email and CP number server-side.
- `supabase/security-hardening.sql` adds normalized unique indexes.

Debug checks:
1. Create a student with email `test@example.com`.
2. Try creating another student with `TEST@example.com`.
3. Expected: second signup is blocked.
4. Create a student with CP number `09123456789`.
5. Try creating another student with the same CP number.
6. Expected: second signup is blocked.
7. Confirm database rejects duplicates even if the frontend check is bypassed.
8. If SQL unique index creation fails, clean existing duplicate data first.

### 30C. Python Signup Finalization

Goal:
- Final student DB creation is controlled by Python.
- Duplicate checks and student insert happen server-side.

Implemented files:
- `backend/signup_service.py`
- `backend/main.py`
- `src/services/workflowService.js`
- `src/pages/SignupPage.jsx`

Backend endpoints:

```txt
POST /workflows/student/signup/validate
POST /workflows/student/signup/finalize
```

Current flow:
- Supabase Auth still creates the auth login.
- Frontend still uploads COR/COG to Supabase Storage.
- Python now performs final student DB creation.
- Python checks student ID, email, CP number, COR student number, COR reuse, and Auth email alignment before saving.

Debug checks:
1. Submit a valid signup.
2. Expected: request goes to `POST /workflows/student/signup/finalize`.
3. Expected: response has `ok: true`.
4. Confirm the row is saved in `students`.
5. Confirm duplicate student ID is blocked.
6. Confirm duplicate email is blocked.
7. Confirm duplicate CP number is blocked.
8. Confirm edited student ID that differs from scanned COR is blocked.
9. Confirm backend still blocks if frontend validation is bypassed.

Common failure reasons:
- `missing_supabase_server_config`
- `student_id_exists`
- `email_exists`
- `cp_exists`
- `cor_file_already_used`
- `cor_identity_cycle_already_used`
- `auth_email_mismatch`
- `student_save_failed`

### 30D. COR Reuse Protection

Goal:
- Prevent one COR from being reused by multiple accounts.
- Prevent the same student identity/document cycle from being reused.

Implemented:
- Frontend computes SHA-256 hash of the uploaded COR file.
- Python records usage in `student_document_usage`.
- Database unique index blocks duplicate `cor_hash`.
- Database unique index blocks duplicate `student_id + academic_year + semester`.

Debug checks:
1. Create an account with a valid COR.
2. Confirm `student_document_usage` has a row for the student.
3. Confirm `cor_hash`, `student_id`, `academic_year`, and `semester` are populated.
4. Try creating another account with the exact same COR file.
5. Expected: blocked as reused COR.
6. Try creating another account with a different copy/image of the same COR for the same student, academic year, and semester.
7. Expected: blocked by `student_id + academic_year + semester`.
8. Try a new COR for a new semester.
9. Expected: allowed if the renewal/account flow permits it.

### 30E. Supabase Auth Email Alignment

Goal:
- Supabase Auth email and `students.data.email` must match.

Implemented:
- Signup finalization sends Auth email and submitted student email to Python.
- Python rejects the save with `auth_email_mismatch` if they differ.

Debug checks:
1. Create account with email `student@example.com`.
2. Confirm Supabase Auth user email is also `student@example.com`.
3. Attempt to save a different `students.data.email`.
4. Expected: backend rejects the mismatch.
5. Confirm forgot-password and email confirmation still use Supabase Auth normally.

### 30F. Inbox Notification Coverage

Goal:
- Important user actions and state changes should create personal inbox entries.
- Student actions should appear in the student inbox when relevant.
- Grantor actions should appear in the grantor inbox when relevant.

Implemented setup:
- `supabase/security-hardening.sql` creates `studentNotifications` and `grantorNotifications`.
- Python notification endpoints write to those tables.
- Student signup finalization creates an `Account Created` student inbox item.
- Existing converted workflows support notifications for announcement publishing, applications, password requests, progress updates, and inbox read/delete actions.

Debug checks:
1. Run `supabase/security-hardening.sql`.
2. Refresh student dashboard.
3. Confirm the previous `studentNotifications` 404 is gone.
4. Create a new student account.
5. Confirm `studentNotifications` has an `Account Created` row for that student.
6. Publish a grantor announcement.
7. Confirm grantor inbox receives a created-announcement item.
8. Apply to an announcement as a student.
9. Confirm student receives application-submitted inbox item.
10. Confirm grantor receives new-application inbox item.
11. Complete an application stage as grantor.
12. Confirm student receives progress/stage update inbox item.
13. Request grantor password change.
14. Confirm grantor inbox receives request/status item.
15. Mark all as read and delete one item in both inboxes.
16. Confirm unread badge updates correctly.

Coverage gap format:

```txt
Missing inbox event:
Page:
Action:
Actor:
Expected recipient:
Expected message:
```

If a user action changes data but no inbox item appears, add that action to the relevant Python workflow notification payload.

## 31. What To Send When Something Fails

For any failed test, send:
- Page you were testing.
- Button/action clicked.
- Browser console error.
- Network endpoint URL.
- Network request payload.
- Network response JSON.
- Python terminal traceback.
- Screenshot only if the issue is visual.

Most useful first debug format:

```txt
Page:
Action:
Endpoint:
Status code:
Response:
Console error:
Python terminal error:
```

## 32. Suggested Test Order

Use this order to avoid confusing dependent failures:

1. Backend health.
2. Env/CORS.
3. Document scan.
4. GWA autofill.
5. Grantor profile update.
6. Grantor roster create/update.
7. Grantor announcement create/update.
8. Student announcement apply.
9. Student inbox.
10. Grantor inbox.
11. Grantor application review.
12. SOE/material workflows.
13. Admin matching.
14. Reports.
15. Email.

Do not test reports, email, or admin matching first. They depend on the backend, env, and basic Supabase writes already working.
