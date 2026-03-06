# BulsuScholar Agent Init

Use this file as the startup context for future Codex sessions in this repo.

## 1) Project Summary
- Project: `BulsuScholar`
- Type: React + Vite web app for scholarship management
- Main roles/pages:
  - Login + Signup
  - Admin dashboard
  - Student dashboard, scholarships, profile
  - Provider dashboard (basic scaffold)
- Backend services:
  - Firebase Auth + Firestore
  - Cloudinary for image uploads

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

## 4) Current Routing (src/App.jsx)
- `/` -> `LoginPage`
- `/signup` -> `SignupPage`
- `/admin-dashboard` -> `AdminDashboard`
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
  - `LoginPage.css`, `SignupPage.css`, `AdminDashboard.css`, `StudentDashboard.css`
- `src/services/`
  - `authService.js` (password encryption)
  - `cloudinaryService.js` (image upload)
  - `imgurService.js` (legacy/unused by current flows)
- `src/hooks/`
  - `useThemeMode.js` (global light/dark persistence)

## 6) Data/Behavior Notes
- Student ID session keys:
  - `bulsuscholar_userId`
  - `bulsuscholar_userType`
- Global theme key:
  - `bulsuscholar_theme`
- Student profile picture:
  - Uploaded to Cloudinary
  - Saved in Firestore `students/{userId}` as `profileImageUrl`
- Signup required documents depend on scholarships:
  - `Other` / `Kuya Win` => COR + COG + School ID required
  - Logic is dynamic and now clears stale file states when requirements change

## 7) Current UI/Feature State (important)
- Student:
  - Settings menu option removed
  - Statistics cards removed from dashboard
  - Profile page added (editable profile + photo upload)
  - Footer enhanced across student pages
- Theme:
  - Working light/dark mode across Admin/Student/Provider dashboard pages
  - Dark mode active indicator fixed in theme toggle buttons
- Notifications:
  - Notification UI removed from student pages

## 8) Known Repo Inconsistency
- `SETUP.md` references ImageBB in several sections, but current code paths use Cloudinary (`uploadToCloudinary`).
- If onboarding a new dev/agent, trust `src/services/cloudinaryService.js` and actual imports in pages over old setup text.

## 9) Coding Conventions for Future Changes
- Preserve current visual language (green-accent dashboard style).
- Prefer updating existing CSS files over creating many new style files.
- Keep role flows separate:
  - Admin styles in `AdminDashboard.css`
  - Student styles in `StudentDashboard.css`
- Always run `npm run build` after non-trivial edits.
- Avoid destructive git commands; do not revert unrelated user changes.

## 10) Fast Start Checklist for New Codex Session
1. Read this file (`agent.md`).
2. Check `src/App.jsx` for routes.
3. Check target page under `src/pages/`.
4. Check matching CSS under `src/css/`.
5. If upload/auth logic is touched, inspect `src/services/` and `firebase.js`.
6. Build with `npm run build` before finalizing.
