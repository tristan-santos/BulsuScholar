# BulsuScholar Agent Init

Use this file as startup context for future Codex sessions in this repo.

## 1) Project Summary
- Project: `BulsuScholar`
- Type: React + Vite scholarship management web app
- Main roles/pages:
  - Login + Signup
  - Admin portal (`/admin/*`, multi-section dashboard)
  - Student dashboard + scholarships + profile
  - Provider dashboard (basic scaffold)
- Backend/services:
  - Firebase Auth + Firestore
  - Cloudinary for image/file uploads
  - EmailJS for compliance/restriction email notifications
- PDF/export stack:
  - `pdf-lib` for SOE template filling
  - generated Application Form PDF service
  - `jsPDF + autoTable` for admin PDF exports
- Active Firestore collections commonly touched by the app:
  - `students`
  - `pendingStudent`
  - `soeRequests`
  - `soeDownloads`
  - `announcements`

## 2) Runtime + Commands
- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Preview build: `npm run preview`
- Lint: `npm run lint`
- Standalone seed entry:
  - run `npm run dev`
  - open `http://localhost:5173/seed.html`
- Repo helper scripts that exist but are not core workflow:
  - `npm run gitgit`
  - `npm run tapos`

## 3) Environment
- Env files:
  - `.env` (local secrets)
  - `.env.example` (template)
- Important vars used by code:
  - Firebase:
    - `VITE_FIREBASE_API_KEY`
    - `VITE_FIREBASE_AUTH_DOMAIN`
    - `VITE_FIREBASE_PROJECT_ID`
    - `VITE_FIREBASE_STORAGE_BUCKET`
    - `VITE_FIREBASE_MESSAGING_SENDER_ID`
    - `VITE_FIREBASE_APP_ID`
    - `VITE_FIREBASE_MEASUREMENT_ID`
  - Upload:
    - `VITE_CLOUDINARY_CLOUD_NAME`
    - `VITE_CLOUDINARY_UPLOAD_PRESET`
  - EmailJS:
    - `VITE_EMAILJS_SERVICE_ID`
    - `VITE_EMAILJS_TEMPLATE_ID`
    - `VITE_EMAILJS_PUBLIC_KEY`
  - Security:
    - `VITE_PASSWORD_SECRET`
- Note:
  - local setups may leave `VITE_FIREBASE_STORAGE_BUCKET` blank; the seed tool should not hard-fail on that optional value

## 4) Current Routing + Standalone Entries
- `src/App.jsx`
  - `/` -> `LoginPage`
  - `/signup` -> `SignupPage`
  - `/admin/*` -> `AdminDashboard`
  - `/admin-dashboard` -> redirects to `/admin/dashboard`
  - `/student-dashboard` -> `StudentDashboard`
  - `/student-dashboard/scholarships` -> `StudentScholarshipsPage`
  - `/student-dashboard/profile` -> `StudentProfilePage`
  - `/provider-dashboard` -> `ProviderDashboard`
  - `*` -> redirects to `/`
- Standalone Vite page:
  - `/seed.html` -> Materials Checking seeder UI

## 5) Key Source Layout
- `src/pages/`
  - `LoginPage.jsx`
  - `SignupPage.jsx`
  - `AdminDashboard.jsx`
  - `StudentDashboard.jsx`
  - `StudentScholarshipsPage.jsx`
  - `StudentProfilePage.jsx`
  - `ProviderDashboard.jsx`
- `src/css/`
  - `AdminDashboard.css`
  - `StudentDashboard.css`
  - `LoginPage.css`
  - `SignupPage.css`
- `src/services/`
  - `adminService.js` - admin table mapping/filtering + PDF report generation
  - `applicationFormService.js` - application form PDF generation
  - `authService.js`
  - `cloudinaryService.js` - active upload path
  - `emailService.js` - EmailJS notification wrapper
  - `imgurService.js` - legacy fallback, not primary
  - `materialRequestService.js` - canonical materials request normalization
  - `scholarshipService.js` - scholarship policy/rules and scholarship request numbers
  - `soeRequestNumberService.js` - shared SOE request-number generation/normalization
  - `soeService.js` - SOE PDF template export
  - `studentAccessService.js` - student block/archive/compliance access logic
- `src/tools/`
  - `materialCheckingSeed.js` - logic for `seed.html`
- `src/hooks/`
  - `useThemeMode.js`
- `public/`
  - `soe-template-fields.pdf`
  - `soe-template.pdf`

## 6) Session/Data Keys
- Session storage:
  - `bulsuscholar_userId`
  - `bulsuscholar_userType`
- Local storage:
  - `bulsuscholar_theme`

## 7) Current Admin Portal State
`src/pages/AdminDashboard.jsx` is still a large all-in-one admin container. Treat derived row builders and section-specific tab filters carefully before changing JSX.

- Dashboard
  - KPI cards show `Total Students`, `Total Material Requests`, and `Total Scholars`
  - `Scholarship Applicant Tracking` chart
  - `Grantor Distribution` doughnut + percentage list
  - `SOE Volume Timeline` chart
  - range behavior still uses current-month daily/weekly views and broader monthly/yearly views
  - the grantor pie tooltip is disabled; hover highlighting still drives the center note/list emphasis

- Student Management
  - Tabs: `Overview / Students / Blocked / Archived`
  - tables/search merge `students` and `pendingStudent`
  - `View Information` modal is the main review shell
  - pending-only records are validation-only inside the modal
  - restriction/archive actions apply only to records already in `students`
  - archived students are retained for reporting/history and can be unarchived from the modal

- Scholarship Programs
  - Tabs:
    - `Overview`
    - `Warning`
    - `No Program`
    - provider tabs
  - `Warning` is reserved for students with multiple scholarships
  - warning students are excluded from provider tabs to avoid duplication
  - overview search/report/export behavior is aligned with the visible overview rows
  - PDF export is tab-aware:
    - `Overview` exports all scholarship program rows
    - provider tabs export only the active visible table
    - `Warning` exports only warning rows

- Materials Request
  - Admin nav label replaced the old SOE Request naming
  - Tabs: `Requesting / Requested`
  - source of truth is `soeRequests`
  - this section handles student requests for:
    - `SOE`
    - `Application Form`
  - `Requesting` is the approval queue
  - if a request has mixed states, `Requesting` should show only the still-pending materials, not already approved items
  - `Requested` shows approved material sets
  - keep the table compact; detailed status, download, and timer info belong in the modal
  - one review action can approve both materials when both are pending on the same request

- Materials Checking
  - Tabs: `Pending / Signed / Non-Compliant`
  - source of truth is `soeDownloads`, not `soeRequests`
  - rows are created only after a student actually downloads an SOE
  - admin checks the SOE request number against the student record, then:
    - `Sign SOE`
    - `Mark Non-Compliant`
  - modal review flow is the active pattern

- Report Generation
  - section is redesigned as `Report Center`
  - badge copy says `Realtime database`
  - unified preview modal is still the export path for students, scholarships, materials, and compliance reports
  - preview close button sits outside the modal shell
  - `Coverage Snapshot` currently uses a white background design

- Announcements
  - modern card-based builder
  - multiple image upload via Cloudinary
  - single-button custom date-range calendar:
    - first click = start
    - second click = end
    - past dates blocked
  - current vs previous announcement split with archive flow
  - shared loading copy reads `Loading Data`

## 8) Current Student Portal State
- `studentAccessService.js` is the shared gatekeeper for:
  - archived account state
  - blocked account access
  - blocked scholarship eligibility
  - compliance holds
  - multiple-scholarship conflict blocking
- Archived students cannot log in
- If admin blocks or archives a student while they are logged in, the student pages react to the updated Firestore state
- Blocked students see:
  - a top warning banner
  - red-tinted scholarship cards / preview cards
- Multiple-scholarship logic:
  - students with multiple scholarships must choose one scholarship first
  - SOE and Application Form actions stay blocked until only one scholarship remains
  - admin `Warning` rows in Scholarship Programs surface these conflicts
- Materials flow on student pages:
  - student requests `SOE` or `Application Form`
  - admin approves in `Materials Request`
  - only approved materials can be downloaded
  - downloading SOE writes a new row into `soeDownloads`
- Student profile image uploads still go to Cloudinary and store in `students/{userId}.profileImageUrl`

## 9) Data and Workflow Notes
- Materials Request vs Materials Checking are different flows:
  - `soeRequests` = request/approval workflow
  - `soeDownloads` = downloaded SOEs awaiting checking/signing
- SOE request number is the single primary identifier used across:
  - SOE PDF
  - `soeDownloads`
  - Materials Checking
  - seeding tool
- SOE request number format:
  - `last 3 student digits + "-" + 6 lowercase alphanumeric characters`
  - example: `123-ab4k9q`
- Use `soeRequestNumberService.js` when generating or normalizing that identifier
- The SOE PDF should carry the request number on the PDF itself through `soeService.js`
- Student-facing scholarship cards should not display the request number anymore
- Material request normalization should go through `normalizeMaterialRequest` / `getMaterialEntry`
- SOE cooldown reset behavior:
  - clears request-side SOE downloaded markers
  - uses `students.soeCooldownOverrideAt` for persisted reset gating
- Restriction/compliance email behavior:
  - EmailJS warnings should surface explicitly if email is missing or the email send fails

## 10) Seeder Notes
- `seed.html` is a standalone admin/dev utility page
- It reads real data from:
  - `students`
  - `soeRequests`
  - `soeDownloads`
- It generates Materials Checking seed rows tied to real student snapshots and scholarship data
- It writes directly into `soeDownloads`
- It supports:
  - preview batch
  - seed batch
  - delete latest seeded batch
  - delete all seeded rows created by the tool
- Open it through the Vite dev server, not directly as a local file

## 11) Known Repo Notes
- `SETUP.md` still references ImageBB in parts; code uses Cloudinary
- Trust live imports and current service usage over older setup docs
- `firebase.js` initializes analytics directly via `getAnalytics(app)`
- `src/pages/AdminDashboard.jsx` contains most admin behavior in one file and many derived row builders
- `src/css/AdminDashboard.css` still contains older duplicate rules in earlier sections; the later appended rules usually win by cascade
- Build passes, but Vite still reports the existing large main-chunk warning (`>500 kB` after minification)

## 12) UI/CSS Conventions
- Keep admin-related style updates in `src/css/AdminDashboard.css`
- Keep student-related style updates in `src/css/StudentDashboard.css`
- Prefer extending current class systems over adding new CSS files
- Preserve the current green-accent visual language unless the section already has a distinct scoped treatment
- Shared admin view buttons use the white `admin-table-btn--view` style
- Review/report close buttons are intentionally placed outside the modal box in some shells
- The Materials Request review modal now uses grouped section-and-row layout instead of stacked info cards; preserve that pattern if you adjust it

## 13) Fast Start Checklist
1. Read this file (`AGENTS.md`).
2. Check routes in `src/App.jsx`.
3. Inspect the target page in `src/pages/` and matching CSS.
4. If touching admin logic, inspect `src/pages/AdminDashboard.jsx` and `src/services/adminService.js`.
5. If a table/search looks wrong, inspect these derived sources before changing JSX:
   - `allStudentsRaw`
   - `studentProfiles`
   - `filteredScholarships`
   - `soeRows`
   - `requestingSoeRows`
   - `requestedSoeRows`
   - `soeDownloadRows`
6. If touching student access/block behavior, inspect `src/services/studentAccessService.js`.
7. If touching materials request state, inspect `src/services/materialRequestService.js`.
8. If touching SOE numbering or the SOE PDF, inspect:
   - `src/services/soeRequestNumberService.js`
   - `src/services/soeService.js`
9. If touching seeding or Materials Checking test data, inspect:
   - `seed.html`
   - `src/tools/materialCheckingSeed.js`
10. If a modal action touches student records, confirm whether the row came from `students` or `pendingStudent`.
11. Run `npm run build` before finalizing non-trivial changes.

## 14) Latest Session Changes (March 13, 2026)
- Materials Request and Materials Checking are now separate workflows with separate Firestore sources
- SOE request number is unified as the single SOE identifier and is printed on the SOE PDF
- Student scholarship cards no longer display the request number
- Scholarship export in Scholarship Programs is now scoped to the active table/tab
- Report Generation was redesigned into `Report Center`
- `Coverage Snapshot` now uses a white background design
- Materials Request `Requested` table was compacted and extra details were moved into the review modal
- Materials Request review modal was flattened into section-and-row layout instead of box-by-box cards
- `seed.html` was added to seed Materials Checking rows into `soeDownloads`
