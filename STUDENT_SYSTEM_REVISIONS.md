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
