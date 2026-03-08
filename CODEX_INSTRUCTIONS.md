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
    - Content pulled from a new `announcements` Firestore collection.
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

## 4. Backend & Database Architecture (Firestore)
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
  - Every time an admin approves an SOE or overrides a status, log it in a `logs` collection: `{adminId, action, targetStudentId, timestamp}`.

---

## 6. Implementation Notes for Codex
- **Priority 1:** Setup the Firestore collection structures (`soeRequests`, `studentWarning`).
- **Priority 2:** Implement the "SOE Confirmation Modal" logic in `StudentScholarshipsPage.jsx`.
- **Priority 3:** Revamp the CSS using modern Flexbox/Grid patterns in `StudentDashboard.css`.
- **Note:** Do not modify Admin Dashboard UI in this phase, only the underlying data processing logic.
