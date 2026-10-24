"""Render the transcript-based panelist recommendations without changing meaning."""

from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle, PageBreak


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs/ThesisPaper/Panelist_Recommendations_Transcript_Review.pdf"
GREEN = colors.HexColor("#075638")
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="ReportTitle", fontName="Helvetica-Bold", fontSize=19, leading=23, textColor=GREEN, spaceAfter=10))
styles.add(ParagraphStyle(name="SectionTitle", fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=GREEN, spaceAfter=9))
styles.add(ParagraphStyle(name="ReportBody", fontName="Helvetica", fontSize=9.5, leading=13, spaceAfter=7, textColor=colors.HexColor("#23352d")))
styles.add(ParagraphStyle(name="Cell", parent=styles["ReportBody"], fontSize=9, leading=12, spaceAfter=0))
styles.add(ParagraphStyle(name="SourceCell", parent=styles["Cell"], fontSize=8.4, leading=11))
styles.add(ParagraphStyle(name="TableHead", parent=styles["Cell"], fontName="Helvetica-Bold", textColor=colors.white))


ROMEL = [
    ("Correct the flowchart.", "Use connectors consistently, simplify the diagram, and show appropriate ending paths for processes that can finish directly.", "N36 p. 1; AF p. 1", "Approximately 00:19-01:00"),
    ("Identify all sensitive information.", "Do not limit the explanation to passwords and user IDs; include scholarship documents and the Student Application Profile. Explain their protection.", "N36 p. 1; AF pp. 1-2", "Approximately 01:47-03:34"),
    ("Add or improve protection for downloadable documents.", "Account passwords alone do not explain how downloaded files remain protected. He used password-protected PDFs as an example of another security layer, not necessarily the only acceptable solution.", "N36 pp. 1-2; AF p. 2", "03:34-04:15"),
    ("Document security testing.", "Show whether the security features and protection of sensitive information are included in the test cases.", "N36 p. 1; AF p. 1", "Approximately 01:47"),
    ("Explain the algorithms and their purposes.", "Identify which algorithm supports account creation, duplicate checking, and scholarship recommendations.", "N36 p. 1; AF pp. 1-2", "Approximately 01:54-02:34"),
    ("Clarify export-security claims.", "Explain what protection actually exists for PDF, CSV, and Excel exports. Exporting a file and protecting a file are different functions.", "N36 p. 2; AF p. 2", "04:33-05:20"),
    ("Explain vulnerabilities found during testing.", "Identify the affected accounts or processes and clarify the suspected attack being discussed.", "N36 p. 2; AF pp. 2-3", "05:32-06:26"),
]

SOLIS = [
    ("Demonstrate Specific Objective No. 2.", "Provide test cases showing student-record validation, duplicate detection, and prevention of multiple active scholarships. Clearly distinguish manual review from automatic validation.", "N36 pp. 2-3; AF p. 4", "07:23-09:17"),
    ("Prove document-extraction accuracy.", "Show evidence that student numbers and other information are read correctly from uploaded documents, including unclear images where characters such as 7 and 1 could be confused.", "N36 p. 3; AF pp. 4-5", "09:17-10:58"),
    ("Present documented test results.", 'Provide test-case tables and explain their results. Clarify the actual testing count rather than relying on statements such as "tested many times."', "N36 pp. 3-4; AF pp. 5-7", "Approximately 11:03-13:50"),
    ("Explain algorithm implementation and selection.", "Describe how matching works, not merely where the algorithm is used. Explain why that algorithm was chosen. Attribution qualification appears on the final page.", "N36 p. 4; AF pp. 7-8", "14:03-14:56"),
    ('Define the scope of "centralized."', "Explain which records, providers, processes, and transactions are brought together. Having an administrator is not, by itself, a sufficient explanation.", "N36 p. 5; AF p. 8", "15:20-16:16"),
    ("Test duplicate-scholarship prevention across more grantors.", "Show what happens when a student with an existing scholarship tries to apply elsewhere. Explain when the application becomes locked.", "N36 p. 5; AF pp. 8-9", "Approximately 16:16-18:48"),
    ("Include external scholarship-recipient lists.", "Add a way to upload records from outside providers, such as local-government scholarships, and use them in comparison. Do not rely only on students declaring their existing scholarships. She wanted this included in the system, not merely postponed as a future recommendation.", "N36 p. 6; AF pp. 9-10", "Approximately 19:39-21:29"),
    ("Explain pre-approval validation clearly.", "Identify who checks the application, when checking happens, whether it is manual or automatic, and which documents or grantor-specific requirements are examined.", "N36 p. 7; AF pp. 11-12", "23:30-25:31"),
    ("Revise Recommendation No. 1.", "Basic validation, verification, and record matching that are necessary to achieve Objective No. 2 should already be implemented - not presented only as future improvements.", "N36 p. 7; AF p. 13", "25:34-26:14"),
]

THON = [
    ("Organize Chapter IV according to the specific objectives.", "Present each objective with the corresponding findings, results, and discussion so readers can clearly see how it was answered.", "N36 p. 8; AF p. 13", "26:24-26:43"),
    ("Explain future expansion and continued operation.", "Describe how the client can continue using and extending the system after the researchers leave, including additional grantors, scholarship processes, and features. Explain how - not simply that future researchers can expand it.", "N36 p. 8; AF pp. 13-14", "Approximately 26:43-27:56"),
]

CAUTIONS = [
    ("Accuracy metrics", 'At approximately 15:07, AF labels the instruction to use metrics as Speaker 3, the speaker associated with Dr. Romel earlier. The DOCX labels this intervention "Panelist (unclear)." This is likely an additional recommendation from Dr. Romel, but not conclusively attributed.'),
    ("Algorithm implementation and selection", "AF assigns the 14:03-14:56 discussion to Speaker 5, associated with Ma'am Solis. However, the DOCX marks these remarks as an unclear panelist. The recommendation is clear; the attribution is less certain."),
    ("Closing privacy discussion", "The PDFs continue after the DOCX ends. The discussion around 28:03 onward returns to sensitive information and document visibility, but speaker attribution is inconsistent. Do not confidently assign it as a separate recommendation from Dr. Concepcion."),
    ("Recommendation No. 1", "The cross-check report flags conflicting wording. The consistent contextual meaning is that functionality required by Objective No. 2 belongs in the implemented system, rather than only in future recommendations."),
    ("Accuracy and testing numbers", "The transcripts disagree on these figures. They do not establish a reliable accuracy percentage or confirmed number of test runs."),
]


def paragraph(text, style="ReportBody"):
    return Paragraph(text, styles[style])


def recommendation_table(rows):
    data = [[paragraph("Recommendation / Requested Clarification", "TableHead"), paragraph("Where to Find It", "TableHead")]]
    for title, body, pages, time in rows:
        data.append([
            paragraph(f"<b>{escape(title)}</b><br/>{escape(body)}", "Cell"),
            paragraph(f"{escape(pages)}<br/>{escape(time)}", "SourceCell"),
        ])
    result = Table(data, colWidths=[122 * mm, 52 * mm], repeatRows=1, hAlign="LEFT")
    result.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), GREEN),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f2f7f4")]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbdcd3")),
    ]))
    return result


def page_decoration(canvas, document):
    canvas.saveState()
    width, height = A4
    canvas.setStrokeColor(GREEN)
    canvas.setLineWidth(2)
    canvas.line(18 * mm, height - 14 * mm, width - 18 * mm, height - 14 * mm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(GREEN)
    canvas.drawString(18 * mm, 12 * mm, "BulsuScholar | Panelist Recommendations | October 23, 2026")
    canvas.drawRightString(width - 18 * mm, 12 * mm, f"Page {document.page}")
    canvas.restoreState()


def build_pdf():
    document = SimpleDocTemplate(str(OUTPUT), pagesize=A4, rightMargin=18 * mm,
        leftMargin=18 * mm, topMargin=21 * mm, bottomMargin=22 * mm,
        title="Panelist Recommendations - Transcript Review", author="BulsuScholar")
    story = [paragraph("Panelist Recommendations<br/>Transcript Review", "ReportTitle"),
        paragraph("Recommendations from the three transcripts, reviewed alongside the cross-check report. Panelists are grouped using the names supplied by the requester. These are paraphrased recommendations, not word-for-word quotations."),
        paragraph("<b>Source key</b><br/><b>DOCX:</b> CAPSTONE-FINAL-DEFENSE-Transcript (1).docx<br/><b>N36:</b> New Recording 36.pdf<br/><b>AF:</b> Audio file.pdf, which provides timestamps.<br/>Page numbers below refer to PDF pages. Attribution cautions and the cross-check report are discussed on the final page."),
        Spacer(1, 3 * mm),
        paragraph("1. Dr. Romel Pabustan", "SectionTitle"),
        paragraph('The DOCX identifies this section as "PANELIST 1 - SIR ROMEL."'),
        recommendation_table(ROMEL), PageBreak(),
        paragraph("2. Dr. Jeniffer Solis", "SectionTitle"),
        paragraph('The DOCX identifies this section as "PANELIST 2 - MA\'AM SOLIS."'),
        recommendation_table(SOLIS), PageBreak(),
        paragraph('3. Dr. Anthony "Thon/Ton" Concepcion', "SectionTitle"),
        paragraph('The DOCX identifies this section as "PANELIST 3 - SIR THON."'),
        recommendation_table(THON), Spacer(1, 6 * mm),
        paragraph("Attribution and Wording That Need Caution", "SectionTitle")]
    for title, body in CAUTIONS:
        story.append(paragraph(f"<b>{escape(title)}.</b> {escape(body)}"))
    story.append(paragraph("These findings follow the limitations documented in <b>Transcript_Cross_Check_Report.docx</b>. The files are text transcriptions; the original playable audio was not available to resolve uncertain wording or voices."))
    document.build(story, onFirstPage=page_decoration, onLaterPages=page_decoration)
    print(OUTPUT)


if __name__ == "__main__":
    build_pdf()
