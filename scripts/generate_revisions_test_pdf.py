from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "ThesisPaper" / "RevisionsTest.pdf"
GREEN = colors.HexColor("#006744")
styles = getSampleStyleSheet()
styles.add(ParagraphStyle("RevisionTitle", fontName="Helvetica-Bold", fontSize=23, leading=28, textColor=GREEN, spaceAfter=7))
styles.add(ParagraphStyle("RevisionHeading", fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=GREEN, spaceBefore=10, spaceAfter=5))
styles.add(ParagraphStyle("RevisionBody", fontName="Helvetica", fontSize=10, leading=13.5, textColor=colors.HexColor("#253B33"), spaceAfter=4))
styles.add(ParagraphStyle("RevisionNote", parent=styles["RevisionBody"], fontSize=9.5, leading=13, textColor=colors.HexColor("#52665B")))


def paragraph(text, style="RevisionBody"):
    return Paragraph(text, styles[style])


def section(title, changed, where, steps, expected):
    content = [paragraph(escape(title), "RevisionHeading"),
               paragraph("<b>Changed:</b> " + escape(changed)),
               paragraph("<b>Where:</b> " + escape(where)),
               paragraph("<b>How to test:</b>")]
    for number, step in enumerate(steps, 1):
        content.append(paragraph(f"{number}. {escape(step)}"))
    content.append(paragraph("<b>Expected result:</b> " + escape(expected)))
    return KeepTogether(content)


def page_decoration(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(GREEN)
    canvas.rect(0, height - 7 * mm, width, 7 * mm, fill=1, stroke=0)
    canvas.setStrokeColor(colors.HexColor("#CADDD2"))
    canvas.line(19 * mm, 17 * mm, width - 19 * mm, 17 * mm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#52665B"))
    canvas.drawString(19 * mm, 12 * mm, "BulsuScholar | System Revisions and Testing Guide")
    canvas.drawRightString(width - 19 * mm, 12 * mm, f"Page {doc.page}")
    canvas.restoreState()


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(str(OUTPUT), pagesize=A4, leftMargin=19 * mm, rightMargin=19 * mm,
                            topMargin=17 * mm, bottomMargin=23 * mm,
                            title="BulsuScholar Revisions and Testing Guide", author="BulsuScholar")
    story = [paragraph("System Revisions &amp; Testing", "RevisionTitle"),
             paragraph("Dr. Solis revisions | What changed, where to find it, and how to test it", "RevisionNote"),
             Spacer(1, 3 * mm),
             paragraph("<b>Deployment status:</b> The changes are local and are not yet deployed. For live testing, apply the database migration first, then deploy the backend and frontend. Your thesis papers were not edited."),
             section("1. External Grantor Type",
                     "Grantors can be marked Internal or External. This is separate from Government / Private / Others.",
                     "Admin > Grantor Management > New Grantor, or View an existing grantor.",
                     ["Create a test grantor and select External.", "Open its details afterward.", "Confirm External was saved and its classification stayed unchanged."],
                     "The grantor retains the External type without changing its classification or normal grantor permissions."),
             section("2. Automatic Scholarship Assignment",
                     "Official roster records are checked during import, account activation, and verified student login.",
                     "The existing grantor/admin Excel roster import, then Student > Scholarships.",
                     ["Create a test scholarship under the grantor.", "Import a roster containing the test student's exact Student ID and matching name.",
                      "For an active student, check Scholarships after import/login.", "For a new student, finish email confirmation and account approval first."],
                     "One scholarship assignment appears. Repeating the import or login must not create another assignment."),
             paragraph("<b>Assignment safeguard:</b> The academic cycle and existing awards are also checked. Fuzzy name similarity alone does not authorize a scholarship."),
             PageBreak(),
             paragraph("Protection &amp; Conflict Tests", "RevisionTitle"),
             section("3. Multiple-Scholarship Protection",
                     "A current-semester award cannot be silently replaced by another award.",
                     "Student scholarship applications and official roster import.",
                     ["Give a test student a current-semester scholarship.", "Try applying to another scholarship or importing a competing award."],
                     "The second application or assignment is blocked or flagged. The original award remains intact."),
             paragraph("A completed scholarship workflow still counts as an award within the same semester. Explicit previous-semester completed records remain history. Cancelled, terminated, or inactive awards do not count as active awards; other eligibility checks still apply."),
             section("4. Full Admin Conflict Review",
                     "Conflicts require verification, a written reason, and an audit record.",
                     "Admin > Scholarship Programs > Warning. The same controls are available inside the roster import window.",
                     ["Import a mismatched name or competing scholarship record.", "Open Warning as a Full Admin.", "Leave the reason empty: resolution should stay disabled.",
                      "Enter a meaningful reason and confirm the appropriate action."],
                     "An existing award can be kept, not overwritten. Reviewers cannot access the resolution controls."),
             section("5. Pending Applications and History",
                     "When an official roster confirms an award, competing current-semester pending applications are archived and their reserved slots are released.",
                     "Student > Scholarships and the existing administrator application, roster, and history records.",
                     ["Start with two pending applications.", "Import an official award for one of them.", "Check both applications, available slots, uploaded files, and history."],
                     "The matching application keeps its ID and progress. The competitor is archived. Uploaded files and historical records remain preserved."),
             Spacer(1, 2 * mm),
             paragraph("<b>Previously checked locally:</b> 348 backend tests, 27 database cases, frontend checks, and synthetic desktop/mobile browser checks passed. These results are not a claim that live deployment has already been tested.", "RevisionNote"),
             paragraph("<b>Next step:</b> Apply 20261023070747_solis_cycle_aware_roster_reconciliation.sql after earlier migrations, then deploy the backend and frontend. Detailed instructions: docs/Solis_System_Revision.md.", "RevisionNote")]
    doc.build(story, onFirstPage=page_decoration, onLaterPages=page_decoration)
    print(OUTPUT)


if __name__ == "__main__":
    main()
