# Veejay Test Case V2

Tester: Veejay  
Assigned Area: Student scholarship application, recommendations, tracking, materials, and announcements V2  
Scope: Test student flows that changed after V1.

## - Test Case Scenario #1 : Recommended Scholarships Dashboard Cards

Login as a student with no active scholarship.

- Recommended Scholarships section appears on dashboard.
- Cards look like announcement cards.
- Each card shows grantor profile image/avatar.
- Each card shows grantor name.
- Minimum GWA is shown.
- Recommendation label is shown.
- Apply button is visible only when allowed.
- If more than 3 recommendations exist, `See all` appears.
- `See all` opens the full Recommended Scholarships page.

## - Test Case Scenario #2 : Recommended Scholarships Ranking

Open the full recommendation page.

- Student GWA appears in the header badge.
- All open grantors are listed.
- Closed grantors are not listed.
- Grantors requiring lower/equal GWA are ranked higher.
- Higher GWA match ranks correctly.
- Grantors with stronger roster count can rank higher if GWA allows.
- Location influence is reflected if available.
- Cards are ordered most recommended to least recommended.
- Apply buttons are same size across cards.

## - Test Case Scenario #3 : Apply from Recommended Scholarship

Apply from a recommended scholarship.

- Application is created.
- Student Scholarship Control Center shows the application.
- Grantor name is correct.
- Application number appears.
- Status begins correctly.
- Student inbox receives application-related message if configured.
- Grantor inbox/application list receives the applicant.
- Student can no longer apply to a second scholarship while active application exists.

## - Test Case Scenario #4 : Announcement Apply Duplicate Prevention

After applying from recommendations:

- Open an announcement from a different grantor.
- Apply Now button should be gray/disabled if active application exists.
- Cursor should show blocked/not allowed.
- Student can still view the announcement details.
- Clicking disabled apply does not create another application.
- Current scholarship does not change.
- Grantor applications do not receive duplicate/incorrect applicant.

## - Test Case Scenario #5 : GWA Requirement Blocking

Use a student whose GWA does not meet a grantor minimum.

- Announcement details show minimum GWA.
- Apply Now is gray/disabled.
- Reason appears below button where implemented.
- Recommended Scholarships should not rank or allow ineligible grantors as valid applications.
- No application is created when GWA is not met.

## - Test Case Scenario #6 : Scholarship Control Center Rejected State

Use or create a rejected application.

- Student inbox receives rejection notice.
- Scholarship page shows rejected status.
- Rejection reason and notes are visible.
- 24-hour cooldown is visible.
- Student cannot continue tracking during cooldown.
- Student cannot request SOE during cooldown.
- After cooldown, student can apply again if scholarship is open.

## - Test Case Scenario #7 : Tracking Flow and Student-Owned Steps

Open Scholarship Control Center.

- Tracking shows current stage correctly.
- Student-owned steps must be completed from student side.
- Admin/grantor-only approval stages wait for admin/grantor action.
- Student receives inbox notification after admin/grantor completes a stage.
- If the student is archived/frozen, tracking is frozen and cannot proceed.
- If unarchived, student receives inbox and can proceed if allowed.

## - Test Case Scenario #8 : Other Requirements Upload

Use a scholarship announcement with other requirements added by grantor.

- Other requirement appears below request/download materials area.
- Label uses the grantor-provided requirement name.
- Upload area appears for that requirement.
- Upload count follows grantor setting if visible.
- Uploaded other requirement appears in student document area.
- Grantor/admin document view shows Other Documents with preview.

## - Test Case Scenario #9 : Material Request and SOE Flow

After reaching material request stage:

- Request SOE button works only when allowed.
- Student receives status after requesting.
- Grantor/admin receives inbox notification for material request.
- Request of Materials stage waits for admin/grantor approval.
- If approved, Request of Materials becomes completed.
- Student proceeds to Downloading of Materials.
- Download button completes Downloading of Materials.
- Signing of Materials status should say `Go to admin for the signature`, not Completed/Pending/On-going.

## - Test Case Scenario #10 : Per-Cycle Renewal Behavior

Simulate/check new cycle behavior if test data is available.

- Student scholarship resets to Request of Materials every cycle/semester.
- Old checking/signing records move to Previous where applicable.
- Student must renew/request materials again for the new cycle.
- Previous data is view-only.

## - Test Case Scenario #11 : Student Announcements Page

Open Student Announcements.

- Current announcements are visible.
- Previous announcements are separated.
- Archived announcements are gray/faded.
- Archived announcements have disabled `Not Available` button and unavailable icon.
- Current open announcements have View Announcement button.
- Announcement card shows author profile, author name, title, posted time, and button.
- Related announcements only show active/current announcements from the same grantor.

## - Test Case Scenario #12 : Announcement Details Apply Button

Open several announcement details.

- Apply Now is green/enabled when student can apply.
- Apply Now is gray/disabled when student already applied.
- Apply Now is gray/disabled when GWA does not meet requirement.
- Disabled button uses blocked cursor.
- Application window is visible.
- Minimum GWA is visible.
- Required documents are visible.
- Other requirements are visible if configured.

## - Test Case Scenario #13 : Student Inbox During Application

During application testing:

- Inbox receives application submitted message if configured.
- Inbox receives stage completed messages.
- Inbox receives archive/freeze/unarchive messages.
- Inbox receives rejection messages with reason.
- Inbox receives material request approval/rejection.
- Clicking inbox row opens full details modal.
- Mark all as read works.
- Badge count updates.

## - Test Case Scenario #14 : Document Preview in Scholarship Pages

Open document previews from scholarship/tracking areas.

- COR preview opens in modal.
- ROG preview opens in modal.
- Student ID preview opens in modal.
- Application Form preview opens in modal.
- Other requirement documents preview in modal.
- Preview does not auto-download.
- Download button is available inside preview.

## - Test Case Scenario #15 : Light/Dark Mode and Mobile

Check all student scholarship pages.

- Recommended cards are readable in light mode.
- Recommended cards are readable in dark mode.
- Scholarship Control Center is readable in both modes.
- Tracking cards do not overlap on mobile.
- Announcement details fit mobile.
- Inbox details modal fits mobile.
- Buttons remain clickable on phone.

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
