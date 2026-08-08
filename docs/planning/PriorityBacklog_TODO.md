# Priority Backlog TODO

Use this as the working priority list after alpha/beta testing. Items are grouped by impact so fixes that block testing and deployment stay ahead of polish work.

## Priority 0 - Critical Flow Fixes

- [ ] Fix Multiple Scholarship.
  - Grantor cannot add the student that is already in the other grantor roster.
  - Admin cannot add the student if the student already exist in some grantor roster.
  - But admin can add the student if the student grantor is just the same as the grantor roster
  - We will apply the prevention of multiple scholarship, rather than detecting
  - but we will still detect 

- [ ] Fix dynamic viewing of tracking.
  - Student tracking must always show the correct scholarship, grantor, current step, status, and required action.
  - Grantor/admin tracking modals must only show the selected student's correct data.
  - Rejected, archived, frozen, and cooldown states must stop students from continuing until allowed.

- [ ] Fix application ownership and visibility.
  - Grantors must only see their own roster, announcements, applicants, and rejected applicants.
  - Students must only see their own scholarship/application data.
  - Admin can see all records, but actions must respect the grantor confirmation rules already added.

- [ ] Fix the application form process.
  - Rename `Application Form` to `Student Application Profile`.
  - Create a checker for uploaded student application profile files.
  - Keep the downloadable format with autofill.
  - Allow PDF upload for now, then add validation later.

- [ ] Add the new request materials review process.
  - Material requests must go through review again.
  - Admin/grantor approval rules must apply.
  - Student must receive inbox notifications when approved, rejected, or moved to the next step.
  - Do not send routine material request updates through email.

- [ ] Finish all reports.
  - Student reports.
  - Grantor reports.
  - Scholarship program reports.
  - Materials/request reports.
  - Top students per grantor report.
  - Make sure PDF/Excel exports use backend data and respect filters.

## Priority 1 - Major New Features

- [ ] FAQ page.
  - Student FAQ.
  - Grantor FAQ.
  - Admin FAQ.
  - Include account creation, document uploads, application steps, ROG/COR rules, SOE/materials, and common errors.

- [ ] About page.
  - Explain BulsuScholar, target users, scholarship process, and office purpose.
  - Keep the design consistent with student/grantor/admin portals.

- [ ] Help Support / AI Bot.
  - Backend-only OpenAI integration.
  - Use a controlled knowledge base, not free-form system access.
  - Include fallback to FAQ/contact support when confidence is low.

- [ ] Grantor custom application form upload.
  - Keep it separate from the default student application profile template.
  - Grantor custom forms must show under that grantor's scholarship/announcement only.
  - Student must know whether they are downloading the default form or a grantor-specific custom form.

- [ ] LOA system.
  - Leave of Absence request flow.
  - Admin/grantor review.
  - Student status changes.
  - Return/reactivation process.

- [ ] Returning students process.
  - Returning student tracking.
  - Required documents.
  - Admin/grantor review rules.

- [ ] UNIFAST module.
  - Define required data first.
  - Add reports and tracking only after requirements are finalized.

- [ ] Objectives checking.
  - Map system features to capstone objectives.
  - Add verification checklist for each objective.

## Priority 2 - UX And Design

- [ ] Loading animations.
  - Page-level loading.
  - Button loading.
  - Modal loading.
  - Upload and scan loading.

- [ ] Skeleton loading.
  - Dashboard sections.
  - Tables.
  - Cards.
  - Inbox.
  - Profile/document vault.

- [ ] Micro animations.
  - Button hover/click.
  - Modal open/close.
  - Dropdown open/close.
  - Table row hover.
  - Card hover.

- [ ] Design consistency.
  - Same topbar/sidebar style per role.
  - Same table style per role.
  - Same modal style per role.
  - Same button, dropdown, status, and badge styles.

- [ ] Overall design concept cleanup.
  - Remove inconsistent old UI pieces.
  - Keep primary color `#00633c`.
  - Make dark mode readable everywhere.
  - Keep spacing compact but not crowded.

- [ ] Typography cleanup.
  - One font system across login, signup, student, grantor, and admin pages.
  - Consistent heading weights.
  - Consistent table and card text sizes.
  - Avoid overly bold body text.

- [ ] Redesign remaining older pages/modals.
  - Any page not matching the current student/grantor/admin design should be updated.
  - Prioritize pages used during alpha/beta testing.

## Priority 3 - Performance And Maintainability

- [ ] Better optimizations.
  - Reduce duplicate queries.
  - Cache stable reference data such as courses, cities, barangays, and grantors.
  - Avoid loading all records when a paginated/filter query is enough.

- [ ] Compacting functions.
  - Split very large page files into services, hooks, utilities, and components.
  - Keep business rules in shared services where possible.
  - Avoid duplicating the same workflow checks in multiple pages.

- [ ] Reduce server-side functions to React functions only when safe.
  - Keep secure operations in Python/backend.
  - Keep duplicate checks, account creation, document usage checks, notifications, and reports server-side.
  - Move only simple display formatting and UI-only calculations to React.

- [ ] Backend performance pass.
  - Review slow endpoints.
  - Add indexes for frequently queried JSON fields.
  - Remove unnecessary debug payloads from saved student records.
  - Confirm Render/Railway deployment uses the correct worker and startup command.

- [ ] Database cleanup.
  - Remove duplicate field names.
  - Standardize `ROG` naming where old `COG` labels remain.
  - Verify every frontend and backend read uses the final field names.

## Priority 4 - Security And Reliability

- [ ] Strengthen role-based access.
  - Student can only access own records.
  - Grantor can only access own grantor records.
  - Admin can access all management records.

- [ ] Add audit logs for important actions.
  - Account creation.
  - Profile updates.
  - Application approval/rejection.
  - Material request approval/rejection.
  - Grantor/admin imports.
  - Duplicate scholarship warnings.

- [ ] Improve inbox reliability.
  - Every important action should create an inbox notification.
  - Avoid email for routine status updates.
  - Use email only for auth, onboarding, password reset, and important external notices.

- [ ] Improve upload validation.
  - COR/Advising Slip must match current semester.
  - ROG must match expected previous semester when required.
  - Student Application Profile checker to be added.
  - File size and MIME type must match Supabase bucket restrictions.

- [ ] Deployment verification checklist.
  - Frontend environment variables.
  - Backend environment variables.
  - CORS origins.
  - Supabase Auth redirect URLs.
  - Storage bucket policies.
  - Email provider domain/sender setup.

## Notes

- Do not convert secure backend logic back to React if it controls account creation, duplicate prevention, role access, reports, notifications, or document-use checks.
- Prioritize fixes that block alpha/beta testing before adding large new modules.
- New features should include test cases and update the V2 testing documents when implemented.
