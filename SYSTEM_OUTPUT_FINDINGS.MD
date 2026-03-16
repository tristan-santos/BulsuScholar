# SYSTEM_OUTPUT_FINDINGS

Generated on March 16, 2026.

## Scope

This document consolidates the repo analysis performed on the `BulsuScholar` capstone system, including:

- architecture and workflow analysis
- codebase strengths
- risks and maintainability findings
- security findings
- current build and lint outputs
- prioritized next steps

## Repo Summary

`BulsuScholar` is a React 19 + Vite single-page application for scholarship management.

Primary flows:

- login and signup
- admin portal under `/admin/*`
- student dashboard
- student scholarships and materials workflow
- student profile management
- provider dashboard scaffold

Primary backend and integrations:

- Firestore as the operational data backend
- Firebase Auth initialized, but not used as the real sign-in flow
- Cloudinary for uploads
- EmailJS for notifications
- `pdf-lib` for SOE and application-form PDFs
- `jsPDF + autoTable` for admin exports

Main collections and workflow entities:

- `students`
- `pendingStudent`
- `scholarshipApplications`
- `soeRequests`
- `soeDownloads`
- `announcements`

## Architecture Read

### 1. App shell

The route shell is simple and thin in `src/App.jsx`:

- `/` -> login
- `/signup` -> signup
- `/admin/*` -> admin dashboard
- `/student-dashboard` -> student dashboard
- `/student-dashboard/scholarships` -> scholarship and materials workflow
- `/student-dashboard/profile` -> student profile
- `/provider-dashboard` -> provider scaffold

Most business behavior lives inside large page components rather than smaller feature components.

### 2. Domain design

The domain model is better than the UI structure.

Strong shared-rule modules:

- `src/services/studentAccessService.js`
- `src/services/materialRequestService.js`
- `src/services/soeRequestNumberService.js`
- `src/services/scholarshipService.js`
- `src/services/soeService.js`
- `src/services/adminService.js`

Good workflow decision:

- `soeRequests` is used for request and approval state
- `soeDownloads` is used for post-download checking and signing

That separation matches the actual business process and avoids overloading one collection for two different state machines.

### 3. Complexity concentration

The codebase is page-heavy and service-assisted.

Largest hotspots by file size:

- `src/pages/AdminDashboard.jsx`: 3931 lines
- `src/pages/SignupPage.jsx`: 2019 lines
- `src/pages/StudentScholarshipsPage.jsx`: 1956 lines

This means the repo's risk is not missing features. The risk is concentrated orchestration logic.

## Strengths

### 1. Real workflow coverage

This is not a basic CRUD capstone. The system covers:

- intake and validation
- auto-verification vs pending review
- multiple scholarship logic
- restrictions, archive state, and compliance holds
- material request approval
- SOE PDF generation
- SOE download tracking
- post-download compliance checking
- announcements with scheduling
- report export

### 2. Shared policy modules exist

Important business rules are centralized instead of fully duplicated in JSX:

- student access blocking and archive logic in `studentAccessService`
- material normalization in `materialRequestService`
- SOE number generation in `soeRequestNumberService`
- scholarship policy and document rules in `scholarshipService`

That is the right direction for the architecture.

### 3. Workflow split is sound

The separation between:

- `students` and `pendingStudent`
- `soeRequests` and `soeDownloads`

is valid from a business-process perspective. It models approval and compliance as different phases.

### 4. Seeder utility is useful

The standalone `seed.html` and `src/tools/materialCheckingSeed.js` utility is a practical operational tool for populating Materials Checking rows tied to real data.

## Major Findings

### Critical 1. Firestore security is effectively open

`firestore.rules` currently contains this logic:

- global `allow read, write`
- gated only by `request.time < timestamp.date(2026, 3, 23)`

The matching rule is at:

- `firestore.rules:15`

This means that as of March 16, 2026, the database is still effectively open to anyone with project access until March 23, 2026.

In this app, Firestore rules are the real backend security boundary. This is the highest-risk finding in the system.

### Critical 2. The actual login system is custom client-side password storage

The app initializes Firebase Auth in `firebase.js`, but the actual sign-in flow is not using Firebase Auth credentials.

Observed implementation:

- `src/pages/LoginPage.jsx:146` verifies passwords with `verifyPassword(...)`
- `src/pages/LoginPage.jsx:162-163` stores role and user id in session storage
- `src/pages/SignupPage.jsx:547` encrypts the password in the client
- `src/services/authService.js` performs reversible AES encryption/decryption in the browser

`VITE_PASSWORD_SECRET` is not a secret in a Vite app because `VITE_*` variables are exposed to the client bundle.

Operationally, this means:

- passwords are being protected by a client-known key
- the system is not relying on Firebase Auth as the source of truth
- role and session handling depend heavily on client state and Firestore contents

### High 3. Password reset route is incomplete

`src/pages/LoginPage.jsx:73` generates a reset URL:

- `/reset-password?userId=...`

But `src/App.jsx` has no reset-password route.

Result:

- the forgot-password email flow can send a link
- the app does not currently expose a page to handle that link

### High 4. Admin dashboard is the main maintainability risk

`src/pages/AdminDashboard.jsx` is the central complexity hotspot.

Confirmed patterns:

- collection subscriptions live in the same component around lines `802`, `810`, `826`, `834`, and `842`
- student restriction logic around `1887`
- student validation actions around `1983`
- material request review logic around `2134`
- materials checking review logic around `2228`
- report preview/export logic around `2503-2508`
- announcement writes around `2350`

Practical risk:

- small changes can break unrelated tabs
- derived rows and modal state are hard to reason about
- regression risk grows with every new admin feature

### High 5. Route protection is mostly client-side

The route shell mounts pages directly without dedicated guard components. Real protection is coming from:

- page-level checks
- session storage keys
- Firestore rules

This is weaker than a model centered on:

- real Firebase Auth state
- role validation
- guarded routes
- strict server-side or rules-side enforcement

### Medium 6. Multi-source state creates drift risk

Your model intentionally merges data from related collections:

- `students` + `pendingStudent`
- `soeRequests` + `soeDownloads`

This is acceptable, but it increases the chance of:

- partial updates
- inconsistent filters
- stale derived rows
- UI states that disagree with stored data

The normalization services help, but the page components still own too much orchestration directly.

### Medium 7. Bundle size is heavy

The app eagerly carries:

- Firebase
- charts
- PDF generation libraries
- report code
- upload integrations
- large admin UI logic

The build output confirms a large main chunk:

- `assets/index-BT5N8I2w.js`: `1,912.13 kB` minified
- gzip size: `631.31 kB`

This is consistent with the existing Vite chunk warning.

### Medium 8. Repo drift and dead-weight dependencies exist

Observed drift:

- `README.md` is still the default Vite template
- `SETUP.md` still has older setup drift according to repo notes
- `package.json` still includes packages that do not match the active path

Notable dependency drift:

- active upload path is Cloudinary
- ImageKit packages are still present
- `express` and `cors` are present in a frontend repo
- legacy `imgurService.js` still exists

This raises confusion and bundle/maintenance cost.

## Key File Notes

### `firebase.js`

Findings:

- initializes Firebase app
- exports Firestore and Auth
- calls `getAnalytics(app)` directly

Relevant lines:

- `firebase.js:20`
- `firebase.js:21`
- `firebase.js:22`

### `src/pages/LoginPage.jsx`

Findings:

- checks user document IDs across `students`, `admins`, and `providers`
- verifies password via custom decryption logic
- stores session info in `sessionStorage`
- forgot-password link points to a route not present in the app

Relevant lines:

- `src/pages/LoginPage.jsx:25`
- `src/pages/LoginPage.jsx:73`
- `src/pages/LoginPage.jsx:146`
- `src/pages/LoginPage.jsx:162`

### `src/pages/SignupPage.jsx`

Findings:

- performs large in-page validation flow
- uploads documents directly to Cloudinary
- encrypts password client-side
- writes either to `students` or `pendingStudent`
- auto-verification logic is embedded in the page

Relevant lines:

- `src/pages/SignupPage.jsx:418`
- `src/pages/SignupPage.jsx:547`
- `src/pages/SignupPage.jsx:553`
- `src/pages/SignupPage.jsx:571`
- `src/pages/SignupPage.jsx:591`
- `src/pages/SignupPage.jsx:642`
- `src/pages/SignupPage.jsx:670`

### `src/pages/StudentDashboard.jsx`

Findings:

- subscribes to the student document in real time
- force-logs out students if admin-side blocking/archive state changes
- fetches latest announcements separately

Relevant lines:

- `src/pages/StudentDashboard.jsx:95`
- `src/pages/StudentDashboard.jsx:131`

### `src/pages/StudentScholarshipsPage.jsx`

Findings:

- owns scholarship application, material request, SOE export, SOE preview, SOE download confirmation, and application form download
- writes approved download events into `soeDownloads`
- re-checks student access state before final SOE download

Relevant lines:

- `src/pages/StudentScholarshipsPage.jsx:675`
- `src/pages/StudentScholarshipsPage.jsx:1010`
- `src/pages/StudentScholarshipsPage.jsx:1137`
- `src/pages/StudentScholarshipsPage.jsx:1227`

### `src/pages/StudentProfilePage.jsx`

Findings:

- subscribes to live student document state
- uploads profile image and documents directly to Cloudinary
- updates profile data directly into Firestore

### `src/pages/AdminDashboard.jsx`

Findings:

- handles dashboard analytics
- student management
- scholarship views
- materials request
- materials checking
- report generation
- announcements

This file is the main refactor candidate in the repo.

Relevant lines:

- subscription setup: `802`, `810`, `826`, `834`, `842`
- save restrictions: `1887`
- approve validation: `1983`
- disapprove validation: `2050`
- request review: `2134`
- checking review: `2228`
- announcement write: `2350`
- report preview/export: `2503`, `2508`

## Current Command Outputs

## `npm run build`

Status:

- passed

Observed output summary:

- build completed successfully
- 549 modules transformed
- main CSS output: `199.55 kB`
- main JS chunk: `1,912.13 kB`
- main JS gzip: `631.31 kB`
- Vite warning still present for chunks larger than `500 kB`

Notable lines:

- `dist/assets/index-BT5N8I2w.js 1,912.13 kB`
- `gzip: 631.31 kB`
- warning suggests dynamic imports or manual chunks

## `npm run lint`

Status:

- failed

Reported result:

- 20 problems total
- 19 errors
- 1 warning

### Admin dashboard lint issues

`src/pages/AdminDashboard.jsx`

- unused `startOfYear`
- unused `getEarliestDate`
- unused `buildTimelineSeries`
- unused `toSoeWarningReportRow`
- unused assigned `id`

### Signup page lint issues

`src/pages/SignupPage.jsx`

- unnecessary escape characters in regex
- unused `kuyaWinCor`
- unused `setKuyaWinCor`
- unused `kuyaWinCog`
- unused `setKuyaWinCog`
- unused `kuyaWinSchoolId`
- unused `setKuyaWinSchoolId`
- `react-hooks/set-state-in-effect` violation caused by synchronous `setCorFile(null)` in an effect

### Student scholarships page lint issues

`src/pages/StudentScholarshipsPage.jsx`

- unused `isMaterialApproved`
- unused `isMaterialPending`
- unused `isMaterialRejected`
- unnecessary `useCallback` dependency warning

## Overall Assessment

This is a strong capstone in terms of business scope, workflow realism, and feature completeness.

The system's main weakness is not feature coverage. The weakness is architectural concentration:

- too much trust in the client
- too much business orchestration inside page components
- too much admin behavior inside one file

If the project keeps growing without refactoring, the likely failure mode is regression-by-edit, especially in admin tables, materials workflows, and CSS behavior.

## Priority Recommendations

### 1. Fix Firestore rules immediately

Highest priority:

- replace the global open rule
- enforce role-based access by authenticated identity and document ownership
- treat Firestore rules as the real backend API boundary

### 2. Replace the custom password system

Move authentication to real Firebase Auth:

- sign up with Firebase Auth credentials
- sign in with Firebase Auth
- use Firestore only for profile and role data
- remove reversible password storage from Firestore

### 3. Add proper route guards

Introduce guarded routing based on:

- authenticated state
- verified role
- student access restrictions

This should not rely mainly on `sessionStorage`.

### 4. Split `AdminDashboard.jsx`

Recommended breakdown:

- `AdminDashboardLayout`
- `AdminDashboardOverviewSection`
- `AdminStudentsSection`
- `AdminScholarshipsSection`
- `AdminMaterialsRequestSection`
- `AdminMaterialsCheckingSection`
- `AdminReportsSection`
- `AdminAnnouncementsSection`

Then move derived row logic into dedicated hooks/selectors.

### 5. Add tests around policy code first

Best first test targets:

- `studentAccessService.js`
- `materialRequestService.js`
- `soeRequestNumberService.js`
- scholarship normalization and warning logic
- report row builders in `adminService.js`

### 6. Reduce bundle size

Recommended:

- lazy-load admin pages
- lazy-load chart/report/PDF-heavy code
- remove unused dependencies
- consider manual chunks in Vite config if needed

### 7. Clean repo drift

Recommended:

- replace default `README.md`
- reconcile `SETUP.md` with Cloudinary-based reality
- remove legacy or unused services and packages
- clearly document which integrations are active vs legacy

## Suggested Next Deep-Dive Options

If more analysis is needed, the next best targeted passes are:

1. security review focused on Firestore rules and auth model
2. admin architecture refactor plan for `AdminDashboard.jsx`
3. data-consistency review of `students`, `pendingStudent`, `soeRequests`, and `soeDownloads`
4. lint-fix and cleanup pass before structural refactors
