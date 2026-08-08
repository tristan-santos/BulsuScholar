# Emmerson Test Case V2

Tester: Emmerson  
Assigned Area: Student account/profile/document/inbox V2 regression  
Scope: Test student-side features changed after V1. Do not test scholarship application submission unless the scenario says so.

## - Test Case Scenario #1 : COR and ROG Upload Rules

Create or use a fresh student account attempt.

- COR upload accepts PDF only.
- PNG/JPG COR upload is rejected with red border and clear message.
- COR must be `Advising Slip` or `Certificate of Registration`.
- Invalid COR title is rejected.
- ROG upload is disabled until COR is uploaded.
- ROG upload accepts PDF only.
- ROG must be `Report of Grades`.
- Invalid ROG title is rejected.
- Upload boxes with errors turn red.
- Error message explains exactly what is wrong.

## - Test Case Scenario #2 : Cycle and Semester Validation

Test document cycle logic.

- Current COR/Advising Slip must match the current semester/cycle.
- If current cycle is 1st cycle, COR should accept the current 1st Semester.
- ROG should use the previous cycle/semester when required.
- 1st year, 1st semester students should not be forced to upload ROG.
- 1st year, 2nd semester and above should be required to upload previous-cycle ROG.
- ROG more than one cycle behind should be rejected.
- Error message should mention whether COR/ROG cycle is missing, invalid, or mismatched.

## - Test Case Scenario #3 : Scanner Output and Autofill

After uploading valid COR and ROG:

- First name autofills correctly.
- Last name autofills correctly.
- Middle name is not required/autofilled.
- Section is not forced/autofilled.
- Course autofills if detected, but can be corrected if needed.
- Year level behaves correctly.
- GWA autofills from ROG.
- Student number is detected correctly.
- Console should not expose large raw scan/debug data.
- No `rawTextPreview`, `gradeDebug`, or `gwaDebug` should be stored in the final student record.

## - Test Case Scenario #4 : Student Identity and Duplicate Security

Test edited identity behavior.

- Slight name variation is allowed if still similar to COR/ROG identity.
- Completely different name should still be noted for future validation but not block if current system allows it.
- Course mismatch can be edited for now.
- Email cannot be reused by another student account.
- CP number cannot be reused.
- CP number starting `929...` is treated the same as `0929...`.
- Reused COR file is blocked.
- Reused COR identity/cycle is blocked.
- Student ID cannot be modified before final submit after extraction.

## - Test Case Scenario #5 : Barangay and Address Fields

Test personal information address.

- Province dropdown works.
- City/Municipality dropdown updates based on province.
- Barangay dropdown updates based on city.
- Baliuag, Bulacan shows valid barangays.
- Barangay selected in signup appears in student profile.
- Street/Subdivision and Postal Code are side by side on larger screens.
- Address appears correctly in profile, grantor view, and admin view.
- Dropdown highlight uses the green/transparent green design where browser allows custom styling.

## - Test Case Scenario #6 : Terms and Conditions Modal

At account creation preview/submit:

- Terms modal appears before account creation.
- Terms must be accepted by checkbox.
- There is no follow-up question.
- Submit is blocked until terms are checked.
- Close/cancel behavior works.
- Modal is readable on mobile.

## - Test Case Scenario #7 : Email Design and Redirects

Test account email flows.

- Welcome email has modern BulsuScholar design.
- Confirmation email has modern BulsuScholar design.
- Forgot password email has modern BulsuScholar design.
- Buttons are visible and noticeable.
- Email links redirect to `https://bulsu-scholar.vercel.app`, not localhost.
- Forgot password rate-limit message is readable if Supabase blocks repeated requests.

## - Test Case Scenario #8 : Student Inbox Details Modal

Open Student Inbox.

- Clicking an inbox row opens a full details modal.
- Modal shows title, full message, received date, status, type/category, author, and related scholarship/application data when present.
- Announcement inbox redirects to the exact announcement detail when clicked.
- Rejection/archive/stage messages can be opened in modal.
- Mark all as read works.
- Badge count updates after reading messages.
- Delete icon works if available.

## - Test Case Scenario #9 : Student Profile V2

Open Student Profile.

- Profile header design is correct.
- Profile image edit uses pen/camera icon.
- Profile picture can be changed.
- Profile details show student ID, name, email, CP number, course, year, section, address, barangay, and postal code.
- Student ID remains locked.
- Document vault shows COR, ROG, Student ID, and Scholarship Application.
- Existing documents show `Update {Document}` buttons.
- Missing documents show upload buttons.
- Document preview opens in modal and does not auto-download.

## - Test Case Scenario #10 : Application Form Document Vault

Test the scholarship application form box.

- Download Form is available even if the student has no active scholarship.
- Upload Application Form is disabled until the form has been downloaded.
- Upload accepts PDF for now.
- No application form identity checker blocks upload for now.
- Uploaded application form can be viewed in preview modal.
- Preview modal has Download button.
- Update button works after upload.

## - Test Case Scenario #11 : Student Dashboard Design Regression

Open Student Dashboard.

- Each section has thin faded primary border and subtle shadow.
- Topbar is dynamic.
- Announcement section shows latest/current announcements.
- Recommended Scholarships section appears when no scholarship exists.
- Scholarship Preview shows no scholarship if the student has not applied.
- Quick Actions are clickable and animated.
- No text overlaps in mobile.
- Dark mode applies to all dashboard sections.

## - Test Case Scenario #12 : Student Announcement Details

Open an announcement detail page.

- Images display properly.
- Carousel/vertical image layout is not broken.
- Application window is shown.
- Minimum GWA is shown.
- Required documents are shown.
- Other requirements are shown if grantor added any.
- Apply Now is gray/disabled if student already has an application.
- Apply Now is gray/disabled if GWA does not meet requirement.
- Disabled apply button uses blocked cursor.
- Student can still view announcement even if cannot apply.

## - Test Case Scenario #13 : Mobile Responsiveness

Test on a real phone or mobile dev tools.

- Login page fits.
- Signup page fields stack properly.
- COR/ROG upload boxes fit.
- Terms modal fits.
- Dashboard sections stack properly.
- Inbox modal fits.
- Profile/document vault fits.
- Announcement details fit.
- No horizontal overflow unless a table intentionally scrolls.

## - Test Case Scenario #14 : Deployment Console Check

While testing:

- No CORS errors.
- No localhost backend requests.
- No white screen.
- No critical console error.
- No broken image icon for uploaded files.
- Document scanner errors are readable if backend is unavailable.

## Tester Notes

Record every issue with:

- Scenario number
- Page
- Test data
- Expected result
- Actual result
- Screenshot
- Console error
- Device/browser
