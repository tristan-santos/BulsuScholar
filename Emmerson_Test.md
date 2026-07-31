# Emmerson Alpha Test Checklist

Tester: Emmerson  
Assigned Area: Student account creation, student dashboard, inbox, profile, and document vault  
Important: Do not apply to any scholarship during this test.

## Test Case Scenario #1 : Student Account Creation

Test creating a student account using correct credentials, then check:

- All required fields are filled and validated properly.
- Student ID cannot be edited after it is extracted/confirmed.
- Email accepts only a valid email format.
- Email cannot be reused by another account.
- Contact number cannot be reused by another account.
- Contact number starts with `09`.
- Province, city/municipality, barangay, street/subdivision, and postal code are working.
- Course, year, and section fields are working.
- COR/Advising Slip upload accepts only valid PDF files.
- ROG upload accepts only valid PDF files.
- ROG upload is disabled until COR/Advising Slip is uploaded first.
- COR/Advising Slip document title is detected correctly.
- ROG document title is detected correctly as `Report of Grades`.
- COR/Advising Slip and ROG student name/student number match.
- Invalid uploads show a red border and a clear error message.
- Terms and Conditions must be checked before creating the account.
- Account creation succeeds when all data is valid.

## Test Case Scenario #2 : Email Confirmation

After creating the account, check:

- A confirmation or welcome email is received by the email used during signup.
- The email design is readable and branded as BulsuScholar.
- The email link redirects to the deployed site, not localhost.
- Account confirmation works from the email link.
- After confirmation, the student can log in successfully.

## Test Case Scenario #3 : Forgot Password

Test the forgot password flow, then check:

- Forgot Password accepts the student account email.
- The reset email is sent to the correct email.
- The reset link redirects to the deployed site, not localhost.
- Password reset page opens correctly.
- New password can be submitted successfully.
- Student can log in using the new password.
- Old password no longer works after reset.

## Test Case Scenario #4 : Student Dashboard

After logging in, check:

- Student name, student ID, email, contact number, GWA, and document status are displayed correctly.
- Announcement section shows available/latest announcements.
- Announcement cards have working buttons/links.
- Recommended Scholarship section shows recommended scholarships.
- Recommendation cards show grantor name, minimum GWA, and relevant recommendation details.
- Scholarship Preview shows that there is no scholarship yet for this student.
- Do not click Apply or submit any scholarship application.

## Test Case Scenario #5 : Quick Actions

Check every quick action button, then verify:

- Each button is clickable.
- Each button has a small animation/hover state.
- Each button redirects to the correct page.
- No button redirects to a broken or blank page.
- Back/navigation buttons return to the expected student page.

## Test Case Scenario #6 : Student Inbox

Check the inbox, then verify:

- Inbox page opens correctly.
- Inbox badge count is dynamic.
- Announcements or system messages appear if available.
- Clicking an announcement inbox item opens the correct announcement details page.
- Mark all as read works.
- Inbox badge updates after messages are marked as read.
- Empty inbox state displays properly if there are no unread messages.

## Test Case Scenario #7 : Student Profile

Open the student profile page, then check:

- Profile shows all details inputted during signup.
- Name, student ID, email, contact number, course, year, section, province, city/municipality, barangay, street/subdivision, and postal code are correct.
- Profile picture can be changed.
- Changed profile picture appears after saving.
- Profile layout is clean and not broken on the current screen size.

## Test Case Scenario #8 : Document Vault

Check the document vault, then verify:

- COR/Advising Slip can be viewed.
- COR/Advising Slip can be updated.
- ROG can be viewed.
- ROG can be updated.
- Student ID can be uploaded or updated.
- Student ID can be viewed after upload.
- Document preview opens in a modal instead of downloading immediately.
- Preview modal has a download button.
- Missing documents show the correct upload button.
- Existing documents show the correct `Update {Document}` button.

## Test Case Scenario #9 : Scholarship Application Form

Check the scholarship application form area, then verify:

- Application form template can be downloaded.
- Uploaded application form accepts PDF/PNG if allowed by the system.
- Uploaded application form can be viewed after upload.
- Uploaded application form can be updated.
- The system checks whether the uploaded application form matches the student's name.

## Test Case Scenario #10 : General UI and Error Checks

While testing, also check:

- No page shows a white screen.
- No button or link is unresponsive.
- No text overlaps or is cut off.
- Dropdowns use the correct green highlight design.
- Required fields show clear errors.
- Console should not show critical errors.
- Deployed links should use `https://bulsu-scholar.vercel.app`, not localhost.

## Tester Notes

Write down any issue found with:

- Page name
- What you clicked or uploaded
- Expected result
- Actual result
- Screenshot if possible
- Console error if available
