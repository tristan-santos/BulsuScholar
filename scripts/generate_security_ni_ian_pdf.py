"""Create the evidence-based security Q&A requested for the thesis."""

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, SimpleDocTemplate, Spacer, TableStyle

from generate_duplicate_detection_verification_pdf import (
    ROOT, GREEN, BODY, HEADING, TITLE, SMALL, paragraph, table,
)


OUTPUT = ROOT / "docs/ThesisPaper/SecurityniIan.pdf"
BODY.fontSize = 10.5
BODY.leading = 14
BODY.spaceAfter = 7


def footer(canvas, document):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#c4d6cb"))
    canvas.line(19 * mm, 17 * mm, 191 * mm, 17 * mm)
    canvas.setFillColor(GREEN)
    canvas.setFont("Times-Roman", 9)
    canvas.drawString(19 * mm, 12 * mm, "BulsuScholar | Security Questions and Evidence | October 20, 2026")
    canvas.drawRightString(191 * mm, 12 * mm, f"Page {document.page}")
    canvas.restoreState()


def build_pdf():
    story = []

    def add(text, style=BODY):
        story.append(paragraph(text, style))

    def heading(text):
        add(text, HEADING)

    def page(title):
        story.append(PageBreak())
        heading(title)

    def qa(question, answer):
        add("<b>" + question + "</b><br/>" + answer)

    def evidence(text):
        add("<b>Evidence:</b> " + text, SMALL)

    def link(label, url):
        add(f'<a href="{url}" color="#075638"><u>{label}</u></a>', SMALL)

    add("BulsuScholar<br/>Security Questions and Answers", TITLE)
    add("Thesis Reference: Implemented Controls, Provider Services and Remaining Gaps", HEADING)
    add("<b>Checked on:</b> October 20, 2026 (Asia/Taipei). This report answers the requested "
        "questions using the current local source, read-only database metadata, public HTTPS "
        "checks, focused automated tests and official Supabase documentation.")
    add("<b>Important boundary:</b> This is a factual implementation review, not a penetration "
        "test, certification or guarantee that every endpoint is secure. Local source may differ "
        "from the deployed backend. No student documents, passwords, tokens or secret values "
        "were included in this report; no production settings were changed.")
    heading("How to Read the Labels")
    story.append(table(["Label", "Meaning"], [
        ("Implemented", "A control exists in the application code. Live confirmation is stated separately where available."),
        ("Provider-managed", "Supabase or the hosting provider supplies the feature; this is not custom security code written by the project."),
        ("Not implemented / Future improvement", "No complete project implementation was found for the stated control."),
        ("Not verified", "The setting or operational evidence was not available or not checked. This does not mean the feature is definitely disabled."),
    ], [54, 118]))
    story.append(Spacer(1, 3 * mm))
    heading("Confirmed Live, Without Reading Student Records")
    add("The connected BULSUScholar database has <b>64 public tables, all with RLS enabled</b>. "
        "No public-table grants to PUBLIC, anon or authenticated were returned. The "
        "<b>bulsuscholar bucket is private</b>, with a 10 MB bucket limit and no storage-object "
        "policies returned. The configured login-attempt limit is <b>3</b>. An aggregate check "
        "found no password, encryptedPassword, passwordHash or temporaryPassword keys in the "
        "student, pending-student, provider and admin account JSON rows.")
    add("Public checks found HTTP-to-HTTPS redirects for both the website and API. "
        "A focused local run passed <b>94 backend tests</b>; those tests do not establish that "
        "every production workflow, backup or recovery operation has been tested.")

    page("1. Authentication: Login, Passwords and Verification")
    heading("Implemented")
    qa("What handles authentication?", "The application uses <b>Supabase Auth together with "
       "custom FastAPI checks</b>. Supabase checks the password and issues login tokens. "
       "FastAPI checks the account type, account status, lockout state, identity and "
       "additional portal-session requirements. It is not a separate homemade password database.")
    qa("Does the application store passwords?", "The normal current account flow sends "
       "passwords to Supabase Auth, not to a password field in student or grantor records. "
       "The backend temporarily receives passwords during login or administrator-created "
       "account setup. The live aggregate check found zero listed password fields in the "
       "four account tables checked. Recovery records do keep a snapshot of the provider's "
       "password hash to check that a reset changed it; this is not a readable password "
       "or a separate login database. A legacy grantor-password migration script also "
       "exists; it is not the current password-storage design.")
    qa("Must students confirm email before activation?", "<b>Yes.</b> The confirmation "
       "workflow checks the authenticated user's confirmed email and matching student identity. "
       "With Manual Account Review enabled, the account remains pending until full-admin "
       "approval. In automatic mode it activates only when the required signup documents "
       "are ready. Grantor/admin accounts created by authorized staff may be marked "
       "email-confirmed through the administrative Auth API, so this is not the same "
       "email-link process for every role.")
    qa("Is there failed-login lockout?", "<b>Yes, for the normal student, grantor and admin "
       "login route.</b> The current database limit is 3 failed attempts; a full admin may "
       "set it from 3 to 10. Failures increase a database counter. Reaching the limit locks "
       "the account and revokes Auth sessions. Backend checks also reject remaining tokens "
       "for a locked account. A successful login resets the counter only if the account "
       "is not already locked. There is no normal fixed-time automatic unlock: students "
       "and grantors use verified recovery, while locked admins can be unblocked by Root.")
    heading("Provider-managed")
    add("Supabase Auth stores passwords as salted <b>bcrypt hashes</b>, not readable "
        "passwords. Hashing is different from reversible encryption. Provider password "
        "rules and Auth settings are managed in Supabase; do not claim that optional "
        "leaked-password protection is enabled without checking its dashboard setting. [W1]")
    heading("Not Implemented / Not Verified")
    add("The separate Root password-login route does not call the normal portal failed-login "
        "counter. Its additional code has a separate attempt limit, described on the next "
        "page. Do not claim identical lockout behavior across both login routes.")
    evidence("backend/auth_service.py:136, 205-289, 419; backend/student_lifecycle_service.py:34; "
             "backend/signup_service.py:341; src/pages/SignupPage.jsx:1610; [D1, D2]")

    page("1. Authentication: OTP, Sessions and Account Recovery")
    heading("Implemented")
    qa("Is MFA or OTP used?", "<b>A conditional email-code step is implemented.</b> Students "
       "and grantors need a six-digit email code after at least 30 days without recorded "
       "meaningful activity, unless a recovery grace period applies. It is not required "
       "at every login and is not applied to ordinary administrators by this rule. "
       "Codes expire in 10 minutes; the checks allow 3 wrong attempts, a 60-second resend "
       "delay and at most 5 issued challenges in an hour. Code hashes use HMAC-SHA256, "
       "with a server-only secret. This is a custom email verification step, not proof "
       "of Supabase authenticator-app MFA enrollment.")
    qa("What extra check does Root Admin use?", "Root signs in through Supabase Auth and "
       "then enters a configured 10-digit login code. The application compares keyed "
       "hashes, limits wrong code attempts to 5, and locks code entry for 15 minutes. "
       "Successful verification creates an additional Root session lasting 8 hours. "
       "This configured login code is <b>not an emailed OTP or a time-changing authenticator code</b>.")
    qa("Is password reset/account recovery available?", "<b>Yes, for students and grantors.</b> "
       "The backend requests a Supabase reset email and binds it to a hashed recovery "
       "challenge. The password is changed through Supabase, and backend completion "
       "checks the challenge and changed password before clearing the lock. The challenge "
       "has a 30-minute validity in the database implementation. Unknown or ineligible "
       "requests receive a generic response. Lost-email recovery also has private support "
       "tickets, evidence attachments and Root review; administrative recovery follows "
       "separate staff/Root controls.")
    qa("How are authenticated sessions handled?", "The browser uses a Supabase session "
       "with a JWT access token and refresh token. The SDK persists the session in browser "
       "storage and normally refreshes tokens; callback pages handle their own confirmation "
       "or recovery flow. API calls send Authorization: Bearer tokens. Protected backend "
       "checks resolve the user through Supabase and validate an extra database "
       "portal_verified_sessions record, account lock state and relevant revocation "
       "timestamps. Changing a browser role/ID label alone does not grant access. Root "
       "also sends an X-Root-Session token; its hash is stored on the server.")
    heading("Provider-managed")
    add("Supabase issues and validates its Auth tokens and supports password-recovery "
        "sessions. Brevo delivers the application's email codes when configured. The "
        "project's extra access and verification rules remain its own responsibility.")
    heading("Not Implemented / Future Improvement")
    add("No application integration for TOTP authenticator apps, passkeys or hardware "
        "security keys was found. The current browser session is not an HttpOnly-cookie "
        "session design; tokens in browser storage require strong protection against "
        "malicious scripts. Do not describe email verification as mandatory MFA for all users.")
    evidence("backend/auth_service.py:115-201, 292-411; backend/access_control.py:72; "
             "backend/root_service.py:232-323; src/services/supabaseClient.js; "
             "src/services/rootService.js; [D1, D2]")

    page("2. Role Permissions and Authorization")
    heading("Implemented")
    qa("Which roles exist?", "The main account types are <b>Student, Grantor/Provider, "
       "Administrator and Root Admin</b>. Administrator subroles are full_admin, "
       "student_reviewer, grantor_manager and reports_viewer. ISPS Coordinator describes "
       "an office responsibility; no separate coordinator account type was found. "
       "The assigned administrator role determines that person's system access.")
    story.append(table(["Administrator Subrole", "Permission Groups"], [
        ("Full admin", "Students, grantors, scholarships, requirements, announcements and reports."),
        ("Student reviewer", "Students and requirements; not full-admin Pending Account approval."),
        ("Grantor manager", "Grantors, scholarships and announcements."),
        ("Reports viewer", "Reports."),
    ], [51, 121]))
    story.append(Spacer(1, 3 * mm))
    qa("Are permissions only enforced on the screen?", "<b>No.</b> FastAPI checks bearer "
       "authentication, the stored account/Auth-user relationship, allowed roles, "
       "permissions and ownership. Sensitive endpoints add specific full-admin or reviewer "
       "checks. The database also restricts direct access and protects selected records "
       "through grants, privileged functions, transactions and triggers.")
    qa("Can a student open another student's records or files?", "The inspected protected "
       "profile, application and document routes restrict students to their own records "
       "and compare the saved document owner with the authenticated student. A changed "
       "URL or browser ID is not intended to bypass those checks. Some non-private "
       "reference information is shared; student-visible roster summaries contain "
       "grantor/archive metadata, not the other scholars' full records.")
    qa("Can grantors see only authorized applications?", "Grantor records are scoped to "
       "their grantor ID. Related student information is limited to students linked "
       "through that grantor's applications or roster. Document access adds relationship "
       "and, for ordinary submissions, approval checks. Signed SOE access uses the "
       "separate student/authorized-admin routes inspected.")
    heading("Provider-managed and Live Database Controls")
    add("PostgreSQL/Supabase supplies Row Level Security (RLS). The live read-only check "
        "found RLS enabled on all <b>64 public tables</b>, and no public-table grants to "
        "PUBLIC, anon or authenticated. Application tables include students, applications, "
        "document metadata/reviews, login state and history. Backend service-role access "
        "can bypass RLS, so server ownership checks are essential, not optional. [W3]")
    heading("Not Verified / Future Improvement")
    add("This review does not prove every route is free of cross-account access errors. "
        "Maintain negative authorization tests and regularly review new endpoints and grants.")
    evidence("backend/access_control.py:117-210; backend/portal_data_service.py:24-155; "
             "backend/root_service.py:941; backend/student_profile_service.py:75, 1112-1170; "
             "live metadata SELECTs on October 20, 2026")

    page("3. Sensitive Student Records")
    heading("Implemented")
    qa("What sensitive information is stored?", "The inspected profile and document flows "
       "store Student ID, name, birthdate, email, phone, permanent address, guardian name "
       "and contact, college/course, year/section, grades/GWA, profile photos and signatures. "
       "They also store COR/ROG/identity documents, profile PDFs, scholarship applications, "
       "review results, commitments, SOE records and support/recovery evidence. Security "
       "records can contain Auth-user references, timestamps, Root IP addresses and user-agent "
       "information. Uploaded files may contain more details than the form fields listed here.")
    qa("Is HTTPS/TLS used in transit?", "<b>Yes for the public website and API checked.</b> "
       "On October 20, 2026, http://bulsuscholar.com returned a 308 redirect to HTTPS; "
       "http://api.bulsuscholar.com/health returned a 301 redirect to HTTPS. Both HTTPS "
       "requests returned 200. The website returned an HSTS header with max-age=63072000. "
       "The API health response did not return an HSTS header. This confirms those "
       "public routes, not every possible network connection.")
    qa("Who can view or change records?", "Students can use their own profile and upload "
       "workflows. Some fields are locked or derived from validated documents, so students "
       "cannot freely overwrite every academic/contact field. Authorized grantors see "
       "related applicants and perform permitted scholarship actions. Full admins and "
       "specialized reviewers/managers act within their assigned permissions. Root has "
       "privileged management and inspection functions. Record access is not intended "
       "to be available to all signed-in users.")
    heading("Provider-managed")
    qa("Does the provider encrypt stored data?", "Supabase states that hosted customer "
       "data is encrypted at rest using AES-256 and in transit using TLS. This is "
       "<b>provider-managed encryption</b>, not encryption implemented by the BulsuScholar "
       "team. It does not replace role permissions or private file access. [W2]")
    heading("Not Implemented / Not Verified")
    qa("Does our app separately encrypt sensitive fields?", "No current separate "
       "field-by-field encryption layer was found for names, addresses, grades or "
       "uploaded student documents. Application code and authorized database/service "
       "access can read these values. OTP/recovery token hashes protect verification "
       "secrets, but hashing those secrets is not encryption of student information.")
    add("Direct PostgreSQL TLS/SSL-enforcement settings and production key-rotation "
        "procedures were not verified. The example database configuration recommends "
        "sslmode=require; that recommendation alone is not proof of the live connection setting.")
    evidence("backend/student_profile_service.py:50-61, 366-400, 847-859; "
             "backend/root_service.py:220-231; .env.example:58; public HTTP/HTTPS checks; [W2]")

    page("4. Uploaded Documents")
    heading("Implemented")
    qa("Where are documents stored? Are they public?", "Document bytes are stored in "
       "<b>Supabase Storage</b>, normally in the bulsuscholar bucket. Database tables store "
       "the bucket/path, submission, revision, review and ownership information. The live "
       "bucket is <b>private</b> with a 10 MB limit. Signup files use pending-signup paths; "
       "active documents use student/cycle paths; signed SOE uses student/application paths.")
    qa("How is another student's file blocked?", "The main protected download/preview "
       "endpoints authenticate the caller, check their role, compare student ownership or "
       "the grantor/application relationship, and then read the saved Storage reference "
       "using backend credentials. Knowing a submission ID or path alone is not enough "
       "for those endpoints. Supabase also blocks unauthenticated access to private objects.")
    qa("Are signed URLs used?", "The inspected student-document and signed-SOE flows "
       "mainly use <b>authenticated backend content endpoints</b>, not temporary signed "
       "Storage URLs. The browser can turn the returned file into a temporary blob URL "
       "for the preview. A blob URL is not a signed Supabase URL. Do not claim all "
       "documents are protected through signed URLs.")
    qa("Which upload checks exist?", "The main backend upload routes check allowed file "
       "types, non-empty bodies, size and owner identity. COR/ROG uploads must be PDFs "
       "and pass the existing document parser and academic-policy checks. Other supported "
       "document/identity routes accept PDF, PNG, JPEG or WebP as applicable, up to 10 MB; "
       "profile photos use a 5 MB limit. Signed SOE accepts PDF/PNG/JPEG up to 10 MB. "
       "Paths are generated from the authenticated student/application. Some application "
       "file references also check HTTPS, the Supabase host and the student's path.")
    heading("Provider-managed")
    add("Supabase provides private object storage and access controls. The bucket's live "
        "object-policy query returned no policies. Service-role reads bypass normal RLS "
        "rules, making the backend's authorization checks important. [W3]")
    heading("Not Implemented / Future Improvement")
    qa("Is malware/virus scanning implemented?", "<b>No dedicated antivirus or malware "
       "scanner integration was found.</b> Reading COR/ROG text and checking a document's "
       "format is not a virus scan. File-type declarations alone do not prove a file is safe.")
    qa("Is there a deletion/retention policy?", "The code preserves submission versions "
       "and history, and has selected failed-upload cleanup and support-attachment "
       "deletion paths. No complete timed student-document retention/purge policy or "
       "scheduled cleanup of every abandoned signup file was verified. Older helpers "
       "still use direct Storage/public-URL patterns: do not treat them as private "
       "access controls or rerun the old permissive storage-policies.sql file.")
    evidence("backend/student_profile_service.py:246-299, 882-940, 1112-1195; "
             "backend/security_history_service.py:105-163, 236; backend/signup_service.py:46-49; "
             "backend/scholarship_choice_service.py:169; [D3]")

    page("5. Logs and Audit Records")
    heading("Implemented")
    qa("Which logs actually exist?", "There are several kinds, not one universal log:")
    log_table = table(["Record / Table", "What It Records"], [
        ("login_security_state", "Failed-attempt count, latest success/failure, lock/unlock state and related activity timestamps. This is mainly current state, not one saved row per login attempt."),
        ("systemLogs", "Workflow/system events such as selected account, document, scholarship and notification actions, with timestamps and actor information when supplied."),
        ("root_audit_logs", "Root actions, actor, target, details, time, IP/user agent; includes code verification, admin management and privileged operations."),
        ("student_document_reviews / signup_account_decisions", "Document preview/review actions and signup decisions, with reviewer/admin or system actor and times."),
        ("student_history_events", "Student-safe application, document, roster, tracking, commitment and waitlist timeline events."),
        ("signed_soe_audit_events / public_recovery_audit_events / waitlist audit events", "Dedicated events for signed-SOE changes, lost-email recovery and queue/offer actions."),
    ], [66, 106])
    log_table.setStyle(TableStyle([
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(log_table)
    story.append(Spacer(1, 3 * mm))
    qa("Who can read them?", "Root has system/audit log inspection. Full-admin access is "
       "required for the general systemLogs compatibility query. Students can read their "
       "own safe history, not staff-only notes or other students' histories. Dedicated "
       "review and workflow endpoints use their own role/permission rules.")
    qa("Do logs show who changed something and when?", "<b>For supported actions, yes.</b> "
       "Examples include account decisions, document reviews and Root actions. Root audit "
       "and selected history/audit tables have database triggers preventing ordinary "
       "updates or deletion. This is not a complete before-and-after audit of every "
       "database field, and not every history event records a human actor.")
    heading("Provider-managed")
    add("Supabase and the hosting services also have operational/Auth logs. Their "
        "availability and retention depend on provider settings and plan; these were "
        "not checked in the provider dashboards.")
    heading("Not Implemented / Future Improvement")
    qa("How long are logs kept?", "No complete time-based retention policy was found "
       "for security, document or scholarship audit logs. Root has a manual cleanup "
       "action for request metrics older than 90 days; this does <b>not</b> mean all audit "
       "logs are automatically deleted after 90 days. A full per-attempt login event "
       "trail and a consistent audit of every record change remain improvements.")
    evidence("backend/supabase_ops.py:768; backend/root_service.py:220, 774, 1074; "
             "backend/portal_data_service.py:41; backend/security_history_service.py:83; "
             "[D2, D4, D5]")

    page("6. Backups and Recovery")
    heading("Implemented by the Project")
    qa("Does the project have a backup tool?", "<b>A manual Storage backup script exists.</b> "
       "scripts/backup-supabase-storage.mjs downloads bucket objects to a folder outside "
       "the repository and writes a manifest with object paths, sizes and SHA-256 "
       "checksums. A September 2026 cutover note records that a manual Storage backup "
       "was made. That historical note does not prove a recent backup still exists "
       "or can be restored today.")
    qa("Is database backup automatic or manual?", "The repository includes deployment "
       "instructions to confirm a database restore point and separately copy Storage. "
       "<b>No project-maintained automated database-backup schedule was found.</b> "
       "No complete automated Storage-backup schedule or verified full restore tool "
       "was established by this review.")
    heading("Provider-managed")
    qa("Does Supabase offer automatic backups?", "Yes. Supabase documents daily database "
       "backups for paid Pro, Team and Enterprise projects; availability and retention "
       "depend on the plan. Free projects should keep their own exports. This provider "
       "capability is not evidence of this project's current backup status. [W4]")
    qa("Is point-in-time recovery enabled?", "<b>Not verified.</b> PITR is a Supabase "
       "feature/add-on. The repository and the read-only metadata checks do not establish "
       "whether it is enabled or what restore points are available. Check Database > "
       "Backups and the relevant project add-on settings before making a thesis claim. [W4]")
    qa("Are uploaded files included in database backups?", "<b>No.</b> Supabase database "
       "backups include Storage metadata, not the actual uploaded file bytes. COR, ROG, "
       "IDs, signatures and SOE files require a separate Storage backup. A database-only "
       "restore cannot recreate a deleted file's contents. [W4]")
    heading("Not Implemented / Not Verified")
    qa("Has a restore/recovery process been tested?", "No documented, independently "
       "verified end-to-end database plus Storage restore was found or run in this review. "
       "Password recovery tests and academic-cycle snapshots are not disaster-recovery "
       "tests. The actual backup plan, recent backup success, storage-copy availability, "
       "recovery-time target and acceptable data-loss target remain unverified.")
    add("<b>Safe thesis statement:</b> The project includes a manual Storage backup tool "
        "and deployment guidance for database backups. Scheduled backup configuration, "
        "PITR enablement and a successful full restore have not been demonstrated and "
        "must not be claimed as completed project controls.")
    evidence("scripts/backup-supabase-storage.mjs; docs/deployment/SecurityCutoverStatus.md "
             "(historical September note); docs/deployment/DeploymentChecklist.md:34-40, 288; [W4]")

    page("7. Other Security Controls")
    heading("Implemented")
    qa("Are secrets kept in environment variables?", "The backend reads service-role, "
       "email-provider, database and session/code secrets from environment variables. "
       ".env files are excluded by .gitignore and .dockerignore. The browser uses the "
       "Supabase URL and public anon key; these are not equivalent to the private "
       "service-role key. Never place private secrets in VITE_ variables, which are "
       "included in browser builds. This review does not certify all Git history or "
       "hosting environments as free of secret exposure.")
    qa("Is HTTPS enforced on deployment?", "Both tested public HTTP URLs redirected to "
       "HTTPS. TLS termination is supplied by the hosting layer, not FastAPI's CORS "
       "middleware. The website had HSTS; the API health response did not. Adding or "
       "verifying API HSTS and direct-database TLS enforcement remains a hardening task.")
    qa("Is rate limiting implemented?", "<b>Some action-specific limits exist, not a "
       "complete global API limit.</b> Examples are account lockout, Root code limits, "
       "email-code expiry/attempt/resend/hourly limits and a five-minute signup-confirmation "
       "resend cooldown. Signup availability checks allow 30 requests per 60 seconds "
       "per requester key, using process memory. That counter is not shared across "
       "server instances and resets on restart; it is not distributed abuse protection.")
    qa("Are CORS restrictions configured?", "Yes. FastAPI allows a list including the "
       "production frontend and local development origins, plus configured additional "
       "origins and an optional regex. It is not a blanket wildcard-origin policy by "
       "default. Credentials are allowed. The actual deployed extra origins/regex were "
       "not checked. CORS limits browser cross-origin behavior; it does not authenticate "
       "users or block all non-browser requests.")
    qa("How is SQL injection risk reduced?", "Normal workflows use structured Supabase "
       "REST/RPC calls and fixed/allow-listed tables rather than accepting ordinary "
       "users' raw SQL. Database functions use typed parameters. Root has an exceptional "
       "privileged query tool with SELECT/EXPLAIN restrictions, a read-only transaction, "
       "statement timeout and row limit. These controls reduce risk but do not prove "
       "all SQL/filter injection is impossible.")
    add("<b>Other controls:</b> sensitive-field redaction on compatibility responses, "
        "server ownership/path checks, disabled/pending-account restrictions, "
        "session revocation, immutable selected audit rows, database transactions and "
        "locks for critical workflows, and maintenance-mode gating.")
    heading("Provider-managed / Future Improvement")
    add("Supabase supplies Auth and database security primitives; hosting supplies the "
        "observed HTTPS redirects. A verified project-wide API rate limiter, CAPTCHA "
        "integration, uniform field-level encryption and a complete documented "
        "disaster-recovery/retention program were not established. Provider WAF, "
        "network restrictions and optional Auth hardening settings remain unverified.")
    evidence("backend/main.py:270-350; backend/signup_service.py:49-54, 391-399; "
             "backend/auth_service.py; backend/root_service.py:738-770; "
             "backend/student_account_review_service.py:36; .gitignore; .dockerignore")

    page("Evidence, Source References and Remaining Checks")
    heading("Local Automated Verification")
    add("A focused run passed <b>94 tests</b> across test_auth_service, test_access_control, "
        "test_portal_data_service, test_security_history_service, test_student_profile_service, "
        "test_signup_confirmation, test_student_activation_service and test_root_service. "
        "These include mocked services; they are not a live malicious-user test or "
        "a proof of successful backup restoration.")
    heading("Database Definitions Referenced")
    for label, name in [
        ("D1", "20260918130000_automatic_roster_and_login_security.sql"),
        ("D2", "20260924125213_security_history_signed_soe.sql"),
        ("D3", "20260922170000_revoke_unsafe_direct_access.sql"),
        ("D4", "20260925103000_complete_student_history_ledger.sql"),
        ("D5", "20260912100000_secure_root_administration.sql"),
    ]:
        add(f"<b>{label}:</b> supabase/migrations/{name}", SMALL)
    add("Document metadata/review protections are also defined in "
        "20260923120000_student_profile_document_verification.sql. Later migrations "
        "extend these workflows. Code and migration references identify the implementation; "
        "their presence alone is not proof that every local definition is deployed.", SMALL)
    heading("Official Provider Sources (Checked October 20, 2026)")
    link("W1. Supabase Auth - Password Security (bcrypt hashes)", "https://supabase.com/docs/guides/auth/password-security")
    link("W2. Security at Supabase (hosted encryption and TLS)", "https://supabase.com/security")
    link("W3. Supabase Storage Access Control (including service-role bypass)", "https://supabase.com/docs/guides/storage/security/access-control")
    link("W4. Supabase Database Backups (plan dependence, PITR and Storage exclusion)", "https://supabase.com/docs/guides/platform/backups")
    heading("What Still Needs Operational Evidence")
    add("Confirm the actual backup plan and PITR setting, record a recent database backup "
        "and separate Storage copy, and test a restore on a nonproduction project. "
        "Approve document/log retention periods and deletion responsibilities. Record "
        "the deployed backend version, complete cross-account browser/API checks, and "
        "verify production CORS, private-file routes and direct database TLS settings.")
    heading("Short Word Guide")
    add("<b>Authentication:</b> proving who is signing in. <b>Authorization:</b> deciding "
        "which records/actions that person may access. <b>JWT:</b> a signed login token. "
        "<b>OTP:</b> a one-time code. <b>RLS:</b> database rules for row access. "
        "<b>TLS/HTTPS:</b> protection while data travels. <b>Encryption at rest:</b> "
        "protection of stored data. <b>Hash:</b> a one-way value used for comparison. "
        "<b>PITR:</b> restoring a database to a selected earlier time. "
        "<b>HSTS:</b> a browser instruction to use HTTPS. <b>Service role:</b> a powerful "
        "backend credential that must not be exposed to the browser.")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT), pagesize=A4, leftMargin=19 * mm, rightMargin=19 * mm,
        topMargin=17 * mm, bottomMargin=23 * mm,
        title="BulsuScholar Security Questions and Answers - SecurityniIan",
        author="BulsuScholar", subject="Implemented, provider-managed and unverified security controls",
    )
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(OUTPUT)


if __name__ == "__main__":
    build_pdf()
