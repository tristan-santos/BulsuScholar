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
    - **System Health:** Quick status of Firebase/Cloudinary connections.
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
