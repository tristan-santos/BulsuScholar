# Johnvher Alpha Test Checklist

Tester: Johnvher  
Assigned Area: Full grantor portal testing  
Test Account ID: `grantor_johnvher`  
Default Password: `Grantor@123`  
Important: The default password must be changed during testing.

## Test Case Scenario #0 : Test Account Setup

Before Johnvher starts, the admin/test lead should create a grantor account:

- First name: `Johnvher`
- Last name: use Johnvher's real/testing last name
- Email: use Johnvher's testing email
- Organization: use a test organization name
- Expected generated account ID: `grantor_johnvher`
- Default password: `Grantor@123`
- The account should force password change on first login.

After setup, check:

- `grantor_johnvher` can log in.
- The system redirects to change password if required.
- New password can be saved.
- Johnvher can log in again using the new password.
- Old default password no longer works after password change.

## Test Case Scenario #1 : Grantor Login and Navigation

Test the grantor login flow, then check:

- Correct credentials allow login.
- Wrong password shows a clear error.
- Unknown grantor ID shows a clear error.
- Topbar loads correctly.
- Sidebar loads correctly.
- Dashboard, Scholars, Applications, Announcements, Inbox, and Profile pages open correctly.
- Active navigation highlight follows the current page.
- Logout works.

## Test Case Scenario #2 : Grantor Dashboard

Open the grantor dashboard, then check:

- Dashboard statistics load correctly.
- Active scholars count is correct.
- Archived records count is correct.
- Latest scholar added is displayed correctly.
- Dashboard content uses the correct green/white design.
- Dashboard works in light mode and dark mode.
- Dashboard does not show broken or missing data.

## Test Case Scenario #3 : Grantor Profile

Open the grantor profile page, then check:

- Display name is correct.
- Organization is correct.
- Email is correct.
- Contact number can be added or updated.
- Minimum GWA to Apply can be added or updated.
- Province, city/municipality, street/subdivision, and postal code work.
- Application open/close toggle works.
- Request to Change Password button works.
- Profile picture can be changed.
- Save Changes button is visible and working.
- Inbox notification is created after profile update if expected.
- Wrong/empty inputs show proper validation.

## Test Case Scenario #4 : Scholars Page - View and Search

Open the Scholars page, then check:

- Scholars tab loads active scholars.
- Archived tab loads archived scholars.
- Search works by student ID.
- Search works by scholar name.
- Search works by course.
- Year level filter works.
- Table headers and cells do not wrap incorrectly.
- Status text is styled correctly.
- Empty state uses full table width.
- Pagination/tab design is working.
- Checkboxes are properly sized.

## Test Case Scenario #5 : Scholars Page - Add Scholar

Test adding scholars manually or through import, then check:

- Add Scholar button opens the correct modal.
- Required fields are validated.
- Student ID is required.
- Name is required.
- Course is required.
- Year level is required.
- Email/contact number validation works if included.
- Duplicate student is blocked.
- Similar duplicate student is warned using duplicate detection.
- Duplicate from another grantor roster is blocked.
- Warning rows/columns are highlighted when multiple duplicates exist.
- Valid scholar can be added successfully.
- Newly added scholar appears in the Scholars table.

## Test Case Scenario #6 : Scholars Page - Edit Scholar

Test editing a scholar, then check:

- Edit mode opens correctly.
- Existing scholar data appears in the modal.
- Student ID is not incorrectly changed if it should be locked.
- Status can be edited if allowed.
- Province, city, street/subdivision, course, and year level fields work.
- Email and contact number fields work.
- Save Changes updates the scholar.
- Cancel closes the modal without saving.
- Wrong inputs show proper validation.

## Test Case Scenario #7 : Scholars Page - Archive and Unarchive

Test archive actions, then check:

- Single scholar can be archived.
- Multiple scholars can be selected and archived.
- Archive confirmation appears if required.
- Archived scholar moves to Archived tab.
- Unarchive works if available.
- Student receives inbox notification when archived/unarchived.
- Archived/frozen student cannot continue application or request SOE if applicable.
- No duplicate archive records are created.

## Test Case Scenario #8 : CSV Import Modal

Test importing scholars, then check:

- CSV import modal opens.
- Header design is correct.
- Cancel button works.
- Import button works.
- Clear and Restart button uses the correct green theme.
- Invalid CSV shows a clear error.
- Missing required columns show a clear error.
- Duplicate rows are blocked.
- Multiple duplicate rows are highlighted.
- Valid rows are imported.
- Imported scholars appear in the Scholars table.

## Test Case Scenario #9 : Announcements Page - Published Announcements

Open the Announcements page, then check:

- Published announcements display as cards.
- Card image sizes are equal.
- Grantor profile image/name appears above the title.
- If made by the current grantor, author displays as `You`.
- Title, subtitle, status, and application window are shown.
- Open/Not Available status is styled correctly.
- View button works.
- Archive button works.
- Archived announcements are removed from active student announcement lists.
- See All Announcement page works.
- Active and Archived tabination works.

## Test Case Scenario #10 : Create Announcement Modal

Create an announcement, then check:

- Create Announcement button opens the modal.
- Announcement Title field is shown.
- Subtitle/message field works.
- Application Window calendar appears above the modal content and is usable.
- Toggle for Open for Applications works.
- If Open for Applications is enabled, Minimum Grade/GWA input appears.
- Accept irregular students checkbox appears.
- Required Documents checkboxes are horizontal and readable.
- Required documents include COG/ROG, COR, and Application Form as configured.
- Other Requirement button shows only one input row at a time.
- Other requirement name, type, and uploads needed fields work.
- Max 5 images can be uploaded.
- Missing fields show red borders and clear messages.
- Publishing creates the announcement.
- Publishing creates a grantor inbox notification.
- Publishing creates student inbox notification if expected.

## Test Case Scenario #11 : Announcement Wrong Input Testing

Try incorrect inputs, then check:

- Empty Announcement Title is blocked.
- Empty message/description is blocked if required.
- Invalid application window is blocked.
- Minimum GWA accepts valid grade format only.
- More than 5 images is blocked.
- Unsupported image file type is blocked.
- Invalid other requirement count is blocked.
- Calendar does not appear behind the modal/card.
- Modal close icon works.

## Test Case Scenario #12 : Applications Page - List and Filters

Open the Applications page, then check:

- Applications table loads only this grantor's applicants.
- Active tab works.
- Rejected tab works.
- Search works by student ID.
- Search works by applicant name.
- Search works by application number.
- Status filter works.
- Table design, pagination, icons, and buttons match the current system design.
- Columns show GWA and Current Step instead of irrelevant Scholarship/Provider columns.
- Empty state uses full table width.

## Test Case Scenario #13 : Application Review Modal

Open an applicant review modal, then check:

- Modal is centered and not too wide.
- Selected student's profile image is shown.
- Header shows student name and application number only.
- Current step is correct.
- Student information is shown clearly.
- Student information is arranged properly.
- GWA is displayed.
- Documents section is below tracking.
- Tracking section is below student information.
- COR preview opens in modal first.
- ROG/COG preview opens in modal first.
- Student ID preview opens in modal first.
- Application Form preview opens in modal first.
- Preview modal has a download button.
- Close icon is aligned and working.

## Test Case Scenario #14 : Complete Current Stage

Test completing stages, then check:

- Complete Current Stage button has the correct design and icon.
- Button works only when the current step is within the grantor's allowed scope.
- If the step is outside grantor scope, the button is disabled/gray.
- Completing a stage updates the student's current step.
- Student receives inbox notification after stage completion.
- Grantor inbox/log is updated if expected.
- No stage is skipped incorrectly.

## Test Case Scenario #15 : Reject Application

Test rejecting an application, then check:

- Reject Application button has correct design.
- Confirmation popup appears.
- Rejection reason dropdown works.
- Notes field works.
- Confirm Reject Application button works.
- Student application is moved to Rejected/Archived tab.
- Student receives inbox notification with rejection reason.
- Student application is removed/freed so the student can apply to another grantor.
- Rejected student does not remain active in the current grantor application list.

## Test Case Scenario #16 : Grantor Inbox

Open the grantor inbox, then check:

- Inbox page opens correctly.
- Grantor sees notifications for actions they need to know.
- Profile update creates an inbox item if expected.
- Password change request creates an inbox item if expected.
- Announcement created creates an inbox item.
- Announcement archived/unarchived creates an inbox item.
- New student application creates an inbox item.
- Stage completion creates an inbox item if expected.
- Mark all as read works.
- Inbox badge count updates dynamically.
- Empty inbox state displays properly.

## Test Case Scenario #17 : Dark Mode and Light Mode

Test all grantor pages in both modes:

- Dashboard supports light and dark mode.
- Scholars page supports light and dark mode.
- Applications page supports light and dark mode.
- Announcements page supports light and dark mode.
- Inbox supports light and dark mode.
- Profile supports light and dark mode.
- Text remains readable.
- Borders, buttons, dropdowns, and modals match the green theme.

## Test Case Scenario #18 : Mobile Responsiveness

Test the grantor portal on mobile or browser dev tools:

- Topbar is usable.
- Sidebar/menu is usable.
- Tables can scroll if needed.
- Modals fit the screen.
- Buttons do not overlap.
- Cards stack properly.
- Search/filter controls remain usable.
- No important content is cut off.

## Test Case Scenario #19 : General Error and Security Checks

While testing, check:

- No white screen appears.
- No broken route appears.
- No button redirects to localhost.
- No CORS error appears.
- No critical console errors appear.
- Required fields cannot be bypassed.
- Duplicate scholars cannot be added.
- Grantor cannot see another grantor's private applicant list.
- Grantor cannot accidentally replace an existing student application.
- Archived/frozen records behave correctly.

## Test Case Scenario #20 : Suggested Full Flow for Johnvher

Follow this order during alpha testing:

1. Admin creates `grantor_johnvher`.
2. Johnvher logs in using `Grantor@123`.
3. Johnvher changes the default password.
4. Johnvher updates the grantor profile.
5. Johnvher opens applications using the profile toggle if needed.
6. Johnvher creates an announcement open for applications.
7. Johnvher creates another announcement for announcement-only.
8. Johnvher adds/imports scholars.
9. Johnvher tests duplicate scholar prevention.
10. A student tester applies to Johnvher's scholarship.
11. Johnvher reviews the student application.
12. Johnvher previews submitted documents.
13. Johnvher completes the current stage if allowed.
14. Johnvher rejects one test application.
15. Johnvher archives and unarchives one scholar/application.
16. Johnvher checks inbox messages after every major action.
17. Johnvher tests light mode, dark mode, and mobile responsiveness.
18. Johnvher records all issues found.

## Tester Notes

Write down any issue found with:

- Page name
- Action performed
- Correct input or wrong input used
- Expected result
- Actual result
- Screenshot if possible
- Console error if available
- Whether the issue happened on desktop, mobile, light mode, or dark mode
