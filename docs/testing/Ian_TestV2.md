# Ian Test Case V2

Tester: Ian  
Assigned Area: Admin portal V2 testing  
Scope: Test admin-side processes, pages, tables, modals, reports, notifications, and management flows.

## - Test Case Scenario #1 : Admin Login, Topbar, Sidebar, and Dashboard

Login as admin.

- Admin topbar uses the current system design.
- Inbox icon appears and badge is dynamic.
- Profile/menu button works.
- Sidebar shows all admin navigation.
- Sidebar active highlight follows current page.
- Dashboard content loads.
- Quick Access and Grantor Distribution are side by side where intended.
- Material Request Timeline is full width.
- Requirements naming is consistent.

## - Test Case Scenario #2 : Admin Inbox Overview

Open Admin Inbox.

- Notifications section shows latest 5 notifications.
- System Logs section shows latest 7 logs.
- `See all` for notifications opens full notifications page.
- `See all` for logs opens full logs page.
- Notifications are dynamic.
- Logs are dynamic/read-only.
- Search/filter works on the full pages.
- Notifications can be marked read and archived if available.
- Logs cannot be marked read or archived.

## - Test Case Scenario #3 : Student Management Header, Stats, Tabs, and Filters

Open Student Management.

- Header matches the Applications-style header design.
- Stats are relevant to student management.
- Stats appear above tabs.
- Tabs use underline design.
- Students and Archived tabs work.
- Archive button aligns with tabs.
- Archive button only enables when rows are checked.
- Pagination is at the bottom of the table.
- Search and filters are separated from pagination.
- Course and Year filters use current dropdown design.
- Table uses full width.

## - Test Case Scenario #4 : Student Management Table Design and Data

Check the table.

- Table includes roster data from all grantors and admin-added students.
- No duplicate student rows should appear for same student identity.
- Columns are centered where required.
- Table uses compact spacing.
- Long data uses ellipsis.
- Hover tooltip shows full data.
- Status logic works:
  - Active if student is in roster and already created account.
  - Pending if student is in roster but has not created account.
- Current Stage column should not be in the table if removed.
- Action column uses View button only.

## - Test Case Scenario #5 : Student Information Modal

Click View on a student.

- Modal is centered.
- Modal width is appropriate.
- Close `x` is inside top-right corner.
- Header design is clean and uses profile image if available.
- Student information excludes gender, birthday, academic cycle, and compliance violation.
- Address is subdivided into province, city/municipality, barangay, street/subdivision, and postal code.
- Scholarship section shows current scholarship/application if any.
- Current tracking appears in the scholarship section.
- Recommended Scholarships section appears only if the student has no scholarship yet.
- Recommended Scholarships shows top 3 recommendations.
- Document previews open in modal, not direct download.

## - Test Case Scenario #6 : Admin Student Archive

Select one or more student rows.

- Checkbox design is aligned.
- Archive button becomes active.
- Archive confirmation modal is redesigned.
- Cancel keeps current state.
- Confirm moves records to Archived tab.
- Archived tab shows archived students.
- Unarchive works if available.
- Student receives inbox notification if the archive affects active application/scholarship.

## - Test Case Scenario #7 : Admin Student Report Modal

Open Generate Report from Student Management.

- Modal is centered.
- Modal has appropriate width/margin.
- PDF/Excel segmented control works.
- Export button is visible.
- Preview table has row limit/pagination.
- Page numbers are at bottom.
- Preview data matches the actual filtered table.
- If filters are applied, export uses filtered data.
- If no filters are applied, export includes all data from first to last.
- Exported PDF has header and footer template.
- Exported PDF removes `Content Starts Here` and `Content Stops Here`.
- Column `Current Stage` is replaced with `Grantor`.
- Course text wraps in exported PDF where needed.

## - Test Case Scenario #8 : Grantor Management Table Design

Open Grantor Management.

- Overview is removed if current design requires it.
- Header matches admin design.
- Stats, tabs, search, filters, pagination, and table match Student Management design.
- Columns use compact spacing and ellipsis.
- Tooltip shows full data on hover.
- Status icon matches current dot/status style.
- Action column only shows View button.
- `No action` text is not shown.
- Action column spacing is correct.

## - Test Case Scenario #9 : Grantor Details Modal

Click View on a grantor.

- Modal is centered.
- Close `x` is inside top-right corner.
- Modal content has borders and spacing.
- Email, organization, contact number, total scholars, minimum GWA, application status, province, and city are shown clearly.
- Current announcement is shown.
- Number of posted announcements is shown.
- Total scholars is shown.
- Recommended Student section shows top 3 suitable students without scholarships.
- Approve Password Change button is enabled only if grantor requested password change.
- Disabled button is gray.
- Archive Grantor button works if allowed.

## - Test Case Scenario #10 : Grantor Password Request Approval

Use a grantor account that requested password change.

- Grantor status shows Password Requested.
- Admin View modal enables Approve Password Change.
- Clicking Approve Password Change updates grantor status.
- Grantor receives inbox notification.
- Button becomes disabled afterward.
- Grantor can change password after approval.

## - Test Case Scenario #11 : Scholarship Programs Main Tabs

Open Scholarship Programs.

- Design matches Student and Grantor Management.
- Overview border/extra container is removed if no longer needed.
- Tabs use underline style:
  - Scholars
  - Tracking
  - Warning
  - Archived
- Counts are dynamic.
- Dropdown for grantor filter lists active grantors only.
- Table design is compact with ellipsis/tooltips.
- Filters work dynamically.

## - Test Case Scenario #12 : Scholarship Programs - Scholars Tab

Check Scholars tab.

- Shows all students who completed the application/have scholarship.
- Includes students from all grantors and admin-added roster where applicable.
- Table data is accurate.
- Grantor/scholarship fields are correct.
- View button opens modal.
- Modal is centered and redesigned.
- Scholarship section is full width.
- Documents section uses non-conflicting class/design.

## - Test Case Scenario #13 : Scholarship Programs - Tracking Tab

Check Tracking tab.

- Shows students currently applying.
- Owned By column is removed.
- Status column is removed if current design requires it.
- Action button says `View`.
- Column headers are centered.
- Filter works dynamically.
- View modal shows Application Tracking header.
- Header does not show `Application Form` badge if removed.
- Documents section uses 2x2 layout.
- Other Documents appears below normal documents.
- Preview opens in modal, not download.
- Buttons include icons.
- Confirm Approval is disabled when current step must be completed by student.

## - Test Case Scenario #14 : Scholarship Programs - Warning Tab

Check Warning tab.

- Shows students with possible duplicate/multiple scholarship detected.
- Detection uses the current matching algorithm.
- Warning rows include previous/current grantor information.
- Admin receives notification when a warning is created.
- View modal explains why the student is in warning.
- Admin can verify which grantors are involved.

## - Test Case Scenario #15 : Scholarship Programs - Admin Add/Import

Test admin adding/importing students.

- Add button design matches current Add button.
- Add/Import modal is centered.
- Modal design matches grantor Add Scholars modal.
- Import preview leaves first column blank for Grantor.
- First column label is `Grantor`.
- First data column starts at the second column.
- Grantor column does not wrap.
- Multiple cell selection works only in Grantor column.
- Selecting a grantor applies it to highlighted cells.
- Highlight clears after grantor selection.
- Clear and Restart button has icon and themed design.
- Import warnings appear before import.
- Same-grantor duplicate is allowed/handled correctly if admin authority permits.
- Cross-grantor duplicate creates warning record.
- Admin-added students appear in the correct grantor roster as `Added by Admin`.

## - Test Case Scenario #16 : Admin Announcements Page

Open Admin Announcements.

- Navigation order has Announcements and Report Generation switched as requested.
- Published/current announcements use grantor announcement card design.
- Card shows image, author, title, subtitle, posted time/window, View/Archive actions as applicable.
- Count shows active and previous totals.
- `See all Announcements` opens all announcements page.
- All announcements page has current and archived/previous tabs.
- Filter supports:
  - All
  - Admin
  - Each active grantor separately
- Admin can see admin announcements and grantor announcements.
- Current/previous filtering works.
- Calendar modal appears above announcement modal.

## - Test Case Scenario #17 : Admin Create Announcement Modal

Open Create Announcement.

- Modal design matches grantor announcement modal.
- Modal is scrollable.
- Close `x` works.
- Announcement Title field works.
- Calendar schedule works.
- Required fields show red borders.
- Max 5 images works.
- Dropdown design matches current admin tables.
- Publishing creates announcement and expected inbox messages.

## - Test Case Scenario #18 : Requirements Section Table

Open Requirements.

- Section uses current admin design.
- Requested tab is split/updated to Approved and Rejected where required.
- Requested Requirements column is removed.
- Stats no longer show rejected in the last stats if removed.
- Checking process no longer includes pending/signed/rejected if manually handled.
- Current list shows students waiting to be signed.
- Previous tab shows previous semester/cycle view-only data.

## - Test Case Scenario #19 : Requirements View Modal

Open a material request.

- Modal is centered.
- Primary Details show student name, student number, scholarship, application number.
- Material Request section shows requested documents and date requested.
- Jan 1, 1970 should not appear.
- Documents section header/icon is aligned.
- COR, ROG, School ID, Application Form preview buttons work.
- Other Requirements are shown if uploaded.
- Preview opens above the view modal, not behind it.
- Approve Request button has icon.
- Reject Request button has icon.
- Reject requires reason/notes and sends student inbox message.
- Rejected modal/status uses `Rejected`, not `Non-Compliant`, where requested.

## - Test Case Scenario #20 : Admin Application Decision Confirmation

Test admin approval/rejection on a grantor-owned application.

- Admin can propose approval/rejection.
- Grantor receives confirmation notification.
- Student is not finalized until grantor confirms or countdown expires.
- 3-day countdown is recorded.
- Grantor confirm notifies admin.
- Auto-confirm after countdown finalizes the decision.
- Student receives final inbox notification.

## - Test Case Scenario #21 : Admin Notifications for Student/Grantor Actions

Verify admin inbox receives messages for:

- Student material request.
- Grantor confirms/rejects admin decision.
- Duplicate/multiple scholarship warning.
- Admin-generated announcements.
- Grantor password request.
- Important backend workflow logs if enabled.

## - Test Case Scenario #22 : Admin Deployment and Console Regression

Check all admin pages.

- No white screen.
- No CORS error.
- No localhost backend request.
- No failed document preview due to storage URL normalization.
- No modal appears behind another modal.
- No `ReferenceError`.
- No broken table layout.
- No missing icons.

## Tester Notes

Record every issue with:

- Scenario number
- Page name
- Test data used
- Expected result
- Actual result
- Screenshot
- Console error
- Browser/device
- Light or dark mode
