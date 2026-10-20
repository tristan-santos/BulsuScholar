"""Build a targeted, page-located revision guide without changing the thesis."""

from pathlib import Path
from xml.sax.saxutils import escape

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, SimpleDocTemplate, Spacer

from generate_duplicate_detection_verification_pdf import (
    ROOT, GREEN, BODY, HEADING, TITLE, SMALL, paragraph, bullet, table,
)


OUTPUT = ROOT / "docs/ThesisPaper/Thesis_Duplicate_Detection_Targeted_Revision_Guide.pdf"
THESIS = ROOT / "docs/ThesisPaper/CENTRALIZED-SCHOLARSHIP-MANAGEMENT-AND-TRACKING-SYSTEM-FOR-BULACAN-STATE-UNIVERSITY-ORIGINAL.pdf"
PAGES = [" ".join(page.extract_text().split()) for page in PdfReader(THESIS).pages]
STORY = []
BODY.fontSize = 10.5
BODY.leading = 14


def add(text, style=BODY):
    STORY.append(paragraph(text, style))


def heading(text):
    add(text, HEADING)


def locator(location, start, end=None, page=None):
    add("<b>Exact location:</b> " + escape(location))
    if page is not None:
        assert "".join(start.split()) in "".join(PAGES[page - 1].split()), (page, start)
    add("<b>Find the paragraph beginning:</b> &quot;" + escape(start) + "&quot;", SMALL)
    if end:
        add("<b>Stop at:</b> &quot;" + escape(end) + "&quot;", SMALL)


def source(text):
    add("<b>Code reference:</b> " + escape(text), SMALL)


def new_page(title):
    STORY.append(PageBreak())
    heading(title)


def replacement(text):
    add("<b>Suggested replacement / insertion:</b>")
    add(text)


def footer(canvas, document):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#c4d6cb"))
    canvas.line(19 * mm, 17 * mm, 191 * mm, 17 * mm)
    canvas.setFillColor(GREEN)
    canvas.setFont("Times-Roman", 9)
    canvas.drawString(19 * mm, 12 * mm, "BulsuScholar | Targeted Thesis Revision Guide | October 20, 2026")
    canvas.drawRightString(191 * mm, 12 * mm, f"Guide page {document.page}")
    canvas.restoreState()


def build_pdf():
    add("Targeted Thesis<br/>Revision Guide", TITLE)
    add("Duplicate Detection, Identity Matching and Scholarship Status", HEADING)
    add("<b>Purpose:</b> Identify only the paragraphs that need correction for the six earlier "
        "questions: compared fields, checking order, Levenshtein usage, thresholds, scholarship "
        "status, and the effect of a possible duplicate. This is not a rewritten thesis.")
    add("<b>Documents reviewed:</b> the original 86-page thesis PDF and "
        "Summary_Comments_Scholarship_System_Final_Defense.docx. Page references below refer "
        "to the original thesis, whose printed numbers match its PDF page positions, not this guide.")
    add("<b>Adviser alignment:</b> Comment 4 is the primary basis (fields, threshold, handling "
        "and tests). Comments 5, 9, 2 and 12 apply to testing evidence, external-record coverage, "
        "objective/finding consistency and repeated terminology. Unrelated recommendation-model, "
        "survey, privacy and formatting revisions are outside this focused guide.")
    STORY.append(table(["Edit", "Original Thesis Location", "Purpose"], [
        ("R1", "Chapter II - Technical Background / Duplication Prevention, pp. 21-22", "Correct the short implementation explanation."),
        ("R2", "Chapter III - System Modules / 6. Duplication Prevention Algorithm, pp. 41-42", "State fields, formulas and exact thresholds."),
        ("R3", "Chapter III - 7. Approval Module and 8. Monitoring Module, p. 42", "Separate approval types; explain active vs. closed."),
        ("R4", "Chapter III - 5. Validation Module, pp. 40-41; Requirements Analysis, p. 50; Chapter IV, pp. 56-57", "Correct repeated automatic-blocking claims."),
        ("R5", "Chapter III - Testing, pp. 33-34", "Identify evidence needed; do not invent passes."),
        ("R6", "Chapter I - Introduction, p. 6; Objectives, p. 8; Conceptual Framework, p. 11; Limitations, p. 14", "Qualify guarantees and explain data coverage."),
        ("R7", "Chapter V - Finding 2, pp. 79-80; Conclusions, p. 81; Recommendations, pp. 82-83", "Align final claims with the verified behavior."),
    ], [12, 101, 59]))
    STORY.append(Spacer(1, 3 * mm))
    add("<b>Evidence boundary:</b> Replacement text is based on inspected local source and migration "
        "definitions, not a fresh production test. Thresholds are configured rules, not measured "
        "accuracy or proof that every duplicate is detected. Original files remain unchanged.", SMALL)

    new_page("R1. Correct the Technical Background Explanation")
    locator("Chapter II - Review of Related Literature and Studies > Technical Background > "
            "Duplication Prevention, pp. 21-22",
            "The duplication prevention process may", "manual review.", page=21)
    add("<b>Edit boundary:</b> Replace the last three implementation paragraphs, starting with "
        "the exact-matching paragraph on p. 21 and ending with the threshold paragraph on p. 22. "
        "Keep the introductory paragraph and the Record Linkage definition/citation. Do not "
        "replace Technology Acceptance Model, which follows on p. 22.")
    add("<b>Problems:</b> This passage lists birthdate and school, describes fuzzy matching only "
        "as a fallback, leaves the threshold unspecified, and implies every possible duplicate "
        "prevents approval. Adviser comment 4 directly requests these corrections.")
    replacement("The system uses separate identity-matching and scholarship-eligibility checks. "
        "During registration, roster records are located using the submitted Student ID and the "
        "associated name is checked for consistency. During roster import, exact student identity, "
        "existing authoritative roster assignments and scholarship commitments are validated. "
        "The weighted duplicate matcher is a separate record-comparison function; it evaluates "
        "the records supplied to it rather than independently querying only active scholarships.")
    add("The weighted matcher compares Student ID (32%), full name (30%), email (10%), contact "
        "number (8%), course (8%), year level (4%), city or municipality (4%), and province (4%). "
        "Birthdate and school are not comparison fields in this implementation. Address matching "
        "within this score is limited to city and province. Levenshtein similarity is calculated "
        "for available comparison values even when the Student IDs match. Unavailable comparisons "
        "are excluded and the remaining weights are normalized.")
    add("The general fuzzy-match rule requires at least 84% weighted similarity and 82% name "
        "similarity. An exact Student ID is independently sufficient to identify a duplicate; "
        "an exact email or contact number also identifies a duplicate when name similarity is "
        "at least 72%. The administrative grouping audit additionally uses a default 84% score "
        "threshold. A suspected match supports record review, whereas backend roster-conflict "
        "and commitment checks restrict scholarship operations. Account activation is separate "
        "from scholarship assignment and is not universally blocked by a suspected duplicate.")
    source("backend/grantor_algorithms.py:68-120, 206-215; backend/signup_service.py:519-586; "
           "backend/roster_workflow_service.py:230-292")
    add("<b>Consistency instruction:</b> Use R2 for the detailed method. Do not insert the old "
        "field list or the unspecified 'defined threshold' again in Chapter III.", SMALL)

    new_page("R2. Replace the Algorithm's Fields, Formula and Rules")
    locator("Chapter III - System Modules > 6. Duplication Prevention Algorithm, pp. 41-42",
            "The duplication prevention process begins with exact matching.",
            "only on a newly created rule-based process.", page=41)
    add("<b>Edit boundary:</b> Replace the whole body of Section 6, including its existing "
        "weighted-score formula and the threshold paragraph on p. 42. Keep the Section 6 title "
        "and stop before 7. Approval Module. This resolves questions 1-4 and adviser comment 4.")
    replacement("The duplicate-comparison function implements weighted record linkage with "
        "normalized Levenshtein similarity. It normalizes case, punctuation and whitespace before "
        "comparison. Names are compared in their original and token-sorted order, and the higher "
        "similarity is used. Exact identifier rules and fuzzy similarity rules are evaluated "
        "together; fuzzy comparison is not restricted to missing or inconsistent Student IDs.")
    STORY.append(table(["Comparison Field", "Weight"], [
        ("Student ID", "0.32"), ("Full name", "0.30"), ("Email", "0.10"),
        ("Contact number", "0.08"), ("Course", "0.08"), ("Year level", "0.04"),
        ("City/municipality", "0.04"), ("Province", "0.04"),
    ], [123, 49]))
    STORY.append(Spacer(1, 3 * mm))
    add("<b>Use these formulas:</b> S(a,b) = 1 - d(a,b) / max(len(a), len(b)); "
        "W = sum(w_i x S_i) / sum(w_i), using only included comparisons. Here d is Levenshtein "
        "edit distance, S_i is field similarity and w_i is its configured weight. "
        "If no comparisons are available, W is zero.")
    add("The function identifies a duplicate when: (1) Student IDs match exactly; or (2) email "
        "or contact number matches exactly and name similarity is at least 0.72; or (3) name "
        "similarity is at least 0.82 and W is at least 0.84. The administrative grouping audit "
        "also groups records when W reaches its default 0.84 threshold, without necessarily "
        "requiring the 0.82 name condition.")
    add("Registration uses a separate roster-name check after an exact Student ID lookup: "
        "direct or token-sorted name similarity must reach 0.72, or matching last names must "
        "have at least 0.50 token overlap. Student ID is mandatory during registration. These "
        "configured thresholds are not measured accuracy rates.")
    source("backend/grantor_algorithms.py:10-65, 68-120, 206-215; backend/signup_service.py:519-586")

    new_page("R3. Explain Active, Pending and Closed Scholarships")
    locator("Chapter III - System Modules > 7. Approval Module, p. 42",
            "The approval module provides scholarship grantors", page=42)
    add("<b>Edit boundary:</b> Replace only the body paragraph of 7. Approval Module; "
        "retain the heading. The old text treats approval as one action and says other applicant "
        "lists may be removed or disabled without explaining when the commitment occurs.")
    replacement("Account approval, document review and scholarship assignment are separate "
        "operations. Account approval may activate a student while a conflicting roster assignment "
        "is recorded for authorized resolution. Scholarship operations remain subject to backend "
        "commitment and roster-conflict checks. Students may hold uncommitted applications with "
        "different grantors, but another open application under the same grantor is restricted; "
        "repeating the same application returns the existing record. A scholarship commitment, "
        "including the commitment established by requesting materials, prevents a second "
        "commitment and closes competing applications through the transaction.")
    locator("Chapter III - System Modules > 8. Monitoring Module, p. 42",
            "This module enabled continuous tracking", page=42)
    add("<b>Edit boundary:</b> Keep the existing monitoring description. Insert the following "
        "status clarification immediately after it and before 9. Notification Module.")
    STORY.append(table(["State", "Clarification to Insert"], [
        ("Active / committed", "An existing commitment or authoritative assignment restricts another scholarship."),
        ("Pending / uncommitted", "Different-grantor applications may coexist; same-grantor open-application restrictions still apply."),
        ("Finished / completed requirements", "Completion may mean the semester's requirements are finished; it does not automatically release the scholarship commitment."),
        ("Closed records", "The shared open-application check excludes rejected, denied, declined, cancelled/canceled, withdrawn, archived, resolved and expired records. Other restrictions and stored commitments must also be checked."),
        ("Rejection / archive", "Rejection can impose a 24-hour same-grantor cooldown. An individual archive can require an invitation before reapplication to that grantor."),
        ("Inactive / terminated", "These labels are not uniformly implemented as terminal scholarship states. Do not state that either automatically permits another application."),
    ], [48, 124]))
    STORY.append(Spacer(1, 3 * mm))
    source("supabase/migrations/20260906124238_multiple_applications_one_choice.sql:4, 130-205; "
           "20260918130000_automatic_roster_and_login_security.sql:299; "
           "20261010154625_allow_account_approval_with_roster_resolution.sql:90")

    new_page("R4. Correct the Repeated Blocking Claims")
    add("<b>Problem:</b> A fuzzy match, a roster conflict and an existing commitment are "
        "not interchangeable. Adviser comments 4 and 12 require the repeated module "
        "descriptions to agree. Make the three limited replacements below.")
    locator("Chapter III - System Modules > 5. Validation Module, pp. 40-41",
            "The validation module serves as a core component", page=40)
    add("<b>Edit boundary:</b> Replace both paragraphs under Section 5, stopping before "
        "6. Duplication Prevention Algorithm. Leave the recommendation section above intact.")
    replacement("The validation module combines identity checks, duplicate-record comparison "
        "and scholarship-commitment validation. Weighted Levenshtein matching supports "
        "administrative duplicate review and grantor record editing. The current roster import "
        "workflow checks exact student identity, normalized-name consistency, active roster "
        "assignments and existing commitments; identity or assignment conflicts block the import "
        "and are recorded for resolution. Backend checks also restrict scholarship operations "
        "when unresolved roster conflicts or existing commitments are present. A fuzzy audit "
        "result does not universally prevent account activation. Coverage is limited to internal "
        "records and external records actually encoded or imported into the system.")
    locator("Chapter III - Requirements Analysis > 5. Validation and Approval Mechanism, p. 50",
            "The system implements a pre-approval validation mechanism", page=50)
    add("<b>Edit boundary:</b> Replace this numbered item's body only.")
    replacement("The system uses identity matching, duplicate-record review and transactional "
        "scholarship-commitment checks to support the one-active-scholarship policy. Suspected "
        "identity matches and authoritative roster conflicts receive different treatment. "
        "Scholarship actions are restricted by unresolved roster conflicts and existing "
        "commitments; account activation remains a separate process. Validation is limited "
        "to the records available in the system.")
    locator("Chapter IV - II. Designing and Developing a Centralized Scholarship Management "
            "and Tracking System > The Validation Module, pp. 56-57",
            "The Validation Module performs pre-approval checking", page=56)
    add("<b>Edit boundary:</b> Replace the one paragraph spanning the page break; stop before "
        "The Approval Module on p. 57.")
    replacement("The Validation Module provides record-comparison and scholarship-conflict "
        "checks. The administrative fuzzy audit groups potential duplicate identities and "
        "suppresses redundant Student List entries without deleting records or itself blocking "
        "account approval. The current roster workflow records identity and assignment conflicts "
        "and blocks conflicting imports. Backend commitment and roster checks restrict affected "
        "scholarship operations until the relevant conflict is resolved.")
    source("src/pages/AdminDashboard.jsx:1958-1989; src/pages/ProviderDashboard.jsx:3150-3178, "
           "3255-3320; backend/roster_workflow_service.py:230-340; "
           "backend/scholarship_choice_service.py:69-111")

    new_page("R5. Add Evidence Without Inventing Test Results")
    locator("Chapter III - Research Methods > Testing, pp. 33-34",
            "Functional testing verified whether each system module", page=33)
    add("<b>Edit boundary:</b> In this paragraph, replace only the sentence beginning "
        "'The Decision Tree recommendation process and the Record Linkage...' as it concerns "
        "duplicate validation. Retain recommendation-test claims only if separate evidence "
        "exists. Insert the duplicate-test table before the next evaluation paragraph "
        "beginning 'The developed system was also evaluated'. Adviser comments 4 and 5 apply.")
    replacement("Duplicate-validation testing must distinguish the weighted comparison "
        "function, registration identity checks, roster import restrictions and transactional "
        "scholarship-commitment checks. For each executed case, report the input, expected "
        "result, actual result, status and evidence reference. Configured similarity thresholds "
        "and source-code inspection alone do not establish accuracy or successful deployment.")
    add("<b>Evidence to collect:</b> The following are required scenarios, not executed results. "
        "Use 'Not yet recorded' for actual results and status until a traceable run is attached.")
    STORY.append(table(["Suggested ID", "Scenario", "Expected Result"], [
        ("DD-01", "Exact Student ID; other fields differ", "Weighted matcher identifies a duplicate via exact ID."),
        ("DD-02", "Different IDs; spelling variations", "Fuzzy result follows both the 82% name and 84% weighted thresholds."),
        ("DD-03", "Missing ID", "Registration rejects missing ID; generic comparison can still evaluate available fields."),
        ("DD-04", "Threshold boundaries and missing fields", "Check just below/at 72%, 82%, 84%; renormalize available comparisons."),
        ("DD-05", "Existing active commitment", "New scholarship action is blocked; account approval is evaluated separately."),
        ("DD-06", "Pending applications", "Different grantors may coexist; same-grantor duplicate is restricted/idempotent."),
        ("DD-07", "Closed, inactive and terminated labels", "Verify each label separately; do not assume inactive/terminated release a commitment."),
        ("DD-08", "Finished semester requirements", "Completion alone does not permit a second commitment."),
        ("DD-09", "Possible fuzzy duplicate vs. roster conflict", "Audit groups records; roster conflict blocks import and records a conflict."),
        ("DD-10", "Unencoded external scholarship", "Document the coverage limitation, not a claim of detecting unseen records."),
    ], [23, 59, 90]))
    STORY.append(Spacer(1, 3 * mm))
    add("<b>Evidence note:</b> A roster identity-mismatch test exists in "
        "backend/tests/test_roster_workflow_service.py. This matrix was not executed here. "
        "Do not infer Pass results from the earlier summary PDF.", SMALL)

    new_page("R6. Qualify Only the Relevant Chapter I Claims")
    add("These are short consistency edits for adviser comments 2, 4 and 9, not a rewrite of "
        "the background, objectives or limitations.")
    locator("Chapter I - Introduction, p. 6",
            "One major concern in scholarship management", page=6)
    add("<b>Edit boundary:</b> Keep the literature discussion. Replace only the final sentence "
        "starting 'This ensures that duplication is prevented...'.")
    replacement("These checks support the prevention of conflicting scholarship commitments "
        "among records available in the system; they do not guarantee detection of every "
        "duplicate identity or scholarship held outside its recorded data.")
    locator("Chapter I - Objectives of the Study > Specific Objectives > Objective 2, p. 8",
            "To develop a system that validates student records", page=8)
    add("<b>Edit boundary:</b> Replace Objective 2 only; keep its number and the other objectives.")
    replacement("To develop a system that validates student identities, flags possible duplicate "
        "records for authorized review, and restricts conflicting active scholarship commitments "
        "using internal and externally sourced records encoded or imported into the system.")
    locator("Chapter I - Conceptual Framework > process-stage discussion, p. 11",
            "After application submission, the system performs", page=11)
    add("<b>Edit boundary:</b> Replace the sentences from 'After application submission...' "
        "through 'another active scholarship.' Retain the final monitoring/reporting sentence.")
    replacement("The system checks available identities, authoritative roster assignments and "
        "existing scholarship commitments at the relevant workflow stages. Uncommitted "
        "applications may exist under different grantors, but committing to a scholarship "
        "restricts another commitment and closes competing applications. Account approval is "
        "separate and may activate a student while a roster conflict awaits staff resolution. "
        "Authorized users review applications and documentary requirements through their "
        "respective workflows.")
    locator("Chapter I - Scope and Limitations of the Study > Limitations of the Study, p. 14",
            "The system does not provide full real-time system-to-system integration", page=14)
    add("<b>Edit boundary:</b> Keep the existing external-integration paragraph; it already "
        "discloses manual encoding. Append the two sentences below before the accuracy paragraph.")
    replacement("Duplicate and commitment checking covers only records entered or imported "
        "into the system. A scholarship absent from these records cannot be detected by "
        "the matching process, and similarity thresholds may produce false matches or "
        "missed matches.")
    source("backend/grantor_algorithms.py:126-146; backend/signup_service.py:546-586; "
           "backend/scholarship_choice_service.py:69-111")

    new_page("R7. Align Findings, Conclusions and Recommendations")
    locator("Chapter V - Summary of Findings > Finding 2, pp. 79-80",
            "The system implements a pre-approval validation mechanism", page=79)
    add("<b>Edit boundary:</b> Replace Finding 2 only, including its continuation on p. 80. "
        "Keep the finding number; do not change respondent counts or survey findings here.")
    replacement("The system includes exact identity checks, weighted Levenshtein-based "
        "record comparison and scholarship-commitment controls. In the inspected implementation, "
        "fuzzy matching supports duplicate-record review, whereas the current roster workflow "
        "checks identity and assignment conflicts and backend transactions restrict conflicting "
        "scholarship commitments. These mechanisms operate on the internal and externally "
        "sourced records actually stored in the system. Their demonstrated effectiveness "
        "must be reported using the documented test cases rather than inferred from their "
        "presence in the code.")
    locator("Chapter V - Conclusions > duplicate-validation paragraph, p. 81",
            "The pre-approval validation mechanism supports the prevention of duplicate scholarship allocation", page=81)
    add("<b>Precise paragraph locator:</b> Use the paragraph beginning 'The pre-approval "
        "validation mechanism supports the prevention of duplicate scholarship allocation' "
        "and ending 'one active scholarship per student.' Replace that paragraph only.")
    replacement("The implemented identity-matching and scholarship-commitment mechanisms "
        "support the institutional one-active-scholarship policy within the records available "
        "to the system. Suspected duplicate identities, roster conflicts and existing commitments "
        "have distinct workflow effects; account activation is not equivalent to scholarship "
        "assignment. The implementation does not establish universal duplicate detection, "
        "and conclusions about its effectiveness must remain limited to documented test results "
        "and data coverage.")
    locator("Chapter V - Recommendations > student-record verification paragraph, pp. 82-83",
            "The researchers recommend improving student", page=82)
    add("<b>Edit boundary:</b> Keep the existing recommendation; it already acknowledges false "
        "matches and missing data. Insert the following sentence after its continuation ending "
        "'inaccurate validation results.' on p. 83.")
    replacement("Future validation should evaluate the configured similarity thresholds with "
        "labeled matching and nonmatching records and standardize scholarship closure behavior "
        "for inactive and terminated labels across workflows.")
    add("<b>Before submission:</b> Run the scenarios in R5 and attach actual evidence before "
        "turning implementation observations into claims of tested effectiveness. Keep the "
        "existing external-integration recommendation on p. 83. Update cross-references and "
        "page numbers only after the final manuscript is repaginated.")
    heading("What This Guide Does Not Change")
    add("The original thesis, adviser DOCX and application source remain unchanged. This guide "
        "does not resolve the adviser's separate recommendation-model, respondent-count, "
        "evaluation-calculation, security-evidence or research-gap comments. It identifies "
        "only the exact duplicate-detection and related consistency passages requested.")

    document = SimpleDocTemplate(
        str(OUTPUT), pagesize=A4, leftMargin=19 * mm, rightMargin=19 * mm,
        topMargin=17 * mm, bottomMargin=23 * mm,
        title="BulsuScholar - Targeted Thesis Revision Guide",
        author="BulsuScholar", subject="Exact paragraph locations and suggested duplicate-detection revisions",
    )
    document.build(STORY, onFirstPage=footer, onLaterPages=footer)
    print(OUTPUT)


if __name__ == "__main__":
    build_pdf()
