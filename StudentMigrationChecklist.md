# Student Functions Migration Checklist

Use this checklist after deploying frontend, backend, and Supabase changes. Test with a fresh student account and one existing migrated account.

## 1. Environment And Access

- [ ] Frontend opens from the deployed Vercel URL.
- [ ] Backend health endpoint opens from Render.
- [ ] Supabase URL and anon key are correct in Vercel environment variables.
- [ ] Backend Render environment variables are configured.
- [ ] Browser console has no CORS errors.
- [ ] Browser console has no `localhost:8000`, `localhost:8001`, or `localhost:5173` API calls in production.

## 2. Student Signup

- [ ] Student can open the signup page.
- [ ] COR upload is enabled first.
- [ ] COG upload is disabled until COR is uploaded.
- [ ] COR and COG only accept PDF files.
- [ ] Student ID is auto-filled from COR and cannot be edited.
- [ ] First name and last name are auto-filled correctly.
- [ ] Middle name is not auto-filled.
- [ ] Section is not auto-filled.
- [ ] Email cannot be reused by another account.
- [ ] Contact number cannot be reused by another account.
- [ ] Contact number must start with `09`.
- [ ] Terms and conditions modal appears before final account creation.
- [ ] Terms checkbox must be checked before creating the account.
- [ ] Account creation works after all validations pass.

## 3. COR And COG Matching

- [ ] COR scan returns the correct student number.
- [ ] COR scan returns the correct student name.
- [ ] COG scan returns the correct student number.
- [ ] COG scan returns the correct student name.
- [ ] COR and COG are accepted when student number and name match.
- [ ] COR and COG are rejected when student number does not match.
- [ ] COR and COG are rejected when student name does not match.
- [ ] Console logs show where identity comparison matched or failed.

## 4. COG Grade Validation

- [ ] Console logs collected COG final grades.
- [ ] Console logs collected COG remarks.
- [ ] COG with `5.0` in Final Grade is blocked.
- [ ] COG with `4.0` in Final Grade is blocked.
- [ ] COG with `INC` in Final Grade is blocked.
- [ ] COG with `UD` in Final Grade is blocked.
- [ ] COG with `OD` in Final Grade is blocked.
- [ ] COG with `Failed` in Remarks is blocked.
- [ ] Grade and remarks checks are case-insensitive.
- [ ] Valid COG with passing grades is accepted.

## 5. Student Type

- [ ] Student type options are shown as checkboxes.
- [ ] Options are `Regular`, `Transferee`, `Shifted`, and `Returning Student`.
- [ ] `Irregular Student` is not shown.
- [ ] No follow-up irregular student question appears.

## 6. Automatic Grantor Matching

- [ ] After signup, the system checks grantor rosters.
- [ ] If the student exists in a grantor roster, the scholarship is automatically attached.
- [ ] Matching uses student ID and name.
- [ ] Duplicate scholarship/application is not created.
- [ ] Student dashboard shows the active scholar/scholarship preview.
- [ ] Scholarship Control Center shows the matched grantor.
- [ ] Available programs are hidden if the student already has an active or pending scholarship/application.

## 7. Student Dashboard

- [ ] Student topbar works on dashboard.
- [ ] Inbox badge count is dynamic.
- [ ] Profile menu links redirect correctly.
- [ ] Dashboard stats show correct student data.
- [ ] Current GWA displays correctly.
- [ ] Document status shows `Complied` or `Not Complied Yet`.
- [ ] Announcement cards show only active/non-archived announcements.
- [ ] Announcement card buttons redirect correctly.
- [ ] Buttons and links have the intended hover/animation behavior.

## 8. Student Announcements

- [ ] Announcement page loads active announcements.
- [ ] Archived announcements are visually gray/faded.
- [ ] Archived announcement button says `Not Available`.
- [ ] Active announcement button allows viewing details.
- [ ] Announcement details page opens the selected announcement directly.
- [ ] Announcement details show application window.
- [ ] Announcement details show minimum GWA.
- [ ] Announcement details show required documents.
- [ ] Announcement details show whether student type/irregular restrictions apply.
- [ ] `Apply Now` only appears when the announcement is open for applications.
- [ ] `Apply Now` creates the scholarship application for the posting grantor.

## 9. Scholarship Control Center

- [ ] Current scholarship/application is shown when student has one.
- [ ] Applying for shows the grantor name.
- [ ] Application status shows `Pending`, `Complete`, or `Rejected`.
- [ ] Requirements status replaces old `Materials` wording.
- [ ] Missing requirements are shown clearly.
- [ ] Instructions explain where the student should upload or update missing documents.
- [ ] SOE box appears below the application summary.
- [ ] SOE request is disabled when student application is frozen or archived.

## 10. Document Vault

- [ ] COR appears after upload.
- [ ] COG appears after upload.
- [ ] Student ID upload appears only when required.
- [ ] Application form download uses the correct template file.
- [ ] Application form accepts PDF and PNG uploads.
- [ ] Uploaded application form can be viewed.
- [ ] Uploaded application form name matching checks only the student name.
- [ ] COR preview opens in a modal.
- [ ] COG preview opens in a modal.
- [ ] Student ID preview opens in a modal.
- [ ] Application form preview opens in a modal.
- [ ] Preview does not immediately download the file.
- [ ] Preview modal has a separate download button.

## 11. Student Inbox

- [ ] Inbox page loads student notifications.
- [ ] Inbox badge count updates based on unread messages.
- [ ] Badge disappears or changes correctly when there are no unread messages.
- [ ] `Mark all read` works.
- [ ] New announcement inbox item title uses `New announcement from [grantor]`.
- [ ] Clicking an announcement inbox item opens that announcement details page.
- [ ] Student receives inbox notification when application is created.
- [ ] Student receives inbox notification when each stage is completed.
- [ ] Student receives inbox notification when documents are reviewed and passed.
- [ ] Student receives inbox notification when application is rejected.
- [ ] Student receives inbox notification when scholarship/application is archived or frozen.
- [ ] Student receives inbox notification when scholarship/application is unarchived.

## 12. Application Stage Flow

- [ ] Step labels show `Step 1`, `Step 2`, and so on.
- [ ] Step 2 is hidden until Step 1 is complete.
- [ ] Document Review stage appears after Step 4.
- [ ] Grantor can complete stages allowed for their role.
- [ ] Admin can complete stages allowed for their role.
- [ ] Student cannot proceed when current stage is blocked.
- [ ] Student application freezes after grantor archive.
- [ ] Student can re-apply after rejection removes the active application.

## 13. Backend Services

- [ ] `/scan-document` works from deployed frontend.
- [ ] Signup duplicate checks work through backend.
- [ ] Student-grantor roster matching works through backend.
- [ ] Workflow stage update endpoints work.
- [ ] Notification creation works.
- [ ] Report/document endpoints used by student pages work if applicable.
- [ ] Backend returns readable error messages when something fails.

## 14. Supabase Data Checks

- [ ] `students` table receives the created student row.
- [ ] Supabase Auth user is created for the student.
- [ ] Auth email matches `students.data.email`.
- [ ] Duplicate normalized email is blocked.
- [ ] Duplicate normalized contact number is blocked.
- [ ] COR document-use/fingerprint check prevents reuse.
- [ ] Student notifications table exists and receives records.
- [ ] Grantor roster/application relationship is created correctly.

## 15. Production Regression Checks

- [ ] Refreshing a student route does not show Vercel 404.
- [ ] Custom 404 page appears for invalid frontend routes.
- [ ] Dark mode applies to student pages.
- [ ] Topbar navigation is consistent on all student pages.
- [ ] Footer is redesigned consistently on student pages that have one.
- [ ] No console errors appear during signup, dashboard, inbox, documents, and scholarship control testing.
- [ ] No failed network request appears except intentionally tested validation failures.

