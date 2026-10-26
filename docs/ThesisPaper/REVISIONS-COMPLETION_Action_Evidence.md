# Revision Form: Actions Taken and Evidence

Prepared from the current manuscript DOCX/PDF, revision form, current local source and existing recorded test evidence. Original files and signatures were not altered. Only a separate filled form was produced.

Page references use the manuscript's printed page numbers. For the reviewed 172-page PDF, add 3 to obtain the PDF viewer page number (for example printed p. 39 is PDF page 42). Page references will change after manuscript editing.

Statuses describe verified work, not panel acceptance or a declaration of complete production readiness. Recorded test evidence was inspected, not re-executed in this task. No new system, database, manuscript or deployment change was made.

## Dr. Jennifer P. Solis

### S1 - Implement Objective No. 2 validation and matching

**Status:** Partially addressed

**Action taken:** Implemented record normalization, exact identity checks, weighted duplicate matching, and academic-cycle-aware scholarship conflict guards. Separated account activation from award assignment. Added manuscript explanations of these mechanisms. Four academic-document validation limitations remain disclosed; therefore, comprehensive validation is not claimed complete.

**Where in the manuscript:** Ch. III, Validation, Duplication Prevention and Monitoring Modules, pp. 74-97; Ch. IV, pp. 152-153.

**Search anchors:** `5. Validation Module`; `6. Duplication Prevention Algorithm`; `Observed Document Validation Limitations`

**Source/evidence:**
- `backend/grantor_algorithms.py:10-148`
- `backend/roster_workflow_service.py:210-398`
- `supabase/migrations/20261023070747_solis_cycle_aware_roster_reconciliation.sql:69-194`
- `docs/ThesisPaper/Figures/item 5/Evaluation_Results.json`

**Remaining work / evidence limit:** Resolve and re-test the four disclosed academic-document validation gaps before claiming complete validation. No system change or re-test was performed in this form-filling task.

### S2 - Provide validation, duplicate and multiple-scholarship test cases

**Status:** Addressed in recorded local evidence

**Action taken:** Prepared automated matching regressions and 27 recorded isolated database cases covering exact identity, conflicting current-cycle awards, historical awards, pending applications, external rosters, authorization and rollback. Preserved expected results, actual results and case identifiers. These are controlled synthetic/local tests, not evidence of production-wide accuracy.

**Where in the manuscript:** Ch. III, Testing and Table 1, pp. 37-48; Ch. IV, Duplicate Scholarship Validation, pp. 140-141.

**Search anchors:** `Testing`; `Summary of Core Automated Backend Test Cases`; `Figure 4.11. Duplicate Scholarship Validation`

**Source/evidence:**
- `test-results/solis-system-cases.json`
- `backend/tests/test_solis_system_revision.py`
- `scripts/test-solis-roster-workflow.mjs`

**Remaining work / evidence limit:** Attach or cross-reference the individual SOL-SYS case records in the final thesis evidence package. These recorded results were inspected, not re-executed in this task.

### S3 - Provide test-case tables and discussion

**Status:** Partially addressed

**Action taken:** Added the core test-case table, document-processing test table, synthetic extraction results and discussion of observed limitations. Distinguished test-pass counts from field accuracy. The 27 scholarship-conflict cases remain separate evidence; map them and the TC-16-TC-35 claims to execution records before marking every thesis case verified.

**Where in the manuscript:** Ch. III, Table 1 and discussion, pp. 41-48; Ch. IV, COR/ROG tests and results, pp. 146-153.

**Search anchors:** `Summary of Core Automated Backend Test Cases`; `COR and ROG Functional Test Case Results`; `Supplementary COR and ROG Extraction Accuracy Evaluation`

**Source/evidence:**
- `test-results/solis-system-cases.json`
- `docs/ThesisPaper/Figures/item 5/Existing_Test_Execution.txt`
- `docs/ThesisPaper/Figures/item 5/Evaluation_Results.json`

**Remaining work / evidence limit:** Add a traceable table for record matching/current-cycle conflict cases. Establish actual execution support for each stated passing TC-16-TC-35 case; do not infer manual/browser outcomes from unit tests.

### S4 - Explain how and why matching is used

**Status:** Addressed in manuscript and source

**Action taken:** Explained normalization, Levenshtein edit distance, available-field weighted scoring, the eight field weights, and the 72%, 82% and 84% decision thresholds. Added the rationale for interpretable matching with spelling/format variations. Distinguished potential identity matches from exact-identity official assignment and explained why similarity alone cannot prove an award.

**Where in the manuscript:** Ch. II, Record Linkage discussion, pp. 21-24; Ch. III, Duplication Prevention Algorithm, pp. 79-91.

**Search anchors:** `The weighted duplicate checker compares available student information`; `6. Duplication Prevention Algorithm`

**Source/evidence:**
- `backend/grantor_algorithms.py:10-123`
- `backend/grantor_algorithms.py:206-262`
- `supabase/migrations/20261023070747_solis_cycle_aware_roster_reconciliation.sql:89-138`

**Remaining work / evidence limit:** Retain the documented admin-grouping distinction: its score-only threshold can flag records without the pairwise name floor. Thresholds are configured rules, not measured accuracy.

### S5 - Show an existing scholar applying elsewhere

**Status:** Addressed in source and recorded local evidence

**Action taken:** Implemented and described rejection of a conflicting current-cycle application or assignment. Preserved completed awards in the same cycle, distinguished historical/inactive records and ordinary pending applications, and retained authorized conflict review. Recorded the existing-scholar-applies-elsewhere scenario as SOL-SYS-17, with related historical and inactive cases.

**Where in the manuscript:** Ch. III, Monitoring and Academic-Cycle/Commitment Validation, pp. 93-97; Ch. IV, pp. 140-141.

**Search anchors:** `Academic-Cycle and Scholarship Status Validation`; `Figure 4.11. Duplicate Scholarship Validation`

**Source/evidence:**
- `supabase/migrations/20261023070747_solis_cycle_aware_roster_reconciliation.sql:447-582`
- `test-results/solis-system-cases.json:SOL-SYS-05-07,17-21`

**Remaining work / evidence limit:** This verifies recorded isolated scenarios, not an independently repeated production workflow. Other eligibility and unresolved legacy-cycle checks still apply.

### S6 - Upload and compare outside-provider scholarship records

**Status:** Addressed in system and manuscript

**Action taken:** Added Internal/External grantor classification and an authorized official-roster import/preview/commit workflow. Imported records participate in exact identity, recognized-program, academic-cycle and existing-award checks. Documented import reconciliation and conflict review. Clarified that external scholarships are detectable only when their records have been entered; no automatic external-provider integration is claimed.

**Where in the manuscript:** Ch. I, Limitations, pp. 12-14; Ch. III, Roster Import and Assignment Flowchart, pp. 114-116.

**Search anchors:** `The system does not provide full real-time system-to-system integration`; `Figure 3.5: Scholarship Roster Import and Assignment Flowchart`

**Source/evidence:**
- `backend/roster_workflow_service.py:159-398`
- `supabase/migrations/20261023070747_solis_cycle_aware_roster_reconciliation.sql:44-67`
- `supabase/migrations/20261023070747_solis_cycle_aware_roster_reconciliation.sql:257-324`
- `test-results/solis-system-cases.json:SOL-SYS-02,15,27`

**Remaining work / evidence limit:** Keep the availability/completeness limitation. A provider classification is not an extra authorization role or a live connection to an LGU system.

## Dr. Romel S. Pabustan

### R1 - Simplify flowcharts, connectors and endings

**Status:** Partially addressed

**Action taken:** Added separate registration, profile, application, roster, grantor, administrator and completion flowcharts with connector labels and explicit ending paths. Simplified the presentation into workflow-specific diagrams. Final alignment remains needed: the registration diagram must show automatic activation, and the document diagram must reflect profile-only manual review and the current download policy.

**Where in the manuscript:** Ch. III, System Process, Figures 3.1-3.8, pp. 106-121.

**Search anchors:** `System Process`; `Figure 3.1: Student Account Registration and Authentication Flowchart`; `Figure 3.2: Student Profile and Document Verification Flowchart`

**Source/evidence:**
- `docs/SystemFlowchart.md`
- `backend/signup_service.py:823-896`
- `backend/student_profile_service.py:885-1025`
- `docs/MpinSecurity.md`

**Remaining work / evidence limit:** Finish source-to-figure alignment; connector presence alone does not establish that every diagram matches the current system.

### R2 - Explain sensitive-data and document security

**Status:** Partially addressed

**Action taken:** Expanded the security discussion to cover authentication, authorization, private document access, sensitive-data categories, session controls, audit records and protected downloads. Separated application/provider controls from malware, retention and backup/recovery limitations. Update the remaining proposed/universal MPIN wording to the implemented optional, role-specific policy; no security certification is claimed.

**Where in the manuscript:** Ch. III, Data Privacy and Ethical Considerations, pp. 52-58; Ch. I, Limitations, pp. 12-14.

**Search anchors:** `Data Privacy and Ethical Considerations`; `Under this proposed mechanism`

**Source/evidence:**
- `backend/access_control.py:68-214`
- `backend/download_protection.py:1-113`
- `backend/mpin_service.py:105-161`
- `docs/MpinSecurity.md`

**Remaining work / evidence limit:** Revise pp. 55-56 and pp. 12-14: MPIN is optional and role-specific. Do not treat historical provider/live-check statements as a fresh production security assessment.

### R3 - Protect downloadable scholarship documents

**Status:** Partially addressed: implementation present; wording pending

**Action taken:** Implemented student download copies protected by AES-256 PDF encryption or AES-256 ZIP packaging, using fresh 24-character file passwords while preserving originals. Added optional six-digit MPIN confirmation. Authorized staff document downloads follow the separate role policy without added file encryption. The manuscript introduces this protection but still describes it as proposed and universally MPIN-gated.

**Where in the manuscript:** Ch. III, Data Privacy and Ethical Considerations, pp. 55-57; Ch. I, pp. 12-14.

**Search anchors:** `a fresh, cryptographically secure, random 24-character password`; `AES-256`

**Source/evidence:**
- `backend/download_protection.py:18-113`
- `backend/mpin_service.py:105-161`
- `docs/MpinSecurity.md`
- `test-results/romel-backend.json`

**Remaining work / evidence limit:** Replace proposed/future and universal-user claims with actual student/staff behavior. Confirm deployment separately; local source and recorded tests do not establish current production activation.

### R4 - Explain actual algorithms, purposes and processes

**Status:** Partially addressed

**Action taken:** Added source-code figures, formulas and explanations for weighted recommendation scoring, duplicate-record matching, official conflict validation and COR/ROG parsing. Distinguished deterministic ranking from trained prediction and similarity flags from award authorization. Remaining developed-system passages still incorrectly call the recommender a Decision Tree and must be reconciled.

**Where in the manuscript:** Ch. III, recommendation and validation modules, pp. 59-91. Remaining inconsistent wording: pp. 18, 98, 105, 122 and 127.

**Search anchors:** `4. Rule-Based Eligibility Filtering and Weighted Recommendation Scoring Mechanism`; `Implementation of COR and ROG Document Extraction`; `6. Duplication Prevention Algorithm`

**Source/evidence:**
- `backend/scholarship_rules.py:137-216`
- `backend/grantor_algorithms.py:68-123`
- `backend/document_scanner.py:887-970`

**Remaining work / evidence limit:** Replace only claims about this system using a Decision Tree; retain legitimate descriptions/citations of other researchers' Decision Tree methods.

### R5 - Use measurable algorithm evaluation metrics

**Status:** Partially addressed; broader performance evidence pending

**Action taken:** Added the field-accuracy formula and measured synthetic COR/ROG results: 16/16 COR fields and 9/9 ROG fields across three text PDFs. Disclosed four validation limitations and blocked OCR tests. A separate ten-pair synthetic matching record reports 90% accuracy, 83.33% precision and 100% recall, including one false positive; it is not population accuracy.

**Where in the manuscript:** Ch. III, Testing, p. 39; Ch. IV, Supplementary Extraction Evaluation and Limitations, pp. 151-153.

**Search anchors:** `A supplementary local evaluation was conducted on October 25, 2026`; `Supplementary COR and ROG Extraction Accuracy Evaluation`; `Observed Document Validation Limitations`

**Source/evidence:**
- `docs/ThesisPaper/Figures/item 5/Evaluation_Results.json`
- `test-results/solis-matching-evaluation.json`

**Remaining work / evidence limit:** Add the matching confusion matrix/sample limits to the paper if using its metrics. Representative OCR/real-document accuracy and latency/load benchmarks remain unestablished; do not equate configured thresholds, acceptability ratings or pass counts with algorithm accuracy.

## Dr. Anthony U. Concepcion

### C1 - Organize Chapter IV by specific objectives

**Status:** Not yet completed

**Action taken:** Expanded Chapter IV with system interfaces, validation discussion and test/evaluation results, and aligned Chapter V findings with the objectives. However, Chapter IV still uses preliminary-study, system-description and evaluation sections rather than separate results for all five specific objectives. Reorganization remains pending and must not be marked completed.

**Where in the manuscript:** Ch. I, Specific Objectives, pp. 5-6; Ch. IV, pp. 125-158; Ch. V, pp. 159-161.

**Search anchors:** `Specific Objectives`; `The chapter is divided into three major sections`; `Summary of Findings`

**Source/evidence:**
- `Manuscript DOCX: Chapter IV opening and section headings; Chapter V Summary of Findings`

**Remaining work / evidence limit:** Use five explicit objective-result sections: centralized workflows; validation/duplication prevention; recommendation/lifecycle; TAM; ISO/IEC 25010. Include findings, supporting tables/figures, discussion and limitations within each.

### C2 - Explain future grantors, requirements, features and processes

**Status:** Partially addressed

**Action taken:** Implemented configurable grantor/scholarship records, documentary requirements and academic-cycle controls, and described the client-server architecture and future expansion. These provide an extensible starting point. A dedicated explanation of how new grantors, requirements and process changes are configured, coded, migrated and regression-tested is still missing from the manuscript.

**Where in the manuscript:** Ch. III, System Modules and Architecture, pp. 58-101; Ch. V, Recommendations, pp. 164-165.

**Search anchors:** `System Architecture`; `This architecture supports scalability`; `Recommendations`

**Source/evidence:**
- `backend/scope_announcement_waitlist_service.py`
- `backend/academic_cycle_service.py`
- `backend/scholarship_requirement_service.py`
- `src/pages/AdminDashboard.jsx`

**Remaining work / evidence limit:** Add an adaptability/maintenance subsection explaining configuration versus development changes, schema/version compatibility, migration and regression tests. Do not claim measured scaling capacity or zero-code support for arbitrary future workflows.

### C3 - Explain client operation and continuity after turnover

**Status:** Partially documented; turnover not demonstrated

**Action taken:** Prepared repository/deployment guidance, workflow documentation and a manual Storage-backup utility, and identified security/recovery work for future maintenance. A completed client handover, assigned institutional maintainer, training, ownership transfer and tested recovery procedure were not established in the reviewed manuscript or evidence. These actions remain required before claiming operational turnover.

**Where in the manuscript:** Ch. III, Implementation Plan/Post-Deployment Evaluation, pp. 121-124; Ch. V, Recommendations, pp. 164-165.

**Search anchors:** `Implementation Plan`; `Post-Deployment Evaluation`; `Recommendations`

**Source/evidence:**
- `docs/README.md`
- `docs/deployment/DeploymentChecklist.md`
- `scripts/backup-supabase-storage.mjs`
- `docs/MpinSecurity.md`

**Remaining work / evidence limit:** Document who maintains the system; controlled repository/domain/hosting/Supabase/Brevo ownership; secret transfer/rotation without publishing values; client training; routine updates/support; and an authorized backup/restore drill. The deployment checklist contains an old snapshot and must be refreshed before operational use.

## Before Signing

- Finish Chapter IV objective-by-objective organization; Chapter V's numbered findings do not substitute for this revision.
- Add a concrete client handover and ongoing-maintenance procedure, not only a generic future-work paragraph.
- Reconcile remaining developed-system Decision Tree claims with weighted recommendation scoring.
- Update MPIN/download text to optional, role-specific behavior and distinguish local implementation from verified deployment.
- Align registration/document flowchart branches with automatic activation and profile-only manual review.
- Trace thesis test IDs to execution records; do not label unrecorded manual scenarios verified.
- Keep synthetic accuracy and the known validation/OCR limitations visible. Do not claim general 100% accuracy.
- Have the researchers and panel review the wording; signature/acceptance cells remain blank.
