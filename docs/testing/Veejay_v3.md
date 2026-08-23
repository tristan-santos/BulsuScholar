# Veejay V3 Test Cases - Grantor Side

Use this file for the final/V3 grantor-side test pass. Record `Pass`, `Fail`, or `Not Executed`, exact test data, expected result, actual result, tester name, date/time, browser/device, screenshots, and console/network logs for failures.

## Test Case Scenario #9: Grantor Login, Dashboard, Profile, and Inbox

- Login as a grantor and confirm only that grantor's data is visible.
- Verify dashboard, sidebar, topbar, theme switch, profile menu, active navigation, and responsive layout.
- Test dark mode across all grantor pages, tables, modals, dropdowns, import previews, and highlighted rows.
- Open Grantor Profile and confirm office address includes province, city, barangay, street, and postal code.
- Confirm contact number accepts only numbers and validates `09XXXXXXXXX` or `9XXXXXXXXX`.
- Save profile changes and confirm grantor and admin inbox notifications show the changed fields.
- Save with no actual changes and confirm no unnecessary profile-updated inbox is created.
- Request password change, wait for admin approval, and change password without entering current password.
- Open grantor inbox and confirm scrolling, mark all read, delete, detail modal, and message content work.

## Test Case Scenario #10: Grantor Scholars - Manual Add, Edit, Archive, and Unarchive

- Open Add Scholar manually and confirm the redesigned modal is scrollable and centered.
- Confirm Scholarship Title is a dropdown containing only that grantor's scholarships.
- Confirm address fields use province, city, and barangay dropdowns.
- Confirm the Active input is removed.
- Add a valid scholar and confirm it appears in the correct grantor roster only.
- Edit a scholar without an existing student account and confirm temporary roster details can be edited.
- Edit a scholar with an existing student account and confirm Student ID and student-owned information are read-only.
- Archive one scholar with reason dropdown, Other reason input, and notes.
- Archive multiple scholars with one modal and one shared reason.
- Confirm archived student application is rejected/frozen and the student receives inbox notification.
- Unarchive one/multiple scholars and confirm a scholarship must be selected.
- Confirm unarchive is blocked if the student already has another scholarship or roster assignment.

## Test Case Scenario #11: Grantor Scholars - Excel Import

- Upload `.csv`, `.xls`, `.xlsx`, `.xlsb`, `.xlsc`, and `.xlsm` files where available.
- Confirm auto column detection maps student number, names, course, year, and address.
- Confirm one system field cannot be selected by multiple columns.
- Confirm dash-only columns are ignored.
- Confirm same-roster duplicate rows are blocked and highlighted.
- Confirm cross-grantor duplicates are prevented, not imported, and shown in the custom confirmation dialog.
- Confirm archived-student conflicts are blocked and explain which grantor archived the student.
- Remove all rows and confirm the flow resets like Clear and Restart.
- Confirm import tables are readable in light and dark mode.

## Test Case Scenario #12: Grantor Announcements and Scholarships

- Create announcement-only post and confirm students see it without Apply.
- Create application announcement and confirm the title field changes to Scholarship Title.
- Select an existing scholarship and confirm applicants are added under that scholarship.
- Select New scholarship, enter a new title, and confirm it becomes available in later scholarship dropdowns.
- Confirm Minimum GWA dropdown includes `1.00` to `3.00` and Custom.
- Confirm Required Documents no longer includes Application Form where the latest flow removed it.
- Add multiple other requirements and confirm all of them appear on the student scholarship page.
- Confirm other requirement type supports PDF, PNG, and Both types.
- Add announcement images and test image preview zoom, drag, reset, and close.
- Set application dates using the calendar modal and Confirm/Cancel buttons.
- Archive an announcement and confirm the custom confirmation box appears.
- Confirm archived grantor announcements are hidden from students and cannot be applied to.

## Test Case Scenario #13: Grantor Applications and Review Flow

- Confirm application table uses the current table design, typography, compact rows, and action buttons.
- Confirm the filter is Newest to Oldest / Oldest to Newest and sorts by Applied On.
- Confirm a grantor sees only their own applicants, never another grantor's applicants.
- Open a student review modal and confirm it is centered, scrollable, and uses the redesigned documents section.
- Preview COR, ROG, Student ID, Student Application Profile, and other documents without forced download.
- Complete a grantor-owned stage and confirm the student receives an inbox notification.
- Confirm student-owned stages disable the approval button.
- Reject an application with reason, notes, and rejector details.
- Confirm rejected applications move to rejected/archive view and cannot continue tracking.
- Confirm admin approval/rejection confirmation rules notify grantor first when applicable.

## Test Case Scenario #14: Grantor Materials, Custom Forms, and Data Isolation

- Upload a custom application form for a scholarship if the flow is available.
- Confirm students can download the correct form when applicable.
- Approve/reject material request stages where the grantor has authority.
- Confirm SOE/material notifications are inbox-only and not sent as routine emails.
- Confirm every grantor action creates a useful inbox notification for the correct student/admin.
- Login as a second grantor and confirm they cannot see, reject, archive, or edit the first grantor's data.
- Try direct navigation to another grantor's records and confirm the page still filters to the logged-in grantor.

## Test Case Scenario #15: Grantor Responsiveness and Visual Checks

- Test grantor dashboard, scholars, applications, announcements, profile, and inbox on mobile, tablet, and desktop.
- Confirm topbar/menu/sidebar behavior works on small screens.
- Confirm tables scroll inside their containers without breaking the page.
- Confirm modals fit the viewport, close from the X button, and close by clicking the gray overlay.
- Confirm buttons keep icons aligned and disabled buttons are gray.
- Confirm no text overlaps in scholars table, import table, application table, or modal sections.
