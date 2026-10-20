"""Generate the thesis reference note from the source-code verification answer."""

from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "ThesisPaper" / "Duplicate_Detection_Code_Verification.pdf"
GREEN = colors.HexColor("#075638")
BODY = ParagraphStyle("Body", fontName="Times-Roman", fontSize=11, leading=15, spaceAfter=7)
HEADING = ParagraphStyle("Heading", parent=BODY, fontName="Times-Bold", fontSize=14,
                         leading=18, textColor=GREEN, spaceBefore=9, spaceAfter=9,
                         keepWithNext=True)
TITLE = ParagraphStyle("Title", parent=HEADING, fontSize=22, leading=26,
                       alignment=TA_CENTER, spaceAfter=14)
SMALL = ParagraphStyle("Small", parent=BODY, fontSize=9, leading=12)
CELL = ParagraphStyle("Cell", parent=BODY, fontSize=10, leading=13, spaceAfter=0)
CELL_HEAD = ParagraphStyle("CellHead", parent=CELL, fontName="Times-Bold",
                           textColor=colors.white)


def paragraph(text, style=BODY):
    return Paragraph(text, style)


def bullet(text):
    return Paragraph(text, BODY, bulletText="-")


def table(headings, rows, widths):
    content = [[paragraph(escape(value), CELL_HEAD) for value in headings]]
    content.extend([[paragraph(escape(value), CELL) for value in row] for row in rows])
    result = Table(content, colWidths=[value * mm for value in widths], repeatRows=1)
    result.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), GREEN),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f7f4")]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#c4d6cb")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return result


def source(text):
    return paragraph("<b>Source:</b> " + escape(text), SMALL)


def footer(canvas, document):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#c4d6cb"))
    canvas.line(19 * mm, 17 * mm, 191 * mm, 17 * mm)
    canvas.setFont("Times-Roman", 9)
    canvas.setFillColor(GREEN)
    canvas.drawString(19 * mm, 12 * mm, "BulsuScholar | Thesis Code Verification | October 20, 2026")
    canvas.drawRightString(191 * mm, 12 * mm, f"Page {document.page}")
    canvas.restoreState()


def build_pdf():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    story = [
        paragraph("Duplicate Detection and<br/>Scholarship Eligibility", TITLE),
        paragraph("Source-Code Verification for Thesis Revision", HEADING),
        paragraph("Reviewed thesis passages: pages 21-22 and 40-42 of the original "
                  "Centralized Scholarship Management and Tracking System manuscript."),
        paragraph("<b>Verification scope:</b> These findings describe the local source code and "
                  "migration files reviewed for the answer. They are not a live verification of "
                  "the deployed database. Several manuscript statements need revision."),
        paragraph("1. What Fields Are Compared?", HEADING),
        paragraph("The weighted duplicate matcher uses the following fields:"),
        table(["Field", "Weight"], [
            ("Student ID", "32%"), ("Full name", "30%"), ("Email", "10%"),
            ("Contact number", "8%"), ("Course", "8%"), ("Year level", "4%"),
            ("City/municipality", "4%"), ("Province", "4%"),
        ], [127, 45]),
        Spacer(1, 3 * mm),
        paragraph("<b>Birthdate and school are not included.</b> Address comparison uses city "
                  "and province, not the complete address."),
        paragraph("Missing fields are excluded, and the score is divided by the total weight "
                  "of the available comparisons. Names are compared in their original and "
                  "alphabetically sorted word order; the higher similarity is used."),
        source("backend/grantor_algorithms.py:68"),
        PageBreak(),
        paragraph("2. Is Student ID Checked First Against Active Scholarships?", HEADING),
        paragraph("<b>Not exactly as the paper describes.</b> There are separate workflows:"),
        bullet("<b>Signup:</b> after document validation, the backend looks up roster records "
               "by Student ID and checks name consistency. It then checks whether the account "
               "ID already exists."),
        bullet("<b>Roster import/manual addition:</b> the current backend validates the scholarship, "
               "duplicate import rows, Student ID/name consistency, existing active roster "
               "assignments, and scholarship commitments."),
        bullet("<b>Weighted duplicate matching:</b> compares the supplied records; the matcher "
               "itself does not first query or filter active scholarships."),
        paragraph("Avoid describing one universal sequence of 'exact ID against active scholars, "
                  "then fuzzy fallback.'"),
        source("backend/signup_service.py:546; backend/roster_workflow_service.py:230"),
        paragraph("3. When Is Levenshtein Used?", HEADING),
        paragraph("In the weighted matcher, Levenshtein similarity is calculated for available "
                  "fields <b>even when Student IDs match</b>. It is not limited to missing or "
                  "different IDs."),
        paragraph("Signup has a separate name-consistency check: after locating the same roster "
                  "Student ID, it accepts sufficiently similar names. Signup requires a Student "
                  "ID; it does not use fuzzy matching as a missing-ID substitute."),
        paragraph("The current roster creation/import workflow uses exact ID and normalized-name "
                  "checks. Older fuzzy checks appear after unconditional return/throw branches "
                  "and are not reached in that flow. Fuzzy matching remains used by the admin "
                  "duplicate audit and grantor scholar-edit check."),
        paragraph("4. What Are the Actual Thresholds?", HEADING),
        paragraph("For the weighted matcher, <b>any one</b> of these identifies a duplicate:"),
        table(["Rule", "Requirement"], [
            ("Exact Student ID", "Sufficient by itself"),
            ("Exact email OR contact number", "Name similarity at least 72%"),
            ("General fuzzy match", "Name similarity at least 82% AND weighted score at least 84%"),
        ], [75, 97]),
        Spacer(1, 3 * mm),
        paragraph("The separate admin duplicate-grouping audit also groups records when their "
                  "weighted score reaches its default <b>84%</b>, without necessarily requiring "
                  "the 82% name condition."),
        paragraph("Signup name consistency uses <b>72%</b> direct/token-sorted similarity, or "
                  "matching last names with at least <b>50% token overlap</b>. These are "
                  "different rules, not one interchangeable threshold."),
        source("backend/grantor_algorithms.py:109 and :206; backend/signup_service.py:519"),
        PageBreak(),
        paragraph("5. How Are Scholarship Statuses Handled?", HEADING),
        table(["Existing State", "Current Behavior"], [
            ("Active committed/awarded scholarship", "Blocks another commitment/application through commitment checks."),
            ("Pending, uncommitted application", "Applications across different grantors are permitted; another open application under the same grantor is restricted."),
            ("Same existing application", "Returns the existing application instead of creating another."),
            ("Finished/completed requirements", "Does not necessarily release the scholarship. Finished can mean requirements are complete for the semester."),
            ("Cancelled/canceled, withdrawn, rejected, declined, denied, archived, resolved, expired", "Classified as closed by the shared application-open function; another application still depends on commitment clearance and other restrictions."),
            ("Rejected/denied/declined", "A 24-hour same-grantor reapplication cooldown applies."),
            ("Inactive or terminated", "Not handled consistently as universal closed statuses. Do not claim these labels automatically permit reapplication."),
        ], [59, 113]),
        Spacer(1, 4 * mm),
        paragraph("<b>Additional restriction:</b> archiving can restrict reapplication to the same "
                  "grantor until an invitation is issued."),
        paragraph("<b>Important distinction:</b> completion of the document workflow is not the "
                  "same as termination of the scholarship. The completion function explicitly "
                  "uses Finished for semester requirements."),
        source("supabase/migrations/20260906124238_multiple_applications_one_choice.sql:130"),
        source("supabase/migrations/20260918130000_automatic_roster_and_login_security.sql:299"),
        PageBreak(),
        paragraph("6. Does a Possible Duplicate Block Approval or Only Warn?", HEADING),
        paragraph("<b>It depends on the operation:</b>"),
        bullet("<b>Admin fuzzy duplicate audit:</b> groups records and hides redundant Student "
               "List entries; it does not itself block account approval or delete records."),
        bullet("<b>Grantor scholar editing:</b> a fuzzy duplicate prevents saving in the UI."),
        bullet("<b>Roster import:</b> identity/assignment conflicts block the import and create "
               "conflict records."),
        bullet("<b>Scholarship application/materials:</b> unresolved roster conflicts or existing "
               "commitments cause backend restrictions."),
        bullet("<b>Pending Account approval:</b> may still activate the account despite a roster "
               "conflict, flagging it for staff resolution instead of assigning another scholarship."),
        paragraph("Therefore, <b>'every possible duplicate blocks approval' is inaccurate</b>, "
                  "especially for account activation."),
        source("supabase/migrations/20261010154625_allow_account_approval_with_roster_resolution.sql:90"),
        Spacer(1, 5 * mm),
        KeepTogether([
            paragraph("Suggested Thesis Wording", HEADING),
            paragraph("The system combines exact identity checks, weighted record linkage using "
                      "normalized Levenshtein similarity, and transactional scholarship-commitment "
                      "controls. The weighted matcher compares Student ID, full name, email, "
                      "contact number, course, year level, city, and province. Its general "
                      "fuzzy-match rule requires at least 84% weighted similarity and 82% name "
                      "similarity, with separate exact-identifier rules. Suspected duplicates "
                      "support administrative review, while authoritative roster conflicts and "
                      "existing commitments restrict scholarship operations. Account activation "
                      "remains separate from scholarship assignment, and completion of semester "
                      "requirements does not automatically terminate an active scholarship."),
        ]),
    ]
    document = SimpleDocTemplate(
        str(OUTPUT), pagesize=A4, rightMargin=19 * mm, leftMargin=19 * mm,
        topMargin=17 * mm, bottomMargin=23 * mm,
        title="BulsuScholar Duplicate Detection - Source-Code Verification",
        author="BulsuScholar", subject="Technical reference for thesis revision",
    )
    document.build(story, onFirstPage=footer, onLaterPages=footer)
    print(OUTPUT)


if __name__ == "__main__":
    build_pdf()
