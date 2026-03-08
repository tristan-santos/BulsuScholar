# BulsuScholar: Admin System Specification Revamp

This document provides the definitive structure and logic for the Admin portal. Follow these instructions to implement a high-performance, data-driven management system.

---

## 1. Dashboard: Analytics & Bento Box
**Objective:** A visually rich landing page driven by real-time Firestore analytics.

- **Layout:** Use the `MagicBento` component.
- **Content:** Each bento box must serve as a container for dynamic charts, graphs, and analytics.
- **Dynamic Data:** Fetch and aggregate data directly from the `students` and `scholarships` collections.
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
  - **Real-time Updates:** Data must refresh dynamically when Firestore records change.
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
