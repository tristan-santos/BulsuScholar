# BulsuScholar Complete System Flow

This document describes the implemented BulsuScholar workflow in the current
repository. It covers the Student, Grantor, and Administrator portals and the
server-owned processes that connect them.

## 1. System Actors

| Actor | Main responsibility |
| --- | --- |
| Student | Creates an account, submits documents and a profile, applies for scholarships, follows application tracking, requests and downloads materials, and submits a signed SOE. |
| Grantor | Maintains scholarship announcements, receives scoped applications, reviews applicants, manages scholars, imports official scholar rosters, and creates grantor reports. |
| Administrator | Approves student accounts, reviews documents, manages grantors and location scopes, oversees scholarship decisions and tracking, approves materials, verifies SOE signing, publishes announcements, and generates system reports. |
| System | Performs document scans, validation, authorization, slot reservation, waitlist processing, automatic document approval when enabled, immutable revision storage, notifications, auditing, and email verification. |

## 2. How to Read the Flowcharts

Every diagram uses the same standard flowchart symbols:

```mermaid
flowchart LR
    Start([START or END]) --> Input[/INPUT: Information or file entered/]
    Input --> Process[PROCESS: Work performed by a person or the system]
    Process --> Decision{DECISION: A yes or no question?}
    Decision -- Yes --> Output[/OUTPUT: Result shown, saved, or sent/]
    Decision -- No --> Connector((A))
    Connector --> Process
```

| Symbol | Name | Beginner meaning |
| --- | --- | --- |
| Rounded rectangle | Start or End | Where a workflow begins or finishes. |
| Parallelogram | Input or Output | Information enters the system, or the system produces a visible result. |
| Rectangle | Process | A person or the system performs an action. |
| Diamond | Condition / Decision | The flow checks a condition or asks a question, then follows the labeled arrow. |
| Circle | Connector | The flow continues in another role, section, or diagram without drawing a long crossing line. |
| Arrow | Flow line | Shows the next step. Text on the arrow explains the condition. |

The large diagram below gives the complete path. The smaller diagrams after it
explain each part in more detail. Connector letters restart in each diagram, so
an **A** connector only connects steps inside the diagram where it appears.

## 3. Master Student to Grantor to Admin Flowchart

```mermaid
flowchart TB
    Start([START: Student needs a scholarship])

    subgraph Student[STUDENT]
        SInput[/INPUT: Personal, school, contact, and address information/]
        SDocs[/INPUT: COR, required ROG, and accepted photo ID/]
        SConfirm[PROCESS: Confirm email address]
        SLogin[/INPUT: User ID and password/]
        SProfile[PROCESS: Complete Profile and Document Vault]
        SApply[PROCESS: Choose an announcement and apply]
        SAction[/OUTPUT: Inbox shows the next required step/]
        SRequest[PROCESS: Confirm Request Materials]
        SDownload[/OUTPUT: Download approved SOE and application form/]
        SSign[PROCESS: Bring SOE to the Scholarship Office for signing]
        SUpload[/INPUT: Upload the signed SOE/]
    end

    subgraph System[SYSTEM]
        SysUnique{DECISION: Student ID, email, and phone are available?}
        SysScan[PROCESS: Scan and validate signup documents]
        SysValid{DECISION: Signup information and documents are valid?}
        SysPending[PROCESS: Create Auth account and pending student record]
        SysDocPolicy{DECISION: Manual Document Review is enabled?}
        SysAuto[PROCESS: System approves new validated documents]
        SysActivate[/OUTPUT: Active student account/]
        SysProfilePolicy{DECISION: Manual review is enabled for the profile documents?}
        SysProfileAuto[PROCESS: System approves new validated profile documents]
        SysLoginCheck{DECISION: Login needs email verification?}
        SysCode[/OUTPUT: Six-digit code sent to registered email/]
        SysEligibility{DECISION: Student is eligible and a slot is available?}
        SysWaitlist[PROCESS: Add student to the ordered waitlist]
        SysApplication[/OUTPUT: Application created and slot reserved/]
        SysPreflight{DECISION: All material-request requirements are complete?}
        SysCommit[PROCESS: Keep selected scholarship and close competing applications]
        SysFinish[PROCESS: Save signed SOE version and complete the cycle]
    end

    subgraph Grantor[GRANTOR]
        GOffer[/INPUT: Scholarship details, dates, slots, requirements, and images/]
        GPublish[PROCESS: Preview recipients and publish the announcement]
        GReview[PROCESS: Review the grantor's own applications]
        GStage[PROCESS: Complete grantor-owned application stages]
        GRoster[/INPUT: Official scholar roster spreadsheet/]
        GReport[/OUTPUT: Filtered applicant or scholar report/]
    end

    subgraph Admin[ADMINISTRATOR]
        APending[PROCESS: Review pending account and signup documents]
        AApprove{DECISION: Approve the student account?}
        ADocuments[PROCESS: Review current COR, ROG, ID, and profile]
        AStages[PROCESS: Complete administrator-owned stages]
        AMaterials{DECISION: Approve requested materials?}
        ASoe{DECISION: Downloaded SOE is correct for signing?}
        AConflict[PROCESS: Resolve roster conflicts when needed]
        AReport[/OUTPUT: Administration reports and audit records/]
    end

    Start --> SInput --> SysUnique
    SysUnique -- No --> SInput
    SysUnique -- Yes --> SDocs --> SysScan --> SysValid
    SysValid -- No: show correction --> SDocs
    SysValid -- Yes --> SysPending --> SysDocPolicy
    SysDocPolicy -- Yes --> CEmail((A))
    SysDocPolicy -- No --> SysAuto --> CEmail
    CEmail --> SConfirm --> CAccountReview((C))
    CAccountReview --> APending --> AApprove
    AApprove -- No: remain pending --> APending
    AApprove -- Yes --> SysActivate --> SLogin --> SysLoginCheck
    SysLoginCheck -- Yes --> SysCode --> SLogin
    SysLoginCheck -- No --> SProfile --> SysProfilePolicy
    SysProfilePolicy -- Yes --> ADocuments
    SysProfilePolicy -- No --> SysProfileAuto --> CPublished

    GOffer --> GPublish --> CPublished((B))
    ADocuments --> CPublished
    CPublished --> SApply --> SysEligibility
    SysEligibility -- No slot, waitlist open --> SysWaitlist --> SAction
    SysEligibility -- Not eligible --> Blocked[/OUTPUT: Apply is disabled and the reason is shown/]
    SysEligibility -- Yes --> SysApplication --> GReview --> GStage --> AStages --> SAction

    SAction --> SRequest --> SysPreflight
    SysPreflight -- No --> Blocker[/OUTPUT: Show the missing requirement and direct action/]
    Blocker --> SAction
    SysPreflight -- Yes --> SysCommit --> AMaterials
    AMaterials -- No --> MaterialReject[/OUTPUT: Rejection reason sent to Student Inbox/]
    MaterialReject --> SAction
    AMaterials -- Yes --> SDownload --> ASoe
    ASoe -- No --> SoeRetry[/OUTPUT: Student must download a corrected SOE/]
    SoeRetry --> SDownload
    ASoe -- Yes --> SSign --> SUpload --> SysFinish --> End([END: Scholarship cycle finished])

    GRoster --> RosterDecision{DECISION: Every roster row has one valid match?}
    RosterDecision -- No --> AConflict --> RosterDecision
    RosterDecision -- Yes --> SysApplication
    GReview --> GReport
    AConflict --> AReport
```

## 4. Authentication and Account Creation

```mermaid
flowchart TD
    Start([START: Student selects Create Account]) --> Details[/INPUT: Personal, academic, contact, and address details/]
    Details --> Unique[PROCESS: Check Student ID, email, and phone availability]
    Unique --> UniqueDecision{DECISION: All three values are available?}
    UniqueDecision -- No --> Error1[/OUTPUT: Show which value is already used or invalid/]
    Error1 --> RetryDetails((A)) --> Details
    UniqueDecision -- Yes --> Cor[/INPUT: Upload current COR or allowed Advising Slip/]
    Cor --> ScanCor[PROCESS: Server scans the school document]
    ScanCor --> CorDecision{DECISION: Correct document and current academic cycle?}
    CorDecision -- No --> CorError[/OUTPUT: Show the document problem/]
    CorError --> RetryCor((B)) --> Cor
    CorDecision -- Yes --> Autofill[/OUTPUT: Autofill detected Student ID, course, and year/]
    Autofill --> SemesterDecision{DECISION: First year and first semester?}
    SemesterDecision -- Yes --> RogOptional[PROCESS: Mark ROG as optional]
    SemesterDecision -- No --> Rog[/INPUT: Upload previous-cycle ROG/]
    Rog --> RogCheck{DECISION: ROG and academic cycle are valid?}
    RogCheck -- No --> RogError[/OUTPUT: Show the ROG correction needed/]
    RogError --> RetryRog((C)) --> Rog
    RogCheck -- Yes --> IdentityConnector((D))
    RogOptional --> IdentityConnector
    IdentityConnector --> YearDecision{DECISION: What is the student's year level?}
    YearDecision -- Year 1 --> FirstYearId[/INPUT: Student ID, previous-school ID, or government photo ID/]
    YearDecision -- Year 2 to 4 --> UpperYearId[/INPUT: Current Student ID/]
    FirstYearId --> Batch[PROCESS: Create an expiring one-time document batch]
    UpperYearId --> Batch
    Batch --> Preview[/OUTPUT: Show all entered information and uploaded documents/]
    Preview --> FinalCheck[PROCESS: Repeat server validation and duplicate checks]
    FinalCheck --> FinalDecision{DECISION: Final submission is valid?}
    FinalDecision -- No --> FinalError[/OUTPUT: Show the field or document that must be corrected/]
    FinalError --> RetryDetails
    FinalDecision -- Yes --> CreateAuth[PROCESS: Create the authentication account]
    CreateAuth --> Pending[PROCESS: Save a pending student account]
    Pending --> SaveDocs[PROCESS: Save immutable COR, ROG, and identity submissions]
    SaveDocs --> ConfirmEmail[/OUTPUT: Send confirmation email/]
    ConfirmEmail --> Confirm[PROCESS: Student confirms the email address]
    Confirm --> AdminReview[PROCESS: Full administrator reviews the pending account]
    AdminReview --> Approval{DECISION: Approve the account?}
    Approval -- No or not ready --> PendingOutput[/OUTPUT: Account remains pending and cannot sign in/]
    PendingOutput --> AdminReview
    Approval -- Yes --> Active[/OUTPUT: Active student account with preserved document statuses/]
    Active --> End([END: Student may sign in])
```

### Signup rules

1. Student ID, email address, and Philippine mobile number are checked while the student types and are checked again on final submission.
2. The backend, not the browser, rescans the uploaded signup documents and decides the academic-cycle and document requirements.
3. A first-year, first-semester student does not need a ROG. All other students need the previous-cycle ROG.
4. Year 1 accepts a Student ID, previous-school photo ID, or government photo ID. Years 2 to 4 require a Student ID.
5. A COR year mismatch is stored for administrator review instead of silently replacing the student's declared year.
6. Street/Subdivision and Postal Code are optional. Province, City/Municipality, and Barangay remain part of scope validation.
7. The account remains in `pending_students` after email confirmation. Only a full administrator can activate it.

## 5. Login, Lockout, Recovery, and Email Verification

```mermaid
flowchart TD
    Start([START: User opens Sign In]) --> Credentials[/INPUT: User ID and password/]
    Credentials --> FindAccount[PROCESS: Find the account without revealing unknown User IDs]
    FindAccount --> AccountCheck{DECISION: Account is active and not locked?}
    AccountCheck -- No --> Unavailable[/OUTPUT: Login unavailable; use recovery or administrator unlock/]
    AccountCheck -- Yes --> PasswordCheck[PROCESS: Verify password with Supabase Auth]
    PasswordCheck --> PasswordDecision{DECISION: Password is correct?}
    PasswordDecision -- No --> Failed[PROCESS: Record a failed attempt]
    Failed --> Limit{DECISION: Failed-attempt limit reached?}
    Limit -- No --> Retry((A)) --> Credentials
    Limit -- Yes --> Locked[/OUTPUT: Account is locked/]
    Locked --> Recovery[PROCESS: Student or grantor uses email recovery; admin uses unlock path]
    PasswordDecision -- Yes --> Inactivity{DECISION: Student or grantor inactive for at least 30 days?}
    Inactivity -- No --> Session[PROCESS: Register a verified portal session]
    Inactivity -- Yes --> Discard[PROCESS: Discard the temporary password-created session]
    Discard --> Code[/OUTPUT: Send a six-digit code to the registered email/]
    Code --> VerifyInput[/INPUT: Verification code and password/]
    VerifyInput --> CodeCheck{DECISION: Code is correct, unused, and not expired?}
    CodeCheck -- No --> CodeError[/OUTPUT: Show remaining attempts or resend option/]
    CodeError --> VerifyInput
    CodeCheck -- Yes --> Session
    Session --> Portal[/OUTPUT: Open the correct Student, Grantor, or Admin portal/]
    Portal --> End([END: Authenticated portal session])
```

Security behavior:

- Email verification is a password-plus-email-code second factor for approved students and grantors after 30 days without meaningful activity.
- Codes expire after 10 minutes, allow three attempts, have a 60-second resend delay, and permit five sends per hour.
- Protected requests require a valid Supabase bearer token, matching portal actor headers, an active account, and a registered verified session.
- Password recovery responses are generic so unknown User IDs are not disclosed.

## 6. Student Profile and Document Verification

```mermaid
flowchart TD
    Start([START: Student opens Profile and Document Vault]) --> Vault[/OUTPUT: Current COR, ROG, identity, and profile statuses/]
    Vault --> Choice{DECISION: What will the student submit?}
    Choice -- COR, ROG, or ID --> File[/INPUT: Replacement document file/]
    File --> Validate[PROCESS: Validate type, size, owner, cycle, and requirement]
    Choice -- Student Application Profile --> Form[PROCESS: Open the in-system profile form]
    Form --> Photo[/INPUT: 2x2 profile photo/]
    Photo --> Fields[/INPUT: Editable profile information/]
    Fields --> Signature[/INPUT: Drawn or uploaded signature/]
    Signature --> DraftChoice{DECISION: Save draft, preview, or submit?}
    DraftChoice -- Save Draft --> Draft[/OUTPUT: Editable draft saved/] --> Form
    DraftChoice -- Preview --> PdfPreview[/OUTPUT: Official template PDF marked Draft/] --> Form
    DraftChoice -- Submit --> Generate[PROCESS: Generate immutable PDF and profile revision]
    Generate --> ReplaceQueue[PROCESS: Replace the older pending profile request in the admin queue]
    Validate --> Submission[PROCESS: Create an immutable document submission]
    ReplaceQueue --> Submission
    Submission --> Policy{DECISION: Manual Document Review enabled?}
    Policy -- No --> Auto[PROCESS: System records an automatic approval]
    Policy -- Yes --> Pending[/OUTPUT: Document status is Pending/]
    Pending --> Reviewer[PROCESS: Admin or authorized reviewer opens the private document]
    Reviewer --> ReviewDecision{DECISION: Approve the document?}
    ReviewDecision -- No --> Rejected[/OUTPUT: Rejection reason and correction notice sent to student/]
    Rejected --> Retry((A)) --> Choice
    ReviewDecision -- Yes --> Approved[PROCESS: Save review and refresh verification and tracking]
    Auto --> Approved
    Approved --> CorChange{DECISION: Approved COR changes current course, year, or section?}
    CorChange -- Yes --> Update[PROCESS: Update academic fields and save audit/history record]
    CorChange -- No --> Ready((B))
    Update --> Ready
    Ready --> End([END: Continue scholarship workflow])
```

### Profile rules

- Student ID, email, contact number, course, year, and section are locked after account creation and come from the authoritative student record.
- Names, birth date, guardian information, college, permanent address, profile photo, and signature are editable where permitted.
- Every submission creates a new immutable revision and PDF. Historical revisions are preserved.
- The admin queue shows only the newest Student Application Profile request per student. An older pending request becomes `superseded` and cannot be reviewed.
- Grantors can only open approved student identity documents for students who applied to or are active scholars of that grantor.
- When manual review is disabled, only new server-validated submissions are automatically approved. Existing pending or rejected records do not change.

## 7. Scholarship Announcement and Application Flow

```mermaid
flowchart TD
    Start([START: Grantor selects Create Announcement]) --> Content[/INPUT: Title, description, and at least one image/]
    Content --> ApplicationChoice{DECISION: Open for applications?}
    ApplicationChoice -- No --> Audience[PROCESS: Select the permitted audience]
    ApplicationChoice -- Yes --> Scholarship[/INPUT: Scholarship, dates, GWA, slots, and required documents/]
    Scholarship --> CustomForm[/INPUT: Optional custom grantor application PDF/]
    CustomForm --> ScopeCheck[PROCESS: Validate offering and grantor location scope]
    Audience --> Preview[PROCESS: Create a 15-minute recipient preview]
    ScopeCheck --> Preview
    Preview --> Confirm{DECISION: Grantor confirms publication?}
    Confirm -- No --> Content
    Confirm -- Yes --> Published[/OUTPUT: Published announcement and deduplicated notifications/]
    Published --> StudentOpen[PROCESS: Student opens the announcement]
    StudentOpen --> Eligibility[PROCESS: Check account, location, dates, GWA, cooldown, commitment, documents, and slots]
    Eligibility --> Eligible{DECISION: Student is eligible?}
    Eligible -- No --> Disabled[/OUTPUT: Apply button disabled with exact reason and next action/]
    Eligible -- Yes --> Apply[/INPUT: Student submits application/]
    Apply --> Slot{DECISION: Scholarship slot available?}
    Slot -- Yes --> Reserve[PROCESS: Reserve one slot and create the application]
    Slot -- No --> WaitlistCheck{DECISION: Waitlist is enabled and has capacity?}
    WaitlistCheck -- No --> Disabled
    WaitlistCheck -- Yes --> Queue[PROCESS: Add student to the ordered waitlist]
    Queue --> QueueOutput[/OUTPUT: Queue position or later slot offer shown to student/]
    QueueOutput --> Offer{DECISION: Student accepts the offer before it expires?}
    Offer -- Yes --> Reserve
    Offer -- No --> Promote[PROCESS: Release offer and promote the next eligible student]
    Promote --> QueueOutput
    Reserve --> Notice[/OUTPUT: Notify Student, Grantor, and Admin/]
    Notice --> Review[PROCESS: Grantor reviews only its own application]
    Review --> Progress[PROCESS: Grantor or Admin completes authorized tracking stages]
    Progress --> End([END: Application continues to Request Materials])
```

### Application checks

The server checks all of the following before committing an application:

- active student account and no unresolved roster conflict;
- active grantor and open scholarship announcement;
- approved municipality when location scope is enforced;
- active application window;
- minimum GWA and required current-cycle documents;
- no blocking scholarship commitment;
- no active rejection or withdrawal cooldown for the same grantor;
- no duplicate application;
- configured slot capacity or available waitlist capacity.

## 8. Standard Scholarship Tracking

```mermaid
flowchart LR
    Start([START]) --> Account[PROCESS: Create and approve account]
    Account --> Apply[PROCESS: Student applies for scholarship]
    Apply --> Documents[/INPUT: Student uploads required documents/]
    Documents --> Profile[/INPUT: Student submits Application Profile/]
    Profile --> Review{DECISION: Documents approved?}
    Review -- No --> Correction[/OUTPUT: Student receives correction or waiting status/]
    Correction --> Documents
    Review -- Yes --> Materials[PROCESS: Student requests materials]
    Materials --> Download[/OUTPUT: Student downloads approved materials/]
    Download --> Signing[PROCESS: Scholarship Office checks and signs SOE]
    Signing --> SignedSoe[/INPUT: Student uploads signed SOE/]
    SignedSoe --> Finish[/OUTPUT: System marks cycle Finished/]
    Finish --> End([END])
```

When the application started from an announcement, **Applying via Announcement** is inserted after Creation of Account.

### KWSP tracking variation

```mermaid
flowchart LR
    Start([START]) --> Account[PROCESS: Create and approve account]
    Account --> Apply[PROCESS: Student applies for KWSP]
    Apply --> Documents[/INPUT: Required documents/]
    Documents --> Profile[/INPUT: Student Application Profile/]
    Profile --> DocReview{DECISION: Documents approved?}
    DocReview -- No --> Correction[/OUTPUT: Student corrects or waits for review/] --> Documents
    DocReview -- Yes --> AdminReview[PROCESS: Admin Review]
    AdminReview --> Interview[PROCESS: Interview]
    Interview --> AppReview[PROCESS: Application Review]
    AppReview --> Screening[PROCESS: Final Screening]
    Screening --> Materials[PROCESS: Request Materials]
    Materials --> Download[/OUTPUT: Download approved materials/]
    Download --> Signing[PROCESS: Scholarship Office signing]
    Signing --> SignedSoe[/INPUT: Upload signed SOE/]
    SignedSoe --> Finish[/OUTPUT: System marks cycle Finished/]
    Finish --> End([END])
```

Tracking ownership:

| Stage | Primary owner |
| --- | --- |
| Account creation | System and Admin |
| Application | Student |
| Document upload | Student, with system validation |
| Student Application Profile | Student |
| Document Review | Admin/authorized reviewer or System when auto-review is enabled |
| Admin Review, Interview, Application Review, Final Screening | Admin/Scholarship Office |
| Request Materials | Student, followed by Admin approval |
| Download Materials | Student |
| Signing of Materials | Scholarship Office/Admin verification |
| Upload Signed SOE | Student |
| Finish | System |

## 9. Request Materials, SOE, and Completion

```mermaid
flowchart TD
    Start([START: Student selects Request Materials]) --> Preflight[PROCESS: Server checks the Application ID]
    Preflight --> Check[PROCESS: Check account, application, grantor, GWA, slot, commitment, approved document versions, profile, and custom requirements]
    Check --> Ready{DECISION: Every requirement is ready?}
    Ready -- No --> Blocker[/OUTPUT: Show missing requirement and a direct action button/]
    Blocker --> Return((A)) --> Start
    Ready -- Yes --> Summary[/OUTPUT: Show scholarship, grantor, materials, applications that will close, and no-withdrawal warning/]
    Summary --> Confirm[/INPUT: Student confirms the request/]
    Confirm --> Recheck[PROCESS: Server repeats all checks inside the transaction]
    Recheck --> StillReady{DECISION: Student is still eligible?}
    StillReady -- No --> Blocker
    StillReady -- Yes --> Request[PROCESS: Create or return the same current request]
    Request --> Commit[PROCESS: Commit selected scholarship]
    Commit --> Close[PROCESS: Close competing applications and release their slots]
    Close --> AdminReview[PROCESS: Admin reviews SOE and applicable application-form request]
    AdminReview --> Approve{DECISION: Approve the materials?}
    Approve -- No --> Reject[/OUTPUT: Rejection reason sent to Student Inbox/]
    Reject --> Return
    Approve -- Yes --> Download[/OUTPUT: Student downloads approved materials/]
    Download --> Office[PROCESS: Scholarship Office checks and signs the downloaded SOE]
    Office --> Compliant{DECISION: SOE is correct and compliant?}
    Compliant -- No --> Retry[/OUTPUT: Reject SOE and allow a corrected download/]
    Retry --> Download
    Compliant -- Yes --> Upload[/INPUT: Student uploads signed SOE/]
    Upload --> Save[PROCESS: Save an immutable signed-SOE version]
    Save --> Complete[/OUTPUT: Upload Signed SOE and Finish become complete/]
    Complete --> End([END: Wait for next academic-cycle renewal])
```

The materials request always includes the SOE and the applicable default or custom application form. Repeated requests are idempotent and do not consume another slot or close applications twice.

## 10. Official Roster Import and Automatic Scholarship Assignment

```mermaid
flowchart TD
    Start([START: Grantor selects Import Scholars]) --> Excel[/INPUT: Official Excel roster/]
    Excel --> Mapping[PROCESS: Grantor maps spreadsheet columns]
    Mapping --> Preview[PROCESS: Server creates an import preview]
    Preview --> Validate[PROCESS: Validate scholarship, duplicate rows, identity, ownership, and existing commitments]
    Validate --> RowType{DECISION: What is the result for this row?}
    RowType -- One active student --> Ready[PROCESS: Mark row ready for assignment]
    RowType -- Matching open application --> Convert[PROCESS: Mark application ready for in-place conversion]
    RowType -- Account not active --> Queue[PROCESS: Queue assignment until account approval]
    RowType -- Ambiguous or conflicting --> Conflict[/OUTPUT: Create a staff-resolution conflict/]
    RowType -- Invalid or duplicate --> Block[/OUTPUT: Block row and show the reason/]
    Ready --> Confirm((A))
    Convert --> Confirm
    Queue --> Confirm
    Confirm --> Commit[/INPUT: Grantor confirms the import preview/]
    Commit --> Transaction[PROCESS: Create or convert the authoritative scholarship]
    Transaction --> Close[PROCESS: Close competing applications and lock withdrawal]
    Close --> Notice[/OUTPUT: Notify student and update Next Required Step/]
    Notice --> Docs{DECISION: All required documents are approved?}
    Docs -- No --> Waiting[/OUTPUT: Scholarship assigned; documents still required/]
    Waiting --> Docs
    Docs -- Yes --> Finished[/OUTPUT: System marks authoritative-roster workflow Finished/]
    Finished --> End([END])
    Conflict --> Admin[PROCESS: Admin reviews and corrects the conflict]
    Admin --> Resolved{DECISION: Conflict resolved?}
    Resolved -- No --> Conflict
    Resolved -- Yes --> Transaction
```

Roster rules:

- A validated official roster is authoritative for the award, but it does not fabricate document uploads, SOE downloads, or signatures.
- A matching application is converted without losing its ID, documents, tracking, or history.
- Re-uploading the same roster is idempotent.
- Conflicting grantors, ambiguous identity, and unrecognized scholarships require staff resolution.
- The student cannot withdraw from an active authoritative-roster scholarship.
- Completion occurs automatically only after all applicable documents are approved.

## 11. Inbox and Notification Flow

```mermaid
flowchart TD
    Start([START: A workflow change is successfully saved]) --> Event[PROCESS: System creates a role-specific notification]
    Event --> Recipient{DECISION: Who must receive it?}
    Recipient -- Student --> StudentInbox[/OUTPUT: Notification appears in Student Inbox/]
    Recipient -- Grantor --> GrantorInbox[/OUTPUT: Notification appears in Grantor Inbox/]
    Recipient -- Admin --> AdminInbox[/OUTPUT: Notification appears in Admin Inbox/]
    StudentInbox --> Required[PROCESS: Server finds the student's one current required action]
    Required --> Pinned[/OUTPUT: Next Required Step is pinned at the top/]
    Pinned --> Action[/INPUT: Student selects the action button/]
    Action --> Complete[PROCESS: Student completes the required step]
    Complete --> Replace[PROCESS: Replace the old required action with the next one]
    Replace --> EndStudent([END: Student sees current instructions only])
    GrantorInbox --> GrantorOpen[PROCESS: Open related application, scholar, or announcement]
    GrantorOpen --> EndGrantor([END: Grantor handles the event])
    AdminInbox --> AdminOpen[PROCESS: Open related account, document, roster, or requirement]
    AdminOpen --> EndAdmin([END: Admin handles the event])
```

Student required-action priority is derived from the current authoritative state. It can direct the student to document correction, profile completion, application-specific requirements, review waiting, materials, waitlist offers, signed SOE, or cycle completion. It is replaced as progress changes instead of creating multiple stale pinned actions.

## 12. Grantor Portal Flow

```mermaid
flowchart TD
    Start([START: Grantor account is created by Admin]) --> Credentials[/OUTPUT: Temporary login credentials/]
    Credentials --> Login[/INPUT: Grantor User ID and temporary password/]
    Login --> Password{DECISION: Temporary password still active?}
    Password -- Yes --> Change[PROCESS: Create a password that meets all requirements]
    Password -- No --> Dashboard((A))
    Change --> Dashboard
    Dashboard --> Home[/OUTPUT: Grantor dashboard and current workload/]
    Home --> Task{DECISION: What does the grantor need to do?}

    Task -- Manage scholars --> Scholars[PROCESS: View active, warning, or archived scholars]
    Scholars --> ScholarAction{DECISION: Add, edit, archive, invite back, or import roster?}
    ScholarAction -- Import roster --> Roster[/INPUT: Excel roster and column mapping/]
    Roster --> RosterOutput[/OUTPUT: Preview, row results, assignments, or conflicts/]
    ScholarAction -- Other scholar action --> ScholarOutput[/OUTPUT: Updated authorized scholar record/]

    Task -- Review applications --> Applications[PROCESS: Filter and open the grantor's own applications]
    Applications --> AppDecision{DECISION: Application action is allowed?}
    AppDecision -- No --> AppBlocked[/OUTPUT: Show ownership, document, or stage restriction/]
    AppDecision -- Yes --> AppOutput[/OUTPUT: Save decision or tracking progress and notify student/]

    Task -- Publish announcement --> Announcement[/INPUT: Content, image, audience, and optional scholarship details/]
    Announcement --> Audience[PROCESS: Preview authorized recipients]
    Audience --> Publish{DECISION: Confirm publication?}
    Publish -- No --> Announcement
    Publish -- Yes --> Published[/OUTPUT: Announcement and deduplicated notifications/]

    Task -- Generate report --> Filters[/INPUT: Search, status, location, scholarship, cycle, review, and stage filters/]
    Filters --> Preview[PROCESS: Generate authorized report preview]
    Preview --> Export[/OUTPUT: Download PDF or CSV/]

    Task -- Update profile or inbox --> Profile[PROCESS: Update permitted profile settings or open notifications]
    Profile --> ProfileOutput[/OUTPUT: Saved profile or opened related workflow/]

    RosterOutput --> Return((B))
    ScholarOutput --> Return
    AppBlocked --> Return
    AppOutput --> Return
    Published --> Return
    Export --> Return
    ProfileOutput --> Return
    Return --> Task
```

1. **Account setup:** An administrator creates the grantor Auth account, profile, classification, and initial location scope together. New grantors must change the temporary password.
2. **Dashboard:** The grantor sees counts, application activity, scholar status, scholarship performance, and recent records limited to its own account.
3. **Scholars:** The grantor views active, warning, and archived scholars; adds or edits permitted records; imports official rosters; invites eligible archived scholars back; and cannot alter another grantor's records.
4. **Applications:** The grantor searches and filters by status, location, scholarship, academic cycle, document-review state, and tracking stage. The grantor can review its own applications and advance only allowed workflow stages.
5. **Documents:** The grantor can view approved documents for its own applicants or scholars. Pending/rejected identity documents and unrelated student documents are not exposed.
6. **Announcements:** The grantor creates an image-backed informational announcement or scholarship offering, previews the immutable audience snapshot, publishes once, edits permitted content, archives, or republishes under server checks.
7. **Audience:** Targets include All Students, Scholarship Applicants, and Active Scholars, with optional application status, course, and year filters. Preview returns counts/snapshots, not unrestricted student data.
8. **Slots and waitlist:** The grantor configures slots. The system reserves and releases slots transactionally, sends low-slot notices, and manages waitlist offers.
9. **Reports:** The grantor generates preview-first PDF or CSV reports using only authorized applicant/scholar data and the active filters.
10. **Profile and Inbox:** The grantor updates permitted profile fields and custom application-form settings, reads workflow notifications, and changes the temporary password.

## 13. Administrator Portal Flow

```mermaid
flowchart TD
    Start([START: Administrator signs in]) --> Session[PROCESS: Verify account, role, permissions, and session]
    Session --> Allowed{DECISION: Session is valid and section is permitted?}
    Allowed -- No --> Denied[/OUTPUT: Access denied or administrator unlock required/]
    Allowed -- Yes --> Dashboard[/OUTPUT: Dashboard, pending work, counts, and alerts/]
    Dashboard --> Task{DECISION: Which administration task is selected?}

    Task -- Student Management --> Student[PROCESS: Review pending, active, archived, or document records]
    Student --> StudentDecision{DECISION: Account approval or document decision?}
    StudentDecision -- Account approval --> AccountOutput[/OUTPUT: Student activated or remains pending with reason/]
    StudentDecision -- Document decision --> DocumentOutput[/OUTPUT: Submission approved/rejected and student notified/]

    Task -- Grantor Management --> Grantor[/INPUT: Grantor profile, classification, and location scope/]
    Grantor --> GrantorCheck{DECISION: Account and scope are valid?}
    GrantorCheck -- No --> GrantorError[/OUTPUT: Show missing or invalid scope information/]
    GrantorCheck -- Yes --> GrantorOutput[/OUTPUT: Grantor created, updated, archived, or restored/]

    Task -- Scholarship Programs --> Scholarship[PROCESS: Review offerings, applications, tracking, slots, and roster conflicts]
    Scholarship --> ScholarshipOutput[/OUTPUT: Authorized decision, progress update, or resolved conflict/]

    Task -- Requirements --> Requirements[PROCESS: Review materials request or downloaded SOE]
    Requirements --> RequirementDecision{DECISION: Approve the request or signing record?}
    RequirementDecision -- No --> RequirementReject[/OUTPUT: Save rejection reason and notify student/]
    RequirementDecision -- Yes --> RequirementApprove[/OUTPUT: Release materials or confirm SOE signing/]

    Task -- Announcements --> Announcement[/INPUT: Announcement content, image, and audience/]
    Announcement --> AnnouncementPreview[PROCESS: Preview recipients]
    AnnouncementPreview --> AnnouncementOutput[/OUTPUT: Publish deduplicated announcement notifications/]

    Task -- Reports --> ReportChoice[/INPUT: Report type and filters/]
    ReportChoice --> ReportPreview[PROCESS: Generate report preview]
    ReportPreview --> ReportOutput[/OUTPUT: Export PDF or CSV/]

    Task -- Policy or Security --> Policy[/INPUT: Document policy, exception, or security setting/]
    Policy --> PolicyOutput[/OUTPUT: Save authorized policy and audit event/]

    AccountOutput --> Return((A))
    DocumentOutput --> Return
    GrantorError --> Return
    GrantorOutput --> Return
    ScholarshipOutput --> Return
    RequirementReject --> Return
    RequirementApprove --> Return
    AnnouncementOutput --> Return
    ReportOutput --> Return
    PolicyOutput --> Return
    Return --> Task
```

1. **Dashboard:** View system totals, pending work, trends, scholarship activity, and quick links.
2. **Student Management:**
   - review email-confirmed pending accounts and their signup COR, ROG, and identity documents;
   - approve accounts as a full administrator;
   - view active/archived student records;
   - run authorized Student ID correction;
   - open the Document Review queue and review current immutable submissions.
3. **Document Policy:** A full administrator controls COR/Advising Slip intake policy, Manual Document Review, and individual exceptions. Policy changes affect new submissions only.
4. **Grantor Management:** Create grantor accounts, set classification, enforce and edit approved municipalities, archive/reactivate accounts, and preserve Scholarship Office Managed scholars after grantor archival.
5. **Scholarship Programs:** Monitor offerings, applications, slots, commitments, application tracking, grantor decisions, roster assignments, archived records, and conflict resolution.
6. **Requirements:** Review material requests, approve or reject SOE/application-form release, verify downloaded SOE signing, and reopen an incorrect signed-SOE submission with a required reason.
7. **Announcements:** Create admin announcements with images, preview the selected audience, publish deduplicated notifications, and manage current/archived notices.
8. **Reports:** Preview and export PDF or CSV reports for students, grantors, scholarships, requirements, compliance, and informational recommendation scores.
9. **Security and Inbox:** Manage permitted account/security settings, receive system events, and access only sections granted by the admin permission set.

## 14. Location Scope Flow

```mermaid
flowchart TD
    Start([START: Admin creates or edits a grantor]) --> Classification[/INPUT: Grantor classification/]
    Classification --> Enforce{DECISION: Enforce a location scope?}
    Enforce -- No --> NoScope[/OUTPUT: Grantor has no municipality restriction/]
    Enforce -- Yes --> Scope[/INPUT: Scope name and approved municipalities/]
    Scope --> Valid{DECISION: At least one valid municipality selected?}
    Valid -- No --> ScopeError[/OUTPUT: Ask Admin to select a municipality/]
    ScopeError --> Retry((A)) --> Scope
    Valid -- Yes --> Save[PROCESS: Save grantor account and scope together]
    NoScope --> Publish((B))
    Save --> Publish
    Publish --> Offering[PROCESS: Grantor publishes a scholarship]
    Offering --> Apply[/INPUT: Student submits an application/]
    Apply --> Compare[PROCESS: Compare permanent municipality with active scope]
    Compare --> Inside{DECISION: Student lives inside the approved scope?}
    Inside -- No --> Block[/OUTPUT: Block application and explain the location rule/]
    Inside -- Yes --> Continue[/OUTPUT: Continue the remaining eligibility checks/]
    Continue --> End([END: Location check passed])
```

## 15. Archive, Rejection, Withdrawal, and Cooldown Flow

```mermaid
flowchart TD
    Start([START: Application or scholarship state changes]) --> State{DECISION: What changed?}
    State -- Application rejected --> Reject[PROCESS: Save the decision and a separate rejection cooldown]
    State -- Student withdrew --> Withdraw[PROCESS: Release slot, archive application, and set withdrawal cooldown]
    State -- Grantor account archived --> Keep[PROCESS: Keep the student's active scholarship]
    Keep --> Managed[/OUTPUT: Mark record Scholarship Office Managed/]
    Managed --> Restrict[/OUTPUT: Student cannot change or withdraw until the scholar record is archived/]
    State -- Individual scholar archived --> Archive[PROCESS: Preserve history and apply reapplication rules]
    Reject --> Cooldown[/OUTPUT: Matching Apply action stays disabled until eligible again/]
    Withdraw --> Cooldown
    Archive --> Invite{DECISION: Grantor sends an invitation to return?}
    Invite -- No --> EndArchive([END: Historical record remains archived])
    Invite -- Yes --> InviteOutput[/OUTPUT: Invitation appears in Student Inbox/]
    InviteOutput --> Response{DECISION: Student accepts the invitation?}
    Response -- Yes --> NewPath[PROCESS: Create an authorized application path]
    NewPath --> EndAccepted([END: Application workflow resumes])
    Response -- No --> Decline[PROCESS: Save rejection and notify grantor]
    Decline --> EndDeclined([END: Invitation closed])
```

## 16. Primary Portal Screens

### Student

- Dashboard
- Announcements and Announcement Details
- Inbox with Next Required Step
- Scholarships and application tracking
- Recommended Scholarships
- Profile and Document Vault
- Student Application Profile Form

The student History screen is intentionally not exposed in the current frontend. Immutable history and audit records remain in the backend for operational integrity.

### Grantor

- Dashboard
- Scholars
- Applications
- Announcements
- Inbox
- Profile and password change
- Report preview/export modals within the relevant workspaces

### Administrator

- Dashboard
- Inbox and Notifications
- Student Management: Pending Accounts, Document Review, active and archived records
- Grantor Management
- Scholarship Programs
- Requirements and SOE Checking
- Announcements
- Report Generation
- Admin Profile

## 17. Authority and Data Boundaries

1. The browser never decides approval, ownership, slots, scope, commitment, or final eligibility.
2. Student identity is derived from the authenticated session for student-owned operations.
3. Grantors are restricted to their own applications, scholars, announcements, scope, and reports.
4. Full-admin-only operations include student account approval and global document-policy changes.
5. Uploaded documents, profile photos, generated PDFs, signatures, recovery evidence, and signed SOEs use private Storage and authenticated content endpoints.
6. Profile revisions, document submissions, reviews, application snapshots, roster imports, and signed SOEs preserve immutable historical versions.
7. Important transitions use server-owned transactions or RPCs and create notifications and audit records only from committed state.
8. Direct public table mutation is not the source of authority for protected workflows.

## 18. Complete Operational Sequence

1. The admin configures academic-cycle settings, document policy, security policy, grantor accounts, and grantor location scopes.
2. A grantor signs in, changes the temporary password, completes its profile, and publishes scholarship offerings with images, rules, dates, documents, and slots.
3. A student creates an account by completing the COR-first document sequence and confirming email.
4. The full admin reviews the pending account and activates it. Signup document review remains separate from account approval.
5. The student signs in, uploads a profile photo, completes the in-system Student Application Profile, and maintains current-cycle COR, ROG, and identity submissions.
6. Documents are manually reviewed or system-approved according to the active policy. Rejections return to the student with a reason and a replacement path.
7. The student browses eligible announcements and recommendations. The backend enforces account, scope, GWA, document, cooldown, commitment, date, slot, and duplication rules.
8. An eligible application reserves a slot atomically. If no slot is available and waitlisting is enabled, the student enters the ordered queue.
9. Grantor and admin users review the application and complete only the stages they own. The Student Inbox always shows the current next required action.
10. When all preconditions are met, the student opens Request Materials. The server preflight explains every blocker before confirmation.
11. A successful material request commits the selected scholarship, closes competing applications, releases competing slots, and creates the SOE/application-form request.
12. The admin approves the requested materials. The student downloads them, obtains the Scholarship Office signature, and uploads the signed SOE.
13. The system stores the signed-SOE version and marks the scholarship cycle Finished. The next cycle restarts at document renewal.
14. Alternatively, a grantor may import an official roster. A unique match assigns or converts the scholarship immediately, while required document approval remains mandatory. Conflicts go to the admin.
15. Throughout the lifecycle, notifications, required actions, audit events, private files, immutable revisions, reports, slot changes, and archive/cooldown rules remain synchronized with the committed server state.
