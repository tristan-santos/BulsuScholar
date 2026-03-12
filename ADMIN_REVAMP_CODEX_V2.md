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
