# Semi-Final Revision Roadmap

This is an implementation checklist for the requests in `C:\Users\santo\Downloads\Revisions.txt`. It is **not** an instruction to run SQL or change production today. The source file also contains a generated priority essay and suggested dates; those are not confirmed requirements or deadlines. Use the office-approved rules and the current [production deployment checklist](deployment/DeploymentChecklist.md) for each release.

**Status as of September 22, 2026:** Some roster-assignment, login-lockout, and recovery code exists in this checkout, but that does not prove it is deployed. The grantor Auth migration was reported complete; do not rerun it merely because it appears in older instructions. Verify the live database migration list, Railway API, Vercel build, and role-specific login before marking those items complete. The remaining items below are planned work unless verified separately.

## 1. Confirm Rules Before Coding

Record each answer in an issue or decision log, with an owner and date. Do not infer policy from UI wording.

- [ ] Ask Sir Celso how a returning student with a schedule conflict should be handled, including who may override the result.
- [ ] Define the official scholarship point formula: inputs, weights, eligibility gates, rounding, ties, effective semester, and who approves changes. Existing recommendation scoring is not automatically the official selection formula.
- [ ] Decide whether COR is always required first, when an Advising Slip may replace it, and which admin role may grant that exception. Clarify whether "generated COR" means a university-issued file or a portal-generated document.
- [ ] Define accepted identity documents, manual-verification authority, rejection reasons, and whether Student ID or another valid ID satisfies the same requirement.
- [ ] Define what an uploaded official roster proves. A roster match may establish the award, but required identity documents must still be completed unless the office formally changes that rule. Define duplicate, missing, and conflicting matches.
- [ ] Define grantor location scope (province/city/barangay or another boundary), how addresses are verified, and whether exceptions are possible.
- [ ] Decide waitlist ordering, expiry, slot reservation, added-slot notification, and whether students must accept an offer. A notification must not promise a slot before it is reserved.
- [ ] Decide whether email is intended as a second factor after a password or as an email sign-in/recovery method. [Supabase's documented native MFA factors](https://supabase.com/docs/guides/auth/auth-mfa) are authenticator app and phone, so an email second factor needs a separately designed and reviewed flow. Decide which roles require it and how lost-email recovery works.
- [ ] Clarify "one Chrome, one session": one active account session across browsers/devices, one active tab, or prevention of duplicate submissions. Browser-specific blocking is not a reliable security boundary.
- [ ] Decide whether the hard-copy SOE must be tracked as a physical handoff, scanned and reuploaded, or both; define custody, access, and retention.

**Gate:** No policy-dependent behavior is released until the responsible office signs off on these rules.

## 2. Establish a Safe Baseline

1. [ ] Make a recoverable production database backup and separately protect the Storage files. [Supabase database backups](https://supabase.com/docs/guides/platform/backups) do not contain uploaded file contents. Verify the restore procedure on a nonproduction project.
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
2. [ ] Add or verify permanent address fields separately from current address; use the approved location data for scope checks.
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
