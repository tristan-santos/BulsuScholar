# BulsuScholar Thesis System Flowcharts

This document presents the main BulsuScholar workflows for thesis documentation.
It focuses on the interactions among the Student, Grantor, Administrator, and
System without including low-level implementation details.

The diagrams use standard flowchart shapes: rounded rectangles represent the
start or end, parallelograms represent input or output, rectangles represent a
process, diamonds represent a condition or decision, and circles represent a
connector.

## 1. System Actors

| Actor | Main responsibility |
| --- | --- |
| Student | Creates an account, maintains a profile, submits documents, applies for scholarships, follows application progress, and completes scholarship requirements. |
| Grantor | Publishes scholarship opportunities, reviews applicants, manages scholars, imports official scholar lists, and produces reports. |
| Administrator | Approves accounts, verifies documents, manages grantors, reviews scholarship requirements, resolves conflicts, and oversees the system. |
| Root Admin | Manages privileged settings, Root sessions, and restricted audit/file inventory access. |
| System | Validates information, enforces scholarship rules, manages slots and records, generates notifications, and stores workflow results. |

## 2. Simplified Overall System Flow

```mermaid
flowchart TD
    Start([START: Student needs scholarship assistance])

    subgraph Student[STUDENT]
        Register[/INPUT: Account information and signup documents/]
        Confirm[PROCESS: Confirm email address]
        Profile[PROCESS: Complete profile and required documents]
        Browse[PROCESS: View available scholarship announcements]
        Apply[/INPUT: Submit scholarship application/]
        Follow[PROCESS: Follow application progress]
        Request[PROCESS: Request scholarship materials]
        Complete[/INPUT: Submit completed scholarship requirements/]
    end

    subgraph System[SYSTEM]
        Validate{DECISION: Account information and documents valid?}
        Eligibility{DECISION: Student meets scholarship requirements?}
        SaveApplication[PROCESS: Save application and reserve slot]
        Requirements{DECISION: All required stages complete?}
        Finish[PROCESS: Record completed scholarship cycle]
    end

    subgraph Grantor[GRANTOR]
        Publish[/INPUT: Create and publish scholarship offering/]
        Review[PROCESS: Review applications]
        Manage[PROCESS: Manage selected scholars]
    end

    subgraph Admin[ADMINISTRATOR]
        AccountReview[PROCESS: Review and approve student account]
        DocumentReview[PROCESS: Review newest Student Application Profile]
        ApplicationReview[PROCESS: Complete administrator review stages]
        MaterialReview[PROCESS: Review requested scholarship materials]
    end

    Start --> Register --> Validate
    Validate -- No --> Correction[/OUTPUT: Show information or document to correct/]
    Correction --> Register
    Validate -- Yes --> Confirm --> Mode{DECISION: Manual Account Review enabled?}
    Mode -- Yes --> AccountReview
    Mode -- No --> AutoReady{DECISION: Applicable signup documents system-approved?}
    AutoReady -- Yes --> Profile
    AutoReady -- No --> Pending
    AccountReview --> Approved{DECISION: Account approved?}
    Approved -- No --> Pending[/OUTPUT: Account remains pending/]
    Pending --> EndPending([END: Account awaits required review or corrections])
    Approved -- Yes --> Profile --> DocumentReview
    DocumentReview --> Browse
    Publish --> Browse
    Browse --> Apply --> Eligibility
    Eligibility -- No --> NotEligible[/OUTPUT: Application unavailable with reason/]
    NotEligible --> EndUnavailable([END: Student may choose another scholarship])
    Eligibility -- Yes --> SaveApplication --> Review
    Review --> ApplicationReview --> Follow --> Requirements
    Requirements -- No --> Follow
    Requirements -- Yes --> Request --> MaterialReview
    MaterialReview --> Released{DECISION: Materials approved?}
    Released -- No --> Follow
    Released -- Yes --> Complete --> Manage --> Finish
    Finish --> End([END: Scholarship cycle completed])
```

## 3. Authentication and Account Creation

```mermaid
flowchart TD
    Start([START: Student selects Create Account]) --> Details[/INPUT: Personal, academic, contact, and address information/]
    Details --> Availability[PROCESS: Check Student ID, email, and phone availability]
    Availability --> Available{DECISION: All identifiers available?}
    Available -- No --> Duplicate[/OUTPUT: Show the identifier that must be corrected/]
    Duplicate --> Details
    Available -- Yes --> COR[/INPUT: Upload current COR or permitted Advising Slip/]
    COR --> Scan[PROCESS: Scan document and detect academic information]
    Scan --> ScanValid{DECISION: School document valid?}
    ScanValid -- No --> ScanError[/OUTPUT: Show document correction/]
    ScanError --> COR
    ScanValid -- Yes --> ROGCheck{DECISION: Is ROG required?}
    ROGCheck -- Yes --> ROG[/INPUT: Upload previous ROG/]
    ROG --> Identity
    ROGCheck -- No --> Identity[/INPUT: Upload Student ID or accepted photo ID/]
    Identity --> Preview[PROCESS: Review entered information and documents]
    Preview --> Submit[/INPUT: Submit account registration/]
    Submit --> ServerCheck[PROCESS: Repeat server validation]
    ServerCheck --> Valid{DECISION: Registration valid?}
    Valid -- No --> Error[/OUTPUT: Return the student to the item requiring correction/]
    Error --> Details
    Valid -- Yes --> Create[PROCESS: Create authentication and pending student records]
    Create --> Email[/OUTPUT: Send confirmation email/]
    Email --> Confirm[PROCESS: Student confirms email address]
    Confirm --> Mode{DECISION: Manual Account Review enabled?}
    Mode -- Yes --> Admin[PROCESS: Administrator previews all required signup documents]
    Mode -- No --> Automatic{DECISION: All applicable signup documents system-approved?}
    Automatic -- Yes --> Active
    Automatic -- No --> Waiting([END: Remain pending until requirements are resolved])
    Admin --> Decision{DECISION: Approve account?}
    Decision -- No --> Pending[/OUTPUT: Account remains pending with reason/]
    Pending --> PendingEnd([END: Account remains pending])
    Decision -- Yes --> Active[/OUTPUT: Activate student account/]
    Active --> Welcome[PROCESS: Attempt one welcome email for newly activated account]
    Welcome --> End([END: Student may sign in; email failure does not undo activation])
```

## 4. Student Profile and Document Verification

```mermaid
flowchart TD
    Start([START: Student opens Profile and Document Vault]) --> Status[/OUTPUT: Show profile and document statuses/]
    Status --> Choice{DECISION: What does the student need to complete?}

    Choice -- Profile --> Photo[/INPUT: Upload 2x2 profile photo/]
    Photo --> Form[/INPUT: Complete editable profile information/]
    Form --> Signature[/INPUT: Draw or upload signature/]
    Signature --> Preview[PROCESS: Preview the official profile PDF]
    Preview --> SubmitProfile[/INPUT: Submit Student Application Profile/]
    SubmitProfile --> Revision[PROCESS: Generate and save a profile revision]

    Choice -- School document --> Upload[/INPUT: Upload COR, ROG, or identity document/]
    Upload --> Validate[PROCESS: Validate file, owner, document type, and academic cycle]
    Validate --> FileValid{DECISION: Document valid?}
    FileValid -- No --> FileError[/OUTPUT: Show correction reason/]
    FileError --> Upload
    FileValid -- Yes --> Submission[PROCESS: Save document submission]
    Revision --> Submission

    Submission --> Kind{DECISION: Student Application Profile?}
    Kind -- No --> Auto[PROCESS: System approves validated COR or ROG or active-student ID replacement]
    Kind -- Yes --> Review[PROCESS: Authorized reviewer opens the profile]
    Review --> Decision{DECISION: Approve document?}
    Decision -- No --> Rejected[/OUTPUT: Send rejection reason to student/]
    Rejected --> Choice
    Decision -- Yes --> Approved[/OUTPUT: Mark document approved/]
    Auto --> Approved
    Approved --> Ready{DECISION: Are all current requirements complete?}
    Ready -- No --> PendingEnd([END: Remaining requirements stay incomplete])
    Ready -- Yes --> End([END: Student profile is ready for scholarship use])
```

## 5. Scholarship Announcement and Application

```mermaid
flowchart TD
    Start([START: Grantor creates scholarship announcement]) --> Details[/INPUT: Scholarship details, image, dates, slots, and requirements/]
    Details --> Scope[PROCESS: Apply grantor location scope and audience rules]
    Scope --> Preview[PROCESS: Preview recipients]
    Preview --> Publish{DECISION: Confirm publication?}
    Publish -- No --> Details
    Publish -- Yes --> Announcement[/OUTPUT: Publish announcement and notify recipients/]
    Announcement --> Open[PROCESS: Student opens scholarship announcement]
    Open --> ApplyCheck[PROCESS: Check account, dates, grades, documents, cooldowns, and existing applications]
    ApplyCheck --> Location{DECISION: Student is within the grantor's approved location?}
    Location -- No --> LocationBlocked[/OUTPUT: Disable application and explain location restriction/]
    Location -- Yes --> Eligible{DECISION: Student meets all requirements?}
    Eligible -- No --> Blocked[/OUTPUT: Disable application and show reason/]
    Eligible -- Yes --> Apply[/INPUT: Student submits application/]
    Apply --> Slot{DECISION: Scholarship slot available?}
    Slot -- Yes --> Reserve[PROCESS: Reserve slot and save application]
    Slot -- No --> Waitlist{DECISION: Waitlist available?}
    Waitlist -- No --> Full[/OUTPUT: Scholarship is currently full/]
    Waitlist -- Yes --> Queue[PROCESS: Add student to ordered waitlist]
    Queue --> QueueNotice[/OUTPUT: Show queue status or slot offer/]
    QueueNotice --> Offer{DECISION: Student accepts available slot in time?}
    Offer -- No --> Next[PROCESS: Offer slot to next eligible student]
    Next --> QueueNotice
    Offer -- Yes --> Reserve
    Reserve --> Notify[/OUTPUT: Notify Student, Grantor, and Administrator/]
    Notify --> End([END: Application enters scholarship tracking])
    LocationBlocked --> EndUnavailable([END: Application not submitted])
    Blocked --> EndUnavailable
    Full --> EndUnavailable
```

## 6. Standard Scholarship Tracking

```mermaid
flowchart LR
    Start([START: Application submitted]) --> GrantorReview[PROCESS: Grantor reviews application]
    GrantorReview --> GrantorDecision{DECISION: Grantor accepts application?}
    GrantorDecision -- No --> Rejected[/OUTPUT: Notify student of rejection and reason/]
    Rejected --> EndRejected([END: Application closed])
    GrantorDecision -- Yes --> AdminReview[PROCESS: Administrator reviews application and requirements]
    AdminReview --> AdminDecision{DECISION: Administrator approves progression?}
    AdminDecision -- No --> Correction[/OUTPUT: Send correction or rejection notice/]
    Correction --> StudentAction[/INPUT: Student completes required action/]
    StudentAction --> AdminReview
    AdminDecision -- Yes --> Qualified[/OUTPUT: Application marked qualified/]
    Qualified --> Materials((A))
    Materials --> End([END: Continue to Request Materials])
```

### KWSP Tracking Variation

For KWSP-managed scholarships, the system uses the same application and
document checks but follows the configured KWSP review stages before the
application continues to Request Materials.

```mermaid
flowchart LR
    Start([START: KWSP application submitted]) --> Screening[PROCESS: Grantor performs initial screening]
    Screening --> Admin[PROCESS: Administrator verifies eligibility and documents]
    Admin --> Interview{DECISION: Additional assessment required?}
    Interview -- Yes --> Assessment[PROCESS: Complete configured assessment stage]
    Interview -- No --> Result((A))
    Assessment --> Result
    Result --> Qualified{DECISION: Applicant qualified?}
    Qualified -- No --> Reject[/OUTPUT: Notify student of result/]
    Qualified -- Yes --> Materials[/OUTPUT: Enable next scholarship requirement/]
```

## 7. Request Materials, SOE, and Completion

```mermaid
flowchart TD
    Start([START: Student selects Request Materials]) --> Preflight[PROCESS: Check current application and requirements]
    Preflight --> Ready{DECISION: All requirements complete?}
    Ready -- No --> Missing[/OUTPUT: Show missing requirement and direct action/]
    Missing --> StudentAction[/INPUT: Student completes missing requirement/]
    StudentAction --> Preflight
    Ready -- Yes --> Summary[/OUTPUT: Show selected scholarship, materials, and applications that will close/]
    Summary --> Confirm{DECISION: Student confirms request?}
    Confirm -- No --> Cancel([END: No changes made])
    Confirm -- Yes --> Commit[PROCESS: Keep selected scholarship and close competing applications]
    Commit --> AdminReview[PROCESS: Administrator reviews material request]
    AdminReview --> Approved{DECISION: Approve materials?}
    Approved -- No --> Rejected[/OUTPUT: Send rejection reason and next action/]
    Rejected --> Preflight
    Approved -- Yes --> Download[/OUTPUT: Student downloads SOE and application form/]
    Download --> Sign[PROCESS: Scholarship Office signs the SOE]
    Sign --> Upload[/INPUT: Student uploads signed SOE/]
    Upload --> Verify[PROCESS: Administrator verifies signed SOE]
    Verify --> Correct{DECISION: Signed SOE correct?}
    Correct -- No --> Retry[/OUTPUT: Request corrected SOE submission/]
    Retry --> Download
    Correct -- Yes --> Complete[PROCESS: Record completed scholarship cycle]
    Complete --> End([END: Scholarship marked Finished])
```

## 8. Official Roster Import and Scholarship Assignment

```mermaid
flowchart TD
    Start([START: Grantor imports official scholar list]) --> File[/INPUT: Upload spreadsheet/]
    File --> Mapping[PROCESS: Match spreadsheet columns to system fields]
    Mapping --> Preview[PROCESS: Preview and validate roster rows]
    Preview --> Match{DECISION: Does the row have one valid student match?}
    Match -- No account --> Queue[PROCESS: Queue assignment until account approval]
    Match -- Ambiguous or conflicting --> Conflict[/OUTPUT: Send row for administrator resolution/]
    Match -- Yes --> Existing{DECISION: Does a matching application already exist?}
    Existing -- Yes --> Convert[PROCESS: Convert existing application to scholarship]
    Existing -- No --> Assign[PROCESS: Create authoritative scholarship assignment]
    Queue --> Confirm((A))
    Convert --> Confirm
    Assign --> Confirm
    Confirm --> Commit[/INPUT: Grantor confirms valid roster results/]
    Commit --> Close[PROCESS: Close competing applications and lock withdrawal]
    Close --> Notify[/OUTPUT: Notify student of scholarship assignment/]
    Notify --> Documents{DECISION: Required documents approved?}
    Documents -- No --> Pending[/OUTPUT: Scholarship assigned; documents still required/]
    Pending --> Documents
    Documents -- Yes --> Finished[/OUTPUT: Mark roster scholarship Finished/]
    Finished --> End([END: Roster assignment completed])
    Conflict --> Resolve[PROCESS: Administrator resolves identity or scholarship conflict]
    Resolve --> Resolved{DECISION: Conflict resolved?}
    Resolved -- No --> Conflict
    Resolved -- Yes --> Assign
```

## 9. Grantor Portal Flow

```mermaid
flowchart TD
    Start([START: Grantor account created by Administrator]) --> Login[/INPUT: User ID and temporary password/]
    Login --> Temporary{DECISION: Temporary password still active?}
    Temporary -- Yes --> Change[PROCESS: Create permanent password]
    Temporary -- No --> Dashboard((A))
    Change --> Dashboard
    Dashboard --> Home[/OUTPUT: Show grantor dashboard and current workload/]
    Home --> Task{DECISION: Select grantor task}

    Task -- Scholarships --> Scholarship[PROCESS: Create or manage scholarship offering]
    Scholarship --> ScholarshipOutput[/OUTPUT: Updated scholarship announcement/]

    Task -- Applications --> Applications[PROCESS: Filter and review authorized applications]
    Applications --> ApplicationOutput[/OUTPUT: Saved decision or tracking progress/]

    Task -- Scholars --> Scholars[PROCESS: Manage scholars or import official roster]
    Scholars --> ScholarOutput[/OUTPUT: Updated scholar records or roster results/]

    Task -- Reports --> Filters[/INPUT: Select report filters/]
    Filters --> Report[PROCESS: Generate report preview]
    Report --> Export[/OUTPUT: Download PDF or CSV report/]

    Task -- Profile and Inbox --> Profile[PROCESS: Update permitted profile fields or open notification]
    Profile --> ProfileOutput[/OUTPUT: Saved profile or related workflow opened/]

    Task -- Sign out --> End([END: Grantor session closed])

    ScholarshipOutput --> Return((B))
    ApplicationOutput --> Return
    ScholarOutput --> Return
    Export --> Return
    ProfileOutput --> Return
    Return --> Task
```

## 10. Administrator Portal Flow

```mermaid
flowchart TD
    Start([START: Administrator signs in]) --> Verify[PROCESS: Verify administrator role and permissions]
    Verify --> Allowed{DECISION: Access permitted?}
    Allowed -- No --> Denied[/OUTPUT: Deny access/]
    Allowed -- Yes --> Dashboard[/OUTPUT: Show dashboard, pending work, and alerts/]
    Dashboard --> Task{DECISION: Select administration task}

    Task -- Student Accounts --> Student[PROCESS: Review pending account and signup documents]
    Student --> StudentDecision{DECISION: Approve account?}
    StudentDecision -- No --> StudentPending[/OUTPUT: Keep account pending with reason/]
    StudentDecision -- Yes --> StudentActive[/OUTPUT: Activate student account/]

    Task -- Document Review --> Documents[PROCESS: Open newest Student Application Profile]
    Documents --> DocumentDecision{DECISION: Approve document?}
    DocumentDecision -- No --> DocumentReject[/OUTPUT: Save rejection reason and notify student/]
    DocumentDecision -- Yes --> DocumentApprove[/OUTPUT: Save approval and update verification/]

    Task -- Grantor Management --> Grantor[/INPUT: Grantor details, classification, and location scope/]
    Grantor --> GrantorValid{DECISION: Account and scope valid?}
    GrantorValid -- No --> GrantorError[/OUTPUT: Show required correction/]
    GrantorValid -- Yes --> GrantorSave[/OUTPUT: Create or update grantor account/]

    Task -- Scholarship Oversight --> Scholarship[PROCESS: Review programs, applications, tracking, slots, and conflicts]
    Scholarship --> ScholarshipOutput[/OUTPUT: Save authorized decision or resolution/]

    Task -- Requirements --> Requirement[PROCESS: Review materials or signed SOE]
    Requirement --> RequirementDecision{DECISION: Approve requirement?}
    RequirementDecision -- No --> RequirementReject[/OUTPUT: Save reason and notify student/]
    RequirementDecision -- Yes --> RequirementApprove[/OUTPUT: Release materials or confirm SOE/]

    Task -- Reports and Announcements --> AdminAction[PROCESS: Prepare announcement or report]
    AdminAction --> AdminOutput[/OUTPUT: Publish notification or export report/]

    Task -- Sign out --> End([END: Administrator session closed])

    StudentPending --> Return((A))
    StudentActive --> Return
    DocumentReject --> Return
    DocumentApprove --> Return
    GrantorError --> Return
    GrantorSave --> Return
    ScholarshipOutput --> Return
    RequirementReject --> Return
    RequirementApprove --> Return
    AdminOutput --> Return
    Return --> Task
```

## 11. Protected Sensitive Downloads

All matching connector labels are local to their diagram. An ending means the
current operation finishes, not that the user's whole portal session ends.

```mermaid
flowchart TD
    Start([START: Select official download]) --> Password[PROCESS: Generate a fresh 32-character random password in browser memory]
    Password --> Save[/OUTPUT: Show password and Copy action/]
    Save --> Ack{DECISION: User saved password?}
    Ack -- Cancel --> Cancel([END: Clear temporary password; no download])
    Ack -- Yes --> Request[/INPUT: Authenticated POST with resource identifier and download password/]
    Request --> Authorized{DECISION: Session, role, ownership or relationship valid?}
    Authorized -- No --> Deny([END: Deny without reading private file])
    Authorized -- Yes --> Read[PROCESS: Read authorized original or build filtered report]
    Read --> Type{DECISION: Ordinary unsigned unencrypted PDF?}
    Type -- Yes --> PDF[PROCESS: Encrypt PDF copy with explicit AES-256]
    Type -- No --> ZIP[PROCESS: AES-256 ZIP containing byte-identical original]
    PDF --> Success{DECISION: Encryption successful?}
    ZIP --> Success
    Success -- No --> Fail[PROCESS: Attempt safe failure audit; never return plaintext]
    Fail --> Failed([END: Show protection error; clear temporary password])
    Success -- Yes --> Audit{DECISION: Append-only preparation audit saved?}
    Audit -- No --> Failed
    Audit -- Yes --> File[/OUTPUT: Protected file with generic filename and private no-store headers/]
    File --> Cleanup[PROCESS: Clear password state and revoke temporary object URL]
    Cleanup --> End([END: Protected download prepared])
```

The audit outcome is **prepared**, not proof that the browser saved or opened
the file. Report export history records successful preparation only. Authenticated
previews remain readable and do not create export-history events. A download
never records the signup-document preview required for account approval.

## 12. Password-Assisted PDF Re-upload

```mermaid
flowchart TD
    Start([START: Choose upload]) --> Access{DECISION: Existing upload authorization passes?}
    Access -- No --> Denied([END: Upload denied])
    Access -- Yes --> File[/INPUT: Original PDF and optional temporary file password/]
    File --> Encrypted{DECISION: PDF encrypted?}
    Encrypted -- No --> Validate
    Encrypted -- Yes --> Unlock{DECISION: Supplied password decrypts PDF?}
    Unlock -- No --> Prompt[/OUTPUT: Request password or explain incorrect password/]
    Prompt --> Retry{DECISION: Retry?}
    Retry -- No --> Cancel([END: Cancel upload and clear password])
    Retry -- Yes --> File
    Unlock -- Yes --> Derivative[PROCESS: Create decrypted processing copy in memory]
    Derivative --> Validate[PROCESS: Apply existing document-specific parser and policy validation]
    Validate --> Valid{DECISION: Valid submission?}
    Valid -- No --> Correction([END: Explain correction; no approved submission])
    Valid -- Yes --> Store[PROCESS: Keep original bytes privately and separate private processing derivative if needed]
    Store --> Kind{DECISION: Profile or school document?}
    Kind -- Profile --> Pending[PROCESS: Keep newest profile pending for administrator review]
    Kind -- School document --> Auto[PROCESS: System-approve valid COR or ROG or active-account identity replacement]
    Pending --> End([END: Clear password; retain immutable history])
    Auto --> End
```

Signup identity verification follows Section 3, not automatic active-account
replacement rules. A processing derivative is not claimed to preserve a digital
signature. The original signed SOE remains authoritative and is archived without
rewriting for download. The password is not saved with either file.
