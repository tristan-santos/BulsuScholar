# BulsuScholar Agent Init

Use this file as startup context for future Codex sessions in this repo.

## 1) Project Summary
- Project: `BulsuScholar`
- Type: React + Vite scholarship management web app
- Main roles/pages:
  - Login + Signup
  - Admin portal (`/admin/*`, multi-section dashboard)
  - Student portal (Scholarships, Profile, Materials)
  - Grantor/Provider portals (Tina Pancho, Morisson, Kuya Win)
- Backend/services:
  - Firebase Auth + Firestore
  - Cloudinary for image/file uploads
  - EmailJS for compliance/conflict notifications
- PDF/export stack:
  - `pdf-lib` for SOE template filling
  - `jsPDF + autoTable` for admin PDF/CSV reports
- Active Firestore collections:
  - `students`, `pendingStudent`, `soeRequests`, `soeDownloads`, `announcements`, `providers`, `grantorPortals`, `scholarshipApplications`

## 2) Runtime + Commands
- Dev server: `npm run dev`
- Standalone seed entry: `http://localhost:5173/seed.html`
- Build: `npm run build`

## 3) Environment
- Firebase: `VITE_FIREBASE_*`
- Upload: `VITE_CLOUDINARY_*`
- EmailJS: `VITE_EMAILJS_*`
- Security: `VITE_PASSWORD_SECRET` (AES-256 for student passwords)

## 4) Current Routing
- `/` -> Login
- `/signup` -> Signup
- `/admin/*` -> Admin Dashboard (Overview, Students, Scholarships, Requests, Checking, Reports, Announcements)
- `/student-dashboard/*` -> Student View (Scholarships, Profile)
- `/provider-dashboard` -> Grantor View

## 5) Key Source Layout
- `src/pages/AdminDashboard.jsx`: Main admin container (large file, handles all sections).
- `src/services/adminService.js`: Table mapping and PDF report logic.
- `src/services/studentAccessService.js`: Central gatekeeper for student restrictions (Archived, Multiple Scholarship Conflict).
- `src/tools/studentSeed.js`: Seeds 100 students with complete data.
- `src/tools/grantorSeed.js`: Seeds login/portal data for the 3 main grantors.

## 6) Current Admin Portal State
- **Dashboard Overview**:
  - KPI cards for Students, Material Requests, and Scholars.
  - Distribution charts for Grantors and Student Lifecycle (Active vs Archived).
- **Student Management**:
  - Tabs: `Overview / Students / Archived` (Manual **Blocked** tab removed).
  - **Batch Archiving**: Supported via row checkboxes and a "Select All" header checkbox.
  - **Archive Button**: Repositioned to the far right of the tabs row; appears only when students are selected in the "Students" tab.
  - Individual "Archive" and "Block" buttons removed from UI.
- **Scholarship Programs**:
  - `Warning` tab surfaces students with multiple scholarships (conflicts).
- **Materials Request**: Handles `SOE` and `Application Form` approvals (`soeRequests`).
- **Materials Checking**: Validates actual SOE downloads (`soeDownloads`) against student records.
- **Report Center**:
  - Unified preview flow for all exports.
  - **High Risk** metric replaced the old "Blocked" count in Compliance reports (based on violation threshold).
- **Announcements**: Modern builder with Cloudinary multi-upload and custom date-range calendar.

## 7) Current Student Portal State
- **Access Control**:
  - **Archived** students are blocked from logging in.
  - **Manual Admin Blocks** (Account/Scholarship) have been removed/disabled.
  - **Multiple Scholarship Conflict**: Automatically blocks SOE/Application actions until the student chooses one provider.
- **Materials Flow**: Students request materials -> Admin approves -> Student downloads (creates `soeDownloads` row) -> Admin signs/checks.

## 8) Data and Workflow Notes
- **SOE Identifier**: Unified SOE request number format (`last 3 digits-6 random chars`) used across PDF, Firestore, and checking.
- **Auth**: Passwords stored via `encryptPasswordAES256`.
- **Seeder**: `seed.html` provides a comprehensive dev environment with 100 student profiles, grantor data (including Kuya Win), and materials checking rows.

## 9) UI/CSS Conventions
- **Admin**: `src/css/AdminDashboard.css` (Green accent, "boxed" tab design with scale-up hover effect).
- **Student**: `src/css/StudentDashboard.css`.
- **Tabs Row**: `.admin-tabs-row` uses `space-between` to align tabs left and batch actions (Archive) right.

## 10) Fast Start Checklist
1. Check `src/App.jsx` for routing.
2. If modifying student logic, check `studentAccessService.js`.
3. If modifying admin tables, check `AdminDashboard.jsx` and `adminService.js`.
4. Ensure `selectedStudentIds` is handled when adding batch actions.
5. Confirm if a record is from `students` or `pendingStudent` before updating.

## 11) Latest Session Changes (March 17, 2026)
- **Removed manual blocking**: UI and logic for manual admin blocks/unblocks were removed.
- **Removed "Blocked" tab**: Student management now only tracks Active and Archived states.
- **Batch Archiving**: Added row checkboxes and a repositioned "Archive" button in the tabs row.
- **Report Updates**: Replaced "Blocked" metrics with "High Risk" compliance monitoring in the Report Center.
- **Seeder Expansion**: Updated `studentSeed.js` to generate 100 complete student profiles, including `kuya_win` data and mock COR files.
