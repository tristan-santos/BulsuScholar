# Dr. Solis Revision: System Implementation

Scope: system changes and reproducible technical evidence only. No research-paper,
transcript, thesis PDF, or thesis DOCX was edited for this revision.

## Implemented Behavior

### External Providers

- Create a regular grantor under Admin > Grantor Management > New Grantor.
- Set **Grantor Type** to **External** for an outside provider, such as an LGU.
- Government / Private / Others remains a separate classification.
- The existing grantor role, authentication, ownership restrictions, scholarship
  announcements and official roster import remain in use. External does not grant
  additional permissions or create an unofficial import path.
- Existing accounts without a grantor type are displayed as Internal. Full Admins
  can change this under grantor details and save it with the scope settings.

### Official Roster Assignment

1. Preview validates the current academic cycle, Student ID, name, owner and
   recognized scholarship. Duplicate rows and competing assignments block the batch.
2. The commit transaction rechecks the records; preview is not authorization.
3. A matching active account is assigned immediately during import. A roster for
   someone without an active account waits until email-confirmed account activation.
4. Verified student login reconciles previously imported rosters. Email-OTP login
   reconciles only after the OTP and verified-session registration succeed.
5. Automatic assignment requires the roster's Student ID and normalized full name
   to match the account, a verified current cycle, and no competing current award.
   Fuzzy similarity alone never authorizes an award.
6. A matching pending application is converted in place. Competing current-cycle
   pending applications are archived and their reserved slots released once.
7. Files, tracking, signed documents, previous-cycle applications and audit rows
   are not deleted. Normalized application/state tables remain authoritative.
8. Repeated login, approval and import are idempotent. Assignment, import and
   application reservation share transaction locks and commit-time checks.

### Active, Inactive and Historical Records

| Existing record | Result |
| --- | --- |
| Current-cycle committed/awarded scholarship | Keep the award; block a second application or automatic competing assignment. |
| Current-cycle completed scholarship workflow | Keep it as an award for that cycle; completion is not cancellation. |
| Previous-cycle completed award with an explicit cycle | Preserve it as history; allow current-cycle eligibility checks. |
| Cancelled, terminated or inactive award | It does not count as an active award. Other eligibility checks still apply. |
| Pending application without an award/commitment | It is not an award. Another pending application may be submitted; roster confirmation closes competitors. |
| Similar name but different identity | Warning/review only; no automatic assignment. |
| Legacy roster without a cycle | Flag for Full Admin verification; do not guess its semester automatically. |

### Full Admin Resolution

Open Admin > Scholarship Programs > **Warning**. The same controls are available
in the roster import window.

- Verify identity and the provider's award record.
- Record a meaningful reason, between 10 and 2,000 characters.
- For an existing awarded/committed application, use **Keep Current Award**.
  This does not terminate or replace that award.
- Without a protected award, select the verified imported/existing roster.
  Untagged legacy alternatives are resolved only through this explicit staff action.
- Competing current-cycle/unverified roster alternatives are archived, not deleted;
  explicitly previous-cycle rosters remain unchanged.
- Only a Full Admin may resolve; the backend and database also enforce this.
- Resolution records the actor, reason, selected record, cycle and timestamp in
  the existing immutable roster audit stream.

An existing award must be ended through its authorized lifecycle workflow before
a different award can be selected. The conflict resolver does not bypass this.

## Matching Implementation Reference

The existing algorithm in `backend/grantor_algorithms.py` was not replaced.
It normalizes text, calculates Levenshtein similarity, compares direct and
token-sorted names, and combines available fields using these weights:

| Field | Weight |
| --- | ---: |
| Student ID | 0.32 |
| Full name | 0.30 |
| Email | 0.10 |
| Contact number | 0.08 |
| Course | 0.08 |
| Year level | 0.04 |
| City | 0.04 |
| Province | 0.04 |

Missing fields are excluded and the remaining weights are normalized. Birthdate,
school, street and barangay are not fields in this weighted duplicate function.
Similarity is calculated even when an ID is present; this is not a strict
"exact-ID lookup, then fuzzy fallback only if absent" implementation.

The duplicate flag is raised when:

- Student ID matches exactly after identifier normalization; or
- Email/contact matches exactly and name similarity is at least 0.72; or
- Name similarity is at least 0.82 and weighted score is at least 0.84.

Levenshtein measures insertions, deletions and substitutions. Similarity is
`1 - edit_distance / longest_string_length`. Its practical purpose here is
identifying possible spelling differences, while weights combine several record
fields. This is interpretable record matching, not proof of identity. Common names
can produce false positives, so duplicate warnings and award authorization are
deliberately separate decisions.

## Reproducible Evidence

Run backend tests:

```powershell
py -3.12 -m unittest discover -s backend/tests
```

Run SQL cases using an isolated installation of `@electric-sql/pglite`:

```powershell
node scripts/test-solis-roster-workflow.mjs <path-to-pglite/dist/index.js>
```

This writes `test-results/solis-system-cases.json`, containing test-case IDs,
core functions, expected results, actual results and Pass/Fail status. Cases
SOL-SYS-01 through SOL-SYS-27 cover private function grants, assignment,
idempotence, name mismatches, active/completed/history handling, pending closure,
slot release, legacy resolution, approval gating, import rollback, waitlist award
revalidation, immutable audit records and grantor-type persistence.

`backend/tests/test_solis_system_revision.py` adds preview, authentication/OTP,
grantor-type and matching-threshold regressions. Existing scanner/signup tests
remain part of the full suite.

Evaluate labeled record pairs:

```powershell
py -3.12 scripts/evaluate-solis-matching.py
py -3.12 scripts/evaluate-solis-matching.py --input <authorized-private-pairs.json>
```

The input contains `datasetKind` (`synthetic` or `authorized_private`) and a
`cases` array. Each case contains `candidate`, `existing` and a boolean
`expectedDuplicate`. Use the checked-in synthetic JSON as a format example.
The report writes ordinal case IDs, scores and a confusion matrix, not student
fields. Keep authorized private inputs outside version control.

The ten synthetic evaluation pairs include an intentional common-name false
positive. They are a demonstration, not a representative accuracy study. Do not
publish their percentage as measured real-student accuracy. PDF extraction
accuracy also requires a separate authorized, labeled COR/ROG sample set.

## Verification Limits

- SQL tests run real PL/pgSQL functions in isolated PostgreSQL/PGlite with
  synthetic records, relational-column synchronization and commitment guards.
- Scope persistence and outer waitlist capacity/queue entry functions are fixture
  dependencies in this focused SQL runner. Their existing suites are separate;
  this runner does not prove the complete live queue/provider integration.
- Browser fixtures intercept API requests and use synthetic accounts. They verify
  presentation, reason gating and request payloads, not production authentication.
- Real-user sample accuracy, multi-connection production concurrency, deployed
  Supabase advisors and live cross-provider imports were not measured here.
- No production database or deployment was changed by this implementation.

Verification on October 23, 2026: the full backend suite passed 348 tests; the
focused SQL runner passed 27 cases; seven frontend security checks passed; frontend
lint and the production build passed. The build still reports the existing large
bundle warnings. Agent-browser checks used synthetic API fixtures at desktop,
1280-pixel laptop and 390-pixel mobile widths in light/dark modes, including reason
gating, a single resolution request, External account creation payloads, loaded
grantor-type values, reviewer restrictions and horizontal-overflow checks.

## Deployment and Controlled Demonstration

1. Apply all earlier migrations and then
   `20261023070747_solis_cycle_aware_roster_reconciliation.sql` to staging.
2. Confirm the new/renamed functions are executable only by `service_role`; run
   Supabase security/performance advisors. Confirm audit rows remain immutable.
3. Deploy the backend, then the frontend. Student login now requires the new
   reconciliation RPC, so do not deploy the backend before the migration.
4. Create a controlled External grantor and its recognized scholarship. Preview
   and import one authorized test roster with no existing award.
5. Activate or log in as the matching test student. Verify one assignment,
   competing pending closure, released slots and a single notification.
6. Import a competing award and check the Warning tab. Verify that the existing
   award cannot be replaced and resolution needs a Full Admin and reason.
7. Repeat with explicit prior-cycle completed, cancelled/terminated, missing-cycle
   and mismatched-name records. Inspect history, files and audit entries afterward.
8. Repeat the same import/login and verify no duplicate records or slot changes.

Paper wording, chapter locations, revision-form entries and thesis PDFs/DOCXs
remain deferred until the user requests the paper phase.
