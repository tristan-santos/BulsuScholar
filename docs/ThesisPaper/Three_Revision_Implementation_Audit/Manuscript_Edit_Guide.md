## Chapter IV opening
WHAT TO FIND? The chapter is divided into three major sections.
WHAT TO DO? Replace only this organizational paragraph (direct-body paragraph625; printed125-126). Preserve the preliminary-study discussion as context.
WHAT TO PUT?
This chapter presents the preliminary findings and the system results according to the specific objectives. The three system-development objectives are presented using actual interface screenshots, verified process flowcharts and source-code excerpts. The Technology Acceptance Model and ISO/IEC 25010 evaluation results are discussed separately under their corresponding evaluation objectives.

## Objective 1 organization
WHAT TO FIND? II. Designing and Developing a Centralized Scholarship Management and Tracking System
WHAT TO DO? Use this exact heading as the start of the objective-based development portion (paragraph632). Preserve its valid introductory module text. Add the Objective1 subsection; move Figures4.1-4.4,4.6,4.8-4.10 and relevant approval Figure4.12 beside its discussion.
WHAT TO PUT?
Specific Objective 1: Centralized Scholarship Posting, Application and Evaluation. Figure4.X-O1a. Centralized scholarship posting and application interfaces. Figure4.X-O1a presents the grantor announcement controls and the student submission interface. The system stores scholarship information and processes owner-scoped applications or waitlist outcomes. Figure4.X-O1b. Scholarship posting, application and evaluation process. Use O1 and its W7 subprocess. The process validates authorization and posting data before persistence, then evaluates application eligibility and permitted stage decisions. Figure4.X-O1c. Application reservation implementation.
code snippet
Use excerpt E1. The source passes authorized student and scholarship identifiers to the reservation transaction; the result distinguishes a submitted application from a waitlist or blocked attempt.

## Objective 2 organization
WHAT TO FIND? Figure 4.11. Duplicate Scholarship Validation
WHAT TO DO? Move the figure and its valid explanation (paragraph677; printed140-141) under a new Objective2 subsection. Add actual registration/profile/conflict screenshots from the capture matrix. Preserve test tables after implementation evidence; distinguish parser gaps.
WHAT TO PUT?
Specific Objective 2: Student-Record Validation and Scholarship Duplication Prevention. Figure4.X-O2a. Student document validation and recorded conflict review. Figure4.X-O2a shows document-specific validation outcomes and authorized review of recorded scholarship conflicts. Extracting a field does not by itself verify that field. Figure4.X-O2b. Separate validation and conflict-prevention processes. Use W1-W6 as separately captioned diagrams, with dashed references to the mechanisms listed in Section3. Suspected duplicate grouping, exact roster identity checks and transactional award prevention perform distinct functions. Figure4.X-O2c. Record matching and official award guards.
code snippet
Use excerpts E2-E4. The code demonstrates signup COR checks, weighted suspected-record matching and exact cycle-aware award guards. Existing imported records are compared; external awards not recorded in the system remain outside detection coverage.

## Objective 3 organization
WHAT TO FIND? Figure 4.5. Scholarship Recommendation
WHAT TO DO? Move recommendation Figure4.5 (paragraph659), tracking Figure4.7 and monitoring/renewal/notification Figures4.13-4.15 into Objective3; retain relevant report Figure4.16 where the monitoring discussion refers to it.
WHAT TO PUT?
Specific Objective 3: Scholarship Recommendations and Lifecycle Monitoring. Figure4.X-O3a. Recommendation and application-tracking interfaces. Figure4.X-O3a presents ranked scholarship options and the current application stage. A recommendation is guidance and does not constitute eligibility approval or an award. Figure4.X-O3b. Recommendation and lifecycle process. Use R1 and O3 as separate diagrams; R1 describes deterministic recommendation filtering and scoring, while O3 references application, materials, signed-SOE and cycle processes. Figure4.X-O3c. Recommendation scoring and lifecycle completion implementation.
code snippet
Use E6-E9. Candidates passing explicit open-state and GWA checks receive grade-fit, roster-popularity, location and candidate-image scores. The page may prioritize invitations and administrator notices above numerical ranking. After authorized signed-SOE submission, the finalizer marks completion; administrators may subsequently reopen the submission.

## Recommendation terminology
WHAT TO FIND? The system uses a rule-based Decision Tree algorithm based on predefined eligibility filtering and deterministic weighted recommendation scoring.
WHAT TO DO? Replace this sentence within the Scholarship Recommendation Module paragraph636 (printed127). Search other Decision Tree implementation claims individually; preserve correct ChapterIII formulas.
WHAT TO PUT?
The system uses Weighted Recommendation Scoring, consisting of rule-based candidate filtering followed by deterministic scoring of grade fit, roster popularity, location information and candidate-image presence. The decision-flowchart represents implemented branches rather than a trained machine-learning Decision Tree. Recommendation results do not automatically approve applications.

## Evaluation organization
WHAT TO FIND? Results and Discussion of the System's Evaluation
WHAT TO DO? Preserve this heading and all verified evaluation results (paragraph704 onward). Place COR/ROG functional evidence under Objective2 or explicitly cross-reference it; retain its limitations. Organize TAM and ISO results as Objectives4 and5 without inventing data.
WHAT TO PUT?
The following functional-test evidence evaluates the stated test cases only. It is separate from user-acceptance and software-quality evaluation. Document parser results and synthetic matching metrics are not estimates of overall student-record accuracy, external-scholarship coverage or production security.

## Signed-SOE clarification
WHAT TO FIND? The signed SOE is uploaded and verified before the scholarship cycle can be marked as completed.
WHAT TO DO? Clarify only this sentence in the Figure3.8 explanation (direct-body paragraph592; printed120-121). The word verified is ambiguous: the text does not explicitly state that a separate administrator must approve the upload. Preserve the administrator material-request review described earlier in the paragraph. Use finalize_signed_soe_submission as authority.
WHAT TO PUT?
For eligible committed applications, a signed-SOE upload is validated for ownership, file constraints and the required signing stage. Successful finalization stores a versioned submission and marks the upload and finish steps complete. An administrator may later reopen the submission for correction; prior administrator approval is not a mandatory finish condition in this implementation.
