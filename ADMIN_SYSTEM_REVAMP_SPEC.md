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
