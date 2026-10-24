"""Create a targeted paper-editing guide without modifying the manuscript."""
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape
from zipfile import ZipFile
import hashlib
import json

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import LongTable, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / "docs" / "ThesisPaper"
MANUSCRIPT = FOLDER / "CENTRALIZED-SCHOLARSHIP-MANAGEMENT-AND-TRACKING-SYSTEM-FOR-BULACAN-STATE-UNIVERSITY.docx"
OUTPUT = FOLDER / "RevisionPaper.pdf"
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
GREEN = colors.HexColor("#006744")
INK = colors.HexColor("#233B31")
PALE = colors.HexColor("#EFF7F2")
LINE = colors.HexColor("#CADDD2")
STYLES = getSampleStyleSheet()
STYLES.add(ParagraphStyle("GuideTitle", fontName="Helvetica-Bold", fontSize=22, leading=26, textColor=GREEN, spaceAfter=9))
STYLES.add(ParagraphStyle("GuideHeading", fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=GREEN, spaceBefore=9, spaceAfter=5))
STYLES.add(ParagraphStyle("GuideBody", fontName="Helvetica", fontSize=9.8, leading=13.3, textColor=INK, spaceAfter=6))
STYLES.add(ParagraphStyle("GuideSmall", parent=STYLES["GuideBody"], fontSize=8.5, leading=11.5, spaceAfter=5))
STYLES.add(ParagraphStyle("GuideCell", parent=STYLES["GuideBody"], fontSize=8, leading=10.5, spaceAfter=0))
STORY = []


def clean(text):
    for old, new in {"\u2019": "'", "\u2018": "'", "\u201c": '"', "\u201d": '"', "\u2013": "-", "\u2014": "-", "\u00a0": " "}.items():
        text = text.replace(old, new)
    return text


def add(text, style="GuideBody"):
    STORY.append(Paragraph(text, STYLES[style]))


def heading(text):
    add(escape(text), "GuideHeading")


def bullet(text):
    add("- " + escape(text))


def location(title, anchor, paragraphs):
    assert any(anchor in paragraph for paragraph in paragraphs), f"Manuscript anchor missing: {anchor}"
    add("<b>Where:</b> " + escape(title))
    add("<b>Find in Word:</b> &quot;" + escape(clean(anchor)) + "&quot;", "GuideSmall")


def suggested(text):
    add("<b>Suggested wording:</b>")
    add(escape(text))


def evidence(text):
    add("<b>Implementation/evidence reference:</b> " + escape(text), "GuideSmall")


def new_page(title):
    STORY.append(PageBreak())
    add(escape(title), "GuideTitle")


def make_table(headers, rows, widths):
    cells = [[Paragraph(escape(clean(str(value))), STYLES["GuideCell"]) for value in row] for row in [headers, *rows]]
    table = LongTable(cells, colWidths=[value * mm for value in widths], repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PALE),
        ("LINEBELOW", (0, 0), (-1, 0), 1, GREEN),
        ("GRID", (0, 1), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAFCFA")]),
    ]))
    STORY.append(table)
    STORY.append(Spacer(1, 3 * mm))


def decorate(canvas, doc):
    width, height = A4
    canvas.saveState()
    canvas.setFillColor(GREEN)
    canvas.rect(0, height - 6 * mm, width, 6 * mm, fill=1, stroke=0)
    canvas.setStrokeColor(LINE)
    canvas.line(18 * mm, 17 * mm, width - 18 * mm, 17 * mm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(INK)
    canvas.drawString(18 * mm, 12 * mm, "BulsuScholar | Dr. Solis | Targeted Research-Paper Revision Guide")
    canvas.drawRightString(width - 18 * mm, 12 * mm, f"Guide page {doc.page}")
    canvas.restoreState()


def main():
    original_hash = hashlib.sha256(MANUSCRIPT.read_bytes()).hexdigest()
    with ZipFile(MANUSCRIPT) as archive:
        tree = ET.fromstring(archive.read("word/document.xml"))
    paragraphs = ["".join(node.text or "" for node in paragraph.findall(".//w:t", NS))
                  for paragraph in tree.findall(".//w:body/w:p", NS)]
    results_path = ROOT / "test-results" / "solis-system-cases.json"
    case_report = json.loads(results_path.read_text(encoding="utf-8")) if results_path.exists() else None

    add("Research-Paper Revisions", "GuideTitle")
    heading("Dr. Solis: What to edit, where to edit it, and what evidence to attach")
    add("This guide reviews the <b>current DOCX manuscript</b>, the panelist transcript-review PDF, the implemented system revision notes, and available local test evidence. It identifies targeted edits only. The manuscript itself has not been modified.")
    add("<b>Important:</b> The current manuscript already contains the corrected matching fields, weights and 72% / 82% / 84% rules. Keep those accurate parts. Do not replace them with the older field list or a claim that fuzzy checking runs only when Student ID is missing.")
    add("<b>How to find the passage:</b> Each item names the chapter, subsection and an exact paragraph opening for Word's Find command. Printed page numbers are not asserted: the supplied file is a DOCX with changeable pagination, and no freshly rendered thesis PDF was available. Do not reuse page numbers from the deleted older manuscript PDF.")
    make_table(["Edit", "Research-paper location", "Required change"], [
        ("R1", "Chapter I: Objectives; Conceptual Framework; Scope and Limitations", "Define centralized coverage and external-record availability."),
        ("R2", "Chapter II: Technical Background > Duplication Prevention; Chapter III: Module 6", "Keep correct rules; add rationale and separate warnings from award authorization."),
        ("R3", "Chapter III: Validation/Approval; Figures 3.1 and 3.2", "Explain automatic checks, manual account review, profile review and activation."),
        ("R4", "Chapter III: Roster import; Figure 3.5", "Explain External grantors, import validation and Full Admin resolution."),
        ("R5", "Chapter III: Approval and Monitoring Modules", "Add cycle-aware status rules and preservation of history."),
        ("R6", "Chapter III: Testing; Table 1", "Describe test methods, evidence sources and correct counting."),
        ("R7", "Chapter IV: System presentation; Figure 4.11", "Present Objective No. 2 results, test cases and screenshots."),
        ("R8", "Chapter III: Testing; Chapter IV: Objective No. 2 evidence", "Add document-extraction accuracy method; identify evidence still missing."),
        ("R9", "Chapter V: Finding 2; Conclusions; Recommendations 1 and 2", "Describe core validation as implemented; reserve advanced work for the future."),
    ], [12, 79, 83])
    add("<b>Boundary:</b> These revisions concern Dr. Solis's validation, matching, external-record and evidence requirements. They are not a complete revision of other panelists' security, expansion, survey or formatting comments.", "GuideSmall")

    new_page("R1. Define the Actual Scope")
    location("Chapter I > Specific Objectives > Objective No. 2", "To develop a system that validates student records", paragraphs)
    add("<b>Action:</b> Keep Objective No. 2. It already includes internal and externally sourced records. Do not weaken it into a future objective. Add the explanation below to Scope of the Study rather than rewriting the objective unnecessarily.")
    location("Chapter I > Scope of the Study", "The system manages student scholarship records and supports pre-approval validation", paragraphs)
    suggested("The system centralizes student accounts, scholarship applications, uploaded requirements, internal scholarship records, imported official rosters, scholarship commitments, monitoring information and selected audit records. Outside providers, such as local-government scholarship offices, may be represented by regular grantor accounts marked as External. Authorized users upload their official recipient lists through the existing spreadsheet roster-import process. Government, Private and Others remain separate provider classifications. External records become available for matching and assignment checks after they have been entered and validated in the system.")
    location("Chapter I > Conceptual Framework > Process-stage explanation", "After application submission, the system performs pre-approval validation", paragraphs)
    add("<b>Action:</b> Replace this process paragraph, which currently describes validation mainly as a single pre-approval event.")
    suggested("Validation occurs at several points in the scholarship workflow. The system checks registration information and uploaded documents, validates official roster imports, and checks existing scholarship commitments before accepting a conflicting application or assignment. Imported roster records may be reconciled when a matching student account is activated or completes verified login. Possible identity conflicts are referred to a Full Admin for review. Account activation, document review and scholarship assignment remain separate decisions.")
    location("Chapter I > Limitations of the Study", "The system does not provide full real-time system-to-system integration", paragraphs)
    add("<b>Action:</b> Keep the limitation on real-time external integration. Change 'manually encoded or updated' to 'uploaded through the official roster-import process, manually encoded where supported, and maintained by authorized users'. Do not claim a direct LGU, DOST or UNIFAST database connection.")
    suggested("The system can compare only the external scholarship information that has been entered and sufficiently updated within its own database. It does not independently retrieve all awards held by every student from outside agencies. Missing, incomplete or outdated provider records may therefore limit duplicate-scholarship detection. Direct external API integration remains future work, subject to permission, data-sharing agreements and security requirements.")
    evidence("docs/Solis_System_Revision.md; backend/roster_workflow_service.py; backend/auth_service.py.")

    new_page("R2. Explain the Matching Method")
    location("Chapter II > Technical Background > Duplication Prevention", "The weighted duplicate checker compares available student information", paragraphs)
    add("<b>Keep:</b> The current field list, assigned weights, missing-field handling and threshold explanation. These are already substantially corrected. Add the rationale after the paragraph describing the 72%, 82% and 84% rules.")
    suggested("Weighted record linkage with Levenshtein similarity provides an interpretable way to compare records that may contain spelling or formatting differences. Normalization reduces differences caused by case, punctuation and spacing, while edit distance measures small changes in text. Field weights allow the comparison to use more than a student's name. However, high similarity is not proof of identity: different students may share common names and other attributes. The similarity result is therefore treated as a possible-match signal, while official scholarship assignment requires separate identity, academic-cycle and commitment checks.")
    location("Chapter III > System Modules > 6. Duplication Prevention Algorithm", "Separate validation rules are also used in other workflows", paragraphs)
    add("<b>Action:</b> Keep the formula and weight table. Expand the separation between the general duplicate matcher and official roster assignment.")
    suggested("The general duplicate checker compares Student ID, full name, email address, contact number, course, year level, city or municipality, and province. Available comparisons contribute to the normalized weighted score. Exact-ID and exact-contact rules are evaluated alongside fuzzy similarity rules; fuzzy comparison is not limited to missing Student IDs. In contrast, automatic official-roster assignment requires an exact Student ID and a matching normalized full name, a verified current academic cycle, a recognized scholarship, and no competing current-cycle award. A fuzzy-name match alone does not authorize an award.")
    heading("Retain these verified distinctions")
    bullet("An exact normalized Student ID independently flags a duplicate in the general matcher.")
    bullet("Exact email/contact plus at least 72% name similarity can flag a duplicate.")
    bullet("The general fuzzy rule requires at least 82% name similarity AND 84% weighted similarity.")
    bullet("Birthdate and school are not weighted fields. Address comparison uses city/municipality and province, not a complete street address.")
    bullet("The general duplicate function computes available similarities even when the IDs match. Do not describe one universal 'ID first, fuzzy only if missing' algorithm.")
    bullet("These are configured matching thresholds, not percentages of measured accuracy. Explain them separately from test results.")
    add("<b>Citation handling:</b> Retain the existing scholarly references for Record Linkage and Levenshtein. Present implementation details as facts about this project. Do not describe the similarity function as a trained machine-learning model.")
    evidence("backend/grantor_algorithms.py; backend/tests/test_solis_system_revision.py > SolisMatchingAlgorithmTests; new migration > assign_authoritative_roster_scholarship.")

    new_page("R3. Separate Checks and Approvals")
    location("Chapter III > System Modules > 7. Approval Module", "The approval module provides scholarship grantors and coordinators", paragraphs)
    add("<b>Action:</b> Replace the module paragraph. Its statement that other applicant lists may be 'removed or disabled' is too vague; records are preserved and competing pending applications are archived at the relevant commitment/assignment transaction.")
    suggested("The system separates account activation, academic-document validation, Student Application Profile review, scholarship application decisions and scholarship assignment. Valid COR and applicable ROG submissions are approved automatically after parser and policy checks. The Student Application Profile always requires administrator approval. Student identity is required during account creation, while optional Student ID replacements by active students are accepted automatically. Grantor-specific requirements remain in the corresponding application workflow. These operations do not constitute one universal administrator approval.")
    suggested("When Manual Account Review is enabled, a Full Admin previews all applicable signup documents and uses the single Approve Account action after email confirmation and signup checks are complete. When it is disabled, a confirmed account may activate automatically only if its applicable signup requirements pass. Roster matching is performed as part of activation or verified login, but an identity or award conflict may leave the account active without granting a second scholarship. Scholarship conflict resolution is restricted to a Full Admin and requires a recorded reason.")
    location("Chapter III > Figure 3.1: Student Account Registration and Authentication Flowchart > explanation", "Figure 3.1 presents the student account registration and authentication process", paragraphs)
    add("<b>Action:</b> Update both the diagram and its explanation. The current paragraph always sends email-confirmed accounts to an administrator, which omits automatic account-review mode.")
    bullet("Add a decision: Manual Account Review enabled? YES -> admin preview/approval; NO -> automatic activation only after required signup checks pass.")
    bullet("After activation, show roster reconciliation as a separate step. A conflict routes to Full Admin resolution rather than granting another award.")
    location("Chapter III > Figure 3.2: Student Profile and Document Verification Flowchart > explanation", "Figure 3.2 presents the process for completing and verifying", paragraphs)
    add("<b>Action:</b> Replace the sentence saying documents may be automatic or manual depending on the configuration. Use document-specific branches instead.")
    suggested("COR and applicable ROG uploads are parsed and validated automatically before acceptance. Invalid submissions receive a correction message. Student Application Profile submissions remain pending until an administrator reviews them. Student ID is verified during signup and is not a recurring semester requirement; an active student may optionally replace it. Manual Account Review controls new-account activation, not whether active students' COR and ROG uploads enter Document Review.")
    evidence("backend/student_profile_service.py; backend/student_activation_service.py; docs/Solis_System_Revision.md; RevisionsTest.pdf.")

    new_page("R4. Describe External Roster Import")
    location("Chapter III > Figure 3.5: Scholarship Roster Import and Assignment Flowchart > explanation", "Figure 3.5 presents the process for importing an official scholar roster", paragraphs)
    add("<b>Action:</b> Replace the explanation and update the matching diagram. Include all three assignment opportunities: import for an active student, new-account activation, and verified login.")
    suggested("Authorized users upload an official recipient spreadsheet through the existing roster-import process. This process is shared by Internal and External grantors; External identifies an outside provider rather than a different authorization role. Preview checks required identity information, repeated rows, the recognized scholarship, the active academic cycle and possible assignment conflicts. Commit repeats the consequential checks in a database transaction instead of trusting the preview alone.")
    suggested("For an active student with a matching Student ID and normalized name, the roster may confirm one official scholarship. A matching pending application is converted without replacing its application ID or deleting its progress. Competing current-cycle pending applications are archived, and their reserved slots are released once. If no active student account exists, the roster waits until account activation. Verified student login also reconciles eligible previously imported records. Repeated processing does not create duplicate awards or notifications.")
    suggested("A mismatched identity, an unverified legacy cycle, multiple current roster alternatives or an existing competing award prevents automatic assignment. The conflict appears in Scholarship Programs under Warning and in the import window. A Full Admin verifies the supporting records and supplies a reason before resolving it. The action records the actor, cycle, selected record, reason and time in the audit history. An existing award is preserved; the resolver does not silently replace it.")
    heading("Add these branches to Figure 3.5")
    bullet("Preview errors or conflicts? -> correct the input or send the conflict to Full Admin; do not show a successful import.")
    bullet("Active matching student exists? -> attempt current-cycle assignment. No active account? -> retain a validated roster awaiting activation.")
    bullet("Existing current-cycle award? -> preserve it and flag the competing assignment.")
    bullet("Valid new assignment? -> convert matching pending application; archive competitors; release reserved slots; retain files/history.")
    bullet("Repeated import/login? -> return the existing result rather than creating another award.")
    heading("Screenshots to capture after deployment")
    bullet("Grantor Type: External, with a separate Government/Private/Others classification.")
    bullet("Roster preview containing valid and conflicting records, followed by a student scholarship assignment.")
    bullet("Warning tab with the required reason field and Keep Current Award action.")
    add("<b>Evidence rule:</b> Label local synthetic screenshots as local/synthetic. Replace or supplement them with controlled deployed screenshots only after the migration and application deployment have been tested.")
    evidence("Migration 20261023070747_solis_cycle_aware_roster_reconciliation.sql; backend/roster_workflow_service.py; backend/auth_service.py.")

    new_page("R5. Explain Semester and Status Rules")
    location("Chapter III > System Modules > 8. Monitoring Module", "This module enabled continuous tracking of scholarship records", paragraphs)
    add("<b>Action:</b> Keep the general monitoring description. Add the following paragraph and status table, and use the same terminology in Approval, Conceptual Framework and Chapter IV.")
    suggested("Scholarship eligibility is evaluated using the academic cycle and the authoritative application and commitment records. Completion of a scholarship workflow does not mean cancellation of its award. A completed award in the current cycle is therefore retained when checking for another award. Explicit previous-cycle completed records remain historical and do not by themselves block a new current-cycle application. Cancelled, terminated and inactive records are not counted as active awards, although other eligibility rules still apply. Pending applications without an award or commitment are not treated as existing awards.")
    make_table(["Record being checked", "Required explanation in the paper"], [
        ("Current-cycle committed/awarded scholarship", "Block a conflicting application or automatic competing assignment; keep the existing award."),
        ("Current-cycle Finished/Completed workflow", "Still an award for that cycle. Do not describe workflow completion as permission to hold another award immediately."),
        ("Explicit previous-cycle completed record", "Preserve history; allow the current-cycle eligibility process to continue."),
        ("Cancelled, terminated or inactive award", "Not an active-award blocker; requirements such as grades, scope, slots and current status still apply."),
        ("Pending application, no award/commitment", "Another pending application may be permitted. Official roster confirmation archives competing pending applications."),
        ("Legacy roster without an academic cycle", "Requires Full Admin verification. The system does not automatically guess the semester."),
    ], [62, 112])
    location("Chapter III > 7. Approval Module", "The approval module provides scholarship grantors and coordinators", paragraphs)
    add("<b>Consistency edit:</b> Replace 'remove or disable the student from other applicant lists' with 'archive competing current-cycle pending applications and release their reserved slots when the official assignment or applicable commitment transaction succeeds'. Do not imply deletion of application documents or historical awards.")
    add("<b>Do not overstate:</b> The table describes stored, cycle-tagged records and active system checks. It is not proof that the system knows every outside scholarship a student holds.")
    evidence("SOL-SYS-05, 06, 07, 17, 18, 19 and 20 in test-results/solis-system-cases.json.")

    new_page("R6. Revise the Testing Method")
    location("Chapter III > Testing", "Functional testing verified whether major system modules", paragraphs)
    add("<b>Action:</b> Keep the existing distinction between backend testing and survey evaluation. Add the targeted method below after the functional-testing paragraph. Do not treat TAM/ISO ratings as proof that duplicate detection is accurate.")
    suggested("The researchers added targeted automated tests for student-record matching, official roster import, scholarship assignment and prevention of conflicting current-cycle awards. Backend tests checked preview decisions, verified-login and email-code sequencing, role restrictions, grantor-type persistence and configured matching thresholds. Database tests used isolated PostgreSQL/PGlite with synthetic records to execute assignment, conflict resolution, account activation, application reservation and related checks. Expected and actual results were recorded using stable test-case identifiers.")
    suggested("The cases included exact identity matches, mismatched names, repeated imports and logins, current-cycle completed awards, prior-cycle completed records, cancelled or terminated awards, competing pending applications, slot release, legacy records without cycles, administrator restrictions, required resolution reasons and whole-batch rollback. Browser checks used synthetic API fixtures to examine visible controls, reason gating, request payloads and responsive layouts. These checks are separate from a fully authenticated production demonstration.")
    location("Chapter III > Table 1: Summary of Core Automated Backend Test Cases > discussion", "Table 1 presents the summary of the selected core test cases", paragraphs)
    add("<b>Action:</b> The existing 15-row table is a selected summary, not a complete list of all tests. Keep or refresh it only with matching evidence. Add an Objective No. 2 table using the SOL-SYS identifiers rather than relabeling unrelated old TC rows.")
    suggested("The earlier table summarizes 15 selected core cases. In the implementation verification recorded on October 23, 2026, the full backend suite passed 348 tests, including 23 added Solis-specific backend regressions. A separate focused database runner passed 27 synthetic cases. Seven frontend security checks, frontend lint and the production build also passed. These figures describe different test sets and must not be added together and reported as a single accuracy percentage or number of independent real-user trials.")
    heading("Evidence to attach or retain")
    bullet("Database case table: test-results/solis-system-cases.json, including ID, core function, expected result, actual result and status.")
    bullet("Backend test reference: backend/tests/test_solis_system_revision.py and the recorded full-suite run.")
    bullet("Matching demonstration: test-results/solis-matching-evaluation.json; label the dataset synthetic.")
    bullet("Keep production deployment, authorized real-document extraction evaluation and multi-connection live concurrency as unverified until they are actually performed.")
    evidence("docs/Solis_System_Revision.md > Reproducible Evidence and Verification Limits; scripts/test-solis-roster-workflow.mjs.")

    new_page("R7. Present Objective No. 2 Results")
    location("Chapter IV > Presentation and Description of the System > Figure 4.11: Duplicate Scholarship Validation", "Figure 4.11 presents the duplicate scholarship validation feature", paragraphs)
    add("<b>Action:</b> Replace the explanation. It currently implies that every possible duplicate restricts one universal approval process. Distinguish a similarity warning from a confirmed assignment blocker.")
    suggested("Figure 4.11 presents the system's validation of stored student and scholarship records. General similarity checking can flag possible duplicate identities for authorized review. Official roster assignment uses a separate set of identity, academic-cycle and commitment checks. A confirmed competing current-cycle award blocks another application or automatic competing assignment, while a possible fuzzy match alone does not authorize an award. Full Admins review conflicts through the Warning tab and must record a reason. Account activation remains separate from scholarship assignment.")
    location("Chapter IV > Designing and Developing a Centralized Scholarship Management and Tracking System > Validation/Approval discussion", "The Validation Module supports student-record verification", paragraphs)
    add("<b>Action:</b> Add a clearly labeled subsection, 'Results for Specific Objective No. 2: Record Validation and Prevention of Multiple Active Scholarships', near the validation discussion and Figure 4.11. Do not replace the survey results or change their respondent counts.")
    suggested("The implemented validation workflow was examined using controlled synthetic cases involving internal and external roster records. The focused database cases demonstrated that a current-cycle award, including a completed workflow in that cycle, was preserved when a competing scholarship was introduced. An explicit previous-cycle completed record did not block current-cycle processing. Mismatched names and unverified legacy cycles required staff review. Repeated processing did not duplicate the assignment, and competing pending applications were archived with their files retained and reserved slots released once.")
    suggested("The reported results demonstrate the behavior of the tested local implementation. They do not establish complete coverage of outside providers, real-document extraction accuracy or successful production deployment. Those matters require their own evidence. The case table identifies expected and observed outcomes so that readers can distinguish an implemented safeguard from an untested claim.")
    heading("Add result explanations, not screenshots alone")
    bullet("Existing scholar tries another scholarship: state the current cycle, the attempted action, the blocker and the preserved original award.")
    bullet("Previous-cycle completed award: show the old record remaining unchanged while the new current-cycle eligibility check proceeds.")
    bullet("External roster: show import, matching assignment and the Warning tab for a conflicting record.")
    bullet("Full Admin versus reviewer: show reason-required resolution and the restricted reviewer view.")
    add("Use the selected evidence table on the next page as a starting point. Attach the full 27-case artifact in an appendix if required. Confirm final table and figure numbering after editing the DOCX.")

    new_page("Objective No. 2: Evidence Table")
    add("<b>Placement:</b> Chapter IV, immediately after the new Objective No. 2 results subsection, or in an appendix referenced by that subsection. This is a selected local database-case table, not a new production test run.")
    selected_ids = {"SOL-SYS-02", "SOL-SYS-04", "SOL-SYS-05", "SOL-SYS-06", "SOL-SYS-07", "SOL-SYS-11", "SOL-SYS-12", "SOL-SYS-14", "SOL-SYS-15", "SOL-SYS-17", "SOL-SYS-19", "SOL-SYS-24"}
    if case_report:
        selected = [case for case in case_report["cases"] if case["id"] in selected_ids]
        assert len(selected) == len(selected_ids)
        rows = [(case["id"], case["coreFunction"], case["expectedResult"], f"{case['actualResult']} / {case['status']}") for case in selected]
        make_table(["Case ID", "Core function", "Expected result", "Actual / status"], rows, [25, 38, 83, 28])
        add("<b>Evidence source:</b> test-results/solis-system-cases.json. Environment: " + escape(case_report["environment"]) + ". Dataset: " + escape(case_report["dataset"]) + ".", "GuideSmall")
    else:
        add("The local case-result JSON is unavailable. Regenerate it with scripts/test-solis-roster-workflow.mjs before inserting actual results or Pass labels. Do not invent missing evidence.")
    add("<b>Discussion to add:</b> These cases support the specified identity, role, cycle and transaction rules for the controlled fixtures. Rejected actions count as successful tests when rejection was the expected safeguard. They do not measure OCR accuracy, a real-population false-positive rate, or complete live grantor/waitlist integration.")

    new_page("R8. Add Document-Accuracy Evidence")
    location("Chapter III > Testing", "In this phase, the developed system underwent testing procedures", paragraphs)
    add("<b>Action still required:</b> Dr. Solis asked for proof that uploaded student numbers and other fields are read correctly, including difficult characters such as 7 and 1. The new roster tests and matching evaluation do not supply a real COR/ROG extraction-accuracy study. Add a method now; add results only after running it.")
    heading("Method to carry out before writing results")
    bullet("Obtain authorized COR/ROG samples. Keep real documents private; use masked copies or synthetic equivalents in the paper.")
    bullet("Have an authorized person record the correct Student ID and other required fields directly from each document before comparing parser output.")
    bullet("Include text-based PDFs, clear scanned PDFs, low-quality scans, 7/1 character cases, missing fields, wrong-owner documents, wrong academic cycles and invalid file types.")
    bullet("For ROG, compare applicable final-grade/GWA information and academic-concern results against the document. Record which supported fields are actually extracted.")
    bullet("Record accepted-and-correct, accepted-but-wrong, and rejected/unreadable outcomes separately. A rejected unreadable document is not a correctly extracted document.")
    bullet("Report the sample size, sample selection, dataset conditions and counts. Do not assume a particular accuracy percentage or silently exclude difficult documents.")
    suggested("Document-extraction evaluation compares the parser's output with manually verified reference values for authorized COR and ROG samples. Student-number extraction is assessed using exact agreement with the reference value. Field-level results and document rejection outcomes are reported separately. Difficult or unreadable documents are retained in the evaluation record rather than automatically counted as successful extraction. This evaluation is distinct from fuzzy identity matching and scholarship-assignment tests.")
    make_table(["Sample ID", "Condition", "Reference vs. extracted fields", "Decision / outcome"], [
        ("DOC-001", "Clear text PDF", "Fill after inspection and execution", "Not yet evaluated"),
        ("DOC-002", "Clear scanned PDF", "Fill after inspection and execution", "Not yet evaluated"),
        ("DOC-003", "Low-quality / 7-versus-1 case", "Fill after inspection and execution", "Not yet evaluated"),
        ("DOC-004", "Wrong owner or cycle", "Record the expected rejection and actual decision", "Not yet evaluated"),
    ], [23, 42, 70, 39])
    add("<b>Do not confuse the measures:</b> The available 10-pair synthetic matching example produced five true positives, four true negatives, one false positive and no false negatives. That demonstrates a common-name limitation; its 90% sample accuracy is not measured real-student accuracy and says nothing about COR/ROG extraction accuracy.")
    evidence("backend/document_scanner.py reads PDF text, with OCR fallback for image-only PDFs where configured; parse_pdf_document applies document parsing and layout/grade extraction. Actual deployed OCR dependencies must also be verified.")

    new_page("R9. Update Findings and Recommendations")
    location("Chapter V > Summary of Findings > Finding No. 2", "2. The system implements a pre-approval validation mechanism", paragraphs)
    suggested("2. The system implements student-record verification, duplicate-record checking and cycle-aware scholarship-assignment safeguards using the internal records and validated external rosters available in its database. A separate External grantor type identifies outside providers without changing their normal grantor permissions. Conflicting identities are flagged for Full Admin verification, while a confirmed current-cycle award prevents a second competing assignment. Controlled local tests support the implemented behaviors, with live deployment and authorized real-document accuracy evaluation reported separately according to their actual verification status.")
    location("Chapter V > Conclusions > validation paragraph", "The pre-approval validation mechanism supports the prevention", paragraphs)
    suggested("The implemented validation and assignment checks support the policy of preventing conflicting active scholarships within the records available to the system. These safeguards distinguish current-cycle awards from explicit historical records and retain existing awards when a competing assignment is attempted. Similarity-based duplicate flags remain review aids rather than proof of identity or award authorization. The conclusion is limited to the implemented functions and documented tests and does not imply detection of unrecorded outside scholarships.")
    location("Chapter V > Recommendations > first substantive recommendation", "The researchers recommend improving student-record verification", paragraphs)
    add("<b>Action:</b> Replace the paragraph so basic verification and duplicate prevention are not presented as work that has been postponed. Keep future improvements genuinely advanced or unverified.")
    suggested("The researchers recommend further evaluating and refining the implemented student-record verification and duplicate-prevention mechanisms using larger authorized datasets and documented error analysis. Future improvements may include better handling of common-name false matches, additional verified identity evidence and improved extraction reliability for low-quality documents. The system's basic validation, official roster import, conflict review and cycle-aware assignment checks are implemented functions, not features deferred entirely to future developers.")
    location("Chapter V > Recommendations > external integration", "The researchers also recommend the future integration of external scholarship databases", paragraphs)
    add("<b>Action:</b> Keep direct external API integration as future work, but explicitly distinguish it from the already implemented spreadsheet roster import.")
    suggested("External provider records can already be uploaded through the official roster-import workflow and used in the system's assignment and conflict checks. Future work may add direct API-based data exchange with authorized providers to improve record freshness and completeness, subject to data-sharing agreements, access approval and security requirements. This future integration does not replace the present responsibility to upload and maintain accurate external rosters.")
    add("<b>Do not change unrelated findings:</b> Keep the existing TAM/ISO respondent counts and statistical results unless a separate verified correction is needed. Automated test results are not survey responses.", "GuideSmall")

    new_page("Editing Checklist and Plain-English Terms")
    heading("Before you finalize the paper")
    for text in [
        "Apply the migration and deploy backend/frontend in the prescribed order before describing the revision as live in production.",
        "Update only the targeted paragraphs and affected flowcharts/captions. Retain the already corrected fields, weights and thresholds.",
        "Replace vague 'approval' language with the actual action: account activation, profile review, application decision or scholarship assignment.",
        "Describe External grantors and spreadsheet imports as implemented, but do not claim a direct connection to every LGU or outside database.",
        "Insert a case table tied to actual case IDs. Explain why an expected block/rejection is a passed safeguard.",
        "State the test date, environment, fixture type and scope. Keep local tests distinct from live deployment and real-user evaluation.",
        "Complete the separate authorized COR/ROG extraction evaluation before claiming a measured document-accuracy result.",
        "Keep same-cycle completion distinct from cancellation, and explicit previous-cycle records distinct from current awards.",
        "Keep the original manuscript unchanged until you make the edits yourself; this PDF is guidance only.",
    ]:
        bullet(text)
    heading("Legend")
    make_table(["Term", "Meaning in this guide"], [
        ("Record linkage", "Comparing two stored records to check whether they may describe the same person."),
        ("Levenshtein similarity", "A score based on how many letters or characters need to be added, removed or replaced to make two texts match."),
        ("Normalized name", "A name cleaned for matching, such as making capitalization and punctuation consistent."),
        ("Roster", "An official list of scholarship recipients supplied by a grantor."),
        ("Academic cycle", "The academic year and semester attached to the record."),
        ("Commitment / award", "A stored scholarship selection or confirmed assignment that prevents a conflicting current-cycle award."),
        ("Idempotent", "Repeating the same request does not create another award or repeat its completed effects."),
        ("False positive", "The matcher flags two different people as a possible duplicate."),
        ("OCR", "Software that reads text from a scanned image rather than directly from a text-based PDF."),
    ], [42, 132])
    add("<b>Source boundary:</b> The panelist-review PDF attributes the algorithm-selection discussion to Dr. Solis with an attribution caution. The recommendation is clear, but the transcripts do not conclusively identify every speaker. Do not present this guide's wording as a direct panelist quotation.", "GuideSmall")
    doc = SimpleDocTemplate(str(OUTPUT), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=17 * mm, bottomMargin=23 * mm,
                            title="Targeted Research-Paper Revisions - Dr. Solis", author="BulsuScholar")
    doc.build(STORY, onFirstPage=decorate, onLaterPages=decorate)
    assert hashlib.sha256(MANUSCRIPT.read_bytes()).hexdigest() == original_hash, "The source manuscript changed."
    print(OUTPUT)
    print("All manuscript anchors verified; source DOCX SHA-256 unchanged.")


if __name__ == "__main__":
    main()
