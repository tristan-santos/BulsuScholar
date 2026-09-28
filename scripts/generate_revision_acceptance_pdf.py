from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "BulsuScholar_Revision_Implementation_and_Test_Guide.pdf"

GREEN = colors.HexColor("#006B3C")
DARK_GREEN = colors.HexColor("#123C2C")
PALE_GREEN = colors.HexColor("#EAF6F0")
INK = colors.HexColor("#17242A")
MUTED = colors.HexColor("#5E6D75")
LINE = colors.HexColor("#CAD8D1")
AMBER = colors.HexColor("#A65A00")
PALE_AMBER = colors.HexColor("#FFF4E5")
RED = colors.HexColor("#B42318")
PALE_RED = colors.HexColor("#FDECEA")
PALE_GRAY = colors.HexColor("#F5F7F6")


class NumberedCanvasMixin:
    pass


class SectionRule(Flowable):
    def __init__(self, width, color=GREEN, thickness=1.2):
        super().__init__()
        self.width = width
        self.height = 5
        self.color = color
        self.thickness = thickness

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, 3, self.width, 3)


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="CoverTitle", parent=styles["Title"], fontName="Helvetica-Bold",
    fontSize=25, leading=30, textColor=DARK_GREEN, alignment=TA_LEFT,
    spaceAfter=10,
))
styles.add(ParagraphStyle(
    name="CoverSubtitle", parent=styles["Normal"], fontName="Helvetica",
    fontSize=12, leading=18, textColor=MUTED, spaceAfter=8,
))
styles.add(ParagraphStyle(
    name="H1Custom", parent=styles["Heading1"], fontName="Helvetica-Bold",
    fontSize=18, leading=22, textColor=DARK_GREEN, spaceBefore=4, spaceAfter=8,
))
styles.add(ParagraphStyle(
    name="H2Custom", parent=styles["Heading2"], fontName="Helvetica-Bold",
    fontSize=13.5, leading=17, textColor=GREEN, spaceBefore=10, spaceAfter=5,
))
styles.add(ParagraphStyle(
    name="H3Custom", parent=styles["Heading3"], fontName="Helvetica-Bold",
    fontSize=11, leading=14, textColor=INK, spaceBefore=7, spaceAfter=3,
))
styles.add(ParagraphStyle(
    name="BodyCustom", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=9.3, leading=13.3, textColor=INK, spaceAfter=5,
))
styles.add(ParagraphStyle(
    name="SmallCustom", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=7.8, leading=10.5, textColor=MUTED,
))
styles.add(ParagraphStyle(
    name="BulletCustom", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=9.1, leading=12.8, textColor=INK, leftIndent=13,
    firstLineIndent=-7, bulletIndent=3, spaceAfter=3,
))
styles.add(ParagraphStyle(
    name="FlowText", parent=styles["Code"], fontName="Courier",
    fontSize=8.1, leading=11, textColor=INK, leftIndent=4, rightIndent=4,
))
styles.add(ParagraphStyle(
    name="TableHead", parent=styles["BodyText"], fontName="Helvetica-Bold",
    fontSize=8.2, leading=10, textColor=colors.white, alignment=TA_LEFT,
))
styles.add(ParagraphStyle(
    name="TableBody", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=7.8, leading=10.2, textColor=INK,
))
styles.add(ParagraphStyle(
    name="Check", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=9, leading=12.5, textColor=INK, leftIndent=15,
    firstLineIndent=-15, spaceAfter=3,
))


def para(text, style="BodyCustom"):
    return Paragraph(text, styles[style])


def bullet(text):
    return Paragraph(f"- {text}", styles["BulletCustom"])


def checklist(text):
    return Paragraph(f"[  ] {text}", styles["Check"])


def callout(title, text, tone="green"):
    palette = {
        "green": (PALE_GREEN, GREEN),
        "amber": (PALE_AMBER, AMBER),
        "red": (PALE_RED, RED),
        "gray": (PALE_GRAY, MUTED),
    }
    background, border = palette[tone]
    content = para(f"<b>{escape(title)}</b><br/>{escape(text)}", "BodyCustom")
    table = Table([[content]], colWidths=[176 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), background),
        ("BOX", (0, 0), (-1, -1), 1, border),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return table


def flowchart(title, lines):
    rows = [[para(title, "TableHead")]]
    for index, line in enumerate(lines):
        if index:
            rows.append([para("|<br/>v", "FlowText")])
        tone = PALE_AMBER if line.startswith("DECISION:") else colors.white
        rows.append([Table(
            [[para(escape(line), "FlowText")]],
            colWidths=[158 * mm],
            style=TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), tone),
                ("BOX", (0, 0), (-1, -1), 0.8, AMBER if line.startswith("DECISION:") else LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]),
        )])
    outer = Table(rows, colWidths=[176 * mm])
    outer.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), GREEN),
        ("BOX", (0, 0), (-1, -1), 1, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ALIGN", (0, 1), (-1, -1), "CENTER"),
    ]))
    return KeepTogether([outer, Spacer(1, 5 * mm)])


def matrix(headers, rows, widths):
    data = [[para(escape(cell), "TableHead") for cell in headers]]
    for row in rows:
        data.append([para(escape(str(cell)), "TableBody") for cell in row])
    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), GREEN),
        ("GRID", (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PALE_GRAY]),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def section_header(story, title):
    story.append(para(title, "H1Custom"))
    story.append(SectionRule(176 * mm))
    story.append(Spacer(1, 3 * mm))


def test_scenario(story, code, title, preconditions, steps, expected):
    story.append(para(f"{code} - {escape(title)}", "H3Custom"))
    content = [
        para(f"<b>Preconditions:</b> {escape(preconditions)}", "BodyCustom"),
        para("<b>Steps:</b>", "BodyCustom"),
    ]
    content.extend(Paragraph(f"{index}. {escape(step)}", styles["BulletCustom"]) for index, step in enumerate(steps, 1))
    content.append(para(f"<b>Expected result:</b> {escape(expected)}", "BodyCustom"))
    table = Table([[content]], colWidths=[176 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.8, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.extend([table, Spacer(1, 3 * mm)])


def page_frame(canvas, doc):
    canvas.saveState()
    width, height = A4
    if doc.page > 1:
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.5)
        canvas.line(18 * mm, height - 15 * mm, width - 18 * mm, height - 15 * mm)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(18 * mm, height - 11.5 * mm, "BulsuScholar Revision Implementation and Test Guide")
        canvas.drawRightString(width - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build_story():
    story = []
    story.extend([
        Spacer(1, 28 * mm),
        para("BulsuScholar", "CoverSubtitle"),
        para("Revised System Implementation and Acceptance Guide", "CoverTitle"),
        SectionRule(176 * mm, GREEN, 2.2),
        Spacer(1, 8 * mm),
        para("Coverage: SemiFinalRevisions Numbers 1, 4, 5, 6, 7, 8, 9, and 10", "CoverSubtitle"),
        para("Prepared from the implementation register and production deployment checklist", "CoverSubtitle"),
        Spacer(1, 18 * mm),
        callout(
            "Current release status",
            "Implemented and locally verified, but not yet production-complete. Keep Maintenance Mode enabled until database, Auth, email, Storage, cron, role, and production smoke-test gates pass.",
            "amber",
        ),
        Spacer(1, 10 * mm),
        para("Prepared: September 28, 2026", "BodyCustom"),
        para("Named acceptance testers: Johnvher (Admin), Veejay (Grantor), Emmerson (Student)", "BodyCustom"),
        Spacer(1, 28 * mm),
        para("Source documents", "H3Custom"),
        bullet("docs/SemiFinalRevisions.md"),
        bullet("docs/deployment/DeploymentChecklist.md"),
        bullet("docs/UIReleaseAudit.md"),
        PageBreak(),
    ])

    section_header(story, "1. Executive Summary: What Changed")
    story.append(para(
        "The revision moves sensitive decisions from browser-side table access to authenticated backend workflows. It also adds manual account approval, reusable student profile revisions, document review, authoritative roster assignment, grantor scope, targeted announcements, FIFO waitlists, inactivity email verification, private recovery, student history, Signed SOE submission, and formal release gates.",
    ))
    story.append(matrix(
        ["No.", "Area", "Main change", "Current status"],
        [
            ["1", "Security and accounts", "Restricted direct data access; backend login, lockout/recovery, pending signup approval, role ownership checks.", "Implemented locally; production/staging role tests remain."],
            ["4", "Profile and documents", "Editable signed profile revisions, private versioned documents, independent review, COR policy, first-year first-semester ROG exemption.", "Implemented locally; private Storage and live review need staging."],
            ["5", "Scholarship and roster", "Server preview/commit import, exact scholarship matching, atomic roster conversion/conflict handling, protected Request Materials.", "Implemented locally; transaction/concurrency tests remain."],
            ["6", "Scope and reports", "Grantor classification/location scope, filtered reports, audit records, student-number correction.", "Implemented; official point formula remains blocked."],
            ["7", "Announcements and waitlist", "Audience preview, deduplicated notices, global FIFO queue, 24-hour offers, cron expiry.", "Implemented; Railway cron and live queue tests remain."],
            ["8", "OTP and sessions", "30-day inactivity email verification, verified sessions, cross-tab identity, lost-email recovery conversation.", "Implemented; live Brevo/Auth/session tests remain."],
            ["9", "History and Signed SOE", "Append-only student history; Signed SOE upload before Finish; admin reason-required reopen.", "Implemented; private upload and cycle tests remain."],
            ["10", "Release acceptance", "UI audit, automated checks, deployment order, smoke-test and rollback gates.", "Local checks pass; production acceptance is blocked."],
        ],
        [10 * mm, 31 * mm, 91 * mm, 44 * mm],
    ))
    story.append(Spacer(1, 5 * mm))
    story.append(callout(
        "Important policy limitation",
        "The recommendation score is informational and is labelled Recommendation Score - Not Official Ranking. The official scholarship point formula has not been supplied and must not be treated as implemented.",
        "red",
    ))

    section_header(story, "2. What Was Implemented")
    implementation_sections = [
        ("Number 1 - Security, approval, and authentication", [
            "Revoked broad direct access to sensitive tables and private Storage; legacy reads use authenticated portal compatibility endpoints with role and ownership filtering.",
            "New signups remain pending after email confirmation when manual approval applies. Full admins accept or reject; pending users cannot start an active portal session.",
            "Unified backend login records failed attempts, locks accounts at the configured limit, resets failures after successful recovery, and keeps administrator unlock under root control.",
            "Student/grantor password recovery resolves email server-side and returns generic responses. Grantor Auth migration tooling exists and the validated production grantor migration was reported complete.",
            "Signed-SOE access now requires Requirements permission or full-admin authority.",
        ]),
        ("Number 4 - Student profile and document verification", [
            "Students edit a reusable master profile draft, save it, sign each submitted revision, preview/export the official PDF, and retain immutable revision history.",
            "Permanent address is required; current address is optional. Scholarship-owned grantor fields are populated from the selected application and are not student-editable.",
            "COR, ROG, identity, profile, signatures, decisions, and generated PDFs are versioned and private. Rejected documents retain the earlier version and require a correction reason.",
            "First-year, first-semester students are automatically exempt from ROG without a fake approval record. ROG becomes required in later semesters or years.",
            "Document Review allows full admins and student reviewers to approve or reject submissions independently from account approval. A failed earlier requirement pauses later tracking and a corrected approval restores preserved progress.",
        ]),
        ("Number 5 - Scholarship and roster workflow", [
            "Grantor/admin roster imports use Preview then Commit. The backend validates ownership, exact recognized scholarship, duplicates, account matches, identity mismatches, commitments, and active-roster conflicts.",
            "A matching ordinary application is converted in place, preserving its ID, tracking, documents, and history while releasing its public slot.",
            "Authoritative roster awards do not consume public slots and do not fabricate uploads, material requests, downloads, signatures, or SOE files.",
            "A unique valid roster match assigns the scholarship after account approval. Conflicts assign nothing until a full admin verifies identity and chooses one row.",
            "Request Materials is an atomic backend operation that accepts only the application ID and returns precise rejection codes instead of a generic eligibility error.",
        ]),
        ("Number 6 - Scope, filtering, reports, and correction", [
            "Grantors have a separate Government, Private, or Others classification and an optional versioned municipality/city scope configured by a full admin.",
            "New application and waitlist decisions snapshot the self-declared permanent address and scope version, so later scope changes do not rewrite existing decisions.",
            "Grantor applicant lists support server-side status, location, scholarship, cycle, document, and tracking filters. CSV/PDF exports are generated from backend-fetched records and audited.",
            "Full admins can correct a student number with uniqueness checks and an audit reason while preserving the Auth UUID and linked history. Existing sessions are revoked.",
            "The existing recommendation algorithm remains informational only; no official ranking formula was invented.",
        ]),
        ("Number 7 - Announcements, notifications, and FIFO waitlist", [
            "Admin/grantor announcement publishing begins with a server-owned audience preview that expires after 15 minutes. Grantors can target only their connected students.",
            "Publishing uses immutable recipient snapshots and deterministic delivery IDs to prevent duplicate inbox/dashboard notices during retries.",
            "The root-controlled global waitlist capacity defaults to zero. When enabled, queued plus offered records count toward the global cap.",
            "Each scholarship queue is FIFO. A released or added slot becomes an exclusive 24-hour offer for the first eligible student; accept creates an ordinary application, while decline/expiry advances the queue.",
            "A protected Railway cron worker calls the expiry endpoint every five minutes using CRON_SECRET.",
        ]),
        ("Number 8 - Email verification, sessions, and lost email", [
            "After a successful password check, students/grantors inactive for 30 days receive a six-digit email challenge before any Supabase session is returned.",
            "Codes are hashed, expire after 10 minutes, allow three wrong attempts, enforce 60-second resend delay, and limit delivery to five sends per hour.",
            "Verified sessions bind Auth UUID, JWT session ID, portal identity, lock state, and sessionValidAfter. Protected backend routes validate all of these.",
            "Normal tabs share login/logout through local storage, BroadcastChannel, and storage events. Incognito and other devices remain independent.",
            "Lost-email recovery uses a signed-out private support conversation, secret capability URL, private evidence attachments, root review, and confirmation of the proposed mailbox before Auth/profile email changes.",
        ]),
        ("Number 9 - Student history and Signed SOE", [
            "The private append-only history ledger records deterministic student-safe application, document, tracking, roster, waitlist, commitment, cooldown, withdrawal, and cycle events.",
            "Students have a History page with pagination, cycle/type filters, and safe related-page links; staff-only notes and security metadata are excluded.",
            "Ordinary committed scholars upload Signed SOE after office signing. PDF/PNG/JPEG up to 10 MB is accepted; successful submission immediately marks Submitted and completes Finish.",
            "The upload proves submission only, not staff verification or physical custody. Authoritative roster scholars are exempt.",
            "Authorized admins can preview and reopen Signed SOE with a mandatory reason. The original remains immutable and the student submits a new version.",
        ]),
        ("Number 10 - Interface and release acceptance", [
            "Local UI checks covered public/authentication, Student and Grantor desktop/mobile, and Admin desktop routes and conditional states.",
            "Responsive, dark-mode, Quick Actions, modal focus/Escape, icon-label, preview layering, and Admin Profile runtime defects were corrected.",
            "Local verification passes 136 backend tests, six frontend security checks, ESLint, production build, backend compilation, and offline migration parsing.",
            "Production remains blocked until staging database, Auth, Brevo, Storage, cron, role, concurrency, rollback, and production smoke-test evidence exists.",
        ]),
    ]
    for title, items in implementation_sections:
        story.append(para(title, "H2Custom"))
        story.extend(bullet(item) for item in items)

    story.append(PageBreak())
    section_header(story, "3. Implemented Flows")
    story.append(flowchart("Flow A - Student account creation and approval", [
        "Student submits signup -> Supabase sends confirmation email",
        "Student confirms email -> account remains Pending",
        "DECISION: Manual approval required? YES -> Full admin reviews; NO -> activation policy continues",
        "DECISION: Admin accepts? YES -> activate account + Welcome email; NO -> Rejected email + cleanup/restart path",
        "Activated student logs in -> verified portal session -> Student Dashboard",
    ]))
    story.append(flowchart("Flow B - Login, lockout, and 30-day email verification", [
        "User ID + password -> backend resolves account without exposing account data",
        "DECISION: Disabled or blocked? YES -> deny login; NO -> Supabase Auth password check",
        "DECISION: Password failed? YES -> increment failures -> limit reached? lock account",
        "DECISION: Inactive for at least 30 days? NO -> create verified session; YES -> send six-digit email code",
        "Correct unexpired code -> reauthenticate -> create verified session -> dashboard",
        "Logout in one normal tab -> BroadcastChannel/storage event -> other normal tabs log out",
    ]))
    story.append(flowchart("Flow C - Profile and document review", [
        "Student edits profile draft -> Save Draft -> Preview",
        "Student provides fresh signature -> Submit Revision -> immutable PDF/version",
        "Student uploads current-cycle COR + identity + applicable ROG",
        "DECISION: First year AND first semester? YES -> ROG not required; NO -> ROG required",
        "Reviewer checks each current version -> Approve or Reject with reason",
        "DECISION: All applicable requirements approved? YES -> complete Document Review; NO -> show correction action",
        "Corrected version approved -> restore preserved tracking stage",
    ]))
    story.append(flowchart("Flow D - Authoritative roster import and assignment", [
        "Grantor/Admin maps spreadsheet -> Preview batch",
        "Backend validates grantor ownership + exact scholarship + identity + duplicates + commitments",
        "DECISION: Blocking row exists? YES -> Commit disabled; correct rows and preview again",
        "Commit valid stored batch -> transaction/advisory lock -> reuse or create roster/application records",
        "DECISION: Unique valid active match? YES -> authoritative assignment; NO -> visible conflict, assign nothing",
        "Full admin verifies conflict in person -> selects one roster -> alternatives archived without cooldown",
        "Applicable approved documents complete -> system completes roster tracking through Finish",
    ]))
    story.append(flowchart("Flow E - Ordinary application and Request Materials", [
        "Student applies to one or more eligible grantor scholarships",
        "Application reserves one public slot -> documents/tracking continue",
        "Student selects Request Materials -> backend receives application ID only",
        "DECISION: Ownership, eligibility, documents, versions, requirements, slot, conflict, and cooldown valid?",
        "NO -> return precise reason; make no partial slot/application/request change",
        "YES -> commit selected scholarship -> create/retry request -> close alternatives -> release their slots",
        "Staff approves materials -> student downloads/signs -> proceeds to Signed SOE",
    ]))
    story.append(flowchart("Flow F - Full scholarship and FIFO waitlist", [
        "Student attempts eligible application -> no public slot remains",
        "DECISION: Global waitlist capacity greater than zero and not full? NO -> explain unavailable; YES -> join queue",
        "Queue position = queued_at then stable ID",
        "Slot released or added -> transaction reserves it for first still-eligible queued student",
        "Student receives inbox/dashboard 24-hour offer",
        "DECISION: Accept before expiry? YES -> ordinary active application; NO/Expired -> offer next eligible student",
        "Scholarship commitment elsewhere -> close all competing queues/offers and restore reserved slots",
    ]))
    story.append(flowchart("Flow G - Targeted announcement", [
        "Admin/Grantor chooses permitted target filters",
        "Backend resolves recipients -> immutable preview snapshot (15 minutes)",
        "DECISION: Preview valid and unexpired? NO -> regenerate; YES -> publish from preview ID",
        "Transaction creates deterministic student deliveries",
        "Student sees one inbox/dashboard notice -> direct link opens the correct announcement or action",
    ]))
    story.append(flowchart("Flow H - Signed SOE, Finish, and renewal", [
        "Ordinary committed scholar completes office-signing stage",
        "Upload Signed SOE -> backend validates owner, cycle, stage, type, size, and duplicate status",
        "Valid upload -> immutable private version -> status Submitted -> Finish complete",
        "Student sees next-semester renewal message + history event",
        "DECISION: Admin reopens for unreadable/wrong file? YES -> reason required -> return to Upload Signed SOE",
        "New cycle -> preserve completed history -> restart applicable document requirements",
    ]))
    story.append(flowchart("Flow I - Safe deployment", [
        "Enable Maintenance Mode -> verify normal portals are blocked",
        "Create recoverable database backup + separate Storage copy/manifest",
        "Run local tests -> verify staged files and commit -> push one reviewed commit",
        "Apply only missing migrations on staging -> database compatibility first",
        "Deploy backend -> verify health/OpenAPI -> configure cron and secrets",
        "Deploy frontend from same commit -> verify production domain",
        "Run Johnvher + Veejay + Emmerson acceptance suites",
        "DECISION: Any release blocker? YES -> keep/restore Maintenance Mode; NO -> reopen and record sign-off",
    ]))

    section_header(story, "4. What You Need to Check")
    check_groups = [
        ("Security and accounts", [
            "Anonymous and ordinary browser clients cannot read/write sensitive tables, call privileged RPCs, subscribe to private Realtime data, or open private files.",
            "Pending students cannot log in; only full admins approve/reject; Welcome/Rejected emails arrive once and match the final committed decision.",
            "Three failed logins lock the configured test account; recovery unlocks students/grantors only after password change; root alone unblocks admins.",
            "Normal-tab login/logout is shared; Incognito/second device remains independent; stale or revoked sessions fail protected backend calls.",
        ]),
        ("Profiles and documents", [
            "Draft save/reopen, fresh signature, immutable revision, one-page PDF, private preview, permanent/current address behavior, and revision history.",
            "First-year first-semester ROG exemption; all other year/semester combinations require ROG.",
            "COR policy modes and exceptions; first-year alternative photo ID; upper-year Student ID/lost-card exception; scanner success never auto-approves.",
            "Rejection reason, corrected upload, compliance pause, preserved later steps, and automatic restoration after approval.",
        ]),
        ("Roster, applications, and materials", [
            "Malformed, duplicate, unknown, ambiguous, identity-mismatch, commitment-conflict, repeated, and concurrent roster imports.",
            "Matching application ID/history/documents are preserved and its public slot is released during authoritative conversion.",
            "Roster lock prevents withdrawal/competing application until individual archival; individual archive starts the 24-hour cooldown; grantor archive transfers servicing to admin.",
            "Request Materials succeeds only after all checks and never leaves partial state after a precise rejection or duplicate click.",
        ]),
        ("Scope, reports, announcements, and waitlist", [
            "Inside/outside municipality behavior, versioned scope snapshot, self-declared-address disclosure, and cross-grantor denial.",
            "Filtered CSV/PDF report totals and immutable report audit; student-number correction preserves history/Auth UUID and revokes sessions.",
            "Audience preview counts, expiry, ownership restrictions, deduplicated publish retries, unread counts, direct links, and archived-user handling.",
            "Waitlist disabled/enabled, global cap, FIFO ordering, simultaneous joins, reserved 24-hour offer, accept/decline/expiry/rejoin, and slot restoration.",
        ]),
        ("History, SOE, and UI", [
            "History ordering, pagination, cycle/type filters, safe descriptions, no staff-only notes, and correct related-page links.",
            "Signed SOE type/size/owner/stage/cycle checks, immediate Finish, reason-required reopen, retained earlier version, and roster exemption.",
            "Desktop/mobile, light/dark, empty/loading/error/disabled/conflict/archived states; no clipping, overflow, hidden focus, duplicate toast, modal-layer error, broken image, console error, or failed request.",
        ]),
    ]
    for title, items in check_groups:
        story.append(para(title, "H2Custom"))
        story.extend(checklist(item) for item in items)

    story.append(PageBreak())
    section_header(story, "5. Current Phase to Production: Step-by-Step Runbook")
    story.append(callout(
        "STOP rule",
        "If a migration result, backup, deployment commit, health check, email, private file, or core role flow is unclear or fails, stop. Do not rerun every SQL file, rerun the completed grantor Auth migration, force-push, or disable Maintenance Mode as a workaround.",
        "red",
    ))
    story.append(Spacer(1, 4 * mm))
    story.append(para("Phase map", "H2Custom"))
    story.append(flowchart("From the current checkout to the live revised system", [
        "Current local working tree -> review every modified and untracked file",
        "Local release candidate -> automated checks pass -> one reviewed Git commit",
        "Staging -> Supabase migrations/config -> Railway API/cron -> Vercel preview",
        "Staging acceptance -> role, email, Storage, security, workflow, and UI evidence",
        "Production protected by Maintenance Mode -> backups and baseline recorded",
        "Production database compatibility -> Railway backend/cron -> Vercel frontend",
        "Controlled production smoke test -> release sign-off -> Maintenance Mode off",
        "DECISION: Any failed gate? YES -> stop/rollback and keep Maintenance Mode on; NO -> monitor",
    ]))
    story.append(callout(
        "Meaning of the three builds",
        "Development build is the code running on your computer. Release candidate is one reviewed Git commit that passed local checks and staging. Deployment build is the exact same commit built by Railway and Vercel with production environment variables. Do not edit files between staging approval and production deployment; corrections require a new commit and a new staging pass.",
        "gray",
    ))

    deployment_steps = [
        ("Phase 1 - Turn the current checkout into a release candidate", [
            "Open VS Code -> Source Control. Review every modified and untracked file. Remove accidental local output, but do not discard work you do not understand.",
            "Confirm .env, API keys, service-role keys, database URLs, backup folders, and dist are not staged. Secrets belong in hosting dashboards, never Git.",
            "In PowerShell at the repository root, run: git status --short; git diff --check; git diff --stat.",
            "Run: python -m compileall backend -q.",
            "Run: python -m unittest discover -s backend/tests -p test_*.py -v.",
            "Run: npm.cmd run test:frontend; npm.cmd run lint; npm.cmd run build.",
            "Fix every error. A Vite large-chunk warning may be recorded, but a failed command blocks release.",
            "Stage only reviewed release files. Inspect with: git diff --cached --name-only and git diff --cached --check.",
            "Create one release commit and push it to GitHub. Record the full SHA using: git rev-parse HEAD. Do not use npm run tapos until the staged content has been reviewed because it automatically adds, commits, and pushes.",
            "Gate: GitHub must show the intended commit on the deployment branch, and the local working tree must contain no forgotten release file.",
        ]),
        ("Phase 2 - Prepare a safe staging environment", [
            "Use a separate staging Supabase project and staging test data. Do not rehearse destructive workflows against production users.",
            "Create or select a Railway staging environment/service and a Vercel Preview deployment connected to the release commit.",
            "Choose staging URLs, for example a Railway staging API URL and the Vercel Preview URL. Add both to the appropriate CORS/Auth redirect configuration.",
            "Create disposable student, grantor, full-admin, reviewer, limited-admin, and root fixtures plus a dedicated test mailbox.",
            "Record the staging project reference, release SHA, starting row counts, application IDs, queue positions, and expected notification counts.",
            "Gate: staging must be isolated enough that account locks, rejection, archival, deletion, waitlist expiry, and recovery tests cannot damage production records.",
        ]),
        ("Phase 3 - Configure and migrate staging Supabase", [
            "In Supabase Dashboard -> Project Settings -> API, copy the staging Project URL and publishable/legacy anon key for the frontend. Copy the service-role key only into trusted Railway/local secret storage.",
            "In Supabase -> Database -> Backups, confirm staging has a recovery point before migration testing. Database backups do not contain Storage object contents.",
            "In Supabase -> Storage, confirm the bulsuscholar bucket exists and is private. Copy any needed staging fixtures into it; never make private student documents public.",
            "In Supabase -> Authentication -> URL Configuration, set the staging Site URL and add the Vercel Preview callback/reset URL. Production URLs are configured separately in Phase 9.",
            "Open SQL Editor -> New query. For each migration below, first verify whether its objects/history already exist, then paste the entire file and click Run once. Write down filename, time, and result.",
            "20260918120000_preserve_tracking_during_document_compliance.sql",
            "20260918123000_add_tracking_finish_stage.sql",
            "20260918130000_automatic_roster_and_login_security.sql",
            "20260922170000_revoke_unsafe_direct_access.sql",
            "20260922180000_require_manual_student_account_approval.sql",
            "20260923120000_student_profile_document_verification.sql",
            "20260923124643_scholarship_roster_workflow.sql",
            "20260924024322_scope_reporting_announcements_waitlist.sql",
            "20260924125213_security_history_signed_soe.sql",
            "20260925103000_complete_student_history_ledger.sql",
            "If a query errors or times out, stop and inspect what committed before retrying. Do not blindly use db push or migration repair when migration history differs.",
            "Run Supabase Security Advisor and Performance Advisor. Confirm protected tables have RLS and that anon/authenticated users have no broad table privileges or privileged RPC execution.",
            "Use an anonymous REST request and an ordinary authenticated test account to prove sensitive reads, writes, deletes, Realtime subscriptions, privileged RPCs, and private Storage access are denied.",
            "Do not rerun the completed production grantor Auth migration. Only a deliberately isolated staging fixture may use the dry-run migration workflow.",
            "Gate: all expected tables/functions exist, advisor findings are reviewed, private files remain private, and transaction/authorization tests pass.",
        ]),
        ("Phase 4 - Configure Brevo and Supabase Auth email", [
            "In Brevo -> Senders, Domains & Dedicated IPs, verify the sender/domain used by no-reply@bulsuscholar.com. Complete SPF/DKIM steps shown by Brevo before relying on delivery.",
            "In Brevo -> SMTP & API -> API Keys, create or select a restricted production API key for the Railway backend. Store it as BREVO_API_KEY in Railway only.",
            "In Brevo -> SMTP & API -> SMTP, obtain the SMTP login and SMTP key. The SMTP key is not BREVO_API_KEY.",
            "In Supabase -> Authentication -> SMTP Settings, enable Custom SMTP and enter the Brevo SMTP host/port/login/key plus the verified sender.",
            "In Supabase -> Authentication -> Email Templates, review Confirm signup and Reset password links against the configured Site URL and redirect allow-list.",
            "Use the staging mailbox to test confirmation, Welcome, rejection, inactivity code, password recovery, and proposed-new-email confirmation. Each expected message must arrive once and link to staging.",
            "Check Brevo transactional logs for delivered, deferred, bounced, or blocked status. A database notification row does not prove email delivery.",
            "Gate: Supabase Auth mail and backend API mail both arrive from the correct sender without exposing secrets or linking to production during staging.",
        ]),
        ("Phase 5 - Deploy the staging Railway API and worker", [
            "In Railway, create/select the staging environment and deploy the exact release SHA using the repository Dockerfile. Do not redeploy an older artifact.",
            "In the API service -> Variables, set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET=bulsuscholar, FRONTEND_URL, and DOCUMENT_SCAN_ALLOWED_ORIGINS to staging values.",
            "Set EMAIL_PROVIDER=brevo, BREVO_API_KEY, BREVO_SENDER_NAME, BREVO_SENDER_EMAIL, and BREVO_REPLY_TO_EMAIL.",
            "Generate different random values of at least 32 characters for ROOT_SESSION_SECRET, PORTAL_EMAIL_CODE_SECRET, PUBLIC_RECOVERY_CODE_SECRET, and CRON_SECRET. Keep all four on Railway only.",
            "Set WEB_CONCURRENCY=1 and UVICORN_KEEP_ALIVE=30 unless the verified production service intentionally differs. Keep DOCUMENT_SCAN_ALLOWED_ORIGIN_REGEX blank; never use https://.*.com.",
            "Optional root integrations such as ROOT_DATABASE_URL, Railway/Vercel tokens, and deploy hooks should remain unset unless the feature is deliberately configured with least privilege.",
            "Wait for Railway status Success. Inspect build and runtime logs for import, migration compatibility, CORS, secret, scanner, or startup errors.",
            "Open /health, /deployment/health, /scan-document/health, /email/health, and /openapi.json on the staging API. Required routes must be present before frontend testing.",
            "Create a second Railway service named waitlist-expiry from the same commit. Set BACKEND_API_URL to the staging API and CRON_SECRET to the exact API value; Start Command: python -m backend.waitlist_expiry_job; schedule: */5 * * * *.",
            "Run the worker once and confirm its log contains ok=true. A 401, 403, timeout, or missing-secret result blocks release.",
            "Gate: API health is ok, deployment health reports required configuration, OpenAPI contains revised routes, CORS allows only intended frontend origins, and the cron worker succeeds.",
        ]),
        ("Phase 6 - Deploy the staging Vercel frontend", [
            "In Vercel -> Project -> Settings -> Environment Variables, add Preview values for VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_STORAGE_BUCKET, VITE_APP_URL, VITE_PUBLIC_SITE_URL, VITE_BACKEND_API_URL, and VITE_DOCUMENT_SCAN_API_URL.",
            "VITE_APP_URL/VITE_PUBLIC_SITE_URL must be the staging Preview/custom URL; backend variables must point to the staging Railway API.",
            "Never add SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY, database URLs, ROOT_SESSION_SECRET, PORTAL_EMAIL_CODE_SECRET, PUBLIC_RECOVERY_CODE_SECRET, or CRON_SECRET to Vercel or any VITE_ variable.",
            "Deploy the exact same release SHA used by Railway. Confirm Vercel reports Ready and inspect build logs for missing-variable or bundle errors.",
            "Open the Preview URL in a private browser, verify its API requests go to staging, and check browser console/network logs for failed requests, CORS errors, mixed environments, or exposed secrets.",
            "Gate: the staging frontend and backend report the same SHA and use only staging Supabase/data/mail fixtures.",
        ]),
        ("Phase 7 - Approve the release candidate in staging", [
            "Run the Johnvher, Veejay, and Emmerson suites in Sections 6-8 and the consolidated matrix in Section 11. Run root checks for waitlist capacity, admin unblock, recovery review, audit views, and destructive confirmations.",
            "Verify student/grantor at desktop and mobile sizes, Admin/root at desktop, and all required light/dark, empty, loading, error, disabled, archived, conflict, modal, toast, and file-preview states.",
            "Verify database state, immutable history/audit rows, notifications, email delivery, private file access, and navigation after every destructive workflow.",
            "Exercise duplicate clicks, retries, concurrent Request Materials/import/waitlist operations, expired previews/offers/codes, and session revocation.",
            "Log every defect with role, route, fixture, steps, expected/actual result, screenshot, console/network evidence, severity, fix commit, and retest result.",
            "Any correction creates a new commit. Redeploy that SHA to staging and rerun the affected test plus regression checks; never patch production separately.",
            "Gate: no unresolved critical/high issue, all release blockers pass, and Johnvher/Veejay/Emmerson plus release owner sign the approved SHA.",
        ]),
        ("Phase 8 - Protect and baseline production", [
            "Open https://bulsuscholar.com/root -> Settings -> Portal controls. Turn Maintenance Mode on, save, confirm, and prove normal student/grantor/admin portals are blocked while root remains available.",
            "In production Supabase -> Database -> Backups, confirm a usable restore point and record its time. Stop if there is no recoverable database backup.",
            "Run the Storage backup script from a trusted machine with production service-role credentials and retain the object manifest/checksums separately. Database backup does not include Storage objects.",
            "Record the current production Supabase project, migration/object state, Railway/Vercel deployment IDs and SHAs, important row counts, domain/DNS state, environment status, and rollback owners.",
            "Confirm the approved release SHA is immutable on GitHub and no new untested commit has replaced it.",
            "Gate: Maintenance Mode is visibly active, both data and file recovery evidence exist, and the previous working deployment identifiers are recorded.",
        ]),
        ("Phase 9 - Configure production Supabase and Brevo", [
            "Compare production database objects/history with the ten migration files. Apply only missing migrations in dependency order through SQL Editor, one file at a time, recording result and time.",
            "After each migration, stop on any error or unclear result. Do not immediately rerun it because earlier statements may already have committed.",
            "In production Supabase Authentication -> URL Configuration, set Site URL to https://bulsuscholar.com and allow the exact confirmation/reset callback URLs required by the application.",
            "Confirm Custom SMTP uses the verified Brevo sender and SMTP key. Confirm templates link to production, not staging.",
            "Confirm the bulsuscholar Storage bucket remains private, RLS is enabled for exposed-schema tables, protected functions are not executable by PUBLIC/anon/authenticated, and advisors are reviewed.",
            "Run readiness and anonymous-denial checks before deploying code. Do not rerun migrate:grantor-auth -- --execute; the validated production grantor migration was already completed.",
            "Gate: production schema is compatible with the release while Maintenance Mode remains on, and no unauthorized direct access is possible.",
        ]),
        ("Phase 10 - Deploy the production Railway backend and cron", [
            "In the Railway production API service, verify production values for all Phase 5 variables. FRONTEND_URL and allowed origin must be https://bulsuscholar.com; BACKEND_API_URL for the worker must be https://api.bulsuscholar.com.",
            "Use production-only random secrets. The API and waitlist worker must share CRON_SECRET; OTP and recovery secrets must be different from each other and from staging.",
            "Deploy Latest Commit for the approved SHA. Do not use Redeploy on an older deployment. Wait for Success and inspect logs.",
            "Run: Invoke-RestMethod https://api.bulsuscholar.com/health and /deployment/health. Load /openapi.json and confirm auth, email-verification, profile/document, roster, scope/report, announcement, waitlist, recovery, history, and Signed SOE routes.",
            "Update/deploy waitlist-expiry from the same SHA, run it once, confirm ok=true, then verify its */5 * * * * schedule.",
            "From the repository with BACKEND_URL configured, run npm.cmd run verify:deployment and save the result.",
            "Gate: production API and cron are healthy on the approved SHA before the production frontend is promoted.",
        ]),
        ("Phase 11 - Deploy the production Vercel frontend", [
            "In Vercel Environment Variables -> Production, verify the public production values: Supabase URL/anon key/bucket, https://bulsuscholar.com for app/public URLs, and https://api.bulsuscholar.com for backend/document scan URLs.",
            "Confirm no Railway-only secret is present. Vite embeds VITE_ values into the public browser bundle.",
            "Promote/deploy the approved SHA to Production. Confirm Ready, the production domain assignment, and the same Git commit shown by Railway.",
            "Open https://bulsuscholar.com in a private window. Maintenance Mode should still appear. Check console/network output and verify requests use the production API, not localhost or staging.",
            "Gate: Vercel and Railway run the same approved SHA, domains/TLS work, and Maintenance Mode still protects normal workflows.",
        ]),
        ("Phase 12 - Production smoke test, release, and monitoring", [
            "While Maintenance Mode is on, verify root health/settings, production API health, cron status, Supabase readiness/denials, Storage authorization, and one controlled Brevo delivery.",
            "Schedule a short controlled opening. Turn Maintenance Mode off and immediately test one disposable student, grantor, full admin, and root login plus dashboard/API bootstrap.",
            "Run a narrow smoke path: pending approval, private document preview, one ordinary application, one roster state, one announcement/notification, one support/recovery check, and waitlist status without disturbing real awards.",
            "Check Railway logs, Vercel/runtime/browser errors, Supabase Auth/database logs, Brevo transactional logs, notification counts, and cron execution for at least the agreed observation window.",
            "If a core/security issue appears, immediately re-enable Maintenance Mode. Roll back Vercel and Railway to the recorded working deployment only when database compatibility permits it.",
            "Do not attempt to reverse database migrations casually. Use an explicit corrective migration, or restore the recorded backup only after assessing all post-backup writes and Storage differences.",
            "When every gate passes, record release owner, date/time, approved SHA, migration log, backup IDs, Railway/Vercel deployment IDs, tester sign-offs, known nonblocking issues, and monitoring owner.",
        ]),
    ]
    for title, items in deployment_steps:
        story.append(para(title, "H2Custom"))
        story.extend(checklist(item) for item in items)

    story.append(PageBreak())
    section_header(story, "6. Johnvher - Admin Test Suite")
    story.append(para("Role: full admin. Run on a disposable staging environment using desktop 1440 x 900. Do not use real student records for destructive tests."))
    admin_tests = [
        ("ADM-01", "Pending account approval and rejection", "Two email-confirmed pending students and access to the test mailbox.", [
            "Open Admin -> Student Management -> Pending.", "Inspect the first student's information and accept the account.", "Confirm the student moves to active records and receives one Welcome email.", "Reject the second student with a safe reason.", "Confirm one Rejected email, restricted decision history, and clean restart behavior.",
        ], "Only a full admin can decide. No pending account can log in before acceptance, and no duplicate email/notification is created."),
        ("ADM-02", "Document review and ROG rules", "One first-year first-semester student and one upper-year student with pending COR/ROG/identity/profile versions.", [
            "Open Document Review and filter by cycle and status.", "Confirm the first-year first-semester student's ROG says Not required for this semester.", "Approve COR, allowed identity document, and profile revision.", "For the upper-year student, reject ROG with a reason, then approve a corrected version.", "Confirm tracking pauses at the first incomplete requirement and restores later progress after approval.",
        ], "ROG exemption is server-derived only for first-year first-semester. Rejection and correction history remain visible and immutable."),
        ("ADM-03", "Grantor classification and location scope", "A disposable grantor and two municipalities.", [
            "Set the grantor classification to Government, Private, or Others.", "Enable a named scope containing one municipality and save.", "Verify an in-scope new applicant can proceed and an out-of-scope applicant receives a clear denial.", "Change the scope and confirm an existing application keeps its earlier scope snapshot.",
        ], "Scope affects new admissions only, uses the self-declared permanent address, and cannot be bypassed by changing request IDs."),
        ("ADM-04", "Roster preview, conflict, and idempotency", "Roster file containing valid, duplicate, unknown-scholarship, name-mismatch, and commitment-conflict rows.", [
            "Upload/map the file and generate the server preview.", "Confirm blocking rows show specific reasons and Commit is disabled.", "Correct the file and preview again.", "Commit the valid batch, then attempt to commit the same batch again.", "Resolve one conflict only after identity verification and select the correct roster row.",
        ], "No duplicate award is created. Matching applications retain IDs/history/documents, public slots are released, and conflict alternatives archive without cooldown."),
        ("ADM-05", "Student-number correction", "Disposable active student with applications, documents, notifications, and history.", [
            "Start correction, enter a unique new number, confirmation, and audit reason.", "Confirm the Auth UUID and linked history remain unchanged.", "Verify the old number no longer logs in and existing sessions are revoked.", "Log in with the new number and confirm all owned records remain accessible.",
        ], "The update is atomic/audited and does not orphan documents, applications, tickets, or history."),
        ("ADM-06", "Targeted announcement and deduplication", "At least three active students in different course/year groups.", [
            "Create an announcement and choose a permitted audience filter.", "Generate the audience preview and record recipient count.", "Publish from the preview, then retry the same publish action.", "Check the intended students' dashboard and inbox; check a nonrecipient account.",
        ], "Each intended recipient gets one delivery and correct direct link; nonrecipients get none; expired previews cannot publish."),
        ("ADM-07", "Signed SOE review and reopen", "Ordinary committed student whose Signed SOE stage is Submitted.", [
            "Open Requirements/SOE review and preview the private file.", "Reopen without a reason and confirm the action is blocked.", "Enter a reason and reopen.", "Verify the student returns to Upload Signed SOE and receives one correction notice.", "After replacement upload, confirm both immutable versions remain.",
        ], "Reopen requires Requirements permission and a reason; the system never labels the file staff-verified merely because it was uploaded."),
        ("ADM-08", "Permission and interface checks", "One full admin and one limited/reviewer admin.", [
            "Attempt each sensitive action with the limited account.", "Confirm hidden/disabled controls match backend denials.", "Check dialogs with keyboard Tab, Shift+Tab, Escape, and focus restoration.", "Check light/dark mode, long names, empty/loading/error states, toasts, and image previews.",
        ], "Backend authorization remains decisive; no clipping, unreadable contrast, modal layering error, duplicate toast, console error, or failed request remains."),
    ]
    for args in admin_tests:
        test_scenario(story, *args)
    story.extend([checklist("Johnvher sign-off: all ADM cases passed and evidence links are recorded."), para("Tester signature: ____________________   Date/time: ____________________   Build/commit: ____________________", "SmallCustom")])

    story.append(PageBreak())
    section_header(story, "7. Veejay - Grantor Test Suite")
    story.append(para("Role: grantor. Run at 1440 x 900 and 390 x 844 in light and dark modes. Use only the grantor's own scholarships and disposable applicants."))
    grantor_tests = [
        ("GRA-01", "Login, email verification, and tab behavior", "Grantor account with valid email; activity timestamp tested at 29 days and at least 30 days.", [
            "At 29 days, sign in with the correct password and confirm normal dashboard access.", "At 30 days, confirm password success leads to Email verification without exposing a portal session.", "Test wrong code attempts, 60-second resend delay, old-code invalidation, and successful code.", "Open a second normal tab and confirm it shares the account; log out and confirm both tabs exit.",
        ], "OTP appears only when due, limits are enforced, no token is released before verification, and Incognito remains independent."),
        ("GRA-02", "Scholarship announcement, image, slots, and audience", "One recognized scholarship program and owned applicant/scholar fixtures.", [
            "Create an application announcement with image, exact scholarship, schedule, and slots.", "Preview a grantor-owned audience and publish.", "Verify the announcement card image appears consistently in dashboard, announcement detail, and recommendation card.", "Confirm an unrelated student/grantor is not included.",
        ], "Published content, image, slot count, audience, inbox notice, and direct link are correct with one delivery per student."),
        ("GRA-03", "Roster preview and commit", "Spreadsheet with one future-account student, one matching applicant, one duplicate, and one unknown scholarship.", [
            "Upload and map the spreadsheet.", "Review server row statuses and exact matched scholarship.", "Confirm Commit remains disabled while blocking errors exist.", "Correct and re-preview; commit once; repeat the commit.", "Check the converted applicant ID/history and the future-account No account yet label.",
        ], "The batch is idempotent, no duplicate award is created, converted history is preserved, and roster awards consume no public slot."),
        ("GRA-04", "Applicant filters and reports", "Applicants across statuses, municipalities, scholarships, cycles, document states, and tracking stages.", [
            "Apply each filter individually and in combination.", "Export CSV and PDF and compare displayed/total counts.", "Attempt to substitute another grantor ID in the request.", "Inspect report audit information as authorized staff.",
        ], "Only the grantor's own records appear. Cross-grantor access is denied and exports are generated from backend records, not browser-supplied rows."),
        ("GRA-05", "Decision, slot return, and waitlist promotion", "A full scholarship with queued students and one disposable active applicant.", [
            "Reject or archive the disposable application using the allowed workflow.", "Confirm the public slot returns exactly once.", "Verify the first eligible queued student receives an exclusive 24-hour offer.", "Add slots and confirm FIFO promotion continues.", "Verify duplicate actions do not create duplicate offers or notifications.",
        ], "Slot accounting remains consistent, queue order is FIFO, and only eligible students receive one actionable notice."),
        ("GRA-06", "Document visibility and authority boundary", "Owned applicant with approved and pending private documents.", [
            "Open documents related to the owned application.", "Confirm approved/application-relevant records can be viewed through authorized short-lived access.", "Attempt to approve/reject a student-level document.", "Attempt to access another grantor's applicant/document URL.",
        ], "Grantor can view only relevant permitted files and cannot issue authoritative document decisions or cross grantor boundaries."),
        ("GRA-07", "Mobile and desktop interface", "Realistic long names, empty list, many records, modal, toast, archived state, and inbox fixtures.", [
            "Check Dashboard, Scholars, Applications, Announcements, Inbox, and Profile at both viewports.", "Open composer, archive/reject confirmations, image preview, document preview, and inbox detail.", "Use keyboard and touch-size controls; switch light/dark mode.", "Check console/network errors and horizontal overflow.",
        ], "No clipped text, inaccessible close control, hidden focus, overlay-behind-modal error, full-width action failure, duplicate toast, or unexpected failed request remains."),
    ]
    for args in grantor_tests:
        test_scenario(story, *args)
    story.extend([checklist("Veejay sign-off: all GRA cases passed and evidence links are recorded."), para("Tester signature: ____________________   Date/time: ____________________   Build/commit: ____________________", "SmallCustom")])

    story.append(PageBreak())
    section_header(story, "8. Emmerson - Student Test Suite")
    story.append(para("Role: student. Run at 1440 x 900 and 390 x 844 in light and dark modes. Use disposable documents and applications."))
    student_tests = [
        ("STU-01", "Signup, confirmation, and approval", "Unused student ID/email and access to the test mailbox.", [
            "Complete signup and confirm the email.", "Attempt login before admin approval.", "Have Johnvher approve the pending account.", "Verify the Welcome email and successful login.",
        ], "The account stays pending until approved, cannot log in early, and becomes active only after the committed admin decision."),
        ("STU-02", "Profile draft, signature, PDF, and document requirements", "Approved first-year first-semester student, then an upper-year/cycle fixture.", [
            "Complete permanent address, leave current address optional, save and reopen the draft.", "Draw/upload a fresh signature, submit, and inspect the official PDF.", "Upload COR, allowed identity document, and verify ROG shows Not required for first-year first-semester.", "Repeat with upper-year/second-semester data and confirm ROG becomes required.",
        ], "Submitted revisions are immutable, drafts remain editable, files are private, and requirement decisions come from the server."),
        ("STU-03", "Multiple applications and one commitment", "Two open eligible scholarships from different grantors with available slots.", [
            "Apply to both scholarships and confirm both current applications remain visible.", "Use the Scroll Stack controls, wheel/swipe, keyboard arrows, and progress dots.", "Complete requirements for one and request materials.", "Confirm the selected scholarship commits and the alternative moves to history with its slot released.",
        ], "Multiple applications are allowed before commitment; only one scholarship remains after confirmation and controls remain usable at both viewports."),
        ("STU-04", "Request Materials rejection and retry", "Ordinary application with one missing/rejected current document, then a corrected approved version.", [
            "Request materials while the requirement is incomplete.", "Record the specific displayed reason and confirm no partial state changed.", "Upload correction and have it approved.", "Double-click Request Materials or submit concurrently, then retry normally.",
        ], "The first request fails precisely and atomically; corrected retry succeeds once with no duplicate commitment/request."),
        ("STU-05", "FIFO waitlist offer", "Full scholarship, waitlist enabled, Emmerson queued first, another student queued second.", [
            "Join the queue and record displayed position.", "Release/add one slot and verify Emmerson receives one inbox/dashboard 24-hour offer.", "Accept before expiry and confirm an ordinary application is created, not an award.", "In a second run, decline/expire and confirm the next eligible student is offered the slot.",
        ], "FIFO position and reserved offer are accurate; accept/decline/expiry is atomic; rejoin goes to the queue end."),
        ("STU-06", "Authoritative roster lock and archival", "Exactly one valid active roster match and approved account.", [
            "Confirm automatic authoritative assignment after approval.", "Verify the required identity documents remain visible until approved.", "Attempt withdrawal and a competing application while the roster row is active.", "Archive the individual roster row through staff, wait/check the 24-hour cooldown, then verify later application eligibility.",
        ], "Roster scholar cannot withdraw/change while active, uses no public slot, and becomes eligible only after individual archival and cooldown."),
        ("STU-07", "Tracking pause and recovery", "Tracking previously progressed beyond document review, then one earlier document becomes invalid.", [
            "Confirm the first incomplete earlier step becomes On-going and every later step appears gray/pending.", "Verify later completion records are not deleted.", "Submit and obtain approval for the corrected document.", "Confirm the tracker restores the previously active stage automatically.",
        ], "Sequential display is correct and preserved progress returns without duplicate tracking history."),
        ("STU-08", "Signed SOE, Finish, and History", "Ordinary committed application with office signing complete.", [
            "Try wrong type, oversized file, wrong stage, and duplicate submission.", "Upload one valid PDF/PNG/JPEG up to 10 MB.", "Confirm Upload Signed SOE shows Submitted, Finish completes, and the renewal message appears.", "Open History, filter by cycle/type, and follow the related link.", "After admin reopen, upload a corrected version and confirm both events/versions remain.",
        ], "A valid upload completes the cycle immediately as submitted, not verified; history is chronological and contains no staff-only notes."),
        ("STU-09", "Email verification and lost-email recovery", "One 30-day-inactive student and one signed-out lost-email fixture.", [
            "Complete password login and verify the six-digit challenge blocks session release.", "Test expiry, three wrong codes, resend delay, old-code invalidation, and successful verification.", "From Help, create a Lost email access ticket and retain the secret link.", "Attach valid private evidence; confirm a tampered link cannot read it.", "After root approval, confirm the proposed mailbox code and verify old sessions are revoked.",
        ], "The flow reveals no account existence, changes no email before mailbox confirmation, and keeps evidence private."),
        ("STU-10", "Student UI, inbox, notifications, and accessibility", "Announcements, unread notices, long text, empty/loading/error states, and one image preview.", [
            "Check Dashboard, Announcements/detail, Inbox/detail, Profile, Scholarships, Recommendations, and History on desktop/mobile.", "Verify Quick Actions use full available width, Support opens Help, announcement cards are consistent, and View Announcement is full width where required.", "Check light/dark contrast, toasts, modal Escape/backdrop behavior, keyboard order, image preview layering, and icon labels.", "Confirm workflow notices arrive once and direct links open the intended section.",
        ], "No clipping, horizontal overflow, unreadable text, duplicate notification/toast, inaccessible icon control, modal layering error, console error, or failed request remains."),
    ]
    for args in student_tests:
        test_scenario(story, *args)
    story.extend([checklist("Emmerson sign-off: all STU cases passed and evidence links are recorded."), para("Tester signature: ____________________   Date/time: ____________________   Build/commit: ____________________", "SmallCustom")])

    story.append(PageBreak())
    section_header(story, "9. Role Test Sign-Off")
    story.append(matrix(
        ["Gate", "Owner", "Required evidence", "Pass"],
        [
            ["Backups and rollback", "Release owner", "Database restore point, Storage copy/manifest, rollback commit", "[  ]"],
            ["Database and RLS", "Backend/DB owner", "Migration log, advisors, anon/authenticated denial checks", "[  ]"],
            ["Backend and cron", "Railway owner", "Healthy deployment, OpenAPI paths, cron ok=true", "[  ]"],
            ["Frontend", "Vercel owner", "Same commit Ready, correct API URL, no console errors", "[  ]"],
            ["Admin acceptance", "Johnvher", "ADM-01 through ADM-08", "[  ]"],
            ["Grantor acceptance", "Veejay", "GRA-01 through GRA-07", "[  ]"],
            ["Student acceptance", "Emmerson", "STU-01 through STU-10", "[  ]"],
            ["Root acceptance", "Root admin", "Recovery, admin unblock, waitlist capacity, audit, destructive dialogs", "[  ]"],
            ["Email and Storage", "Release owner", "Brevo deliveries and private file authorization", "[  ]"],
            ["Production smoke test", "All owners", "Role flows, timestamps, screenshots, issue/retest record", "[  ]"],
        ],
        [35 * mm, 30 * mm, 96 * mm, 15 * mm],
    ))
    story.append(Spacer(1, 6 * mm))
    story.append(callout(
        "Pre-release status",
        "These role and infrastructure gates feed the final September 18-present verification checklist at the end of this guide. Number 6 remains partially blocked until the scholarship office supplies and approves the official point formula.",
        "amber",
    ))
    story.append(Spacer(1, 8 * mm))
    story.append(para("Release owner: ______________________________", "BodyCustom"))
    story.append(para("Approved commit: _____________________________", "BodyCustom"))
    story.append(para("Database backup/restore point: ________________", "BodyCustom"))
    story.append(para("Deployment date/time: _________________________", "BodyCustom"))
    story.append(para("Final decision: [  ] Release   [  ] Keep Maintenance Mode enabled", "BodyCustom"))
    story.append(para("Notes / unresolved issues:", "BodyCustom"))
    story.append(Table([[""]], colWidths=[176 * mm], rowHeights=[30 * mm], style=TableStyle([("BOX", (0, 0), (-1, -1), 0.8, LINE)])))

    story.append(PageBreak())
    section_header(story, "10. Complete Change Register: September 18-Present")
    story.append(callout(
        "Comparison basis",
        "Baseline commit: 97383b0 (Added Support Conversation), pushed September 17, 2026. Current comparison includes the September 18 and September 22 pushes plus the uncommitted working tree through September 28, 2026.",
        "gray",
    ))
    story.append(Spacer(1, 3 * mm))
    story.append(callout(
        "Git status warning",
        "The latest GitHub push is 1752c0f from September 22. The Numbers 4-10 implementation, five later migrations, UI audit, this PDF, and related backend/frontend files are still modified or untracked locally. They are not on GitHub until reviewed, committed, and pushed.",
        "red",
    ))
    story.append(para("Measured tracked-file impact", "H2Custom"))
    story.extend([
        bullet("82 tracked files changed relative to the September 17 baseline."),
        bullet("6,429 tracked-line additions and 3,974 tracked-line deletions."),
        bullet("25 additional untracked files currently span backend services/tests, frontend services/pages/components, documentation/scripts, and Supabase migrations."),
        bullet("Three recorded pushes in this window: September 18 at 10:16 AM, September 22 at 3:32 PM, and September 22 at 10:30 PM."),
    ])

    story.append(para("A. Change timeline", "H2Custom"))
    story.append(matrix(
        ["Date/state", "Change group", "System effect"],
        [
            ["Sep 18 push 9ffcca0", "Scholarship document validation", "Expanded scholarship readiness beyond COR/ROG to include Student ID and Student Application Profile, accepted legacy string URLs, improved eligibility/correction messages, and reduced unnecessary console errors for expected ineligibility."],
            ["Sep 22 push 7705a43", "Tracking, roster, and login foundation", "Added compliance-pause tracking, Finish stage, automatic roster/login-security migration, unified backend Auth, failed-login tracking/recovery, grantor Auth migration, portal session checks, and removal of the browser-side roster-choice gate and legacy password service."],
            ["Sep 22 push 1752c0f", "Security cutover and account approval", "Added unsafe-access revocation, manual student approval records/endpoints, pending-session rejection, full-admin account review, Storage backup/private-bucket scripts, tests, and security cutover documentation."],
            ["Sep 23-28 local", "Numbers 4-10 implementation", "Added profile/document review, roster preview/commit/conflicts, scope/reporting, targeted announcements, waitlist, OTP/session/recovery, history/Signed SOE, portal compatibility gateway, UI changes, release tests, migrations, and acceptance documentation."],
        ],
        [31 * mm, 47 * mm, 98 * mm],
    ))

    story.append(para("B. Logic, data, and security changes", "H2Custom"))
    logic_changes = [
        "Sensitive portal reads/writes moved behind authenticated backend routes with role, actor, record-owner, and grantor-owner checks. Student roster summaries redact other students' identity data.",
        "Anonymous/authenticated direct table privileges were revoked for protected records; the Storage bucket was made private and private content is served only after authorization.",
        "Student signup validates and finalizes server-side, confirms email, enters a Pending review queue, and cannot bootstrap a portal session until a full admin accepts the account.",
        "Backend login now resolves User ID safely, checks blocked/disabled state, uses Supabase Auth, records concurrent-safe failures, locks at the configured limit, and resets failures on successful authentication/recovery.",
        "Thirty-day student/grantor inactivity now triggers a hashed six-digit email challenge before session tokens are released. Verified sessions bind Auth UUID, session ID, account identity, lock state, and sessionValidAfter.",
        "Normal tabs share portal identity and logout through local storage/BroadcastChannel; Incognito and separate devices retain independent sessions.",
        "Lost-email recovery now uses secret-capability support conversations, private attachments, root review, proposed-email code confirmation, atomic Auth/profile update, failure reset, audit, and old-session revocation.",
        "Profile handling changed from a file-only model to editable drafts, fresh signatures, immutable submitted revisions, generated official PDFs, private Storage, per-application snapshots, and revision history.",
        "COR, ROG, identity, and profile submissions are immutable versions with pending/approved/rejected decisions. First-year first-semester ROG exemption is server-derived; later semesters/years require ROG.",
        "COR policy supports cor_only, advising_only, or either; individual exceptions are reasoned and audited. Scanner classification does not equal approval.",
        "Tracking pauses at the first incomplete requirement. Later steps turn gray but remain preserved in compliance-pause metadata; corrected approval restores the previous active stage.",
        "Ordinary applications may coexist before commitment. Request Materials is atomic and validates ownership, account, eligibility, approved document snapshot/versions, application requirements, slot, roster conflicts, cooldown, and existing commitment.",
        "Authoritative roster import now requires server Preview then Commit, exact recognized scholarship ownership, stable batch fingerprints, row classifications, idempotency, advisory locking, in-place application conversion, and visible conflict resolution.",
        "Roster awards consume no public slot and fabricate no files/events. Active individual roster membership locks withdrawal/competing applications; individual archive releases the commitment and starts the 24-hour cooldown; grantor archive transfers servicing to admin.",
        "Grantor classification and versioned municipality scope are separate from provider type. New application/waitlist decisions snapshot the self-declared permanent address and applied scope version.",
        "Applicant filtering and CSV/PDF exports are backend-owned and audited. Full-admin student-number correction preserves Auth UUID/history, updates live references, changes Auth metadata, revokes sessions, and records a retryable audit state.",
        "Announcement audience selection uses a 15-minute server preview and immutable recipient snapshot. Deterministic delivery IDs prevent duplicate inbox/dashboard notices.",
        "A root-controlled global waitlist cap defaults to zero. Per-scholarship FIFO queues create exclusive 24-hour slot offers; accept creates an ordinary application, decline/expiry advances the queue, and commitment closes competing entries/offers.",
        "The protected waitlist expiry endpoint uses CRON_SECRET and is designed for a five-minute Railway cron worker.",
        "Student history is a private append-only deterministic ledger covering application, document, tracking, roster, waitlist, commitment, cooldown, withdrawal, and cycle events without staff-only notes.",
        "Ordinary committed scholars now upload Signed SOE after office signing and before Finish. Valid PDF/PNG/JPEG submission completes the cycle as Submitted; authorized admins can reopen with a reason while preserving all versions. Roster scholars are exempt.",
        "The official ranking formula remains intentionally unimplemented. Existing output is labelled Recommendation Score - Not Official Ranking.",
    ]
    story.extend(bullet(item) for item in logic_changes)

    story.append(para("C. User-interface changes", "H2Custom"))
    ui_changes = [
        "Replaced wording-based runtime button classification with explicit positive, danger, neutral, and unstyled semantics; destructive color is consistent and links/rows/icon controls remain unboxed.",
        "Added shared Light mode/Dark mode switch behavior and dark-mode contrast corrections; loading overlay uses the darker green backdrop.",
        "Student inbox rows are borderless clickable surfaces; message detail uses one top-right X; delete remains a compact danger icon; footer Quick Links are navigation links.",
        "Back to Dashboard uses neutral styling and arrow-left; View Announcement includes an eye icon and full-width placement; the duplicate Recommended Scholarships header action was removed.",
        "Student dashboard Quick Actions use equal desktop columns and responsive mobile stacking; Support opens Help and Support; the History shortcut was added.",
        "Announcement cards were aligned across student dashboard/list/detail/recommendation surfaces, including preserved scholarship images and links to the correct announcement detail.",
        "Multiple current applications use the contained Motion Scroll Stack with wheel, swipe, previous/next, arrows, progress dots, stable selection, reduced motion, and one interactive front card. Previous applications are separated from current records.",
        "Student Profile now exposes draft completeness, Save Draft, Preview, Submit for Review, signature input, document-version status, rejection reasons, correction actions, and first-year ROG exemption copy.",
        "Admin gained Pending Accounts, Document Review, roster conflicts/import preview, grantor scope/classification, applicant reports, student-number correction, targeted announcement preview, Signed SOE review/reopen, and permission-denied states.",
        "Grantor gained server roster preview/commit results, scoped applicant filters/exports, announcement audiences, location information, waitlist-related slot behavior, and refined mobile announcement/profile layouts.",
        "Login added Email verification UI and improved mobile form-first layout. Help added signed-out Lost email access conversation and attachment controls.",
        "Student History page provides filters, pagination, safe descriptions, and related links. Scholarship tracking includes Upload Signed SOE and Finish/renewal states.",
        "Shared modal accessibility now provides dialog semantics, initial focus, Tab trapping, Escape close, focus restoration, accessible icon labels/tooltips, and corrected nested image-preview layering.",
        "UI audit fixed the Admin Profile missing-icon runtime crash, student dark-mode empty-state readability, grantor mobile header/save clipping, signup preview close icon, and five-column Quick Actions layout.",
        "Recommendation wording no longer presents the informational score as an official ranking.",
    ]
    story.extend(bullet(item) for item in ui_changes)

    story.append(para("D. Operational and development-process changes", "H2Custom"))
    process_changes = [
        "Added additive migrations for compliance preservation, Finish, automatic roster/login security, access revocation, manual approval, profile/document review, roster workflow, scope/reporting/announcements/waitlist, OTP/history/Signed SOE, and complete history backfill.",
        "Added a dry-run-first idempotent grantor-to-Supabase-Auth migration script and removed browser-side legacy password encryption/reset utilities.",
        "Added Storage backup/private-bucket scripts, a security cutover record, a beginner deployment checklist, the tapos build/commit/push helper, waitlist expiry worker, and frontend security regression script.",
        "Deployment order is now explicit: Maintenance Mode and backups -> staging migrations -> database compatibility -> backend -> health/OpenAPI/cron -> frontend -> role acceptance -> production smoke test -> reopen.",
        "Required backend-only secrets now include separate portal email code, public recovery code, cron, root session, service-role, Brevo, frontend URL, and private Storage configuration. Server secrets must never be exposed as VITE variables.",
        "Local release evidence currently includes 136 backend tests, six frontend security checks, ESLint, production build, backend compilation, offline parsing of all migrations, and desktop/mobile browser/UI checks.",
        "Production acceptance still requires real Supabase transaction/RLS/Storage tests, Brevo delivery, Auth session behavior, Railway cron, concurrency/retry, authenticated role workflows, and rollback evidence.",
    ]
    story.extend(bullet(item) for item in process_changes)

    story.append(para("E. New migrations introduced in this change window", "H2Custom"))
    migration_rows = [
        ["20260918120000", "Preserve tracking during document compliance"],
        ["20260918123000", "Add tracking Finish stage"],
        ["20260918130000", "Automatic roster and login security"],
        ["20260922170000", "Revoke unsafe direct access"],
        ["20260922180000", "Require manual student account approval"],
        ["20260923120000", "Student profile and document verification"],
        ["20260923124643", "Scholarship roster workflow"],
        ["20260924024322", "Scope, reporting, announcements, and waitlist"],
        ["20260924125213", "Security, history, and Signed SOE"],
        ["20260925103000", "Complete student history ledger"],
    ]
    story.append(matrix(["Version", "Purpose"], migration_rows, [42 * mm, 134 * mm]))

    story.append(PageBreak())
    section_header(story, "11. Consolidated Tests for September 18-Present")
    story.append(para("Run these checks in staging against the exact commit intended for deployment. The Johnvher, Veejay, and Emmerson suites remain the detailed role procedures; this section is the change-to-test traceability list."))
    story.append(matrix(
        ["Change area", "Required test evidence"],
        [
            ["Access containment", "Anon/authenticated direct reads, writes, deletes, privileged RPCs, Realtime subscriptions, and private file URLs fail; permitted backend-owned role reads succeed."],
            ["Signup approval", "Confirmed signup stays Pending; pending login fails; full-admin approve/reject works; Welcome/Rejected email is single; rejection restart and cleanup are safe."],
            ["Login lockout/recovery", "Limits 3 and 10, simultaneous failures, successful reset, blocked sessions, generic unknown-ID response, student/grantor recovery, root-only admin unblock."],
            ["Thirty-day email verification", "29/30-day boundary, no token before code, 10-minute expiry, three wrong codes, 60-second resend, five sends/hour, replay, Brevo failure/retry."],
            ["Session behavior", "Normal-tab sharing/logout, Incognito and second-device independence, token refresh, deleted Auth session, lock/password reset revocation, stale JWT denial."],
            ["Profile/revisions", "Draft save/reopen, validation, fresh signature, immutable revision, one-page PDF, application snapshot, history, permanent/current address behavior."],
            ["Document rules", "First-year first-semester ROG exemption, later ROG requirement, COR modes/exception, first-year photo-ID alternatives, upper-year Student ID/lost-card exception, scanner not approval."],
            ["Review/tracking recovery", "Pending/approve/reject/resubmit, reason required, compliance pause, later steps gray, preserved completions, corrected approval restores prior active stage without duplicate history."],
            ["Roster import", "Unknown/ambiguous scholarship, duplicates, name mismatch, future account, matching application conversion, other roster/commitment conflict, repeat/concurrent commit, no public-slot use."],
            ["Roster lifecycle", "Active lock, document-gated system Finish, individual archive and 24-hour cooldown, full grantor archive to admin servicing, no fabricated documents/material/signature/SOE."],
            ["Ordinary application", "Multiple precommit applications, Scroll Stack controls, exact eligibility/scope/cooldown/slot checks, Request Materials rejection atomicity, duplicate/concurrent success, alternative closure/slot release."],
            ["Scope and reports", "Scope on/off, inside/outside normalized address, version snapshot, cross-grantor denial, filters/pagination/counts, CSV/PDF audit, student-number correction and session revocation."],
            ["Announcement delivery", "Every audience type, 15-minute expiry, preview count, grantor ownership, retry deduplication, disabled/archived recipients, unread counts, dashboard/inbox direct links."],
            ["Waitlist", "Disabled/global cap, FIFO ties, simultaneous joins, release/add-slot promotion, reserved offer, accept/decline/expiry/rejoin, no eligible successor, commitment cleanup, cron secret/schedule."],
            ["Lost-email recovery", "Unknown User ID privacy, capability tamper, attachment type/size/count/private access, root reject/approve, duplicate email, proposed-mailbox code, partial Auth retry, old-session revocation."],
            ["History", "Backfill count and deterministic deduplication, chronological pagination, filters, related links, cycle preservation, absence of reviewer/security notes."],
            ["Signed SOE", "Wrong owner/stage/cycle/type/size/duplicate, immediate Submitted/Finish, renewal copy, authorized preview, reason-required reopen, replacement version, roster exemption."],
            ["UI and accessibility", "Student/grantor desktop+mobile and Admin/root desktop; light/dark; empty/loading/error/conflict/archived states; toasts; modals; focus; Escape; labels; preview layering; no overflow/console/network error."],
            ["Deployment", "Backup restore point and Storage manifest, migration log, RLS/advisors, matching Railway/Vercel commit, health/OpenAPI, cron ok=true, rollback rehearsal, role smoke tests."],
        ],
        [47 * mm, 129 * mm],
    ))

    story.append(para("Recommended execution order", "H2Custom"))
    execution_order = [
        "Freeze the staging dataset and record fixture IDs, application IDs, queue positions, notification counts, current commit, and migration state.",
        "Run automated backend/frontend/build checks and preserve their output.",
        "Run RLS, direct-access, private Storage, and cross-role authorization checks before functional testing.",
        "Run Johnvher's account, document, roster, scope, announcement, student-number, and Signed SOE scenarios.",
        "Run Veejay's login, announcement, roster import, applicant report, slot/waitlist, document-boundary, and responsive scenarios.",
        "Run Emmerson's signup, profile/documents, multiple applications, materials, waitlist, roster lock, tracking recovery, Signed SOE, OTP/recovery, and responsive scenarios.",
        "Run root-only recovery review, admin unblock, waitlist capacity, audit, settings, and destructive confirmations.",
        "Run concurrency and retry checks for login failures, roster commits, Request Materials, waitlist joins/promotions, audience publishing, emails, and Storage operations.",
        "Check database state, history/audit rows, notifications, emails, and UI result after every destructive transition.",
        "Retest each defect after correction and retain before/after evidence.",
        "Run the production smoke test under Maintenance Mode or a controlled window, then make the release decision.",
    ]
    story.extend(checklist(item) for item in execution_order)

    story.append(Spacer(1, 5 * mm))
    story.append(callout(
        "Final release rule",
        "Do not deploy the current workspace until all intended modified and untracked files are reviewed and committed, the same commit is deployed to Railway and Vercel, all required migrations are confirmed on staging, and every release-blocking test above passes. Keep Maintenance Mode enabled when any result is missing or unclear.",
        "red",
    ))
    story.append(Spacer(1, 6 * mm))
    story.append(para("September 18-present test owner: ______________________________", "BodyCustom"))
    story.append(para("Approved commit containing local revisions: ____________________", "BodyCustom"))
    story.append(para("Evidence location: _____________________________________________", "BodyCustom"))
    story.append(para("Final result: [  ] Pass for deployment   [  ] Blocked / retest required", "BodyCustom"))
    return story


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = BaseDocTemplate(
        str(OUTPUT), pagesize=A4,
        leftMargin=17 * mm, rightMargin=17 * mm,
        topMargin=20 * mm, bottomMargin=17 * mm,
        title="BulsuScholar Revision Implementation and Test Guide",
        author="BulsuScholar Project",
        subject="Implementation summary, workflow diagrams, deployment checklist, and role acceptance tests",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=page_frame)])
    doc.build(build_story())
    print(OUTPUT)


if __name__ == "__main__":
    main()
