# Python Conversion Notes

## Converted To Python

### Document scanning and parsing
- Files: `backend/document_scanner.py`, `backend/main.py`
- Endpoint: `POST /scan-document`
- Handles PDF/PNG/JPG OCR, COR/COG identity extraction, printed GWA extraction, name splitting, course/year/section parsing.

### Grantor duplicate and matching algorithms
- File: `backend/grantor_algorithms.py`
- Endpoints:
  - `POST /grantor/evaluate-scholar-duplicate`
  - `POST /grantor/find-scholar-duplicate`
  - `POST /grantor/find-matching-scholars`
- React now calls Python from `src/services/grantorService.js`.
- Algorithm preserved: Weighted Record Linkage with Levenshtein Similarity.

### Early grantor roster detection during signup
- Existing flow preserved in `src/pages/SignupPage.jsx`.
- After signup data is prepared, the student is matched against all grantor rosters through the Python matching endpoint.
- If the student exists in a grantor roster, scholarship records are automatically attached/applied as before.

### Custom email sending
- File: `backend/email_service.py`
- Endpoint: `POST /email/send`
- React custom email helper now points to Python in `src/services/emailService.js`.
- Supabase Auth confirm-account and forgot-password flows are not changed.

### Supabase operation helpers and logs
- File: `backend/supabase_ops.py`
- Endpoints:
  - `POST /logs/build`
  - `POST /logs/create`
  - `POST /notifications/student/build`
  - `POST /notifications/student/create`
  - `POST /notifications/student/update`
  - `POST /notifications/student/delete`
  - `POST /notifications/grantor/build`
  - `POST /notifications/grantor/create`
  - `POST /notifications/grantor/update`
  - `POST /notifications/grantor/delete`
- Notification create/update/delete operations now go through Python for:
  - grantor announcement published inbox item
  - student announcement inbox broadcast
  - student scholarship progress inbox item
  - grantor password change request inbox item
  - grantor password change approved inbox item
  - grantor new application inbox item
  - student application submitted inbox item
  - student inbox mark as read / delete
  - grantor inbox mark as read / delete
- Notification reads/listeners remain in React/Supabase so the current realtime inbox UI is preserved.

### Scholarship rules and recommendation scaffold
- File: `backend/scholarship_rules.py`
- Endpoints:
  - `POST /scholarships/validate-documents`
  - `POST /scholarships/check-gwa`
  - `POST /scholarships/check-eligibility`
  - `POST /scholarships/recommend`
- Current UI flows are preserved. The recommendation endpoint is a starter weighted scoring scaffold and can be refined later.

### Scholarship application create/update workflows
- File: `backend/workflow_service.py`
- Endpoint: `POST /workflows/scholarship/apply`
- Frontend wrapper: `src/services/workflowService.js`
- Converted flows:
  - Student applies from an announcement.
  - Student applies from the scholarship catalog/control center.
- React still builds the same scholarship/application payloads, but Python now performs:
  - student scholarship list update
  - `scholarship_applications` insert
  - optional grantor/student notification creation

### Grantor application update workflow
- File: `backend/workflow_service.py`
- Endpoint: `POST /workflows/admin/review`
- Converted flow:
  - Grantor completes the current application tracking stage.
- React still computes the next tracking/status values, but Python updates:
  - `students`
  - `scholarship_applications`

### Grantor roster, profile, and announcement workflows
- File: `backend/workflow_service.py`
- Endpoints:
  - `POST /workflows/grantor/scholars/create`
  - `POST /workflows/grantor/scholars/update`
  - `POST /workflows/grantor/scholars/update-many`
  - `POST /workflows/grantor/announcements/create`
  - `POST /workflows/grantor/announcements/update`
  - `POST /workflows/grantor/profile/update`
  - `POST /workflows/grantor/password/request`
- Converted flows:
  - grantor scholar CSV/manual add
  - grantor scholar edit
  - grantor scholar archive/unarchive
  - final-screening scholar roster upsert
  - grantor announcement publish/archive
  - grantor profile detail save
  - grantor profile photo metadata save
  - grantor application window toggle
  - grantor request-to-change-password submission
- React still builds the same payloads and uploads images through the existing storage helper, but Python now performs the Supabase row writes.
- Grantor subcollection rows keep `parent_id`, so existing realtime listeners and collection group reads still work.

### SOE/material request workflows
- File: `backend/workflow_service.py`
- Endpoint: `POST /workflows/materials/update`
- Converted flows:
  - Admin resets SOE cooldown.
  - Admin approves/rejects material requests.
  - Admin checks downloaded SOE/material compliance.
  - Student requests SOE/material approval.
  - Student downloads the application form and saves the download marker.
  - Student finalizes an SOE download.
  - Student saves SOE expense presets.
  - Student scholarship normalization/selection updates.
- React still keeps the same UI state and email calls, but Python performs the Supabase record updates.

### Admin grantor-student dashboard matching
- File: `backend/grantor_algorithms.py`
- Endpoint: `POST /admin/match-grantor-students`
- Frontend wrapper: `src/services/adminMatchingService.js`
- AdminDashboard now requests the matching lookup from Python.
- Browser fallback remains only for local development if the Python backend is unavailable.

### Admin student roster duplicate audit
- File: `backend/grantor_algorithms.py`
- Endpoint: `POST /admin/check-student-duplicates`
- Frontend wrapper: `src/services/adminMatchingService.js`
- Algorithm: Weighted Record Linkage with Levenshtein Similarity.
- Admin Student Management sends the combined student-account and grantor-roster rows to Python.
- Python returns duplicate row IDs and duplicate groups.
- The admin table, tab counts, and student-management stats hide duplicate rows, preferring real student accounts over roster-only rows.
- This keeps all grantor rosters available to admin while preventing the same student from appearing multiple times in the Student Management table.

### Report generation endpoints
- File: `backend/report_service.py`
- Endpoints:
  - `POST /reports/csv`
  - `POST /reports/pdf`
- `reportlab` and `pypdf` were added to `backend/requirements.txt`.
- Admin report buttons now call the Python report endpoints.
- PDF generation uses `public/Templates/FORMATTED_REPORT.pdf` as the page background, then overlays title, summary, and table data.
- CSV generation now calls Python first and falls back to browser CSV generation if the backend is unavailable.

## Not Changed

- Supabase Auth email confirmation flow.
- Supabase Auth forgot-password flow.
- Existing student/grantor/admin page behavior unless already calling a converted Python service.
- Existing report template file is not removed.
- Student warning maintenance documents are still maintained from React.
- Admin redesign and audit-log wiring are intentionally left for later.

## Environment Variables

Frontend:
```env
VITE_BACKEND_API_URL=https://bulsuscholar.onrender.com
VITE_DOCUMENT_SCAN_API_URL=https://bulsuscholar.onrender.com
VITE_RESEND_API_ENDPOINT=https://bulsuscholar.onrender.com/email/send
VITE_APP_URL=https://bulsu-scholar.vercel.app
VITE_PUBLIC_SITE_URL=https://bulsu-scholar.vercel.app
```

Python backend:
```env
RESEND_API_KEY=
RESEND_FROM_EMAIL=BulsuScholar <onboarding@resend.dev>
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DOCUMENT_SCAN_ALLOWED_ORIGINS=https://bulsu-scholar.vercel.app
FRONTEND_URL=https://bulsu-scholar.vercel.app
```

For production email branding, verify your domain in Resend before using a custom sender like `BulsuScholar <noreply@your-domain.com>`.

## Required Tests

### Backend startup
- Open `https://bulsuscholar.onrender.com/health`.
- Expected: `{"status":"ok"}`.

### Document scanning
- Upload COR.
- Confirm student ID, name, course/year/section autofill.
- Upload COG.
- Confirm COG identity is accepted when student number matches.
- Confirm printed GWA autofills.

### Grantor duplicate checking
- Import a CSV with a known duplicate student.
- Confirm duplicate rows are highlighted and not imported.
- Add a duplicate manually.
- Confirm warning appears and save is blocked.

### Signup roster matching
- Add student to a grantor roster.
- Create that student account.
- Confirm the matching grantor scholarship is attached/applied automatically.

### Scholarship application workflows
- Apply from a student announcement.
- Confirm the student `scholarships` list updates.
- Confirm a `scholarship_applications` row is created.
- Confirm grantor and student inbox notifications are created.
- Apply from the scholarship control center/catalog.
- Confirm the same student/application records are created as before.

### Grantor application update workflows
- As grantor, open an application review modal.
- Click `Complete Current Stage`.
- Confirm student scholarship tracking/status updates.
- Confirm `scholarship_applications` tracking/status updates.
- Confirm the student receives the progress notification.
- If the completed stage is final screening, confirm the scholar is added or updated in the grantor roster.

### Grantor roster, profile, and announcements
- Import scholars from CSV.
- Confirm accepted rows are inserted under the correct grantor roster.
- Add a scholar manually.
- Edit an existing scholar.
- Archive and unarchive selected scholars.
- Update grantor profile text fields and minimum GWA.
- Update the grantor profile photo.
- Toggle student applications open/closed.
- Request a password change from the grantor profile.
- Publish an announcement with images and required documents.
- Confirm the created announcement has the same title/subtitle/content/window/images as before.
- Archive an announcement.
- Confirm student and grantor inbox items are still created.

### Admin SOE/material workflows
- Reset SOE cooldown.
- Confirm student cooldown fields and request download fields update.
- Approve a material request.
- Confirm `soe_requests` status/material fields update.
- Mark a downloaded SOE/material signed or non-compliant.
- Confirm `soe_downloads`, `soe_requests`, and `students` updates match the previous behavior.

### Student SOE/material workflows
- Request SOE from the scholarship control center.
- Confirm `soe_requests` is created/updated and the student scholarship is finalized.
- Download the application form.
- Confirm the student scholarship download marker is saved.
- Save SOE expense presets.
- Preview and finalize SOE download.
- Confirm `soe_requests`, `soe_downloads`, and the student cooldown fields update.

### Admin grantor-student matching
- Open Admin dashboard scholarship/grantor views.
- Confirm active recipient counts still match previous data.
- Confirm selected student scholarship list still finds grantor roster matches.
- Stop Python backend and reload only for dev fallback testing.
- Confirm browser fallback still prevents a blank dashboard.

### Email
- Trigger a custom welcome/SOE email.
- Confirm request goes to `POST /email/send`.
- Confirm Supabase forgot-password and account confirmation still use Supabase Auth.

### Notifications
- Publish a grantor announcement.
- Confirm `POST /notifications/grantor/create` creates the grantor inbox item.
- Confirm `POST /notifications/student/create` creates student inbox items.
- Apply to an announcement as a student.
- Confirm the grantor receives the new application inbox item.
- Confirm the student receives the application submitted inbox item.
- Mark student inbox messages as read.
- Confirm `POST /notifications/student/update` preserves title/message and only adds read/readAt.
- Delete one student inbox message.
- Confirm `POST /notifications/student/delete`.
- Mark grantor inbox messages as read and delete one.
- Confirm `POST /notifications/grantor/update` and `POST /notifications/grantor/delete`.

### Scholarship rules
- Call `/scholarships/validate-documents` with missing COR/COG.
- Confirm missing document response.
- Call `/scholarships/check-gwa`.
- Confirm minimum GWA response.

### Reports
- Call `/reports/csv` with headers and rows.
- Confirm CSV downloads.
- Install backend requirements including `reportlab` and `pypdf`.
- Call `/reports/pdf`.
- Confirm PDF downloads.
- Confirm the PDF still uses `public/Templates/FORMATTED_REPORT.pdf` as the background template.
- From the admin report buttons, export each report type and compare columns/rows/counts with the previous frontend-generated report.

### Logs and notifications
- Call `/logs/build`.
- Confirm it returns a log payload.
- Do not wire into admin UI until admin redesign.

## Recommended Next Python Conversions

- Supabase Auth confirmation and forgot-password should stay in Supabase Auth for now because it safely handles token generation, expiration, and redirect/session exchange.
- Move scholarship application creation/update flows to Python after notification conversion is tested.
- Move remaining admin approval/rejection workflows to more specific Python endpoints during the admin redesign so status changes, logs, and notifications happen in one transaction-like backend action.
- Move storage upload post-processing metadata to Python only if uploads become server-mediated later.
- Move student warning maintenance to Python if those warning records become part of official admin reports.
