# Veejay Alpha Test Checklist

Tester: Veejay  
Assigned Area: Student scholarship application flow, recommended scholarships, announcements, responsiveness, theme mode, and application progress  
Important: Veejay and Emmerson should both test the student side so errors are easier to catch.

## Test Case Scenario #1 : Student Account Creation

First, create a student account, then check:

- Account can be created using valid student data.
- COR/Advising Slip and ROG uploads are accepted only when valid.
- Duplicate email, contact number, student ID, or reused document is blocked.
- Required fields show clear errors.
- Account can be confirmed through email.
- Student can log in after confirmation.

## Test Case Scenario #2 : Recommended Scholarship Apply Button

After logging in, go to the student dashboard and check:

- Recommended Scholarship section is visible.
- Recommended scholarships are ranked and displayed properly.
- Grantor name, minimum GWA, and recommendation details are shown.
- `See all` opens the full recommended scholarships page.
- Recommended scholarship cards are clickable.
- `Apply` button works from the recommended scholarship card.
- After applying, the student application appears in the Scholarship Preview or Scholarship Control Center.
- Inbox receives a relevant message if the system sends one after applying.

## Test Case Scenario #3 : Announcement Apply Duplicate Prevention

After applying from Recommended Scholarship, test applying again from an announcement:

- Open the Announcements page.
- Open an announcement that has an available `Apply Now` button.
- Try to apply from the announcement.
- The system must not create a second application.
- The system must not change the scholarship/grantor already applied to.
- A clear warning/message should appear explaining that the student already has an active application.
- Scholarship Preview should still show the first applied scholarship only.
- Grantor application list should not receive duplicate student applications.

## Test Case Scenario #4 : Application Progress Flow

Complete the application process until it reaches the stage where admin/grantor approval is needed:

- Check that the applied scholarship appears correctly.
- Check that application status is shown as `Pending`, `Complete`, or `Rejected` depending on progress.
- Upload required documents if the current stage asks for them.
- Check that missing requirements show clear instructions.
- Check that completed steps update properly.
- Check that the student cannot proceed if required documents are missing.
- Check that the student inbox receives updates when stages are completed.
- Stop when the next step needs admin or grantor approval.
- Message the assigned grantor/admin through Messenger if approval is needed for testing.

## Test Case Scenario #5 : Student Buttons and Navigation

Check all clickable buttons and links on the student side:

- Dashboard buttons work.
- Announcement buttons work.
- Recommended scholarship buttons work.
- Scholarship Control Center buttons work.
- Profile buttons work.
- Document Vault view/update buttons work.
- Inbox buttons work.
- Back buttons return to the correct page.
- Buttons have hover/click animation.
- No button opens a blank page.
- No button redirects to localhost.

## Test Case Scenario #6 : Mobile Responsiveness

Test the student pages on mobile size using browser dev tools or an actual phone:

- Login page is usable on mobile.
- Signup page fields do not overlap.
- Dashboard sections stack properly.
- Announcement cards are readable.
- Recommended scholarship cards are readable.
- Scholarship Control Center is readable.
- Profile and Document Vault are usable.
- Inbox layout is readable.
- Topbar/menu works on mobile.
- No horizontal overflow unless the table intentionally needs scrolling.

## Test Case Scenario #7 : Light Mode and Dark Mode

Test both themes:

- Light mode applies to all student pages.
- Dark mode applies to all student pages.
- Dashboard, announcements, profile, inbox, and scholarship pages are not left in mixed colors.
- Text remains readable in both modes.
- Buttons and borders still match the green theme.
- Theme setting remains after navigating to another page.

## Test Case Scenario #8 : Announcement Pages

Check the student announcement experience:

- Announcements list shows available/latest announcements.
- Archived announcements are styled as unavailable/gray.
- `View Announcement` opens the correct announcement detail page.
- Announcement details show title, subtitle/message, grantor profile, images, date posted, and application window.
- Image area displays correctly.
- Related announcements do not show archived items.
- `Apply Now` is hidden or disabled when announcement is unavailable.

## Test Case Scenario #9 : Scholarship Control Center

Check the scholarship page after applying:

- Available/recommended programs should not allow duplicate applications.
- Current application information is displayed.
- Applying for/grantor name is correct.
- Application number is shown.
- Requirements status is shown.
- SOE/request area is positioned correctly.
- Request buttons are disabled if the student is not allowed to request yet.
- If the application is rejected/archived, the student can apply again to another grantor.

## Test Case Scenario #10 : Inbox and Notifications

Check inbox behavior during the application test:

- Inbox badge count updates dynamically.
- New application-related messages appear.
- Stage completion messages appear.
- Rejection/archive messages appear if tested.
- Mark all as read works.
- Read messages do not remain counted as unread.
- Clicking announcement messages opens the exact announcement detail page.

## Test Case Scenario #11 : General Error Checks

While testing, check:

- No white screen appears.
- No page has broken layout.
- No text overlaps.
- No missing image icons unless no image was uploaded.
- No critical console errors.
- Backend-related actions work on the deployed URL.
- CORS errors should not appear.
- All redirects should use `https://bulsu-scholar.vercel.app`.

## Tester Notes

Write down any issue found with:

- Page name
- Action performed
- Expected result
- Actual result
- Screenshot if possible
- Console error if available
- Whether the issue happened on desktop, mobile, light mode, or dark mode
