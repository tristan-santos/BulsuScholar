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
  - Firebase (Firestore + Auth)
  - Cloudinary for image/file uploads
  - jsPDF + autoTable for admin PDF exports

## 2) Runtime + Commands
- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Preview build: `npm run preview`
- Lint: `npm run lint`

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
  - Security:
    - `VITE_PASSWORD_SECRET`

## 4) Current Routing (`src/App.jsx`)
- `/` -> `LoginPage`
- `/signup` -> `SignupPage`
- `/admin/*` -> `AdminDashboard` (internal section routing by pathname)
- `/admin-dashboard` -> redirects to `/admin/dashboard`
- `/student-dashboard` -> `StudentDashboard`
- `/student-dashboard/scholarships` -> `StudentScholarshipsPage`
- `/student-dashboard/profile` -> `StudentProfilePage`
- `/provider-dashboard` -> `ProviderDashboard`

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
  - `adminService.js` (mapping/filtering + PDF report generation)
  - `scholarshipService.js` (scholarship policy/rules)
  - `cloudinaryService.js` (active upload path)
  - `imgurService.js` (legacy fallback, not primary)
  - `authService.js`
- `src/hooks/`
  - `useThemeMode.js`

## 6) Session/Data Keys
- Session storage:
  - `bulsuscholar_userId`
  - `bulsuscholar_userType`
- Local storage:
  - `bulsuscholar_theme`

## 7) Current Admin Portal State (Important)
`src/pages/AdminDashboard.jsx` is now a large all-in-one admin container with these sections:
- Dashboard
  - KPI cards
  - College Applications Overview line/area chart with `Daily / Weekly / Monthly / Yearly` range buttons
  - Scholarship Distribution donut + horizontal percentage bars
  - SOE Volume chart with `Daily / Weekly / Monthly / Yearly` range buttons
- Student Management
  - Search + filters + status badges
  - “View Information” opens rich student detail modal
- Scholarship Programs
  - Distribution/volume charts
  - Collapsible warning + provider tables
- SOE Requests
  - Search + status filters only (no range filter here)
  - Reset timer button disable/re-enable logic per student request cycle
- Announcements
  - Card-based form
  - Multiple image upload (Cloudinary)
  - Single-button custom date-range calendar popover:
    - first click = start
    - second click = end
    - past dates blocked/disabled
  - Current vs Previous announcements with archive flow

## 8) Student/Profile State (Important)
- Student profile image uploads to Cloudinary and stores in `students/{userId}.profileImageUrl`.
- Signup and scholarship flows still enforce document requirements by provider policy.
- Student pages continue to use green-accent styling and shared theme behavior.

## 9) Known Repo Notes
- `SETUP.md` still references ImageBB in parts; code uses Cloudinary.
- Trust live imports and service usage over old setup docs.
- `firebase.js` initializes analytics directly via `getAnalytics(app)`.

## 10) UI/CSS Conventions
- Keep admin-related style updates in `src/css/AdminDashboard.css`.
- Keep student-related style updates in `src/css/StudentDashboard.css`.
- Prefer extending existing class systems over creating new CSS files.
- Preserve current green-accent visual language and accessibility-first sizing in admin UI.

## 11) Fast Start Checklist
1. Read this file (`AGENTS.md`).
2. Check routes in `src/App.jsx`.
3. Inspect target page in `src/pages/` and matching CSS.
4. If touching admin logic, inspect `src/pages/AdminDashboard.jsx` and `src/services/adminService.js`.
5. If touching scholarship business rules, inspect `src/services/scholarshipService.js`.
6. If touching upload flows, inspect `src/services/cloudinaryService.js` and related page handlers.
7. Run `npm run build` before finalizing non-trivial changes.
