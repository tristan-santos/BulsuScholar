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
