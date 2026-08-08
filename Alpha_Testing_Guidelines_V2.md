# Alpha Testing V2 General Guidelines

Deadline: August 09, 2026, 11:59 PM

These guidelines are for the V2 alpha test cases. V2 focuses on the new, modified, and recently fixed flows in the student, grantor, and admin portals. Do not repeat unchanged V1 tests unless the V2 checklist mentions that the feature was redesigned, renamed, moved, or connected to a new backend process.

## 1. Assigned Testers

- Johnvher: Grantor side V2 test cases.
- Emmerson: Student account, profile, document, inbox, dashboard, and announcement V2 test cases.
- Veejay: Student scholarship, application, recommendation, tracking, materials, and apply-flow V2 test cases.
- Ian: Admin side V2 test cases.

Each tester must only follow their assigned V2 checklist unless asked to cross-check another tester's failed scenario.

## 2. Required Test Case File Format

Use the provided Excel Manual Test Case Format.

File name format:

`Test Case V2 #ScenarioNumber_TesterName`

Examples:

- `Test Case V2 #1_Johnvher`
- `Test Case V2 #4_Veejay`
- `Test Case V2 #9_Emmerson`
- `Test Case V2 #12_Ian`

If one Excel file contains all assigned V2 scenarios, use:

`Test Case V2_All_TesterName`

## 3. Manual Test Case Fields

Fill out every required field:

- Created by: your name
- Test Case Description: short description of the scenario
- Tester's Name: your full name
- Test Case Result: `Pass`, `Fail`, or `Not Executed`
- Prerequisites: what must exist before testing
- Test Data: exact data used
- Test Scenario: copied from your V2 checklist
- Step Details: exact steps followed
- Expected Results: what should happen
- Actual Results: what happened
- Remarks: issue summary, blocker, or notes

Do not leave `Actual Results`, `Test Data`, or `Remarks` blank for failed tests.

## 4. V2 Testing Focus

For V2, focus on:

- Recently redesigned pages.
- New modal behavior.
- New inbox notification behavior.
- New document preview behavior.
- New admin and grantor import flows.
- New recommended scholarship and recommended student logic.
- New rejection, archive, approval, and confirmation logic.
- Backend-connected flows after deployment.
- Mobile responsiveness and dark mode regressions.

If a V1 feature was edited in V2, test it again.

## 5. Test Data Rules

Always record exact test data used.

Include these when applicable:

- Student ID
- Student full name
- Student email
- Contact number
- Course, year level, and section
- Province, city, barangay, street, and postal code
- COR file name
- ROG file name
- Student ID file name
- Application form file name
- Grantor ID
- Grantor name
- Announcement title
- Application number
- Scholarship applied to
- Rejection reason and notes
- Requirement name and uploaded file
- Browser and device used

If a bug involves duplicate detection, record both records being compared.

## 6. Password and Account Rules

- Use only assigned test accounts.
- Password format should follow this style: `Test_YourName`
- Example: `Test_Johnvher`
- Do not use a personal password.
- Do not share test credentials with another tester.
- Do not reuse another tester's email or contact number.
- Do not spam forgot password, confirmation email, or resend email features because email services can rate-limit.

## 7. Modal Testing Rules

All modal-related test cases must check:

- Modal opens.
- Modal closes through the `x` icon.
- `x` icon is inside the top-right corner and is circular.
- Modal is centered on desktop.
- Modal fits on mobile.
- Modal content scrolls if it is too long.
- Buttons are aligned and have icons when required.
- Nested modals appear above the parent modal.
- Document preview modal appears above the view modal.
- No background page action happens accidentally while the modal is open.

If the modal appears behind another modal, mark it as `Fail`.

## 8. Document Preview Rules

When testing document preview:

- Preview should open in a modal.
- Preview should not force an automatic download.
- Download button should be inside the preview modal.
- COR, ROG, Student ID, Application Form, and Other Requirements should preview when uploaded.
- Missing documents should show a clean unavailable state.
- Storage links should work in deployment.
- No `preview_failed_400` error should appear.

If the browser downloads the file immediately instead of previewing it, mark it as `Fail`.

## 9. Inbox and Notification Rules

For every action that should notify a user, verify:

- The inbox badge count updates.
- The notification appears in the correct user inbox.
- The notification does not appear in the wrong user's inbox.
- Clicking the inbox item opens a full details modal.
- The full message is visible.
- The read state updates.
- Mark all as read works.
- Delete/archive message works if available.

Important notifications to check:

- Announcement created.
- Student applied.
- Application rejected.
- Application archived or unarchived.
- Material request submitted.
- Material request approved or rejected.
- Admin/grantor stage approval.
- Profile updated, only when actual changes were saved.
- Password change requested or approved.

## 10. Data Isolation Rules

Every tester must check that accounts only see their own allowed data.

- A student should only see their own profile, scholarship, documents, inbox, and application tracking.
- A grantor should only see their own roster, applicants, announcements, inbox, and material requests.
- Admin can see all system data.
- Grantor A must not be able to reject or approve Grantor B's applicant.
- A student rejected by one grantor should not remain active in that grantor's tracking flow.

If data appears under the wrong user or grantor, mark it as a high-priority `Fail`.

## 11. Deployment and Backend Rules

Test using the deployed site unless instructed otherwise.

Expected production URLs:

- Frontend: `https://bulsu-scholar.vercel.app`
- Backend: `https://bulsuscholar.onrender.com`

During testing, open the browser console and check:

- No localhost API request.
- No CORS error.
- No `ERR_CONNECTION_REFUSED`.
- No `ReferenceError`.
- No white screen.
- No missing backend route error for expected features.
- No Supabase table missing error.
- No document scanner unavailable error, unless Render is sleeping or down.

If Render is sleeping, wait for it to wake up and retry once before marking as failed.

## 12. Mobile Testing Rules

Student pages must be tested carefully on mobile because most users are expected to use phones.

Check:

- Topbar fits.
- Menu opens and closes.
- Cards stack cleanly.
- Tables scroll horizontally when needed.
- Buttons remain clickable.
- Modals fit the viewport.
- Document preview is usable.
- Text does not overlap.
- No unusable horizontal page overflow.
- Light and dark mode both remain readable.

Grantor and admin pages should also be checked in mobile view for major layout breaks.

## 13. Screenshot and Console Error Rules

When an error occurs:

1. Reload the page once.
2. Repeat the same action.
3. If the issue remains, screenshot the page.
4. Screenshot the console error.
5. Copy the exact error text into the Excel remarks.
6. Upload screenshots to the provided Google Drive folder.

Screenshot file name format:

`Test Case Scenario #Number_Error_TesterName`

Examples:

- `Test Case Scenario #5_Error_Johnvher`
- `Test Case Scenario #8_Error_Veejay`
- `Test Case Scenario #12_Error_Ian`
- `Test Case Scenario #3_Error_Emmerson`

## 14. Result Rules

Use only these values:

- Pass: the feature works exactly as expected.
- Fail: the feature breaks, saves wrong data, shows wrong UI, redirects incorrectly, sends wrong notification, or exposes wrong user data.
- Not Executed: the test could not be performed because another feature blocked it.

If a test is `Not Executed`, explain the blocker.

## 15. Final Submission Checklist

Before submitting, make sure:

- All assigned V2 scenarios are tested.
- Every scenario has a result.
- Failed scenarios include screenshots and console logs.
- Test data is complete.
- Actual results are specific.
- Remarks explain failures clearly.
- Files are named correctly.
- Screenshots are uploaded to Google Drive.
- The Excel file is uploaded before the deadline.

## 16. Important Reminder

V2 testing is mainly for the newest changes and fixes. The goal is to confirm that the system works after deployment, that each user type sees only their own data, and that all redesigned pages and modals are usable on desktop and mobile.
