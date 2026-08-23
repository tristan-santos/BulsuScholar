# Johvnher V3 Test Cases - Admin Side

Use this file for the final/V3 admin-side test pass. Record `Pass`, `Fail`, or `Not Executed`, exact test data, expected result, actual result, tester name, date/time, browser/device, screenshots, and console/network logs for failures.

## Test Case Scenario #1: Admin Login, Dashboard, Profile, and Maintenance

- Login using the admin account and confirm the admin dashboard loads without console errors.
- Verify the admin topbar, sidebar, theme switch, profile menu, and active navigation highlight.
- Open Admin Profile and confirm administrator details, system settings, contact fields, and scrollability work.
- Confirm contact number accepts only numbers and validates `09XXXXXXXXX` or `9XXXXXXXXX`.
- Turn Maintenance Mode on and confirm protected page changes redirect to the maintenance page.
- Confirm the maintenance page has the login button and normal routing resumes after Maintenance Mode is turned off.
- Confirm admin inbox and system logs sections are scrollable and use the themed scrollbar.

## Test Case Scenario #2: Admin Student Management

- Verify header, stats, tabs, search, filters, table, status text, pagination, archive/unarchive button, and table scroll.
- Confirm active status means the student is in the roster/table and already created an account.
- Confirm pending status means the student is in a roster/table but has not created an account.
- View a student and confirm profile image, student ID, name, email, contact number, course, year, address, barangay, current tracking, scholarship, and documents are correct.
- Confirm birthday, gender, academic cycle, and compliance violation are not shown in the student info modal.
- Preview COR, ROG, Student ID, Student Application Profile, and other documents without automatic download.
- Test zoom in/out from `0%`, drag while zoomed, reset zoom, scroll long previews, and download from the preview modal.
- Archive one student with a reason dropdown, Other reason input, and notes.
- Archive multiple students using checkboxes and confirm one reason applies to all selected students.
- Unarchive one and multiple students with confirmation and verify they return only when rules allow it.
- Confirm `roster_` is never shown in student numbers or document paths.

## Test Case Scenario #3: Admin Grantor Management

- Verify grantor table design, compact text, tooltips, status text, action button, tabs, search, filters, and pagination.
- View a grantor and confirm profile data, barangay/office address, minimum GWA format `0.00`, application status, current scholarship, posted announcements, total scholarships, total scholars, and total applicants.
- Confirm Recommended Student cards do not overlap and show top 3 suitable students with readable score details.
- Approve password change only when the grantor requested it; button must be disabled and gray otherwise.
- Confirm archived grantors cannot login, request password changes, publish announcements, or receive student applications.
- Unarchive grantors with confirmation and confirm their password is reset to the default flow.
- Confirm grantor profile updates create admin inbox notifications with useful changed fields.

## Test Case Scenario #4: Admin Scholarship Programs

- Verify tabs: Scholars, Tracking, Warning, Archived, and Scholarships.
- Confirm Scholars contains students who completed or hold a scholarship.
- Confirm Tracking contains only current active applications, not rejected or archived records.
- Confirm Warning contains duplicate/multiple-scholarship conflict records.
- Confirm Archived contains archived scholarship records.
- Confirm Scholarships contains only grantor-created scholarship application announcements, not admin announcements and not announcement-only posts.
- Filter by scholarship and confirm Scholars/Tracking data changes correctly.
- View a scholarship and confirm grantor, minimum GWA, requirements, application window, applied count, images, details, and View Announcement button.
- If archived, confirm View Announcement redirects to the archived announcement section.
- Confirm scholarship modal is centered, readable, scrollable, and has no hidden close button.

## Test Case Scenario #5: Admin Add/Import Scholars

- Add a student manually and confirm the modal sections are: Scholarship Details, Student ID and Name, Address, Additional Information, and Notes.
- Confirm the admin must select a grantor first, then scholarship dropdown shows only scholarships created by that grantor.
- Confirm all grantor scholarships appear, not only open scholarships.
- Confirm Student ID is required, 10 digits, and checked against existing accounts/rosters.
- Confirm student name is required and validates against the selected Student ID when it already exists.
- Confirm province, city, and barangay are dropdowns and use the same address data as student signup.
- Import Excel and confirm auto column detection for student number, names, course, year, and address.
- Confirm one system field cannot be assigned to multiple spreadsheet columns.
- Confirm dash-only columns are ignored.
- Confirm removing all rows resets the import flow like Clear and Restart.
- Confirm duplicate prevention blocks students already in another grantor roster and shows a custom confirmation dialog.

## Test Case Scenario #6: Admin Multiple Scholarship Prevention and Warning Resolution

- Attempt to add/import a student already assigned to another grantor and confirm the row is blocked from import.
- Confirm same-grantor roster update is allowed when it does not create a second scholarship.
- Force or locate a conflict in Warning and verify the student is frozen from continuing scholarship actions.
- View warning details and confirm all detected scholarship/grantor conflicts are listed.
- Select `Choose this Scholar`, confirm the decision, and verify non-selected scholarship assignments are archived/removed.
- Confirm the student is unfrozen and only the selected scholarship remains.
- Confirm admin and affected grantors receive inbox notifications.

## Test Case Scenario #7: Admin Requirements, SOE, LOA, Returning, and UNIFAST

- Verify Requirements tabs: Pending, Signing, Rejected, and Previous.
- Approve and reject material requests and confirm the student receives inbox notifications.
- Sign an SOE and confirm the cycle cooldown prevents another SOE download until the next cycle.
- Reject an SOE signing request with reason/notes and confirm the student must download/request again.
- Confirm previous signed records move to Previous after cycle reset.
- Submit and review LOA records; confirm reload keeps the student session and request data.
- Approve/reject LOA with reason and verify frozen/returning behavior where applicable.
- Verify UNIFAST and returning-student workflows show the expected records and do not create duplicates.

## Test Case Scenario #8: Admin Announcements, Inbox, Reports, and Deployment Checks

- Create an admin announcement and confirm all students can see it and receive an inbox notification.
- Archive an announcement and confirm the custom confirmation box appears.
- Use the announcement date picker and confirm dates are only set after Confirm.
- Test announcement filters: All, Admin, and each active grantor.
- Confirm current/previous announcement counts use the compact count design.
- Open admin inbox messages and confirm detail modals are readable and scrollable.
- Generate reports with and without filters and confirm preview data matches the table.
- Export PDF using the formatted report template with correct header/footer and no placeholder text.
- Export Excel and confirm the exported rows match the preview.
- For grantor reports, test `Export Top Students per Grantor` and confirm each grantor has a top 10 page.
- Confirm production URLs do not call localhost and no normal route opens the custom 404 page.
