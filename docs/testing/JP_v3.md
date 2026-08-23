# JP V3 Test Cases - System Process and Objectives Flow

Use this file for the final/V3 end-to-end process test. This is less detailed than the role-specific files; focus on whether the whole system flow supports the project objectives. Record `Pass`, `Fail`, or `Not Executed`, exact test data, expected result, actual result, tester name, date/time, browser/device, screenshots, and console/network logs for failures.

## Test Case Scenario #23: Objective 1 - Centralized Scholarship Management

- Start from a fresh student account or provided test account.
- Confirm the student can create/login to an account and manage their own profile/documents.
- Confirm the grantor can publish/manage only their own scholarships, scholars, announcements, and applicants.
- Confirm the admin can view/manage students, grantors, scholarships, requirements, announcements, inbox, and reports.
- Run one complete application flow from student application to grantor/admin review.
- Confirm statuses stay consistent across Student, Grantor, and Admin portals.
- Confirm document previews are accessible only from authorized accounts.

## Test Case Scenario #24: Objective 2 - Duplicate and Multiple Scholarship Prevention

- Try duplicate student ID, email, contact number, reused COR, wrong ROG cycle, and mismatched identity during signup.
- Confirm invalid data is blocked with clear errors.
- Try adding/importing a student already assigned to another grantor from admin and grantor sides.
- Confirm duplicate/multiple-scholarship prevention blocks the import/add where required.
- If a conflict already exists, confirm the student is frozen and appears in the warning table.
- Resolve a warning by choosing one scholarship and confirm all other assignments are archived/removed.
- Confirm no student can actively continue with two scholarships at the same time.

## Test Case Scenario #25: Objective 3 - Recommendations, Lifecycle, Compliance, and Academic Monitoring

- Confirm Recommended Scholarships are based on GWA, grantor availability, roster strength, location, admin recommendation, and apply-again state.
- Confirm a student can choose from recommendations unless admin/grantor roster rules restrict the grantor list.
- Move a student through lifecycle states: account created, applying, document upload/profile setup, document review, requesting materials, signing/cooldown, rejection, archive, LOA, and returning.
- Confirm inbox notifications are used for routine lifecycle changes instead of email.
- Confirm COR/ROG/GWA data supports eligibility and academic checks.
- Confirm reports provide useful summaries for student records, grantors, scholarships, material requests, UNIFAST, and top students per grantor.

## Test Case Scenario #26: Final Process Regression

- Test the system on production frontend and backend URLs.
- Confirm no visible localhost links remain in emails, redirects, API calls, or inbox links.
- Confirm no page routes redirect to 404 during normal use.
- Confirm mobile student/grantor flows work and admin remains usable on laptop/desktop.
- Confirm every important action creates the correct inbox notification for the correct role.
- Confirm no routine SOE/material update email is sent.
- Confirm final smoke tests pass: account creation, login, forgot password, announcement, recommendation, application, review, rejection, archive, unarchive, SOE, LOA, report export, FAQ/About/Help.
