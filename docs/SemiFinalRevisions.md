# Semi-Final Revision Roadmap

This is an implementation checklist for the requests in `C:\Users\santo\Downloads\Revisions.txt`. It is **not** an instruction to run SQL or change production today. The source file also contains a generated priority essay and suggested dates; those are not confirmed requirements or deadlines. Use the office-approved rules and the current [production deployment checklist](deployment/DeploymentChecklist.md) for each release.

**Status as of September 22, 2026:** Some roster-assignment, login-lockout, and recovery code exists in this checkout, but that does not prove it is deployed. The grantor Auth migration was reported complete; do not rerun it merely because it appears in older instructions. Verify the live database migration list, Railway API, Vercel build, and role-specific login before marking those items complete. The remaining items below are planned work unless verified separately.

## 1. Confirm Rules Before Coding

Record each answer in an issue or decision log, with an owner and date. Do not infer policy from UI wording.

- [ Since later on we will have a manual document handling before student can create an account. Leave this for now] Ask Sir Celso how a returning student with a schedule conflict should be handled, including who may override the result.
- [ Please elaborate this ] Define the official scholarship point formula: inputs, weights, eligibility gates, rounding, ties, effective semester, and who approves changes. Existing recommendation scoring is not automatically the official selection formula.
- [ To have an option between cor and advising slip the admin will decide or keep both open, for the generated is just a text reminder for student when uploading cor/roog, it must be Portal-Generated Documents ] Decide whether COR is always required first, when an Advising Slip may replace it, and which admin role may grant that exception. Clarify whether "generated COR" means a university-issued file or a portal-generated document.
- [ When the student is detected to be a 1st year, Student ID/Valid Id is not strict, but when student is 2nd year above student id is a must, remind student that their Student ID/Valid ID will be checked manually by the admin. Admin will have an option for both automatic approval or manual approval, when manual approval is ON, all the student creating their account will have to wait for the admin approval, and the system will email the student a "Welcome" Email if they get approved by the admin, now ehn rejected is the "Rejected" Email. Now when automatic approval is on in discretion by the admin, the "Confirm-email" will be sent on the email they set. Now create me a new tab in th admin side-students management section-"Pending" Table, where it will hold all the students who create an account and need for manual approval. Now change the status of "pending" in the student management section-students table, into "No account yet". Create a modal for viewing the students information and have a button, accept and reject for the creation of account.] Define accepted identity documents, manual-verification authority, rejection reasons, and whether Student ID or another valid ID satisfies the same requirement.
- [ Please elaborate before we proceed] Define what an uploaded official roster proves. A roster match may establish the award, but required identity documents must still be completed unless the office formally changes that rule. Define duplicate, missing, and conflicting matches.
- [ When creating a grantor account in the admin side, redesign the modal, we will have a new details about a grantors. 1. Their Location Scope, admin can turn on or off this, example of Location Scope is Grantor Pancho is only for District 2 of Bulacan, all the student located in district 2 of bulacan can only apply, the rest cannot. Next grantor type wether "Governement", "Private", "Others". ] Define grantor location scope (province/city/barangay or another boundary), how addresses are verified, and whether exceptions are possible.
- [ So here is the my logic for that, when a grantor creates a scholarship, example: grantor01 creaates a scholarship-announcement with a 50 slots, when student001 see the announcement, the slots is empty, now student001 can still apply or "WAIT" but waiting still have slots ( let the root admin define the waiting slots), now when in the 50 students 5 students is rejected or withdrawn their application on grantor01, the slots will comeback right, now the first 5 on the waitlist will be notified ( on the inbox as well as in the dashboard ) that grantor01 scholarship slots is reversed back or comeback, and student001 is on the first 5 waitlist, Now they can accept it ( they are priority), or reject it. When accepted, they will have that application, when rejected the person next to that waitlist will be notified, until the scholarship is either closed, full, or completed. Until then there must be a waitlist, First Come First Serve basis, but students may have a chance. Now it will also apply when grantor01 added a slots, the first in the waitlist will be notified first and they wil fillup the additional slots. ] Decide waitlist ordering, expiry, slot reservation, added-slot notification, and whether students must accept an offer. A notification must not promise a slot before it is reserved.
- [ Lets increase our security by having a MFA such as OTP, other than password we will have an OTP. Rules: only student who has an account can sent an OTP since they are either manually reviewed or automatically reviewed. Every 30 days of Inactivity will sent an OTP. OTP must be 6 digits code sent via email they provide, so create a design for that 6 digit OTP for the email and for the frontend design. Add more/suggest more usage for additional security using 6 digit otp-email. Lost-Email recovery will be handled by the Help and Support for the root admin. Now admin can change someones email at will, it will redirect in the supabase database, and authetication when changed.] Decide whether email is intended as a second factor after a password or as an email sign-in/recovery method. [Supabase's documented native MFA factors](https://supabase.com/docs/guides/auth/auth-mfa) are authenticator app and phone, so an email second factor needs a separately designed and reviewed flow. Decide which roles require it and how lost-email recovery works.
- [One Chrome Browser, One Session, like in some big companies. Users must use a incognito if they want to create a new session, nonetheless, when user login into the account, when they create a new tab, and search the url, it will just redirect them to their dashboards, unless they Logout. ] Clarify "one Chrome, one session": one active account session across browsers/devices, one active tab, or prevention of duplicate submissions. Browser-specific blocking is not a reliable security boundary.
- [Create a new step in the tracking, that student must upload the signed SOE inside the system for admin backup/collection, so Step 10: Upload Signed SOE, Step 11: Finish and wait for the next sem/cycle. ] Decide whether the hard-copy SOE must be tracked as a physical handoff, scanned and reuploaded, or both; define custody, access, and retention.

**Gate:** No policy-dependent behavior is released until the responsible office signs off on these rules.

### Implementation and Verification Register

This register records engineering evidence without changing any bracketed policy answer above. A feature is not production-complete merely because its local code or build passes.

#### Number 1 - Security containment, account approval, and authentication

**Updated:** September 24, 2026

- **Implemented locally:** Restrictive table and Storage access migrations, pending-account records and full-admin approval endpoints, pending-session rejection, unified backend authentication, login-attempt lockout, recovery, and grantor Auth migration tooling exist in this checkout.
- **Implemented locally (September 28):** Legacy screen reads now pass through authenticated `/portal/data/*` compatibility endpoints with role and ownership filtering; student roster summaries omit other scholars' identities. Signup no longer probes accounts or roster rows in the browser, student pages no longer run client-side roster assignment, and the grantor forced-password flow preserves its authenticated portal identity until completion. The retired scholarship-choice endpoint remains feature-gated rather than being selected by the browser UI.
- **Implemented locally (September 28):** Signed-SOE listing, download, and reopening now consistently require Requirements permission (or full-admin role). The application-tracking dialog includes the scoped submission list, authorized preview, and reason-required reopen action. History now records future application stage/status, document, roster, waitlist, and scholarship-commitment changes in the private student ledger.
- **Verified (September 28):** `python -m unittest discover -s backend/tests -v` passes **136 tests**; `npm run test:frontend`, `npm run lint`, production build, backend compilation, and offline parsing of all 28 migrations pass. Build output retains only existing large-chunk warnings.
- **Verified:** Anonymous REST access to `students` returned HTTP 401 after the production containment action. Direct `anon` and `authenticated` table privileges were reported revoked, the `bulsuscholar` bucket was made private, and a 48-object Storage backup with a SHA-256 manifest was created. The grantor Auth migration was reported successful for the one validated grantor.
- **Requires deployment:** Production migration history must be checked for `20260922170000_revoke_unsafe_direct_access.sql` and `20260922180000_require_manual_student_account_approval.sql`. Deploy database compatibility first, then the matching backend and frontend. Do not restore broad browser grants or rerun the old permissive `security-hardening.sql`.
- **Not verified:** A recoverable database backup and nonproduction restore; production manual signup approval; Welcome/Rejected email delivery and retry; rejection cleanup; all role and ownership boundaries; active-session invalidation after lockout.
- **Blocked:** Reopening a paused production rollout is blocked until the database restore point, staging migration test, matched deployment, anonymous denial checks, and student/grantor/reviewer/full-admin/root smoke tests pass.
- **What to check:** Confirm signup remains pending after email verification, a pending student cannot log in, only a full admin can approve or reject, approval activates the account, rejection supports a clean restart, failed-login counts lock at the configured limit, recovery unlocks students/grantors only after password change, and root can unblock an administrator.

#### Number 4 - Student profile and document verification

**Updated:** September 23, 2026

- **Implemented locally:** `20260923120000_student_profile_document_verification.sql`; editable profile drafts; immutable signed revisions; PDF preview/export; permanent and optional current addresses; private signature/document storage; versioned COR, ROG, identity, and profile submissions; independent review decisions; rejection reasons; corrected resubmission; COR policy modes and individual exceptions; application snapshots; tracking pause/restore integration; and the admin Document Review workspace.
- **Implemented locally:** First-year, first-semester ROG is server-derived as `first_year_first_semester` and shown as not required without creating a fake upload or approval. First-year, second-semester and upper-year records require ROG. Authoritative-roster completion uses applicable approved current-cycle documents rather than file existence.
- **Verified:** Local backend tests cover profile validation, PDF generation, the ROG exemption boundary, immutable review decisions, and policy validation. The cumulative local suite currently passes 119 tests. Frontend lint and the production build pass; the build reports only existing large-chunk warnings.
- **Requires deployment:** Apply the migration to a staging copy after all prerequisites, deploy the matching backend and frontend, and configure/verify private Storage access. Run SQL transaction, RLS, Storage, scanner, PDF, and role tests before production.
- **Not verified:** The migration has not been executed against a local database because Docker or Podman is unavailable. Staging/production database behavior, signed upload URLs, reviewer permissions, email/notification delivery, authenticated browser flows, and cycle-change restoration remain unverified in this register.
- **What to check:** Save and reopen a draft; submit a freshly signed revision; inspect the generated PDF and immutable history; approve/reject/resubmit every document type; test all COR policy modes and exceptions; verify first-year first-semester ROG exemption and second-semester requirement; confirm rejection pauses tracking and corrected approval restores it; confirm grantors cannot make authoritative decisions.

#### Number 5 - Scholarship and roster workflow

**Updated:** September 24, 2026

- **Implemented locally:** `20260923124643_scholarship_roster_workflow.sql` adds private import batches, validated rows, conflict records, immutable audit events, atomic commit, authoritative conversion, conflict resolution, and material-request RPCs. Browser roles have no direct access; workflow functions are granted only to `service_role`.
- **Implemented locally:** Grantor and admin roster entry now use stored server preview followed by explicit commit. Exact grantor-owned scholarship recognition is required. Results distinguish future account, new assignment, existing-application conversion, already imported, unknown or ambiguous scholarship, identity mismatch, active-roster conflict, commitment conflict, duplicate row, and invalid data. Changed files, mappings, rows, or form fields invalidate a previous preview.
- **Implemented locally:** Matching nonterminal applications are converted in place, preserving their application ID, tracking, documents, and history while releasing any public slot. Competing open applications are archived without a withdrawal cooldown. Roster awards do not reserve public slots or fabricate uploads, materials, downloads, signatures, or SOE files.
- **Implemented locally:** Full admins can review open roster conflicts in the Add/Import Scholars workspace and either select the identity-verified imported candidate or retain an existing roster. Alternatives are archived without cooldown and the decision is audited. Roster-only students remain available for assignment after account approval.
- **Implemented locally:** Student Request Materials now sends only the authenticated application ID to an atomic backend workflow. It checks ownership, account state, grade, approved current-cycle documents, document versions, application-specific requirements, slot reservation, roster conflicts, and existing commitment, returning specific failure codes. Authoritative-roster scholars do not use Request Materials.
- **Verified:** Backend compilation and offline PostgreSQL syntax parsing pass. The full backend suite passes **119 tests**, including exact recognition, unknown/ambiguous-program blocking, in-place conversion classification, identity conflict persistence, idempotent preview, authenticated commit parameters, session-derived material requests, and full-admin conflict resolution. All five new routes appear in generated OpenAPI. Frontend lint and the production build pass with existing large-chunk warnings. Agent-browser loaded the public shell at 1440x900 and 390x844 with no page errors.
- **Requires deployment:** Test and apply `20260923124643_scholarship_roster_workflow.sql` on staging after `20260923120000_student_profile_document_verification.sql`; deploy the matching backend endpoints and frontend; then run authenticated role and transaction tests before production.
- **Not verified:** Database-executed SQL lint/transaction tests are unavailable locally because Docker or Podman is not installed. Concurrent commits, advisory-lock behavior, production slot reconciliation, private-table/RPC denial, email/inbox delivery, and authenticated mobile/desktop roster screens remain unverified.
- **Blocked:** Sections 4 and 5 remain unchecked until staging database, backend, frontend, authorization, and production smoke-test gates pass.
- **Test data required:** One active grantor with two recognized scholarships; students with no account, matching account, name mismatch, an ordinary matching application, another active roster, another commitment, incomplete documents, approved first-year first-semester documents, and an archived individual scholar.
- **What to check:** Preview malformed, duplicate, repeated, unknown, and ambiguous rows; commit the same batch twice; confirm future-account behavior; preserve a converted application's ID/history/documents; release its public slot; resolve each conflict choice; reproduce the former Request Materials failure and every precise rejection; retry after corrected approval; double-click and concurrent-submit; archive an individual scholar and verify the 24-hour cooldown; archive a grantor account and verify administrator servicing remains locked.

#### Number 6 - Scope, filtering, ranking, and reports

**Updated:** September 24, 2026

- **Implemented locally:** `20260924024322_scope_reporting_announcements_waitlist.sql` adds private versioned grantor location scopes, immutable report audits, and student-number correction events. New applications capture the enforced scope and self-declared permanent-address snapshot, so later policy changes do not rewrite existing decisions.
- **Implemented locally:** Full admins can assign Government, Private, or Others classification and configure a named municipality list from Grantor Management. Grantors can filter applicants by status, location, scholarship, cycle, document review, and tracking stage, then export server-generated CSV or PDF reports. Backend ownership checks reject cross-grantor report requests.
- **Implemented locally:** Full admins can correct a student number from Student Management with confirmation and an audit reason. The workflow preserves the Auth UUID, updates live references transactionally, records old/new identifiers, updates Auth metadata, revokes sessions, and retains a retryable state if Auth synchronization fails.
- **Blocked:** The scholarship office has not supplied the approved official point formula. Existing scores are now labelled **Recommendation Score - Not Official Ranking** and remain informational. Number 6 cannot be marked complete until a versioned official formula and reproducibility tests are approved.
- **Verified:** Python compilation, offline PostgreSQL parsing, frontend lint, production build, and the complete local backend suite pass. The suite now contains **127 passing tests**, including grantor ownership, applicant-filter, transactional announcement-publish, and waitlist rejection/position checks. The build reports only the existing large-chunk warnings.
- **Requires deployment:** Apply the new migration on staging after the Number 4 and 5 migrations, deploy backend and frontend together, then verify scope enforcement, Auth metadata updates, session revocation, report files, immutable audits, and cross-grantor denial with real role accounts.
- **Not verified:** Database-executed transaction/RLS tests, Auth administrator calls, authenticated report downloads, and correction rollback/retry have not been exercised against staging or production.
- **What to check:** Enable and disable a municipality scope; apply inside and outside the scope; change a policy and confirm existing applications retain their snapshot; export the same filtered grantor report as grantor/admin; tamper with another grantor ID; correct a test student number; verify old login rejection, new login success, preserved documents/history, and revoked sessions.

#### Number 7 - Announcements, inbox, and waitlist

**Updated:** September 24, 2026

- **Implemented locally:** Admin and grantor announcement composers now create a server-owned 15-minute audience preview before publishing. Admin targeting supports all active students, specific IDs, course, and year. Grantor targeting is restricted to owned applicants or active scholars and can filter application status, course, and year.
- **Implemented locally:** Publishing uses the immutable recipient snapshot and deterministic announcement/student notification IDs in one database transaction. Delivery events record the inbox/dashboard channel and prevent duplicate delivery during retries.
- **Implemented locally:** A root-controlled global waitlist capacity defaults to `0` (disabled) and counts queued plus offered entries across all scholarships. A global admission lock prevents simultaneous queues from exceeding that cap. Full eligible applications can join per-scholarship FIFO queues, see their current position, receive exclusive 24-hour reserved-slot offers, accept into an ordinary application, decline, expire, or rejoin at the queue end.
- **Implemented locally:** Slot releases and capacity increases promote the next eligible student transactionally. Commitment closes competing queues/offers and restores reserved slots. Authoritative-roster awards remain outside public slots and waitlists. Students see queue/offer state and can accept or decline from Scholarships.
- **Implemented locally:** `/internal/cron/waitlist/expire` requires `CRON_SECRET` and processes expiry idempotently. Configure Railway to call it every five minutes with the matching `X-Cron-Secret` header.
- **Verified:** Python compilation, route/OpenAPI checks, offline SQL parsing, frontend lint/build, and **127 backend tests** pass. Tests include recipient ownership intersection, atomic publish routing, ineligible offer closure, FIFO position privacy, and cron-secret rejection/success. Agent-browser loaded the public shell at 1440x900 and 390x844 without horizontal overflow or runtime page errors.
- **Requires deployment:** Set `CRON_SECRET` in Railway, apply the migration on staging, deploy the backend and frontend, then create the `waitlist-expiry` Railway service using `python -m backend.waitlist_expiry_job` on the `*/5 * * * *` schedule. Verify the root capacity setting before enabling a nonzero queue.
- **Not verified:** Concurrent database queue joins/promotions, real 24-hour expiry, notification retries, authenticated admin/grantor audience previews, student offer controls, dark-mode role screens, and Railway scheduling require staging/production role tests.
- **Blocked:** Keep Number 7 unchecked until database transaction/RLS tests, all authenticated role checks, cron execution, and production smoke tests pass.
- **What to check:** Preview and publish every permitted audience; attempt a cross-grantor recipient; retry publish and confirm no duplicates; test waitlist disabled, global cap shared across scholarships, FIFO ties, simultaneous joins, slot release/addition, accept/decline/expiry, rejoin at the end, commitment closure, unread counts, archived users, and reserved-slot restoration when no eligible student remains.

#### Number 8 - Security and session controls

**Updated:** September 24, 2026

- **Implemented locally:** Student and grantor password login now checks 30-day meaningful inactivity. An inactive account receives a six-digit **Email verification** challenge instead of Supabase tokens. Codes are HMAC-hashed, expire after 10 minutes, allow three attempts, enforce a 60-second resend delay and five sends per hour, and never store the password or plaintext code.
- **Implemented locally:** `portal_verified_sessions` binds every student, grantor, and admin portal session to the Supabase Auth UUID and JWT `session_id`. Protected backend authorization now checks the Auth user, live `auth.sessions` row, verified-session record, account lock, ownership, and `sessionValidAfter`. Activity writes are throttled to approximately hourly successful protected use. Existing student/grantor security rows receive a 30-day rollout grace period.
- **Implemented locally:** Student, grantor, and admin identity is shared through browser-profile local storage with `BroadcastChannel` and storage-event synchronization. Login and logout propagate to normal tabs; Incognito and separate browser/device profiles remain independent. Root session handling remains separate.
- **Implemented locally:** Help and Support provides signed-out **Lost email access** conversations with opaque capability links and up to five private PDF/PNG/JPEG/WebP attachments of 10 MB each. Root can review evidence, reject safely, or send a one-time confirmation code to a unique proposed email. Auth/profile mutation and session revocation occur only after mailbox confirmation, with immutable decision audit events.
- **Verified:** Python compilation, offline SQL parsing, OpenAPI route checks, frontend lint/build, and **136 backend tests** pass. Tests cover the inactivity challenge withholding tokens, unsupported SOE files, cross-student ownership, unknown-ID recovery privacy, unresolved-account approval denial, and compatibility-gateway ownership filtering. Agent-browser verified the public recovery workspace at desktop and 390 px mobile with no horizontal overflow or runtime page errors.
- **Requires deployment:** Apply `20260924125213_security_history_signed_soe.sql` after the Number 7 migration. Configure separate backend-only `PORTAL_EMAIL_CODE_SECRET` and `PUBLIC_RECOVERY_CODE_SECRET` values of at least 32 random characters, confirm Brevo sender settings, then deploy backend before frontend.
- **Not verified:** Live Brevo delivery, `auth.sessions` validation, refresh-token behavior, direct Supabase bypass denial, two-device independence, normal-tab propagation, account-lock interruption, private recovery evidence, Auth email mutation, and partial-failure retry require staging and production role accounts.
- **Blocked:** Number 8 remains unchecked until staging transaction/RLS/Storage tests and real student, grantor, admin, and root session acceptance tests pass.
- **What to check:** Sign in at 29 and 30 days; try three wrong codes; resend before/after 60 seconds; exceed five sends; replay an old code; refresh a verified token; delete its Auth session; lock/reset each account type; test two tabs, Incognito, and a second device; open/tamper with recovery capability links; upload valid/invalid evidence; reject and approve; test duplicate email and code expiry; verify old sessions stop working.

#### Number 9 - History, signed SOE, and interface polish

**Updated:** September 24, 2026

- **Implemented locally:** A private append-only `student_history_events` ledger backfills deterministic application and document events. The new `/student-dashboard/history` page provides pagination, cycle/activity filters, student-safe descriptions, and related-page links without reviewer notes or security metadata. History is available from the student menu and dashboard Quick Actions.
- **Implemented locally:** Ordinary committed applications now include **Upload Signed SOE** after office signing and before **Finish**. The authenticated student may upload one current PDF, PNG, or JPEG up to 10 MB. The transactional submission records an immutable version, marks the stage **Submitted**, completes Finish immediately, records history/audit, and explicitly avoids claiming staff verification or physical custody.
- **Implemented locally:** Authoritative-roster scholarships remain exempt. Admins with Requirements permission have backend operations to preview/download and reopen a submission with a mandatory reason; reopening preserves the original file, returns tracking to Upload Signed SOE, notifies the student, and requires a new version.
- **Implemented locally:** Newly unavailable signed-SOE controls use disabled states plus text explaining the prerequisite. New history, recovery, and upload controls retain labels, focusability, file restrictions, and mobile layouts.
- **Verified:** The production build contains dedicated History and security workflow chunks; lint, build, OpenAPI, **136 backend tests**, SQL parsing, and signed-out desktop/mobile browser checks pass. The build reports only the existing large-chunk warnings.
- **Requires deployment:** Create/verify the private Storage paths under the configured `SUPABASE_STORAGE_BUCKET`, deploy the migration/backend/frontend in order, and test with an ordinary signed application plus an authoritative-roster application.
- **Not verified:** Database-executed backfill counts, authenticated History filtering, real private uploads/downloads, admin preview/reopen UI against live records, academic-cycle restart snapshots, and historical preservation need staging data and role tests.
- **Blocked:** Number 9 remains unchecked until the database, Storage, authenticated role, dark-mode, and cycle-renewal release gates pass.
- **What to check:** Compare history against applications/documents/tracking; verify pagination and safe copy; try wrong file type/size/owner/stage/cycle; upload a signed SOE and confirm immediate Finish plus renewal message; reopen with a reason; upload a replacement; verify the first version remains; verify roster scholars never see this requirement.

#### Number 10 - Release and acceptance

**Updated:** September 28, 2026

- **Implemented locally:** The Number 8–10 migration, backend routes, client services, student/root workflows, focused tests, environment template, and this cumulative register are prepared as one compatibility release.
- **Verified:** The September 28 local UI audit covered public/authentication, Student and Grantor desktop/mobile, and Admin desktop routes and conditional states. It corrected responsive, dark-mode, runtime, dialog-focus, icon-label, and Quick Actions defects. Evidence and remaining staging gates are recorded in [UIReleaseAudit.md](UIReleaseAudit.md).
- **Verified:** Local compilation, offline PostgreSQL parsing, all **136 backend tests**, frontend security checks, frontend lint, production build, OpenAPI registration, and local desktop/mobile agent-browser checks pass. The generated frontend has no lint errors; only existing Vite chunk-size warnings remain.
- **Requires deployment:** Follow the new Number 8–10 section in `docs/deployment/DeploymentChecklist.md`. Record the production backup/Storage copy, release owner, migration row counts, deployment IDs, rollback point, and every role smoke-test result.
- **Not verified:** Supabase transaction execution/advisors, staging migration, live Auth/Brevo/Storage behavior, all authenticated pages, concurrency/network retry, production smoke tests, and rollback rehearsal cannot be completed from this local checkout.
- **Blocked:** Number 10 cannot be marked complete locally. Keep Maintenance Mode enabled until student, grantor, admin, and root acceptance plus email, Storage, roster, waitlist, report, notification, History, signed-SOE, and session checks all pass.

## 2. Establish a Safe Baseline

1. [ Tell me what to do] Make a recoverable production database backup and separately protect the Storage files. [Supabase database backups](https://supabase.com/docs/guides/platform/backups) do not contain uploaded file contents. Verify the restore procedure on a nonproduction project.
2. [ ] Inventory the currently deployed frontend, backend commit, applied Supabase migrations, Auth configuration, email settings, and existing data counts. Do not assume the local checkout equals production.
3. [ ] Reproduce the reported **Request Materials** problem using a test student and record the exact state, response code, error text, and expected result. Repeat for the existing-scholarship modal.
4. [ ] Create test accounts/fixtures for student, grantor, admin, and root, including a roster match, no match, duplicate match, incomplete documents, and an archived scholar.
5. [ ] Keep Maintenance Mode available for schema/auth rollouts and prepare a rollback path before changing production data.

**Gate:** Backups, reproduction steps, and a production-state snapshot exist before workflow edits.

## 3. Stabilize Existing Roster and Login Work

1. [ ] Follow the [deployment checklist](deployment/DeploymentChecklist.md) to verify the three tracking/roster migrations, backend `/auth/login` endpoint, and matching frontend release in the correct order. Do not execute an already-applied migration or rerun the completed grantor Auth conversion without a specific repair plan.
2. [ ] Verify automatic assignment after confirmation for exactly one active roster match; verify no assignment and an admin-visible conflict for multiple matches.
3. [ ] Verify the assigned scholar cannot withdraw or apply elsewhere while their individual roster record is active, and can follow the documented archive/cooldown path when it is archived.
4. [ ] Verify the existing login-attempt limit (default three), student/grantor email recovery, and root-controlled admin unlock using real role accounts. Test concurrent failures and blocked sessions.
5. [ ] Fix any deployment/API mismatch before proceeding. A local feature is not complete while the production backend still returns `405 Method Not Allowed` or the endpoint is absent from OpenAPI.

**Gate:** All four roles can complete their expected sign-in path, and roster state matches the approved rules in production.

## 4. Student Profile and Document Verification

1. [ ] Replace the PDF-only Student Application Profile workflow with an editable in-system form. Save draft and submitted versions, validate required fields, and keep an audit trail. Preserve any official export/print format the office needs.
2. [ just specify using text, that the home address will be permanent address ] Add or verify permanent address fields separately from current address; use the approved location data for scope checks.
3. [ ] Present COR, ROG, and Student ID/approved alternative ID requirements clearly. Use the approved copy for "Please upload the generated COR" and explain the COR/ROG distinction without misleading students.
4. [ ] Enforce COR-first intake. Allow the admin-approved Advising Slip alternative only under the signed-off rule, with reason, reviewer, and timestamp. Do not let a client-side toggle bypass verification.
5. [ ] Add manual document review with pending, approved, and rejected states; show rejection reasons and allow corrected resubmission. Keep uploads and review decisions separate.
6. [ ] Notify the student of the specific next incomplete tracking step, including a direct link to the relevant page. Deduplicate notifications when data refreshes.

**Gate:** A student can complete and revise the profile, submit each required document, receive an understandable review result, and see the next action without staff intervention.

## 5. Scholarship and Roster Workflow

1. [ ] Fix **Request Materials** from the reproduced case. Trace eligibility, document compliance, roster commitment, and RPC response; update tests for success, rejection, retry, and concurrent requests. Never remove an eligibility rule just to hide an error.
2. [ ] Remove or correct the existing-scholarship modal only after mapping every roster/archived-scholar state it serves. The UI must reflect the server's authoritative scholarship and withdrawal rules.
3. [ ] Add a preview-and-validate step for grantor/admin roster uploads: file errors, duplicates, unmatched students, conflicting grantors, and the number of existing applicants who will become scholars.
4. [ ] Atomically link a unique roster match to the student's scholarship and move matching applicants to scholar status. Make repeated uploads idempotent and audit the source row and actor. Do not fabricate document uploads, material downloads, or signatures.
5. [ ] Apply the approved automatic-approval rule only to roster-authoritative awards. Keep identity-document verification and its tracking states visible until complete; show explicit exception handling for ambiguous matches.
6. [ ] Verify archival, replacement, cooldown, and historical applications after the transfer. Existing manual applicants must not disappear from history.

**Gate:** Uploading the same roster twice does not duplicate awards, a unique valid match follows the approved path, and conflicts require staff resolution.

## 6. Scope, Filtering, Ranking, and Reports

1. [ ] Store each grantor's approved location scope and enforce it in backend authorization/eligibility, not only in dropdowns. Test address changes and out-of-scope requests.
2. [ ] Add applicant filters and groups for grantor, status, location, scholarship, academic cycle, and document/review state. Define who may see each group; grantors must only access their own permitted records.
3. [ ] Implement the approved point formula as a versioned backend calculation with input validation and reproducible results. Show the score breakdown to authorized reviewers and preserve the version used for each decision.
4. [ ] Provide a grantor-scoped report/export with filters, counts, and an audit record. Verify that a grantor cannot obtain another grantor's data by changing query parameters.
5. [ ] Permit student-number corrections only through an authorized, audited workflow. Preserve the Auth UUID and historical references; check uniqueness and downstream report links before committing a correction.

**Gate:** Scope and ranking decisions can be reproduced and audited; cross-grantor access tests fail as expected.

## 7. Announcements, Inbox, and Waitlist

1. [ ] Add announcement targeting by specific recipient or approved group, with a publish preview and authorization checks. Prevent recipient-list leakage and duplicate delivery.
2. [ ] Send actionable inbox notices when a tracking step becomes available, is rejected, or needs correction. Include the step name, reason where appropriate, and destination link.
3. [ ] Implement the approved waitlist as a server-owned queue with deterministic ordering and atomic slot reservation. When slots are added, notify eligible queued students according to policy; show offer expiry and next steps.
4. [ ] Test unread counts, delivery failures, retries, and archived/withdrawn users. Notifications should reflect the final committed state, not an attempted transaction that later failed.

**Gate:** Students receive correct, nonduplicated instructions and no out-of-scope announcements or premature slot promises.

## 8. Security and Session Controls

1. [ ] Verify the existing failed-login lockout and recovery behavior from Step 3 before adding new security controls. Unknown User IDs must not reveal whether an account exists.
2. [ ] Design the approved second-factor flow, including enrollment, challenge expiration, replay protection, rate limits, recovery, and role-based enforcement. Do not label ordinary email OTP sign-in as MFA without a separate factor after password verification.
3. [ ] Implement the approved single-session policy server-side and test token refresh/logout behavior. Check [Supabase's session settings and plan limits](https://supabase.com/docs/guides/auth/sessions) before choosing the mechanism. Synchronize tabs so duplicate tabs cannot submit conflicting changes; use idempotency/concurrency checks for important operations.
4. [ ] Test two devices, two tabs, expired sessions, account lock, password reset, and interrupted MFA. Sensitive backend routes must reject stale or revoked sessions, not just hide the page in React.

**Gate:** Session and MFA behavior passes role-specific security tests without locking legitimate users out of recovery.

## 9. History, SOE, and Interface Polish

1. [ ] Show students a chronological history of applications, document decisions, scholarship changes, cooldowns, and prior academic cycles without exposing staff-only notes.
2. [ ] Implement the approved hard-copy SOE or reupload workflow, including who received the copy, when, and where the electronic version is stored. Do not claim a file exists when only a physical copy was logged.
3. [ ] Make unavailable actions visibly gray/disabled, but include a short reason and the next action. Preserve keyboard focus and readable contrast; do not rely on color alone.
4. [ ] Review the requested field labels and help text with a nontechnical student before release.

**Gate:** Students can understand the current status and previous decisions without contacting staff for basic clarification.

## 10. Release and Acceptance

1. [ ] For each phase, add focused backend tests, Supabase transaction/security tests, frontend interaction tests, and role-based browser checks. Include duplicate uploads, network retries, concurrency, and authorization failures.
2. [ ] Run backend tests/compilation, SQL transaction tests, frontend lint and production build. Capture the results in the release record.
3. [ ] Recheck backup/restore access and apply migrations on a staging copy first. Review data migration counts and a rollback plan before production deployment.
4. [ ] Deploy database compatibility, then backend, then frontend. Check Railway health/OpenAPI and Vercel output before reopening normal access.
5. [ ] Smoke-test student, grantor, admin, and root workflows on production test accounts. Verify email, Storage uploads, reports, roster import, document review, materials, notifications, and session behavior.
6. [ ] Turn off Maintenance Mode only after the acceptance checks pass. Record remaining issues and release owner; do not treat an unchecked item as complete.

The phases are ordered to keep production data and account access safe. Independent UI work may proceed in parallel, but a phase's release gate must pass before dependent behavior goes live.
