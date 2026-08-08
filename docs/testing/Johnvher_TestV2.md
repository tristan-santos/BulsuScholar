# Johnvher Test Case V2

Tester: Johnvher  
Assigned Area: Grantor portal V2 regression and new workflow testing  
Test Account ID: `grantor_johnvher`  
Scope: Test the grantor-side features that were added or modified after V1.

## - Test Case Scenario #1 : Grantor Data Isolation

Check that each grantor account only sees its own data.

- Login as `grantor_johnvher`.
- Open Scholars, Applications, Announcements, Inbox, and Profile.
- Confirm Johnvher only sees Johnvher roster records.
- Confirm Johnvher only sees Johnvher applicants.
- Confirm Johnvher cannot reject, approve, archive, or edit applicants from another grantor.
- Confirm search and filters do not reveal another grantor's applicants or roster.
- Confirm rejected/archived tabs only show Johnvher records.
- Confirm student tracking displays the correct grantor name, not another grantor.

## - Test Case Scenario #2 : Grantor Topbar, Sidebar, Profile Menu, and Inbox Badge

Check all grantor navigation surfaces.

- Topbar loads correctly on every grantor page.
- Inbox icon redirects to the grantor inbox.
- Inbox badge count updates when unread messages exist.
- Profile/menu button opens correctly.
- Light/dark mode toggle works from the menu.
- Sidebar highlights the current page.
- Logout works.
- Mobile menu opens and closes correctly.

## - Test Case Scenario #3 : Grantor Profile Save and No-Change Behavior

Open Grantor Profile and test profile updates.

- Save button is visible and aligned.
- Saving with no actual changes should not create a fake `Profile Updated` inbox message.
- Updating display name, organization, contact number, address, minimum GWA, or application toggle saves correctly.
- Inbox message is created only when real fields changed.
- Inbox details modal shows the changed fields.
- Request Password Change button works.
- Password request creates a grantor inbox item.
- Admin side shows the password request status.

## - Test Case Scenario #4 : Edit Scholar Account-Locked Fields

Open Scholars, then edit one scholar who already created a student account.

- Student ID is not editable.
- Student name fields are not editable.
- Email and contact number are not editable.
- Address fields are not editable.
- Course/year fields are not editable if the student account already owns them.
- Modal explains or visually indicates the account data is locked.
- Saving does not overwrite the student's official profile.

Then edit a temporary roster-only scholar.

- Temporary student fields can still be edited.
- Save Changes updates the grantor roster.
- After the student creates an account with that Student ID, repeat the test and confirm fields become locked.

## - Test Case Scenario #5 : Add Scholar Duplicate and Applicant Protection

Test manual add and import add.

- Adding a student already in Johnvher active roster is blocked.
- Adding a student already in Johnvher archived roster is blocked.
- Adding a student already applying to Johnvher is blocked.
- Adding a student already in another grantor roster shows a warning but can proceed only after confirmation.
- Warning rows are highlighted.
- Duplicate/multiple scholarship records appear in the Warning section.
- Admin receives an inbox notification when a multiple scholarship warning is detected.
- If the student already has a system account, the added roster row uses the existing student details instead of overwriting them.

## - Test Case Scenario #6 : Import Scholars Modal

Test the updated import modal.

- Modal is centered.
- Upload/drop zone design matches the system.
- Import preview opens after choosing an Excel/CSV file.
- Clear and Restart button has icon and themed design.
- Column mapping works.
- Same-roster duplicates are blocked.
- Cross-grantor duplicates are warned.
- Invalid rows are highlighted.
- Remove Selected works.
- Import button imports only valid/confirmed rows.
- Imported rows show in Scholars table.
- Rows added by admin, if visible in grantor roster, show `Added by Admin` or equivalent discretion.

## - Test Case Scenario #7 : Scholars Table and Archive Modal

Check updated table behavior.

- Student ID no longer shows `roster_` prefix.
- Checkbox column is aligned and sized correctly.
- Multiple row selection works.
- Archive button is enabled only when rows are checked.
- Archive confirmation modal is redesigned and centered.
- `Keep Current State` cancels correctly.
- `Archive Selected` archives selected rows.
- Archived rows move to Archived tab.
- Unarchive works if available.
- Student receives inbox notification when archived/unarchived if the student has an account/application.

## - Test Case Scenario #8 : Scholars Dark Mode Highlight

Switch to dark mode.

- Selected rows remain readable.
- Warning rows remain readable.
- Hover highlight is visible.
- Active/Archived status text is readable.
- Buttons, checkboxes, and filters are readable.
- No white table highlight appears behind white text.

## - Test Case Scenario #9 : Create Announcement Modal

Open Announcements, then Create Announcement.

- Modal is centered and scrollable when content is long.
- Close `x` is a circular icon inside the modal corner.
- Label is `Announcement Title`.
- Calendar appears above the announcement modal, not behind it.
- Dropdowns use the current admin-style dropdown design.
- Open for Applications toggle works.
- Minimum GWA appears only when applications are open.
- Required documents are horizontal.
- Other Requirement opens one editable requirement at a time.
- Check icon confirms the other requirement.
- Edit/delete icons work for saved other requirements.
- Max 5 images is enforced.
- Missing fields get red borders and clear error messages.
- Publish creates a grantor inbox message.

## - Test Case Scenario #10 : Announcement Cards and See All

Check published/current and previous announcements.

- Active announcement cards use the grantor-card design.
- Card image sizes are consistent.
- Card shows author profile, author name, title, subtitle, posted time, and application window.
- Count shows active and previous announcement totals.
- `See all Announcements` opens the all-announcements page.
- All Announcements has Announcements and Archived tabs.
- Archive moves the announcement to Archived.
- Archived announcements no longer appear as active on student pages.

## - Test Case Scenario #11 : Application List and Filter

Open Applications.

- Active and Rejected tabs work.
- Search works by student ID, applicant name, and application number.
- Status filter works.
- Table design matches the current table style.
- Columns show Student ID, Applicant, Application No., GWA, Current Step, Status, Applied On, Action.
- Action button says `View`.
- `No action` text is not shown.
- Only Johnvher applicants appear.

## - Test Case Scenario #12 : Application View Modal

Open an applicant.

- Modal is centered and reduced to the intended size.
- Close `x` is inside the top-right corner.
- Header shows profile image, student name, and application number.
- Current step is correct.
- Student Information uses the current compact design.
- Tracking is below Student Information.
- Documents section is below Tracking.
- Documents are shown in 2x2 full-width layout.
- COR, ROG, School ID, and Application Form open in preview modals, not direct downloads.
- Preview modal includes a Download button.
- Other Documents section appears when the student uploaded grantor-added requirements.
- If no other documents exist, it shows `None`.

## - Test Case Scenario #13 : Complete Current Stage Rules

Test a student stage that grantor can complete.

- Complete Current Stage button has icon and correct style.
- Stage completion updates tracking.
- Student receives inbox notification.
- Admin receives notification if the flow requires it.

Test a student-owned stage.

- Complete Current Stage button is disabled/gray.
- Message explains the step must be completed by the student.
- Grantor cannot force-complete a student-only step.

## - Test Case Scenario #14 : Admin Decision Confirmation

This applies when admin approves/rejects first.

- Grantor receives inbox notification for admin proposed decision.
- Application modal shows warning asking grantor to confirm.
- Buttons show Confirm Approval/Rejection and Cancel Approval/Rejection.
- Confirming notifies admin and student.
- Cancelling notifies admin if required.
- If grantor does nothing for 3 days, auto-confirmation should happen.
- Student should not wait indefinitely.

## - Test Case Scenario #15 : Reject Application

Reject a test application.

- Reject Application opens confirmation modal.
- Modal asks for reason, cause, notes/message, and shows who rejected.
- Confirm Reject Application works.
- Rejected student moves to Rejected tab.
- Reject button becomes gray/disabled if already rejected.
- Student receives inbox with reason and notes.
- Student scholarship page shows rejection, reason, and 24-hour cooldown.
- Student cannot continue that application while rejected.
- Student can re-apply after cooldown if the scholarship is available.

## - Test Case Scenario #16 : Material Request Notifications

Ask a student tester to request materials/SOE.

- Grantor receives inbox notification for material request.
- Request appears in the correct review area if grantor is allowed to review it.
- Approving/rejecting request sends student inbox notification.
- If rejected, reason/notes are visible to the student.
- If approved, student can proceed to downloading materials.

## - Test Case Scenario #17 : Grantor Inbox Details Modal

Open grantor Inbox.

- Clicking any inbox row opens full details modal.
- Modal shows type/category, title, full message, received date, read status, author, grantor ID, and related student/application data when present.
- Profile update messages show changed fields.
- Announcement messages show announcement details.
- Application messages show student/application details.
- Mark all as read works.
- Delete Message works.
- Badge updates after read/delete.

## - Test Case Scenario #18 : Grantor Deployment and Console Check

While testing every grantor page:

- No CORS error appears.
- No request points to localhost.
- No `ReferenceError` appears.
- No `HiOutlineShieldCheck is not defined` error appears.
- No `entryRejected is not defined` error appears.
- No white screen appears.
- Backend requests use Render URL.
- Images and document previews load.

## - Test Case Scenario #19 : Mobile and Theme Regression

Test on mobile and both themes.

- Tables scroll when needed.
- Modals fit the screen.
- Announcement modal scrolls.
- Reject modal fits.
- Application view modal fits.
- Buttons do not overlap close icons.
- Text remains readable in light and dark mode.

## Tester Notes

For every issue, record:

- Test Case Scenario number
- Page name
- Test data used
- Expected result
- Actual result
- Screenshot
- Console error
- Browser/device
- Light or dark mode
