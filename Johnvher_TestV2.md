# Johnvher Alpha Test Checklist V2

Tester: Johnvher  
Assigned Area: Grantor portal regression testing after latest edits  
Test Account ID: `grantor_johnvher`  
Purpose: Test only the newly modified or added grantor-side behavior.

## Test Case Scenario #1 : Grantor Data Isolation

Open the grantor Applications and Scholars pages, then check:

- Johnvher only sees applicants that applied to `grantor_johnvher`.
- Johnvher does not see applicants from `grantor_test`, `grantor_tina`, or other grantors.
- Johnvher cannot reject, approve, archive, or edit another grantor's applicant.
- Search and filters do not reveal another grantor's private records.
- Rejected tab only shows Johnvher's rejected applications.
- Scholars tab only shows Johnvher's roster.
- Archived scholars only show Johnvher's archived roster records.

## Test Case Scenario #2 : Edit Scholar Locking

Open Scholars, select a scholar, then click Edit.

Check a student who already created an account:

- Student ID is not editable.
- First name, middle name, last name are not editable.
- Email and contact number are not editable.
- Province, city/municipality, barangay, street/subdivision, and postal code are not editable.
- Course and year level are not editable.
- The modal shows a note that Student ID is locked because the student account already exists.
- Saving does not overwrite the student's account information.

Check a roster student who has not created an account yet:

- Student ID is editable.
- Temporary profile fields are editable.
- Save Changes updates the grantor roster.
- Once a student creates an account using that Student ID, repeat this test and confirm the fields become locked.

## Test Case Scenario #3 : Add Scholar Duplicate and Applicant Protection

Try adding a scholar manually and through import.

Check:

- If the Student ID already exists in Johnvher's active roster, the system blocks adding it.
- If the Student ID already exists in Johnvher's archived roster, the system blocks adding it.
- If the Student ID already exists as an applicant for Johnvher, the system blocks adding it manually.
- If the Student ID already exists in another grantor roster, the system warns but allows confirmation if intended.
- Warning rows are highlighted.
- Students with multiple detected scholarships appear in the Warning section.
- Admin receives a notification if duplicate/multiple scholarship warning is detected.

## Test Case Scenario #4 : Scholars Table Dark Mode

Switch to dark mode, then test the Scholars table.

Check:

- Selected row highlight is visible and readable.
- Warning row highlight is visible and readable.
- Text does not become white on a light background.
- Checkbox, status, updated date, and action buttons remain readable.
- Hover state is visible in dark mode.

## Test Case Scenario #5 : Create Announcement Modal

Open Announcements, then click Create Announcement.

Check:

- Modal opens centered.
- Announcement Title label is correct.
- Modal can scroll when the content is long.
- Close `x` button is a circle, not oval.
- Application Window calendar appears above the modal content and is usable.
- Open for Applications toggle works.
- Minimum Grade / GWA appears only when applications are open.
- Accept irregular students checkbox appears when applicable.
- Required documents are aligned horizontally.
- Other Requirement shows only one input row at a time.
- Other Requirement has a check/confirm button after entering the requirement.
- Max 5 images can be added.
- Missing required fields show red borders and clear error messages.

## Test Case Scenario #6 : Announcement Cards and Details

Test active and archived announcements.

Check:

- Published announcement cards show image, author, title, subtitle, and application window.
- Count displays as `0 active announcement | {n} previous announcement` or correct equivalent.
- View button opens the details modal.
- Details modal scrolls properly when images/content are long.
- Close `x` button is circular.
- Archive button works.
- Archived announcements no longer appear in student active announcements.
- Archived announcements are visible only in previous/archived sections.

## Test Case Scenario #7 : Grantor Inbox Details

Open grantor Inbox.

Check:

- Inbox badge count is dynamic.
- Mark all as read works.
- Clicking an inbox row opens a details modal.
- Modal shows full message, received date, read status, type, author, grantor ID, and related data.
- If the message is for profile updates, it shows what changed.
- If no profile field changed, no unnecessary `Profile Updated` inbox should be created.
- Delete Message works.
- Close button works.

## Test Case Scenario #8 : Profile Update and Password Request Notifications

Open Grantor Profile.

Check:

- Save Changes button is visible and working.
- Updating real profile fields creates a grantor inbox notification.
- Saving without changing anything should not create a fake profile update notification.
- Request Password Change button works.
- Password request creates an inbox notification.
- Admin should see password request status on the admin side.

## Test Case Scenario #9 : Application Review Modal

Open Applications, then View an applicant.

Check:

- Modal is centered.
- Close `x` button is inside the modal top-right corner.
- Header shows selected student's profile image, name, and application number only.
- Current step is correct.
- Student information is clean and readable.
- GWA is shown.
- Tracking is below student information.
- Documents section is below tracking.
- Document buttons are preview buttons, not direct downloads.
- Preview modal opens for COR, ROG/COG, School ID, and Application Form when available.
- Preview modal includes a Download button.

## Test Case Scenario #10 : Complete Current Stage

Use an application in a stage grantor can review.

Check:

- Complete Current Stage button has correct design and icon.
- Button is enabled only when the stage is within grantor scope.
- If the stage is outside grantor scope, button is gray and disabled.
- Completing the current stage updates the student's tracking.
- Student receives inbox notification after stage completion.
- Grantor cannot skip stages incorrectly.

## Test Case Scenario #11 : Reject Application

Reject a test application.

Check:

- Reject Application button opens confirmation modal.
- Close `x` button is circular and placed correctly.
- Reason dropdown works.
- Notes/message field works.
- Modal shows applicant, application number, scholarship, and rejected by.
- Confirm Reject Application works.
- Rejected application moves to Rejected tab.
- Reject button becomes disabled/gray if the application is already completely rejected.
- Student receives inbox notification with reason and notes.
- Student sees rejection status and cooldown on their scholarship page.
- Student cannot continue tracking during rejection cooldown.
- After cooldown, student can re-apply if the scholarship is open.

## Test Case Scenario #12 : Admin Confirmation Flow for Admin Decisions

This applies when admin approves/rejects an application first.

Check:

- Grantor receives notification that admin proposed approval/rejection.
- Application modal shows warning asking the grantor to confirm the admin decision.
- Button text changes to Confirm Approval or Confirm Rejection.
- Cancel Approval/Rejection button works if available.
- If grantor confirms, admin is notified.
- If grantor does not confirm within the 3-day countdown, the system auto-confirms the decision.
- Student is notified after the final decision.

## Test Case Scenario #13 : Grantor Dark Mode Regression

Test these pages in dark mode:

- Dashboard
- Scholars
- Applications
- Announcements
- Inbox
- Profile

Check:

- No table row becomes unreadable.
- No white row highlight appears behind white text.
- Modals use dark mode colors correctly.
- Dropdowns, buttons, icons, and borders are visible.
- Announcement and application image previews remain visible.

## Test Case Scenario #14 : Mobile Responsiveness Regression

Test the grantor portal using mobile size or a real phone.

Check:

- Topbar works.
- Menu opens and closes.
- Inbox button works.
- Tables scroll horizontally when needed.
- Edit Scholar modal fits the screen.
- Announcement modal scrolls properly.
- Reject Application modal fits the screen.
- Application Review modal fits the screen.
- No button overlaps with the close icon.
- Text remains readable and does not overflow badly.

## Test Case Scenario #15 : Console and Deployment Errors

While testing all grantor pages, check the browser console.

Check:

- No `ReferenceError` appears.
- No `HiOutlineShieldCheck is not defined` error appears.
- No `entryRejected is not defined` error appears.
- No CORS error appears for backend requests.
- No request still points to `localhost`.
- No white screen appears after navigation.
- No failed notification request appears when inbox actions are performed.

## Suggested V2 Test Flow

1. Login as `grantor_johnvher`.
2. Check dashboard, sidebar, topbar, inbox badge, and profile menu.
3. Open Profile and test save with no changes, then save with real changes.
4. Request password change and check inbox.
5. Open Scholars and test row selection in light and dark mode.
6. Edit one scholar with an existing student account and confirm locked fields.
7. Edit one temporary roster scholar and confirm fields are editable.
8. Try adding a duplicate active roster student.
9. Try adding a student who is already an applicant.
10. Try importing duplicate and warning rows.
11. Create an announcement with application open.
12. Create an announcement-only post.
13. View a long announcement and confirm modal scrolling.
14. Ask a student tester to apply to Johnvher's announcement.
15. Review the application and preview documents.
16. Complete a valid current stage.
17. Reject one test application with reason and notes.
18. Confirm inbox notifications after each major action.
19. Test dark mode.
20. Test mobile responsiveness.

## Tester Notes

For every issue found, record:

- Test Case Scenario number
- Page name
- Action performed
- Test data used
- Expected result
- Actual result
- Screenshot
- Console error, if any
- Device/browser used
- Light mode or dark mode
