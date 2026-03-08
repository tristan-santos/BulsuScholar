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
    - Save URLs to the student's Firestore document.

---

## 5. Verification Checklist
- [ ] SOE Export generates a valid document.
- [ ] Header gap is closed.
- [ ] Bento box has a top margin.
- [ ] Logout button looks correct in dark mode.
- [ ] "Kuya Win" application submits successfully with all documents.
- [ ] Profile photo has no hover indicator.
- [ ] Document Vault successfully uploads and displays COG/Student ID.
