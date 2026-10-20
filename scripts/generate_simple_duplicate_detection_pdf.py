"""Rephrase the verification note in plain English without changing its findings."""

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, SimpleDocTemplate, Spacer

from generate_duplicate_detection_verification_pdf import (
    ROOT, GREEN, BODY, HEADING, TITLE, SMALL, paragraph, bullet, table,
)


OUTPUT = ROOT / "docs/ThesisPaper/Duplicate_Detection_Code_Verification.pdf"


def footer(canvas, document):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#c4d6cb"))
    canvas.line(19 * mm, 17 * mm, 191 * mm, 17 * mm)
    canvas.setFillColor(GREEN)
    canvas.setFont("Times-Roman", 9)
    canvas.drawString(19 * mm, 12 * mm, "BulsuScholar | Duplicate Checking Explained Simply")
    canvas.drawRightString(191 * mm, 12 * mm, f"Page {document.page}")
    canvas.restoreState()


def build_pdf():
    story = []

    def add(text, style=BODY):
        story.append(paragraph(text, style))

    def heading(text):
        add(text, HEADING)

    def source(text):
        add("<b>Where this is written in the code:</b> " + text, SMALL)

    def page(title):
        story.append(PageBreak())
        heading(title)

    add("How the System Checks<br/>Student and Scholarship Records", TITLE)
    add("The Same Findings, Explained in Simple English", HEADING)
    add("This guide answers the same six questions as the earlier version. The facts, "
        "percentages and warnings have not changed. Only the explanation is simpler.")
    add("<b>Important:</b> The answers come from the saved program code and database-update "
        "files. They do not mean that we tested every rule on the live website. The related "
        "thesis parts are on pages 21-22 and 40-42 of the original paper.")
    heading("Word Guide / Legend")
    add("Use this list whenever an unfamiliar word appears in the next pages.")
    story.append(table(["Word", "Simple Meaning"], [
        ("Record / field", "A record is saved information about one person or application. A field is one detail, such as a name or Student ID."),
        ("Duplicate / possible duplicate", "Two records that may describe the same student. A possible match still needs careful checking."),
        ("Grantor / roster", "A grantor provides a scholarship. A roster is an official list of scholars."),
        ("Exact match", "The values are the same after the program's text-cleaning rules are applied."),
        ("Levenshtein", "A way to count letter changes between two texts. A change can add, remove or replace a letter. For example, Ana becomes Anna by adding one n."),
        ("Fuzzy matching / similarity", "Checking how close two texts are, even if they are not exactly the same. Levenshtein helps calculate this."),
        ("Weight / weighted score", "A weight says how much a detail counts. The weighted score combines the comparisons. Student ID counts more than province."),
        ("Threshold", "The minimum score needed for a rule to apply. At least 84% means 84% or higher."),
        ("Token / token overlap", "A token is a word in a name. Token overlap measures shared name words. Token-sorted means putting the words in alphabetical order."),
        ("Scholarship commitment", "The system has linked the student to a scholarship and prevents another conflicting scholarship commitment."),
        ("Conflict / flag / audit", "A conflict means records or assignments disagree. A flag marks something for checking. An audit checks records for possible problems."),
        ("Backend / UI", "The backend checks and saves information on the server. The UI is the screen and buttons the user sees."),
    ], [48, 124]))

    page("1. Which Student Details Are Compared?")
    add("The weighted duplicate checker compares these details. The percentage shows how "
        "much each detail counts in the combined score when all comparisons are available.")
    story.append(table(["Student Detail", "How Much It Counts"], [
        ("Student ID", "32%"), ("Full name", "30%"), ("Email", "10%"),
        ("Contact number", "8%"), ("Course", "8%"), ("Year level", "4%"),
        ("City or municipality", "4%"), ("Province", "4%"),
    ], [113, 59]))
    story.append(Spacer(1, 3 * mm))
    add("<b>Birthdate and school are not used in this score.</b> For the address, this "
        "checker uses only city or municipality and province, not the full address.")
    add("If a detail is missing, the checker leaves that comparison out and adjusts the "
        "total using the weights of the comparisons it can use. It also compares names in "
        "their original word order and with their words in alphabetical order. It keeps "
        "whichever name score is higher.")
    source("backend/grantor_algorithms.py:68")
    heading("2. Does It Always Check Student ID First?")
    add("<b>No. There is no single checking order for every task.</b> Different tasks have "
        "different checks:")
    story.append(bullet("<b>Creating an account:</b> after checking the documents, the system "
        "looks for the Student ID in the scholar list and checks whether the names agree. "
        "It then checks whether an account with that ID already exists."))
    story.append(bullet("<b>Adding a scholar or uploading a scholar list:</b> the server checks "
        "the scholarship, repeated rows, Student ID and name, existing active scholar-list "
        "assignments, and scholarship commitments."))
    story.append(bullet("<b>Using the weighted duplicate checker:</b> it compares the records "
        "given to it. That checker does not first search the database for active scholarships."))
    add("<b>For the paper:</b> Do not say that every process follows 'check the exact Student "
        "ID against active scholars first, then use similar names if needed.' That does not "
        "describe every part of the current program.")
    source("backend/signup_service.py:546; backend/roster_workflow_service.py:230")

    page("3. When Does It Use Levenshtein?")
    add("Levenshtein helps compare text with small differences. See the Word Guide on page 1. "
        "The program turns the number of text changes into a similarity score.")
    add("In the <b>weighted duplicate checker</b>, it compares the available details even "
        "when the Student IDs are already the same. It is <b>not used only when an ID is "
        "missing or different</b>.")
    add("Account creation has a separate name check. After finding the same Student ID in "
        "the scholar list, it checks whether the names are close enough. A Student ID is "
        "required to create an account. A similar name cannot replace a missing Student ID.")
    add("The current process for creating or uploading scholar-list entries checks exact "
        "IDs and names after basic text cleaning. Older fuzzy checks are still written in "
        "that part of the program, but the process finishes or stops before reaching them. "
        "They do not run there. Fuzzy matching is still used when the admin checks for "
        "duplicate records and when a grantor edits a scholar's record.")
    heading("4. What Scores Are Needed?")
    add("In the weighted checker, <b>any one</b> of these rules can mark two records as a duplicate:")
    story.append(table(["Rule", "What Must Happen"], [
        ("Same Student ID", "An exact Student ID match is enough by itself."),
        ("Same email OR contact number", "The email or contact number matches exactly, AND the names are at least 72% similar."),
        ("General similarity check", "The names are at least 82% similar, AND the combined weighted score is at least 84%. Both are needed."),
    ], [56, 116]))
    story.append(Spacer(1, 3 * mm))
    add("<b>The admin's grouping check has an extra rule:</b> it can group records when "
        "the combined score reaches its default 84%. For that rule, it does not always "
        "require the separate 82% name score.")
    add("<b>The account-creation name check is different:</b> it accepts a name score of "
        "at least 72%, using either the original or alphabetically arranged name words. "
        "It can also accept the same last name with at least 50% token overlap, which "
        "measures shared name words.")
    add("These numbers belong to different rules. Do not describe them as one score used "
        "everywhere. They are matching cutoffs, not the percentage of correct results.")
    source("backend/grantor_algorithms.py:109, :206; backend/signup_service.py:519")

    page("5. What Happens to Each Scholarship Status?")
    add("A student's application status and scholarship commitment both matter. A status "
        "word by itself does not always decide whether the student can apply again.")
    story.append(table(["Existing Status or Situation", "What the Current Program Does"], [
        ("Active scholarship with a commitment or award", "The commitment checks stop another conflicting scholarship commitment or application."),
        ("Pending application, with no commitment yet", "The student may apply to different grantors. Another open application under the same grantor is restricted."),
        ("The same application is sent again", "The system returns the saved application instead of making another copy."),
        ("Finished or completed requirements", "This does not always end the scholarship. Finished may only mean the student completed the semester's requirements."),
        ("Cancelled/canceled, withdrawn, rejected, declined, denied, archived, resolved or expired", "The shared application-status check treats these as closed. However, the system must still check any remaining commitment and other restrictions before allowing a new application."),
        ("Rejected, denied or declined", "A 24-hour waiting period applies before applying again to the same grantor."),
        ("Inactive or terminated", "Different parts of the program do not handle these words in the same way. Do not say that either word automatically allows a new application."),
    ], [61, 111]))
    story.append(Spacer(1, 4 * mm))
    add("<b>One more rule:</b> if a grantor archives a student's scholar record, the student "
        "may need an invitation before applying to that grantor again.")
    add("<b>Remember:</b> 'I finished my documents' does not mean 'my scholarship has ended.' "
        "The program uses Finished for completed semester requirements. That alone does "
        "not remove a scholarship commitment.")
    source("supabase/migrations/20260906124238_multiple_applications_one_choice.sql:130; "
           "20260918130000_automatic_roster_and_login_security.sql:299")

    page("6. Does a Possible Duplicate Always Stop Approval?")
    add("<b>No. It depends on what the user is doing.</b>")
    story.append(bullet("<b>Admin checks for similar records:</b> the system groups possible "
        "duplicates and hides extra entries in the Student List. This check alone does "
        "not stop account approval and does not delete the saved records."))
    story.append(bullet("<b>Grantor edits a scholar's record:</b> if the fuzzy checker finds "
        "a duplicate, the screen prevents the grantor from saving the change."))
    story.append(bullet("<b>Grantor uploads a scholar list:</b> identity or scholarship-assignment "
        "conflicts stop the import. The system also saves a conflict record for checking."))
    story.append(bullet("<b>Student applies or requests materials:</b> an unresolved scholar-list "
        "conflict or an existing scholarship commitment can cause the server to stop the action."))
    story.append(bullet("<b>Admin approves a Pending Account:</b> the account may still become "
        "active even if a scholar-list conflict exists. The system marks the conflict for "
        "staff to fix instead of assigning another scholarship."))
    add("<b>For the paper:</b> 'Every possible duplicate stops approval' is not correct. "
        "Making an account active and giving that student a scholarship are separate actions.")
    source("supabase/migrations/20261010154625_allow_account_approval_with_roster_resolution.sql:90")
    heading("Suggested Thesis Explanation in Simple English")
    add("The system uses exact identity checks, text-similarity checks and scholarship "
        "commitment rules. The weighted checker compares Student ID, full name, email, contact "
        "number, course, year level, city and province. Its general similarity rule requires "
        "a combined score of at least 84% and a name score of at least 82%. It also has "
        "separate rules for exact matching details. Possible duplicate records help staff "
        "review student information. Conflicting scholar-list assignments and existing "
        "commitments restrict scholarship actions. Approving an account is different from "
        "assigning a scholarship. Finishing semester requirements does not automatically "
        "end an active scholarship.")
    document = SimpleDocTemplate(
        str(OUTPUT), pagesize=A4, leftMargin=19 * mm, rightMargin=19 * mm,
        topMargin=17 * mm, bottomMargin=23 * mm,
        title="BulsuScholar - Duplicate Checking Explained Simply",
        author="BulsuScholar", subject="Plain-English explanation with a word guide; original findings preserved",
    )
    document.build(story, onFirstPage=footer, onLaterPages=footer)
    print(OUTPUT)


if __name__ == "__main__":
    build_pdf()
