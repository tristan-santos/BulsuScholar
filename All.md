# File: ADMIN_DASHBOARD_REVAMP.md
# BulsuScholar: Admin Dashboard Revamp & Management System

This document serves as the master specification for the Admin Dashboard overhaul. The goal is to transition the Admin interface to a high-density, professional management portal with a persistent sidebar and advanced data tracking.

---

## 1. Architectural Layout: Persistent Sidebar
**Objective:** Replace the current header-based navigation with a professional left-aligned sidebar.

- **Sidebar Configuration:**
  - **Position:** Left side, fixed, and always open.
  - **Width:** Approximately `260px` to `280px`.
  - **Styling:** Dark BulSU Green (`#004d2e`) or a clean white with subtle borders.
  - **Navigation Items:**
    - **Dashboard** (Bento-box Home)
    - **Student Management** (Table view)
    - **Scholarship Programs** (Catalog/Management)
    - **SOE Requests** (Approval queue)
    - **Announcements** (Feed management)
    - **Settings/Admin Profile**
  - **Bottom Section:** Admin profile snippet and Logout button.

---

## 2. Admin Dashboard: Magic Bento Integration
**Objective:** Mirror the modern visual language of the Student Dashboard using the `MagicBento` component.

- **Dashboard Content:**
  - Use the `MagicBento` component for the landing page (`AdminDashboard.jsx`).
  - **Bento Items:**
    - **Statistics Overlook:** Total Students, Active Scholarships, Pending SOEs (High-density counters).
    - **Recent Activity:** A small feed of recent scholarship applications or SOE requests.
    - **System Health:** Quick status of Supabase/Cloudinary connections.
    - **Quick Actions:** Buttons to "New Announcement" or "Export System Audit".

---

## 3. Data Management & Tracking (Tabular System)
**Objective:** Implement dedicated pages for Students and Scholarships with robust filtering.

### A. Student Management Page
- **View:** Full-width data table.
- **Columns:** Student ID, Full Name, Course, Year Level, Validation Status, Applied Scholarship.
- **Filtering:** 
  - Filter by Course, Year, and Validation Status.
  - Search bar for Name or Student ID.

### B. Scholarship Management Page
- **View:** Full-width data table or card grid.
- **Columns:** Program Name, Provider Type, Total Slots, Active Recipients, Status (Open/Closed).
- **Filtering:** Filter by Provider (Kuya Win, Tina Pancho, etc.) or Status.

---

## 4. Report Generation: PDF Export System
**Objective:** Allow admins to generate filtered reports for offline use.

- **Logic:** 
  - Each management table must have a "Generate Report (PDF)" button.
  - **Filtered Context:** The PDF generator must respect the *current* state of the table filters. (e.g., If the admin filters for "BSIT" students, the PDF should only contain BSIT students).
- **Implementation:** 
  - Use a library like `jsPDF` and `jspdf-autotable`.
  - Header of the PDF should include the BulsuScholar logo and the current date/academic year.

---

## 5. Technical Requirements for Codex
1. **Routing:** Update `App.jsx` to support the new sidebar layout for all `/admin/*` routes.
2. **CSS:** Create/Update `AdminDashboard.css` to handle the sidebar flex layout and the `MagicBento` styling.
3. **Services:** Ensure `scholarshipService.js` or a new `adminService.js` handles the filtered data fetching and PDF logic.
4. **Consistency:** Maintain BulSU Green (`#00633C`) accents and support both Light and Dark modes.

---

## 6. Implementation Checklist
- [ ] Persistent Left Sidebar implemented and responsive.
- [ ] Admin Dashboard uses `MagicBento` for main metrics.
- [ ] Student Management page created with table and filters.
- [ ] Scholarship Management page created with table and filters.
- [ ] PDF Generation service respects active table filters.
- [ ] Dark Mode support verified for all Admin pages.

# File: ADMIN_REVAMP_CODEX_V2.md
# BulsuScholar: Admin System Revamp v2 (Codex)

This document serves as the primary technical and design specification for the 2025/2026 Admin System overhaul. It prioritizes modern "Industry-Proof" UI/UX, data visualization, and streamlined administrative workflows.

---

## 1. Dashboard: Advanced Analytics
**Objective:** Transition from static data to interactive, high-fidelity visualizations using **Chart.js**.

- **Scholarship Applicant Tracking:**
    - Replace the "Scholarship Distribution" bar graph with a **Line Chart**.
    - **Data Focus:** Track applicant volume over time.
    - **Styling:** Smooth curves (tension), point highlighting, and gradient fills under the lines.
- **SOE Volume Timeline:**
    - The time axis for SOE (Statement of Expenditures) Volume must start strictly from **January 1, 20xx**.
- **Grantor Distribution Chart:**
    - Revert the "Scholarship Status Mix" pie graph to **Scholarship Distribution per Grantor**.
    - **Features:** 
        - Display percentage values directly on or beside segments.
        - Integrate the **Loading Bar** animation used in previous versions for data fetching states.
        - High-contrast professional color palette for different grantors.

---

## 2. Student Management: Precision Controls
**Objective:** Enhance the granularity of student status management and improve modal ergonomics.

- **Archive/Unarchive Workflow:**
    - Implement a clear "Unarchive" option for previously archived students.
    - **Archived Logic:** Archived students are "log-only." The admin **cannot** block their scholarship or account while they are in the archived state.
- **Restriction Modal UI:**
    - **Input Type:** Change the "Blocked Students" checklist to a **Radio Button** group for mutually exclusive states.
    - **Save Button Logic:** The "Save Restriction" button must remain **disabled** until a specific block option is selected or the user is explicitly unblocked.
    - **Modal Interaction:** Enable "Click-to-Dismiss" behavior; clicking outside the modal boundary must automatically close it.
- **Action Buttons Layout:**
    - **Structure:** `display: flex; flex-direction: row;`
    - **Sizing:** Buttons must occupy **50% width each**, filling the entire container width.
    - **Spacing:** `margin: clamp(0.75rem, 1.5rem, 1.5rem);` applied to all sides for responsive breathing room.

---

## 3. Scholarship Programs: Visual Overview
**Objective:** Shift from tabular data to visual insights in the main management view.

- **Overview Section:** 
    - **Requirement:** Remove the table from the "Overview" tab.
    - **Replacement:** Use a dedicated analytics dashboard featuring charts and graphs representing the scholarship program's data distribution and performance.

---

## 4. SOE Workflows (Request & Checking)
**Objective:** Simplify navigation and formalize the checking/signing process.

- **SOE Request Navigation:**
    - Simplify tabs to only: **"Requested"** and **"Warning"**.
    - Remove "History" and "Pending" from this specific view.
- **SOE Checking Modal:**
    - Implement a modal popup for the checking process.
    - **Actions:**
        - **"Sign" Button:** Changes the review state to **"Signed"**.
        - **"Not actual Data" Button:** Changes the review state to **"Non-compliant"**.
    - **Note:** The button area should focus on the signing action rather than raw data display.

---

## 5. Report Generation: Comprehensive Previews
**Objective:** Provide a "Pre-flight" check for all generated documents.

- **One-Generation per Section:** Apply a unified generation logic across all report types.
- **Preview Modal:**
    - Clicking generate must open a modal showing a **Live Preview** of the file.
    - **Export Options:** Clear toggle/dropdown to choose between **PDF** or **CSV** formats.
- **Enhanced Preview UI:** Add modern analytic elements (mini-charts or summary tiles) within the preview to provide immediate context.

---

## 6. Announcement Management
**Objective:** Professionalize the communication toolset.

- **Form Design:** Modern, industry-standard input fields with clear floating labels.
- **Image Upload:**
    - Change the "Choose Images" button color/style.
    - Include a prominent **Upload Icon** (e.g., Lucide or FontAwesome).
- **Scheduling Layout:** The "Schedule" and "Post" buttons must each occupy **50% of the parent container's width**.

---

## 7. Global UI/UX & Theming (2025/2026 Standards)
**Objective:** Ensure a "cutting-edge" feel that competes with modern enterprise dashboards.

- **Chrome-Style Tabulation:**
    - Navigation tabs should mimic **Google Chrome's tab design** (slight curves, distinct "active" tab shape).
    - Include **relevant icons** within each tab for faster visual recognition.
- **Dark Mode Enhancements:**
    - When Dark Mode is active, update the **background color of buttons** to provide better contrast and a distinct "Dark Mode" aesthetic.
- **Design Philosophy:** 
    - Prioritize a "Modern & Industry-Proof" look.
    - Use clean lines, subtle shadows, and a focus on user-friendliness.
    - Target a high-end 2025/2026 aesthetic (Glassmorphism, Bento-style containers where appropriate, or clean Minimalist Professional).

---

## 8. Implementation Checklist
- [ ] Refactor `AdminDashboard.jsx` (Chart.js Line Graph + SOE Timeline).
- [ ] Update `StudentManagement` (Unarchive + Modal Radio Buttons + Flex Buttons).
- [ ] Modify `ScholarshipPrograms` (Overview Analytics vs. Tables).
- [ ] Update `SOEService` & UI (Requested/Warning Tabs + Signed/Non-compliant States).
- [ ] Implement `ReportGeneration` Preview Modal.
- [ ] Revamp `AnnouncementForm` (Modern UI + 50% width buttons).
- [ ] Global CSS: Chrome-style tabs and Dark Mode button states.

# File: ADMIN_REVAMP_CODEX.md
# BulsuScholar: Admin Dashboard Senior-Friendly Overhaul

This document serves as the master UI/UX and functional specification for the next phase of the BulsuScholar Admin System. The primary focus is **Accessibility**, **Visual Clarity**, and **Analytical Depth**.

---

## 0. Core Design Philosophy (Accessibility First)
**Target Audience:** Non-technically savvy users with below-average eyesight.
- **Typography:** Increase default font sizes across all labels, buttons, and table data.
- **Contrast:** High-contrast color palette. Avoid faint borders.
- **Card Styling:** Cards should have a slightly darker background (e.g., `#f8f9fa` in light mode, deeper grays in dark mode) to stand out from the main background.
- **Borders:** Use solid, well-defined borders for all interactive elements.
- **Visual Feedback:** Large, clear hover states and active indicators.

---

## 1. Navigation Sidebar Refactoring
**Objective:** Improve ergonomic access to system settings and user profile.

- **Structure:**
  - **Top/Middle:** Standard navigation links (Dashboard, Students, etc.).
  - **Bottom Area:** 
    - **Theme Toggle:** Positioned directly above the profile section. 
      - **Indicator:** In Dark Mode, the "Light" icon/button must have a prominent active indicator (e.g., a glowing ring or colored dot) to show it is the selectable option to return.
    - **Admin Profile:** Fixed at the very bottom of the sidebar.
- **Styling:** Ensure the logout and profile buttons are large and easy to click.

---

## 2. Dashboard: Analytics & Insights
**Objective:** Replace the "Magic Bento" grid with a professional, data-driven analytics suite.

- **REMOVAL:** Delete the `MagicBento` component from the Admin home.
- **IMPLEMENTATION:** Use **Chart.js** for a modern, high-density visualization layer.
- **Key Components:**
  - **Large Primary Graph:** Monthly scholarship application trends (Line or Bar chart).
  - **Distribution Charts:** Pie or Doughnut charts for quick status overviews.
  - **Metric Cards:** High-contrast cards with large numerical values (Total Students, Active Programs, Issued SOEs).
- **UI:** Ensure charts use a professional color palette (BulSU Green, Navy, Gold) with clear legends.

---

## 3. Student Management Enhancements
**Objective:** Transform the basic table into a rich information management tool.

- **UI Elements:** 
  - Add more "breathing room" (padding) and distinct row separators.
  - Use status badges with high-contrast background colors.
- **Functional Addition:** 
  - **"View Information" Button:** A prominent action button for each student row that opens a full-profile view/modal.

---

## 4. Scholarship Programs Management
**Objective:** Improve data density and visual organization.

- **Analytics:** 
  - Replace raw student numbers in pie graphs with **Percentage of Scholarships per Distributor** (e.g., Kuya Win: 45%, Tina Pancho: 30%, etc.).
- **Table Organization:**
  - **Collapsible Tables:** Implement a dropdown/accordion system for all tables so they aren't all expanded at once.
  - **Spacing:** Each table section must have a clear `margin-bottom` and a distinct box-shadow to separate it from the page background.
- **View Details Modal:**
  - Redesign from a "plain modal" to a rich detail view.
  - **Profile Integration:** Include the student's profile picture prominently in the header of the modal.
  - **Layout:** Use a multi-column grid for student data to improve readability.

---

## 5. SOE Request Workflow
**Objective:** Optimize the approval interface and prevent accidental duplicate actions.

- **Table Layout:** Increase margins between table rows and sections to prevent "visual clutter."
- **Timer Logic:**
  - **Reset Button State:** When the "Reset Timer" action is performed, immediately **disable** the button.
  - **Reactive Re-enabling:** The button should only become enabled again if the user submits a *new* SOE request, indicating a fresh cycle is needed.

---

## 6. Announcement Management System
**Objective:** Move from a "plain form" to a feature-rich announcement builder.

- **Form Redesign:**
  - Larger input fields and clear labels.
  - Use a "Card-based" form layout with distinct sections for content and media.
- **Media Support:** Implement **Multiple Image Upload** (Cloudinary integration).
- **Scheduling:** 
  - **Single-Button Calendar:** A unified date-picker component to define both the `Start Date` and `End Date` of the announcement.
- **Feed Management:**
  - **Sections:** Split the view into "Current Announcements" and "Previous Announcements."
  - **Dynamic Transitions:** Add a "Delete/Archive" button to current announcements. When clicked, the announcement should dynamically move to the "Previous" section without a full page reload.

---

## 7. Implementation Checklist for Codex
1. [ ] Update `AdminDashboard.jsx` to remove `MagicBento` and integrate `Chart.js`.
2. [ ] Refactor `AdminDashboard.css` with larger fonts and higher contrast variables.
3. [ ] Implement the `ThemeToggle` with the active-state indicator in the sidebar.
4. [ ] Create the collapsible table component with shadow and margin-bottom.
5. [ ] Update the Announcement form to handle multiple images and the dual-date calendar.
6. [ ] Add `isTimerReset` state logic to the SOE request handlers.

# File: ADMIN_SYSTEM_REVAMP_SPEC.md
# Admin System Revamp Specification

## 1. Dashboard Overview
*   **Metric Visualization:** Replace the current "College Application Overview" with a comprehensive **Scholarship Distribution Chart**.
    *   *Requirement:* Implement a visual representation (Pie or Bar chart) showing the distribution and status of various scholarship programs.

## 2. Student Management Module
*   **Student Information Modal:**
    *   **Blocking Logic:** Replace the current block/unblock buttons with a single **"Blocked"** status toggle/button.
    *   **Granular Control:** Upon selection, provide checkboxes to block/unblock specific categories:
        *   [ ] Account Access
        *   [ ] Scholarship Eligibility
    *   **State Management:** Unchecking both boxes should automatically revert the student status to "Active/Unblocked."
*   **Data Lifecycle:**
    *   **Archiving:** Deprecate the "Remove/Delete" functionality. Implement **"Archive"** logic to preserve data while removing it from active views.
*   **View Organization:** Implement a **Tabbed Interface** with the following sections:
    1.  **Students:** Active, non-blocked student records.
    2.  **Blocked:** Students with account or scholarship restrictions.
    3.  **Archived:** Historical/Inactive records.
*   **Table Cleanup:** Remove the "Applied Scholarship" column from the primary student management table.

## 3. Scholarship Program Module
*   **UI Layout:** Transition all scholarship tables into a **Tabbed Interface** organized by program type or status.

## 4. SOE (Statement of Expenditures) Request Module
*   **Date Timer End Column:** 
    *   *Definition:* A dynamic column calculating the interval between the "Request Date" and the "Eligibility Date for Next Request."
    *   *Logic:* Helps track cooldown periods for student SOE submissions.
*   **UI Layout:** Implement a **Tabbed Interface** for organizing different request states (e.g., Pending, Approved, History).

## 5. SOE Checking Module (New Feature)
*   **Navigation:** Add "SOE Checking" to the Sidebar Navigation, positioned immediately after "SOE Request."
*   **Verification Workflow:**
    *   **Input:** Admin enters/searches request form data.
    *   **Association:** System maps the request to the corresponding user in the database.
*   **Action Categories:**
    *   **Sign:** Student has physically/officially signed; record is moved to the "Signed" table.
    *   **Not Actual Data:** Data discrepancies found; record moved to the "Non-Compliant" table.
*   **Violation Logic:**
    *   Students in the "Non-Compliant" table must see a **Dashboard Warning** stating: *"Compliance Alert: Do not send or modify current SOE data."*
    *   **Escalation:** Repeated compliance violations must trigger an **Automatic Scholarship Block**, preventing the student from Sending, Transferring, or Modifying their SOE.
*   **UI Layout:** Use a **Tabbed Interface** for "Signed" and "Non-Compliant" data categories.

## 6. Announcement Module
*   **Scheduling UI:**
    *   Implement a **Popup Modal** for date/calendar selection.
    *   **Button Layout:** Place "Schedule Date" and "Post Announcement" buttons side-by-side (Horizontal layout) to optimize vertical space.
*   **Media Handling:**
    *   Align the "Choose Image" design with the existing Account Creation/Document Upload UI.
    *   **Preview Gallery:** Provide a thumbnail preview of the selected image with "View Fullscreen" and "Delete" options.

## 7. Report Generation Module (New Feature)
*   **Navigation:** Add "Report Generation" to the Sidebar Navigation, positioned immediately before "Announcements."
*   **Functionality:** A centralized hub for generating on-demand PDF/CSV reports for all system metrics (Students, Scholarships, SOE, Compliance).

## 8. Global UI/UX Standards
*   **Button Components:** Reduce button scaling. Implement a "Mini" or "Small" button variant that is sleek, modernized, and space-efficient.
*   **Search Functionality:**
    *   Implement an **Empty State** for all search bars.
    *   *Display Text:* If no matches are found, display: *"No results found matching your criteria."* (or equivalent professional copy).

# File: ADMIN_SYSTEM_SPEC_REVAMP.md
# BulsuScholar: Admin System Specification Revamp

This document provides the definitive structure and logic for the Admin portal. Follow these instructions to implement a high-performance, data-driven management system.

---

## 1. Dashboard: Analytics & Bento Box
**Objective:** A visually rich landing page driven by real-time Supabase analytics.

- **Layout:** Use the `MagicBento` component.
- **Content:** Each bento box must serve as a container for dynamic charts, graphs, and analytics.
- **Dynamic Data:** Fetch and aggregate data directly from the `students` and `scholarships` tables.
- **Key Metrics (Requested by Client):**
  - **Scholarship Distribution:** A pie or doughnut chart showing the percentage of total students per scholarship grantor.
  - **Grantor Volume:** A bar chart showing the total number of students per grantor/provider.
  - **SOE Trends:** A line chart showing SOE request volume over time.

---

## 2. Student Management
- **Directive:** Preserve the current implementation. Do not change existing logic or UI unless specifically requested.

---

## 3. Scholarship Management: Granular Tracking
**Objective:** Provide per-grantor oversight and conflict resolution.

- **First Section:** Visualization (Pie/Bar charts) showing percentage and total counts per provider.
- **Table Structure:**
  - **Warning Table (Top Priority):** Displays students with **Multiple Scholarships**. 
  - **Provider Tables:** Separate tables for each grantor (e.g., Kuya Win, Tina Pancho).
  - **"Other" Table:** A dedicated table for students under the "Other" category.
  - **"None" Table:** A dedicated table for students currently without a scholarship.
- **Features:**
  - **Filtering:** Each table must have its own search and status filters.
  - **Real-time Updates:** Data must refresh dynamically when Supabase records change.
  - **Student Detail Modal:**
    - Clicking a student opens a popup modal with their full profile and documents.
    - **Actions:** Buttons to **Block**, **Remove Entirely**, or **Unblock** the student account.
  - **Conflict Management (Multiple Scholarships):**
    - The admin can see which specific scholarships a student is "Saved" or "Applied" to.
    - **Action:** A button to **Block specific scholarships** within their list.
    - **Logic:** Blocked scholarships prevent the student from requesting an SOE for that specific program. The student must visit the Office of the Scholarship to have them **Unblocked**.

---

## 4. SOE Request & Intervention
**Objective:** Manage the Statement of Enrollment queue with strict timing rules.

- **Primary Table:** Shows all SOE requests with filters and report generation (PDF).
- **Warning Table:** Highlights students requesting an SOE **within 6 months** of their initial/previous request.
- **Admin Intervention:** 
  - A dedicated "Intervene" or "Reset Timer" button.
  - **Logic:** Allows the admin to manually override the 6-month cooldown, letting the student request a new SOE immediately.

---

## 5. Announcement System
**Objective:** Direct communication with the student body.

- **Creation Interface:** Admin can create announcements with:
  - **Title**
  - **Description (Rich Text/Long Form)**
  - **Image Upload (Cloudinary Integration)**
  - **Category/Type (Deadline, Event, Update)**
- **Distribution:** Announcements must appear in the Student Dashboard announcement feed.

---

## 6. Navigation & Settings
- **Settings:** Completely remove the "Settings" page.
- **Theme Toggle:** Relocate the Light/Dark mode toggle to the top of the sidebar within the `admin-sidebar-profile` section.
- **Sidebar:** Persistent, left-aligned, and always open.

---

## 7. Implementation Checklist for Codex
- [ ] Implement `recharts` or a similar library for the Bento Box analytics.
- [ ] Create the "Warning Table" for multiple scholarship students.
- [ ] Add the "Block/Unblock" scholarship logic to the student detail modal.
- [ ] Implement the SOE cooldown override button.
- [ ] Build the Announcement creator with image upload support.
- [ ] Reposition the theme toggle and remove the Settings route.

# File: AGENTS.md
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
  - Supabase Auth + Database
  - Cloudinary for image/file uploads
  - EmailJS for compliance/conflict notifications
- PDF/export stack:
  - `pdf-lib` for SOE template filling
  - `jsPDF + autoTable` for admin PDF/CSV reports
- Active Supabase tables:
  - `students`, `pendingStudent`, `soeRequests`, `soeDownloads`, `announcements`, `providers`, `grantorPortals`, `scholarshipApplications`

## 2) Runtime + Commands
- Dev server: `npm run dev`
- Standalone seed entry: `http://localhost:5173/seed.html`
- Build: `npm run build`

## 3) Environment
- Supabase: `VITE_SUPABASE_*`
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
- **SOE Identifier**: Unified SOE request number format (`last 3 digits-6 random chars`) used across PDF, Supabase, and checking.
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

# File: CODEX_INSTRUCTIONS.md
# BulsuScholar: Advanced Student & Scholarship System Specification

This document serves as the master logic and design directive for the BulsuScholar platform. Use these instructions to implement the next phase of the application with a focus on modern UX, strict scholarship business rules, and robust administrative tracking.

---

## 1. Student Dashboard Revamp (UX/UI)
**Objective:** Transform the dashboard into a high-end, professional student portal while maintaining core content.

- **Visual Style:**
  - Transition from a basic grid to a "Modular Bento-Box" layout.
  - Use subtle glassmorphism (backdrop-blur) for cards.
  - Primary color: `#00633C` (BulSU Green) with high-contrast accents.
- **Structural Changes:**
  - **REMOVE:** The "Student Information Card" (Personal details like Name/ID should now live in the Header/Sidebar only).
  - **ADD:** **Announcement Section:**
    - A prominent, scrollable horizontal or vertical feed at the top.
    - Each announcement card should have: `Icon (Type)`, `Title`, `Date`, and `Preview Text`.
    - Content pulled from a new `announcements` Supabase table.
  - **RETAIN:** Navigation links to Scholarship and Profile, but style them as large interactive action cards with custom SVG icons.

---

## 2. Student Profile Revamp (Modernization)
**Objective:** A sleek, "Social-Media-Professional" style profile page.

- **Design Elements:**
  - **Header:** A wide cover-image area with the profile picture overlapping the bottom-left edge.
  - **Information Sections:** Use clean typography with plenty of whitespace. Categorize data into:
    - `Academic Information` (Student ID, Course, Year).
    - `Personal Details` (Contact, Email).
    - `Document Vault` (Quick links to view uploaded COR/COG).
- **Continuity:** Maintain the same color palette as the previous design to ensure brand recognition, but use thinner borders and softer shadows.

---

## 3. Advanced Scholarship Logic & Constraints
**Objective:** Enforce the "One Student, One Scholarship" rule while allowing flexibility during the application phase.

### A. The "Save vs. Request" Flow
- **Initial State:** Students can "Save" or "Apply" for up to **3 different scholarships** to keep their options open.
- **The Locking Trigger (SOE Request):**
  - When a student attempts to "Request SOE" for a specific scholarship:
    - **IF** they have 2 or more scholarships in their list:
      - **ACTION:** Display a "Final Confirmation" Modal.
      - **MODAL TEXT:** *"Requesting an SOE for [Scholarship Name] will finalize your choice. All other saved scholarships will be permanently removed and blocked for this semester. Do you wish to proceed?"*
      - **ON CONFIRM:** Delete all other scholarship records for that student and set `isLocked: true` on the remaining one.

### B. "Kuya Win Scholarship Program" (Tiered Approval)
- **Requirements:** Must upload 3 specific documents: **COG**, **COR**, and **School ID/Valid ID**.
- **Process:**
  - When a student chooses this program, the status is immediately set to `Application Submitted`.
  - **SOE Logic:** When they request an SOE for Kuya Win:
    - Status changes to `Pending`.
    - The student is "Blocked" from all other scholarships.
    - They must wait for the **Office of the Scholarship** to manually verify their physical documents before the SOE is officially issued.

### C. "Cong. Tina Pancho" & "Morrison" (Fast-Track)
- **Process:** These programs allow for immediate SOE requests.
- **Constraint:** Still applies the "One Scholarship per Student" rule—once requested, the choice is final.

---

## 4. Backend & Database Architecture (Supabase)
**Objective:** Ensure full auditability and admin oversight.

- **`soeRequests` Collection:**
  - Store: `studentId`, `scholarshipId`, `timestamp`, `status` (Pending/Approved/Issued), and `academicYear`.
- **`scholarshipApplications` Collection:**
  - Track every time a student clicks "Apply". Store metadata like `applicationDate` and `documentUrls`.
- **`studentWarning` Collection (Admin Intelligence):**
  - **Logic:** A background trigger or manual admin view that flags students based on:
    - `multiple_scholarships`: Students who have "Applied" to 2+ programs but haven't finalized an SOE.
    - `zero_scholarships`: Students who have registered but have 0 applications.
  - **Data Stored:** `studentName`, `studentId`, `savedScholarshipsCount`, `lastActive`.

---

## 5. New Logic Enhancements (AI Recommendations)
**Objective:** Proactively manage student success and admin efficiency.

- **[NEW] Automated Eligibility Guard:**
  - Before allowing a student to apply for a second scholarship, the system checks their `GWA` (stored in profile). If it doesn't meet the minimum for the second scholarship, the "Apply" button is disabled with a "Grade Requirement Not Met" tooltip.
- **[NEW] Smart Deadline Notifications:**
  - If a student has a "Pending" Kuya Win application for more than 7 days, automatically generate a `studentWarning` entry: `Status: Delayed Document Submission`.
- **[NEW] Document Expiry Logic:**
  - Attach a `semesterTag` (e.g., "2025-2026-1ST") to every uploaded COG/COR. If the student tries to use an old document for a new application, prompt them to upload the latest version.
- **[NEW] Admin Audit Trail:**
  - Every time an admin approves an SOE or overrides a status, log it in a `logs` table: `{adminId, action, targetStudentId, timestamp}`.

---

## 6. Implementation Notes for Codex
- **Priority 1:** Setup the Supabase table structures (`soeRequests`, `studentWarning`).
- **Priority 2:** Implement the "SOE Confirmation Modal" logic in `StudentScholarshipsPage.jsx`.
- **Priority 3:** Revamp the CSS using modern Flexbox/Grid patterns in `StudentDashboard.css`.
- **Note:** Do not modify Admin Dashboard UI in this phase, only the underlying data processing logic.

# File: CURRENT_IMPLEMENTATION_PLAN.md
# BulsuScholar: Current Implementation Plan

This document outlines the immediate technical tasks and bug fixes required for the Student System. Follow these instructions strictly to ensure consistency and correctness.

---

## 1. SOE (Statement of Enrollment) Export System
**Objective:** Implement a system to generate and export the SOE for students.
- **Task:** Add a "Download SOE" or "Export SOE" button in the Student Dashboard or Scholarships page.
- **Logic:** This should probably generate a PDF or a structured document containing student enrollment details and scholarship status.
- **Reference:** Check `scholarshipService.js` for data fetching and any existing PDF generation libraries in `package.json`.

## 2. Layout & CSS Fixes
### A. Header Gap Fix
- **Objective:** Eliminate the unwanted gap in the header component.
- **Task:** Inspect the header's margin/padding in `App.css` or the specific dashboard CSS files (`StudentDashboard.css`, `AdminDashboard.css`). Ensure the header sits flush where intended.

### B. Bento Box Margin
- **Objective:** Add a clear separation between the header and the main content area.
- **Task:** Add a `margin-top` to the bento box container (likely in `MagicBento.css` or `StudentDashboard.css`) so there is a visible gap between the header and the bento grid.

### C. Logout Button (Dark Mode)
- **Objective:** Improve the visibility/aesthetics of the logout button in dark mode.
- **Task:** Update the CSS for the logout button to have a specific background color when the `.dark-mode` class is active. Ensure it maintains high contrast and follows the BulSU Green theme.

## 3. Scholarship Logic: "Kuya Win" Fix
- **Objective:** Resolve issues with the "Kuya Win" scholarship application flow.
- **Task:** Investigate the application logic for the "Kuya Win" program. Ensure that the required documents (COR, COG, School ID) are correctly handled and that the status transitions are accurate.
- **Reference:** `StudentScholarshipsPage.jsx` and the document upload logic.

## 4. Profile UI Refinement
### A. Remove Hover Photo Indicator
- **Objective:** Simplify the profile picture interaction.
- **Task:** Remove the hover effect/indicator from the student profile picture. The image should be static or have a simpler interaction without an overlaying "indicator" text/icon on hover.
- **File:** `StudentProfilePage.jsx` and matching CSS.

### B. Document Vault Implementation
- **Objective:** Provide a centralized place for students to manage their academic documents.
- **Task:** Add a "Document Vault" section to the `StudentProfilePage.jsx`.
- **Requirements:** 
    - Allow uploading and viewing of **COG (Certificate of Grades)** and **Student ID**.
    - Integrate with `cloudinaryService.js` for storage.
    - Save URLs to the student's Supabase document.

---

## 5. Verification Checklist
- [ ] SOE Export generates a valid document.
- [ ] Header gap is closed.
- [ ] Bento box has a top margin.
- [ ] Logout button looks correct in dark mode.
- [ ] "Kuya Win" application submits successfully with all documents.
- [ ] Profile photo has no hover indicator.
- [ ] Document Vault successfully uploads and displays COG/Student ID.

# File: EMAIL_SYSTEM_SPEC.md
# Email Notification System Specification (EmailJS)

This document outlines the implementation plan for the automated email notification system using **EmailJS**. The system will use a single dynamic template with a fixed header and footer, where the `message_body` variable will change depending on the notification type.

---

## 1. Environment Configuration (.env)
Add these private credentials to your `.env` file. **Never commit the `.env` file to version control.**

```env
VITE_EMAILJS_SERVICE_ID=your_service_id_here
VITE_EMAILJS_TEMPLATE_ID=your_template_id_here
VITE_EMAILJS_PUBLIC_KEY=your_public_key_here
```

---

## 2. Email Template Structure (EmailJS Dashboard)
The EmailJS template should be configured with the following parameters:
- **To Email:** `{{to_email}}`
- **To Name:** `{{to_name}}`
- **Subject:** `{{subject}}`
- **Body:** `{{message_body}}` (This will contain the dynamic HTML content)

### Base HTML Wrapper (Fixed Header/Footer)
The `message_body` will be injected into a layout similar to this:
- **Header:** BulsuScholar Logo/Title (BulSU Green: `#00633C`)
- **Footer:** Bulacan State University - Scholarship Office & Contact Info

---

## 3. Required Email Notifications

### A. Authentication & Account
1.  **Welcome Email**
    *   **Trigger:** Successful student registration.
    *   **Content:** Welcome message, brief overview of portal features (SOE, Scholarship Tracking).
2.  **Forgot Password**
    *   **Trigger:** Student requests a password reset.
    *   **Content:** Reset link/OTP with instructions.

### B. Scholarship Program (Kuya Win Scholarship)
1.  **Application Approved**
    *   **Trigger:** Admin approves the student's application for the Kuya Win Scholarship Program.
    *   **Content:** Congratulations message, next steps for the scholar.
2.  **Application Disapproved**
    *   **Trigger:** Admin rejects the application.
    *   **Content:** Regret message, reason for disapproval (if provided), and instructions for re-applying or contacting support.

### C. SOE (Statement of Expenditures) Requests
1.  **SOE Request Approved**
    *   **Trigger:** Admin approves an SOE request.
    *   **Content:** Notification that the SOE is ready for download/table.
2.  **SOE Request Disapproved**
    *   **Trigger:** Admin rejects the SOE request.
    *   **Content:** Reason for rejection (e.g., "Incomplete data", "Incorrect attachment") and a prompt to resubmit.

---

## 4. Implementation Logic (Services)

A new service `src/services/emailService.js` should be created to centralize all email triggers.

```javascript
import emailjs from '@emailjs/browser';

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

export const sendEmailNotification = async (toEmail, toName, subject, body) => {
  try {
    const templateParams = {
      to_email: toEmail,
      to_name: toName,
      subject: subject,
      message_body: body,
    };

    const response = await emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams, PUBLIC_KEY);
    return response;
  } catch (error) {
    console.error('Email failed to send:', error);
    throw error;
  }
};
```

---

## 5. Dynamic Content Guidelines
To maintain the "Senior-Friendly" and "Professional" look:
- **Contrast:** High contrast text (Dark gray on white background).
- **Buttons:** Use clear, large call-to-action buttons for links.
- **Tone:** Encouraging for approvals, professional and helpful for disapprovals.

# File: README.md
# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

# File: SETUP.md
# BulsuScholar - Setup & Configuration Guide

## Overview of Changes

This project has been updated to use **ImageBB** as the image storage solution instead of Supabase Storage. This approach is cost-effective and keeps your Supabase storage quota available for other uses.

## Key Changes Made

### 1. Secured API Keys (Environment Variables)
- All sensitive configuration is now stored in `.env` file
- `.env` is excluded from Git (see `.gitignore`)
- Use `.env.example` as a template for new deployments

### 2. ImageBB Integration
- COR (Certificate of Registration) file uploads now use **ImageBB API**
- Upload functionality moved to `src/services/imageBBService.js`
- Admin dashboard automatically displays images from ImageBB URLs

### 3. Supabase Configuration
- Supabase config now uses environment variables instead of hardcoded values
- Safer for production deployments

## Setup Instructions

### Step 1: Get ImageBB API Key

1. Visit [https://imgbb.com/api](https://imgbb.com/api)
2. Sign up for a free account (if you don't have one)
3. Go to your account dashboard: [https://imgbb.com/dashboard](https://imgbb.com/dashboard)
4. Copy your API key

### Step 2: Configure Environment Variables

1. Open `.env` file in the root directory
2. Replace `your_imagebb_api_key_here` with your actual ImageBB API key:
   ```
   VITE_IMAGEBB_API_KEY=your_actual_api_key_here
   ```
3. Verify other environment variables match your Supabase project settings
4. Never commit `.env` file to Git

### Step 3: Test the Setup

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Try signing up a student account
3. Upload a COR file in Step 4 of the signup form
4. Verify the image appears when the admin previews it

## File Structure

```
src/
├── services/
│   └── imageBBService.js    # ImageBB upload utility
└── pages/
    ├── SignupPage.jsx       # Uses ImageBB for COR uploads
    └── AdminDashboard.jsx   # Displays ImageBB URLs (no changes needed)

supabase.js                    # Now uses environment variables

.env                          # Your local configuration (never commit)
.env.example                  # Template for new setups
```

## How It Works

### Student Registration (SignupPage.jsx)
1. Student uploads a COR file
2. `uploadToImageBB()` sends file to ImageBB API
3. ImageBB returns a permanent URL and delete URL
4. Only the URL is stored in Supabase Supabase
5. No large files stored in Supabase Storage

### Admin Preview (AdminDashboard.jsx)
1. Admin clicks "Preview" on a pending student
2. System retrieves the ImageBB URL from Supabase
3. Image is displayed directly from ImageBB
4. No changes needed to AdminDashboard code

## Environment Variables Reference

| Variable | Purpose | Example |
|----------|---------|---------|
| `VITE_SUPABASE_API_KEY` | Supabase authentication | `AIzaS...` |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project ID | `bulsuscholar` |
| `VITE_IMAGEBB_API_KEY` | ImageBB upload API key | `abc123...` |
| `VITE_PASSWORD_SECRET` | Password encryption secret | Must be ≥32 chars |

## Troubleshooting

### "ImageBB API key not configured"
- Check `.env` file exists in project root
- Verify `VITE_IMAGEBB_API_KEY` is set and not empty
- Restart development server after changing `.env`

### Upload fails with "Failed to upload image to ImageBB"
- Verify API key is correct (from imgbb.com dashboard)
- Check file size (ImageBB has size limits)
- Check internet connection
- Check browser console for detailed error

### Environment variables not loading
- Vite reads `.env` files only at startup
- Stop dev server and run `npm run dev` again
- Variables must start with `VITE_` to be exposed to client-side code

## Security Best Practices

1. **Never commit `.env` file** - It contains API keys
2. **Use `.env.example`** - Share this with team, they fill in their own values
3. **Rotate ImageBB API key** - If compromised, regenerate from imgbb.com
4. **Different keys per environment** - Use different ImageBB accounts for dev/production
5. **Secure CI/CD** - Set environment variables in CI/CD system secrets, not in repo

## Production Deployment

1. Set environment variables in your deployment platform:
   - Vercel/Netlify: Project Settings → Environment Variables
   - Supabase Hosting: Create new `.env` for production
   - Docker: Pass via environment or .env file during build

2. Ensure `.env` file is NOT uploaded to version control

3. Test all uploads in production environment

## Reverting to Supabase Storage (if needed)

If you need to revert to Supabase Storage for COR files:

1. In `SignupPage.jsx`, restore Supabase storage imports:
   ```js
   import { ref, uploadBytes, getDownloadURL } from "supabase/storage"
   ```

2. Replace `uploadToImageBB()` with original Supabase storage code

3. Update `corFilePayload` to include `path` field

Existing ImageBB URLs in database will continue to work.

## Support

For issues with:
- **ImageBB**: Visit [https://imgbb.com/support](https://imgbb.com/support)
- **Supabase**: Visit [https://supabase.com/support](https://supabase.com/support)
- **This Project**: Check the README.md or project documentation

# File: SOE_SYSTEM_SPEC.md
# BulsuScholar: SOE Generation & Verification System Specification

This directive focuses on the automated creation, security, and administrative validation of the Statement of Expenses (SOE). It ensures that every issued SOE is legitimate, traceable, and tamper-proof.

---

## 1. The "Request Number" Security Protocol
**Objective:** Prevent forgery by linking every document to a unique, searchable ID.

- **Generation Logic:** 
  - Every SOE request must generate a unique `RequestNumber` (e.g., `SOE-2026-XXXXX`).
  - This number must be cryptographically or sequentially linked to the `StudentID` and `Timestamp`.
- **Database Storage (Supabase):**
  - Store the `RequestNumber` inside the `soeRequests` table.
  - Fields: `requestNumber`, `studentId`, `studentName`, `expensesArray`, `totalAmount`, `status` (Pending/Signed/Rejected).
- **Admin Verification Workflow:**
  - Create a "Verify SOE" tool in the Admin Dashboard.
  - **Action:** Admin types in a `RequestNumber`.
  - **Validation:** The system fetches the student info associated with that number.
  - **Integrity Check:** If the student name/details on the physical/digital paper don't match the database result, the Admin flags it as "Invalid/Tampered" and rejects the signing.

---

## 2. Student Request UI: The "Expense Entry" Modal
**Objective:** A user-friendly popup to collect financial data before generation.

- **Design:**
  - Modern, centered modal with a progress stepper (if needed).
  - **Inputs:**
    - Dynamic list of "Expense Items" (e.g., Tuition, Books, Uniform).
    - "Amount" field for each item.
    - Automatic "Grand Total" calculator at the bottom.
- **Visuals:** Use the BulSU Green theme with clear "Submit" and "Cancel" actions.

---

## 3. Automated Document Mapping (Template Filling)
**Objective:** Map student data to the "SOE Template.docs/.pdf" fields automatically.

- **Mapping Logic:**
  - `Point of Origin` ➔ Student's **College Department**.
  - `Date` ➔ **Current Date**.
  - `Name of Scholar` ➔ Student's **Full Name**.
  - `Student Number` ➔ Student's **Official ID**.
  - `Program` ➔ Student's **Course/Major**.
  - `Nature of Scholarship` ➔ The **Scholarship Program Name** (e.g., Kuya Win).
  - `Registration Number` ➔ The newly generated **Request Number**.
- **The "Tamper-Proof" Footer:** Add the `Request Number` as a small QR code or text at the bottom of every page to ensure it can be verified in the field.

---

## 4. Technical Integration (React Tools)
**Objective:** Use specialized libraries to handle document parsing and generation.

- **Template Analysis:**
  - Use `docxtemplater` or a similar React-compatible library to parse the `.docx` template.
  - For PDF analysis, ensure the coordinates for "Autofill" fields are precisely mapped to the `SOE Template.pdf`.
- **Export Workflow (`@react-pdf/renderer`):**
  - Once the student submits the Expense Modal, the system generates a preview.
  - **Export Action:** Allow the student to download the final, filled-out SOE as a high-quality PDF.
  - **Constraint:** The PDF must be "Read-Only" to prevent further manual editing by the student after generation.

---

## 5. Admin Dashboard Logic (The Gatekeeper)
**Objective:** Empower admins to manage the flow of funds and signatures.

- **Search/Filter:** Admins can filter requests by "Pending Signature."
- **Approval Action:**
  - Clicking "Approve & Sign" updates the Supabase status to `Signed`.
  - This triggers a notification to the student that their SOE is ready for table or digital use.
- **Rejection Logic:**
  - If a discrepancy is found (e.g., wrong Request Number), the Admin provides a "Reason for Rejection" which is sent back to the student.

# File: STUDENT_SYSTEM_REVAMP_SPEC.md
# Student System Revamp Specification

## 1. Dashboard Restoration
*   **UI Architecture:** Revert the Student Dashboard to the **"Magic Bento"** grid-based layout.
*   **Content Recovery:** Restore all previously implemented dashboard modules, interactive widgets, and data visualizations.
    *   *Requirement:* Ensure the CSS and component logic for `MagicBento.jsx` are fully integrated and functional.

## 2. Scholarship Management
*   **State-Based Interaction:**
    *   **Action Locking:** Automatically **Disable** interaction buttons (e.g., Edit, Submit, or Delete) once a scholarship status is marked as **"Finalized."**
    *   *Visual Feedback:** Apply a "Disabled" UI state to communicate that the application is locked for review.
*   **Identifier Standardization (Request Number):**
    *   **Format:** `[Last 3 Digits of Student Number][6-Digit Random Alphanumeric]`
    *   **Constraint:** All characters must be **lowercase**.
    *   **Example:** If student number is `2022-10456` and random code is `x7y2z8`, the ID becomes `456x7y2z8`.

## 3. Global Student UI/UX
*   **Consistency:** Ensure all student-facing buttons align with the "Mini/Sleek" design standard established in the Admin revamp.
*   **System Alerts:** Maintain professional and clear messaging for all status changes (e.g., Scholarship Blocking alerts as defined in the SOE Checking module).

# File: STUDENT_SYSTEM_REVISIONS.md
# BulsuScholar: Student System Revisions & Visual Overhaul

This document supersedes previous UI/UX directives for the Student Dashboard and Profile, focusing on a "High-Density Modern" aesthetic and stricter scholarship business logic.

---

## 1. Visual Revamp: High-Density Dashboard
**Objective:** Move away from minimalism towards a visually rich, feature-packed interface.

- **Design Enhancements:**
  - **Borders & Accents:** Add 2px solid borders to all cards using `#00633C` (BulSU Green) or a light grey `#E2E8F0` with subtle glow effects on hover.
  - **Profile Integration:** Include a "Mini-Profile" widget in the Dashboard (top-right or sidebar) displaying the **Student's Profile Picture**, Name, and Year Level.
  - **Background Texture:** Use a very subtle geometric pattern or a faint gradient in the background to eliminate the "empty" feel.
  - **Quick Actions:** 
    - **ADD:** "Download Latest SOE", "Contact Support", "Application Status Tracker".
    - **REMOVE:** Any redundant informational cards that don't provide immediate utility.
- **Recommended Libraries:**
  - `framer-motion`: For smooth entry animations and hover transitions.
  - `lucide-react`: For consistent, high-quality iconography in the Bento-Box cards.

---

## 2. Strict Scholarship Logic (Phase 2)
**Objective:** Simplify the application flow and enforce strict exclusivity.

- **Application Constraints:**
  - **IF** the student already has an active or pending scholarship:
    - **ACTION:** Disable the "Apply" button for all other scholarships.
    - **TOOLTIP:** "You already have an existing scholarship application. You cannot apply for another until the current one is resolved."
  - **IF** the student has no scholarship:
    - They are allowed to click "Apply" on one program.
- **UI Changes:**
  - **REMOVE:** The "Save Scholarship" button entirely. The only action should be "Apply".
  - **REMOVE:** The "Minimum GWA" logic/check. All students can see the "Apply" button regardless of grade (unless they already have a scholarship).

---

## 3. Navigation & Header Fixes
- **Dashboard Linkage:** Ensure both the **BulsuScholar Logo** and the **Site Title** in the Header are wrapped in a `<Link>` or `<a>` tag that redirects the user back to the Student Dashboard.

---

## 4. Profile UI & Photo Interaction Repair
**Objective:** Fix the broken photo upload flow and center the identity section.

- **Profile Picture Layout:**
  - **Centered Identity:** The profile picture, name, and student ID must be perfectly centered in the header section of the profile page.
  - **GWA Removal:** **REMOVE** all GWA-related fields and displays from the Profile page.
- **The "Hover-Action" Interaction:**
  - When the Profile Picture is **hovered** (or clicked on mobile):
    - Overlay a semi-transparent dark layer.
    - Show two distinct buttons: **[Show Profile]** and **[Upload New]**.
  - **[Upload New]** should trigger the Cloudinary upload service immediately.
  - **[Show Profile]** (or clicking the image itself) should open a full-screen "Lightbox" preview of the current photo.

---

## 5. Implementation Priority for Codex
1. **Header Navigation:** Restore the "Back to Dashboard" functionality on the logo/title.
2. **Profile Section:** Center the layout, remove GWA, and implement the new Hover/Action buttons for the profile picture.
3. **Scholarship Lockdown:** Update the application logic to prevent multiple applications and remove the "Save" feature.
4. **Dashboard Enrichment:** Add borders, the mini-profile widget, and extra design elements to fill the visual space.

# File: SYSTEM_OUTPUT_FINDINGS.MD
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

- Supabase as the operational data backend
- Supabase Auth initialized, but not used as the real sign-in flow
- Cloudinary for uploads
- EmailJS for notifications
- `pdf-lib` for SOE and application-form PDFs
- `jsPDF + autoTable` for admin exports

Main tables and workflow entities:

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

That separation matches the actual business process and avoids overloading one table for two different state machines.

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
- soeRequestNumberService in `soeRequestNumberService`
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

### Critical 1. Supabase security is effectively open

`supabase.rules` currently contains this logic:

- global `allow read, write`
- gated only by `request.time < timestamp.date(2026, 3, 23)`

The matching rule is at:

- `supabase.rules:15`

This means that as of March 16, 2026, the database is still effectively open to anyone with project access until March 23, 2026.

In this app, Supabase rules are the real backend security boundary. This is the highest-risk finding in the system.

### Critical 2. The actual login system is custom client-side password storage

The app initializes Supabase Auth in `supabase.js`, but the actual sign-in flow is not using Supabase Auth credentials.

Observed implementation:

- `src/pages/LoginPage.jsx:146` verifies passwords with `verifyPassword(...)`
- `src/pages/LoginPage.jsx:162-163` stores role and user id in session storage
- `src/pages/SignupPage.jsx:547` encrypts the password in the client
- `src/services/authService.js` performs reversible AES encryption/decryption in the browser

`VITE_PASSWORD_SECRET` is not a secret in a Vite app because `VITE_*` variables are exposed to the client bundle.

Operationally, this means:

- passwords are being protected by a client-known key
- the system is not relying on Supabase Auth as the source of truth
- role and session handling depend heavily on client state and Supabase contents

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

- table subscriptions live in the same component around lines `802`, `810`, `826`, `834`, and `842`
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
- Supabase rules

This is weaker than a model centered on:

- real Supabase Auth state
- role validation
- guarded routes
- strict server-side or rules-side enforcement

### Medium 6. Multi-source state creates drift risk

Your model intentionally merges data from related tables:

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

- Supabase
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

### `supabase.js`

Findings:

- initializes Supabase app
- exports Supabase and Auth
- calls `getAnalytics(app)` directly

Relevant lines:

- `supabase.js:20`
- `supabase.js:21`
- `supabase.js:22`

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
- updates profile data directly into Supabase

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

### 1. Fix Supabase rules immediately

Highest priority:

- replace the global open rule
- enforce role-based access by authenticated identity and document ownership
- treat Supabase rules as the real backend API boundary

### 2. Replace the custom password system

Move authentication to real Supabase Auth:

- sign up with Supabase Auth credentials
- sign in with Supabase Auth
- use Supabase only for profile and role data
- remove reversible password storage from Supabase

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

1. security review focused on Supabase rules and auth model
2. admin architecture refactor plan for `AdminDashboard.jsx`
3. data-consistency review of `students`, `pendingStudent`, `soeRequests`, and `soeDownloads`
4. lint-fix and cleanup pass before structural refactors

# File: WELCOME_EMAIL.md
# BulsuScholar: Welcome Email Template

This document contains the official HTML template for the student welcome email. It follows the senior-friendly design principles: high-contrast, large typography, and a clear call-to-action.

---

## 1. Visual Specification
- **Base Font Size:** 18px (for readability).
- **Primary Color:** `#00633C` (BulSU Green).
- **Secondary Background:** `#f4f4f4`.
- **Button Style:** Large, bold, centered with a 2px border for high visibility.

---

## 2. HTML Source Code

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to BulsuScholar</title>
    <style>
        body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4; color: #333333; }
        .email-wrapper { width: 100%; background-color: #f4f4f4; padding: 20px 0; }
        .email-content { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 1px solid #dddddd; }
        .header { background-color: #00633C; padding: 40px 20px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 32px; letter-spacing: 1px; }
        .body-content { padding: 40px 30px; line-height: 1.8; }
        .body-content h2 { font-size: 26px; color: #00633C; margin-top: 0; }
        .body-content p { font-size: 18px; margin-bottom: 25px; }
        .btn-container { text-align: center; padding: 20px 0; }
        .cta-button { background-color: #00633C; color: #ffffff !important; padding: 20px 40px; text-decoration: none; font-size: 20px; font-weight: bold; border-radius: 8px; display: inline-block; border: 2px solid #004d2e; }
        .features { background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 5px solid #00633C; }
        .features ul { padding-left: 20px; margin: 0; }
        .features li { font-size: 18px; margin-bottom: 10px; }
        .footer { background-color: #eeeeee; padding: 30px 20px; text-align: center; font-size: 14px; color: #666666; border-top: 1px solid #dddddd; }
        .footer p { margin: 5px 0; }
        @media screen and (max-width: 600px) { .body-content { padding: 20px 15px; } .header h1 { font-size: 24px; } }
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="email-content">
            <div class="header">
                <h1>BulsuScholar</h1>
            </div>
            <div class="body-content">
                <h2>Welcome to the Portal!</h2>
                <p>Hello,</p>
                <p>We are excited to have you on <strong>BulsuScholar</strong>. Our goal is to make your scholarship journey as simple and accessible as possible.</p>
                <div class="features">
                    <p style="margin-bottom: 10px; font-weight: bold;">What you can do now:</p>
                    <ul>
                        <li>View available scholarship programs.</li>
                        <li>Request your Statement of Enrollment (SOE).</li>
                        <li>Track your application status in real-time.</li>
                    </ul>
                </div>
                <p>To get started, please log in to your dashboard using the button below:</p>
                <div class="btn-container">
                    <a href="https://your-website-url.com/login" class="cta-button">Go to My Dashboard</a>
                </div>
                <p>If you have any questions or need help navigating the system, our support team is just an email away.</p>
                <p>Best Regards,<br><strong>The BulsuScholar Team</strong></p>
            </div>
            <div class="footer">
                <p>&copy; 2026 Bulacan State University - Scholarship Office</p>
                <p>Malolos City, Bulacan, Philippines</p>
            </div>
        </div>
    </div>
</body>
</html>
