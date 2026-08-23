# Emmerson V3 Test Cases - Student Side

Use this file for the final/V3 student-side test pass. Record `Pass`, `Fail`, or `Not Executed`, exact test data, expected result, actual result, tester name, date/time, browser/device, screenshots, and console/network logs for failures.

## Test Case Scenario #16: Student Account Creation and Document Rules

- Create an account with valid student data and confirm all required fields validate correctly.
- Upload COR/Advising Slip and confirm only documents titled `Advising Slip` or `Certificate of Registration` are accepted.
- Confirm COR/Advising Slip must match the current semester/cycle.
- Confirm ROG upload is disabled until COR is uploaded.
- Upload ROG and confirm only documents titled `Report of Grades` are accepted.
- Confirm ROG is optional only for first-year, first-cycle students.
- Confirm ROG must match the previous semester/cycle when required.
- Upload invalid COR/ROG and confirm the upload box border turns red with a clear error message.
- Confirm ROG final grade or remarks with `5.0`, `4.0`, `INC`, `UD`, `OD`, or `Failed` blocks signup.
- Confirm only regular students can apply for scholarships.
- Confirm duplicate email, contact number, student ID, and reused COR are blocked.
- Confirm roster identity check allows similar names but blocks unrelated names for the same student ID.
- Confirm welcome/confirmation email redirects to the deployed Vercel URL, not localhost.

## Test Case Scenario #17: Student Login, Dashboard, and Inbox

- Login after account creation and confirm the student sees only their own dashboard data.
- Verify Student Details, Announcements, Recommended Scholarships, Scholarship Preview, and Quick Actions.
- Confirm dashboard recommendation count matches the scholarship page recommendation count.
- Confirm dashboard cards do not repeatedly reload or flicker.
- Open Account Created inbox item and confirm it opens a detail modal, not a 404 route.
- Confirm inbox count is dynamic and disappears when no unread messages exist.
- Test mark all read, delete, message detail modal, and vertical inbox scroll.
- Confirm student receives inbox notifications for application, rejection, archive, unarchive invitation, material request approval/rejection, SOE signing, and admin/grantor stage approvals.

## Test Case Scenario #18: Student Profile and Document Vault

- Open Student Profile and confirm the profile card is sticky at the top-left on desktop.
- Confirm profile picture can be changed and remains after reload.
- Confirm student details include barangay and correct address formatting.
- Confirm contact number accepts only numbers and validates `09XXXXXXXXX` or `9XXXXXXXXX`.
- Confirm Document Vault shows COR, ROG, Student ID, and Student Application Profile.
- Confirm every document has View and Update/Upload behavior where appropriate.
- Confirm Student Application Profile can be downloaded even without a scholarship.
- Confirm Student Application Profile upload is disabled until the form has been downloaded, if that rule is active.
- Preview every document without automatic download.
- Test document zoom from `0%`, mouse wheel/touchpad zoom, drag while zoomed, reset, scroll, and download button.

## Test Case Scenario #19: Student Recommendations and Application Choice

- Confirm students without scholarships see Recommended Scholarships as cards with image/profile, grantor name, minimum GWA, reason label, and Apply button.
- Confirm recommendation priority is: Apply Again, Recommended by Admin, then Algorithm Recommendation.
- Confirm algorithm recommendations consider open application, GWA, roster strength, and location.
- Confirm admin-assigned students see only scholarships from the assigned grantor.
- Confirm students still choose which scholarship from that allowed grantor list.
- Confirm Apply is disabled/gray if already applied, in cooldown, archived by that grantor, grantor archived, or GWA is below requirement.
- Confirm disabled Apply on announcement details shows a clear reason where required.
- Confirm warning/frozen students do not see normal recommendations and instead see conflict guidance.

## Test Case Scenario #20: Student Scholarship Tracking, Rejection, Archive, and Cooldown

- Apply from Recommended Scholarships and confirm the chosen scholarship/grantor appears in tracking.
- Try applying again from an announcement and confirm duplicate applications are blocked.
- Move through tracking until admin/grantor review is required.
- Confirm student-owned stages can only be completed from the student side.
- Reject the student from grantor/admin side and confirm the student sees rejection reason and 24-hour cooldown.
- Confirm student cannot apply to any other grantor during the 24-hour cooldown.
- After cooldown, confirm previous rejected scholarship is archived and student can apply elsewhere.
- Archive the student from grantor side and confirm status becomes Archived, tracking freezes, and same-grantor reapply is blocked until unarchived.
- Unarchive invitation should show a card asking whether the student wants to apply again.
- Confirm accepting invitation starts the correct flow and rejecting invitation asks for reason/notes.

## Test Case Scenario #21: Student Announcements

- Open Announcements and confirm active/latest announcements show as cards with image, author profile, title, subtitle, and posted time.
- Confirm archived/expired announcements are faded gray and show Not Available.
- Confirm archived grantor announcements are hidden from students.
- Open announcement details and verify image preview/zoom, grantor profile image, application window, requirements, minimum GWA, and related announcements.
- Apply from announcement details and confirm the application uses the correct grantor and scholarship.
- Confirm applying to an archived or unavailable announcement is impossible.
- Confirm See All Announcements shows current and previous announcements correctly.

## Test Case Scenario #22: Student Materials, SOE, LOA, Returning, UNIFAST, Help, FAQ, and About

- Request SOE/materials and confirm admin/grantor inbox notifications are created.
- Confirm approved material request moves tracking forward and student receives inbox notification only, not routine email.
- Confirm student can download multiple SOEs until admin signs one.
- Confirm after SOE signing, cooldown prevents another SOE until the next cycle.
- Submit LOA with reason, supporting PDF, notes, and Other reason input.
- Reload LOA page and confirm student session and data are preserved.
- Confirm LOA approval freezes scholarship correctly and returning flow is available when applicable.
- Open Help and Support, FAQ, and About pages and confirm design, send button, and links work.
- Test all student pages on mobile and confirm no major overlap, cut headers, or broken modals.
