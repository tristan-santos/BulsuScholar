# Priority Backlog TODO

Use this as the working priority list after alpha/beta testing. Items are grouped by impact so fixes that block testing and deployment stay ahead of polish work.

## Priority 0 - Critical Flow Fixes

- [ ] Fix Multiple Scholarship.
  - Grantor cannot add the student that is already in the other grantor roster.
  - Admin cannot add the student if the student already exist in some grantor roster.
  - But admin can add the student if the student grantor is just the same as the grantor roster
  - We will apply the prevention of multiple scholarship, rather than detecting
  - but we will still detect it.

- [ ] Notification log for admin
  - When a grantor logged into their account, there should be a system log for it
  - Where it will show the whos grantor logged in, date and time of the log in, if possible is when or what device use

- [ ] Types of scholarships
  - When admin add a grantor, there should be a type of Grantors
  - Private, Public, and Government ( later i will add more and distinct more)
  - This will distinguish the type of Grantor we have in the system
  - Later we will tackle more into it

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

- [ ]Allow grantor for custom application form
  - Grantor can add a custom application form ( Pdf), in their profile
  - This will be used by the student in "Application Form" stage in the tracking
  - Where student must download the custom application form set by the grantor where they apply for
  - If there is no application form, the default application form will be used and downloaded by the student
  - After downloading, they will now upload the application form in the left tab (simmilar to additional requirements)accept only pdf and png
  - Since we establish that in the "Application Form" stage, only then the student will download and upload the form set by the grantor or the default if there is no custom application form. 
  - Now in the student profile document vault, since we establish that it will changed to "Student Application Profile" it must not accept Application form anymore, but "Student Application Profile" where they can download it, its just a Student Profile that the admin will have hardcopy.
  - Now here is the new step. Student Download `Student Application Profile`, upload it when they are done, then it will be added to check in the 'Upload Documnets' stage. Then after the Grantor or Admin check and confirm ( using the rule we establish that the admin can accept or reject the stage or application, but the grantor must be the one to confirm the decision and wait for 3 days to automatically accept the decision if the grantor doesnt confirm the decision manually), Student will proceed to "Application Form" Stage where they will download the custom application ( default application if there is no custom), will be found in the Left side of the scholarship tracking box, then after they done they can upload it and all the other requirement set by the grantor. Then they can proceed to "Document Review".
  - Change the "Uploading Documents" to "Complete profile setup", then "Application form" stage to "Uploading Documents"
  - So bring back the option of "Application Form" in creating announcement - required announcement, and have a option for custom or default application
  - Now for admin and grantor side, in tracking or application, when viewing student, it must show all the documents the student provide and the grantor set. Example : Student Document Section, COR ROG Student ID, Student Application Profile. Then Application Documents : Custom Application Form, Baranngay Clearance, NBI. Etc etc. Grantor and admin can preview it, can scroll the preview image and zoom in and out and can drag the zoom in and out of the documents.
  - Additional: Remove the "Uploads Needed" when adding additional requirements, just make it 1 additional requirements 1 file


- [ ] Add the new request materials review process.
  - Material requests must go through review again.
  - Admin/grantor approval rules must apply.
  - Student must receive inbox notifications when approved, rejected, or moved to the next step.
  - Do not send routine material request updates through email.



## Priority 1 - Major New Features

- [x] FAQ page.
  - Student FAQ.
  - Grantor FAQ.
  - Admin FAQ.
  - Include account creation, document uploads, application steps, ROG/COR rules, SOE/materials, and common errors.

- [x] About page.
  - Explain BulsuScholar, target users, scholarship process, and office purpose.
  - Keep the design consistent with student/grantor/admin portals.

- [x] Help Support / AI Bot.
  - Backend-only OpenAI integration.
  - Create a dedicated page for Help and Support with the Ai or not, and the Feedback
  - Always show the help and support button ( right bottom corner)
  - Design the button like a question mark, when click will redirect to Help and Support page.
  - Help and Support page, will look like a conversation between the Ai and the user. ( later we will add more into it)
  - Use a controlled knowledge base, not free-form system access.
  - Include fallback to FAQ/contact support when confidence is low.
  - Tell me what is the AI we use and how can i use it or make it work also if there is a need for API Keys

- [x] Grantor custom application form upload.
  - Keep it separate from the default student application profile template.
  - Student must know whether they are downloading the default form or a grantor-specific custom form.

- [x] LOA system. 
  - Brief Introduction: LOA (Leave of Absence) is a Request made by the student. A loa student is typically a student who did continue their current or future studies. Example: Student001 request for LOA, Student001 will not be studying the school from now until they become Returning Student. LOA Student will still have their scholarship when they return to the school. LOA student will still have a unifast scholarship ( later i will establish what UNIFAST is). And at last Student must request to become LOA and must be approve by the admin, or they can pass a document, also called LOA Request Form.

  - Leave of Absence request flow. Create button for Request of Leave of absence in student profile, then when the button is click create a modal popup, asking why they are requesting for LOA, upload a document of the LOA Req Form, then some aditional notes. then the confirmation box.
  - Admin/grantor review. Admin accepts / rejects the LOA
  - Student status changes. Students with scholarship, applying for scholarships will become archive when the LOA was approved by the admin. 
  - Return/reactivation process. When student return they must appeal a request also for returning their account and their previous scholarship will be highly suggested to them.

- [x] Returning students process.
  - Returning student tracking.
  - Required documents.
  - Admin/grantor review rules.

- [x] UNIFAST Scholarship.
  - Brief Introduction: UNIFAST is a type of scholarship, not entirely scholarship that grants money. Its a scholarship for student studying the school. UNIFAST pays the student tuition itself. UNIFAST will only cover 5 years of student studies. So meaning if the system finds a student who is 6 years studying, their UNIFAST will not be available. Example: student001 is 4th year, and 2 years from the future AY 2028-2029, he/she is not eligible for UNIFAST. UNIFAST Scholarship is not considered in a multiple/duplicate scholarship rules

  - Admin only, create a new section of UNIFAST above the Announcement. It will hold the Students who have a unifast scholars
  - Admin only, Admin can import excel file of student who have UNIFAST. It will show into the table and also atleast a filter
  - Admin only, 2 Tabinations will be available, With Unifast and Without Unifast ( create a tabination name for that ). With Unifast is when the system detect a student have unifast ( when the admin upload the excel file, it will check for existing student in the system, using an algorithm like student number, name) and they will have a unifast (Do not put unifast in the student side for now), and Without Unifast is student who did not have unifast when the system detects in the admin upload
  - For now thats just it, i will add a function for that
  - Add reports also for this.


- [x] Fix the inbox modal popup box
  - Some inbox when click will redirect to 404 page
  - Create a custom inbox modal popup, when the user click the inbox it will show the details of that inbox, do add technical details, only the user needs. like the title, subtitle, body, from who, when, and time, etc etc.


- [x] Objectives checking.
  - Map system features to capstone objectives.
  - Add verification checklist for each objective.
  - Here is the Objective:
    1. To develop a centralized scholarship management system that enables students to apply and submit required documents, while allowing grantors and administrators to manage scholarship postings, evaluate applicants, and process approvals efficiently within a unified platform.
    2. To develop a system that validates student records, prevents multiple active scholarships, and enforces duplication prevention across both internal and externally sourced scholarship records.
    3. To develop a system that provides scholarship recommendations, manages the scholarship lifecycle (application, approval, active status, renewal, and completion), and monitors student compliance and academic performance.


## Priority 2 - UX And Design

- [ ] Finish all reports.
  - Student reports.
  - Grantor reports.
  - Scholarship program reports.
  - Materials/request reports.
  - Top students per grantor report.
  - Make sure PDF/Excel exports use backend data and respect filters.
  
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
- New and modified features must be added to `docs/testing/LAST_Test_V3.md`. Do not modify the completed V2 testing documents.
- Priority 1 deployment requires running `supabase/priority-one.sql`. The Help assistant uses the backend-only `OPENAI_API_KEY` and `OPENAI_HELP_MODEL`; without a key it safely falls back to the controlled FAQ knowledge base.
