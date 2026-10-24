"""Generate traceable Romel deliverables without editing the thesis or Solis PDFs."""
import hashlib
import json
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape
from zipfile import ZipFile

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import LongTable, PageBreak, Paragraph, SimpleDocTemplate, Spacer, TableStyle

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / "docs/ThesisPaper"
MANUSCRIPT = FOLDER / "CENTRALIZED-SCHOLARSHIP-MANAGEMENT-AND-TRACKING-SYSTEM-FOR-BULACAN-STATE-UNIVERSITY.docx"
GREEN = colors.HexColor("#006744")
INK = colors.HexColor("#233B31")
STYLES = getSampleStyleSheet()
STYLES.add(ParagraphStyle("RomelTitle", fontName="Helvetica-Bold", fontSize=23, leading=28, textColor=GREEN, spaceAfter=10))
STYLES.add(ParagraphStyle("RomelHead", fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=GREEN, spaceBefore=10, spaceAfter=6, keepWithNext=True))
STYLES.add(ParagraphStyle("RomelBody", fontName="Helvetica", fontSize=10, leading=14, textColor=INK, spaceAfter=7))
STYLES.add(ParagraphStyle("RomelSmall", parent=STYLES["RomelBody"], fontSize=8.5, leading=11.5))
STYLES.add(ParagraphStyle("RomelCell", parent=STYLES["RomelBody"], fontSize=8, leading=10.5, spaceAfter=0))


def clean(value):
    return str(value).replace("\u2019", "'").replace("\u2018", "'").replace("\u2013", "-").replace("\u2014", "-").replace("\u00a0", " ")


def p(text, style="RomelBody"):
    return Paragraph(escape(clean(text)).replace("\n", "<br/>"), STYLES[style])


def heading(story, title):
    story.append(p(title, "RomelHead"))


def table(story, headers, rows, widths):
    data = [[p(cell, "RomelCell") for cell in row] for row in [headers, *rows]]
    item = LongTable(data, colWidths=[width * mm for width in widths], repeatRows=1, hAlign="LEFT")
    item.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E4F2EA")),
        ("TEXTCOLOR", (0, 0), (-1, 0), GREEN),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), .4, colors.HexColor("#C8DCD0")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FBF9")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.extend([item, Spacer(1, 3 * mm)])


def build(name, story):
    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(GREEN)
        canvas.rect(0, A4[1] - 6 * mm, A4[0], 6 * mm, fill=1, stroke=0)
        canvas.setFont("Helvetica", 8)
        canvas.drawString(18 * mm, 12 * mm, "BulsuScholar | Dr. Romel Revision | Local evidence / deployment pending")
        canvas.drawRightString(A4[0] - 18 * mm, 12 * mm, str(doc.page))
        canvas.restoreState()
    doc = SimpleDocTemplate(str(FOLDER / name), pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm,
                            topMargin=17 * mm, bottomMargin=22 * mm, title=name[:-4], author="BulsuScholar project")
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


def evidence(name):
    path = ROOT / "test-results" / name
    if not path.exists():
        raise RuntimeError(f"Missing evidence: {name}. Run tests before generating these PDFs.")
    return json.loads(path.read_text(encoding="utf-8-sig"))


def test_pdf():
    backend, sql, frontend, browser = [evidence(name) for name in ("romel-backend.json", "romel-sql.json", "romel-frontend.json", "romel-browser.json")]
    baseline = evidence("romel-baseline.json")
    assert backend["passed"], "Do not publish a passing test report with a failing suite."
    focused = [case for case in backend["results"] if "test_romel_download_protection." in case["test"]]
    assert focused and all(case["status"] == "Pass" for case in focused)
    story = [p("Romel Revision Tests", "RomelTitle"), p("Implementation, local results, and release checks | 24 October 2026", "RomelSmall")]
    story.append(p("This report documents a local revision, not a declaration that production is updated or certified secure. No real student record was changed by these test fixtures. The full manuscript and existing Solis PDFs remain unchanged."))
    table(story, ["Evidence", "Observed result", "Boundary"], [
        ("Backend suite", f"{backend['count']} tests; suite passed", "Local Python; mocked service/network boundaries where specified"),
        ("New protection tests", f"{len(focused)} passing test methods", "Real in-memory pypdf/pyzipper encryption and controlled authorization/upload tests"),
        ("Migration", f"{len(sql['results'])} passing scenarios", "Local PostgreSQL-compatible PGlite; not live Supabase"),
        ("Frontend service", f"{len(frontend['results'])} passing scenarios", "Isolated actual JS module; synthetic fetch responses"),
        ("Browser", f"{len(browser['results'])} passing scenarios", "Shared dialog fixture; desktop/mobile light/dark; not real-role production sessions"),
    ], [33, 44, 97])
    story.append(p("Counts describe different kinds of evidence. A test method may contain several subcases. These counts must not be added together and presented as a number of real users or independent production transactions."))
    heading(story, "Where the changes appear")
    story.append(p("Student Profile document previews/downloads; Student Scholarships SOE and attachment downloads; Grantor document and applicant-report actions; Admin document previews and report exports; Root Reports & Files and Logs & Audit. Downloads now open Save Your File Password. An encrypted PDF upload opens Unlock Uploaded PDF when a password is required."))
    story.append(p("Public images, branding, and empty import/application templates remain unchanged. For a ZIP, use an AES-capable archive tool, then work with the extracted original-format file. An already encrypted PDF inside a ZIP still needs its original PDF password."))
    story.append(PageBreak())
    heading(story, "RM Tests: Expected and Observed Behavior")
    story.append(p("Each row maps to the exact unittest method listed in the traceability appendix. Pass means the controlled local assertions held; it does not mean staging or every real document reader was tested.", "RomelSmall"))
    descriptions = {
        "pdf_is_explicit_aes256": ("PDF encryption configuration", "Encrypted PDF reports a 256-bit key and revision 6; generic filename."),
        "pdf_rejects_wrong_or_missing_password": ("PDF wrong/missing password", "The encrypted pages cannot be read without the correct password."),
        "pdf_opens_with_correct_password_and_preserves_page": ("PDF correct password", "Correct password opens the page; source PDF stays unencrypted and unchanged."),
        "encryption_does_not_flatten_editable_pdf_fields": ("Editable PDF forms", "Existing editable text field remains a form field after encryption."),
        "archive_aes256_preserves_originals": ("CSV / image / Excel archives", "AES-256 ZIP rejects absent/wrong passwords; extraction returns exact original bytes."),
        "signed_pdf_is_not_rewritten": ("Signed-PDF preservation", "Conservative signature-marker case uses ZIP; extracted bytes match the source."),
        "explicit_original_archive_is_byte_identical": ("Original-copy preservation", "Explicit original mode uses ZIP and preserves every original byte."),
        "encrypted_original_can_be_archived_without_its_old_password": ("Already encrypted originals", "Original encrypted PDF is archived intact without knowing its old password."),
        "password_required_for_old_clients": ("Old export clients", "Missing or malformed protection request is rejected with structured 422."),
        "audit_failure_withholds_file": ("Audit failure", "No file response when preparation cannot be audited."),
        "protection_failure_has_safe_audit_and_no_fallback": ("Encryption failure", "Safe failure audit; no plaintext fallback and no password in audit arguments."),
        "headers_filename_and_audit_contain_no_password": ("Headers and audit privacy", "No-store/nosniff, generic filename; password excluded; version fingerprint recorded."),
        "password_assisted_processing_retains_original": ("Password-assisted processing", "Decrypted processing PDF is readable; uploaded encrypted original remains encrypted."),
        "password_assisted_processing_rejects_wrong_and_missing": ("Upload password errors", "Clear required/incorrect password correction, not automatic acceptance."),
        "malformed_pdf_rejected": ("Malformed PDF", "Invalid PDF is rejected before acceptance."),
        "password_mapping_validation": ("Batch password mapping", "Valid per-file mapping accepted; malformed maps rejected."),
        "download_does_not_mark_signup_preview": ("Pending Account preview gate", "Downloading signup document never writes a previewed review."),
        "cross_student_download_denied_before_storage_read": ("Cross-student access", "Student cannot read another student's file; Storage is not read."),
        "cross_grantor_download_denied_before_storage_read": ("Cross-grantor access", "Unrelated grantor cannot read file; Storage is not read."),
        "anonymous_or_unrelated_admin_denied": ("Anonymous / reviewer scope", "Anonymous actor and unrelated grantor reviewer cannot read file."),
        "expired_and_revoked_sessions_do_not_read_files": ("Expired / revoked sessions", "Session rejection prevents Storage reads."),
        "mixed_password_batch_validates_before_writes": ("Mixed-password upload batch", "Incorrect second password identifies its index; no files written before full validation."),
        "applicant_csv_preserves_formula_injection_protection": ("Applicant CSV safety", "Leading whitespace plus formula prefix is escaped; counts remain correct."),
        "applicant_preview_never_records_an_export": ("Applicant report preview", "Inline preview makes no export-history or encryption call."),
        "applicant_protection_failure_does_not_record_export_history": ("Report preparation failure", "Failed encryption does not create successful export history."),
        "encrypted_cor_upload_preserves_original_and_separate_private_preview": ("COR upload round trip", "Encrypted original stored unchanged; private processing copy scanned; password not saved."),
        "wrong_upload_password_creates_no_storage_or_submission": ("Wrong-password persistence", "Wrong password creates no Storage file or submission."),
        "protected_signed_soe_upload_uses_atomic_derivative_rpc": ("Signed-SOE upload", "Original and derivative linked through atomic RPC without retaining password."),
        "root_files_cannot_use_arbitrary_storage_paths": ("Root file identifiers", "Arbitrary bucket/path payload without stored identifiers is rejected."),
        "root_audit_shows_actor_version_and_protection": ("Root audit display", "Existing Root audit interface receives actor, version fingerprint, method, time and outcome."),
    }
    methods = {case["test"].split(".")[-1]: case for case in focused}
    assert set(methods) == {"test_" + key for key in descriptions}, "Update descriptions when tests change."
    ordered = sorted(methods)
    rows = []
    for index, method in enumerate(ordered, 1):
        title, expected = descriptions[method[5:]]
        rows.append((f"RM-{index:02}", title, expected, "Pass\nLocal"))
    table(story, ["ID", "Core Function", "Expected / Observed", "Status"], rows, [17, 44, 91, 22])
    heading(story, "Database, Service, and Browser Evidence")
    for label, record in [("SQL", sql), ("Frontend", frontend)]:
        table(story, ["ID", f"{label} verification", "Status"], [(row["id"], row["test"], row["status"]) for row in record["results"]], [25, 125, 24])
    story.append(p("Browser: 1440, 1366, 1280, 1024, 768 and 390 px, each in light/dark mode; fit, no horizontal overflow, focus, 32-character password display, acknowledgment gating and cancellation. The real loading overlay is included so the prompt remains clickable. Additional upload-password/Escape and real AES-encrypted PDF.js preview tests passed, including nonblank canvas pixels. Screenshots redact even synthetic passwords. Live clipboard-history behavior is not certified."))
    heading(story, "Reproduced Findings: Not a Historical Attack Claim")
    story.append(p(f"Baseline commit: {baseline['baselineCommit']}", "RomelSmall"))
    for item in baseline["results"]:
        story.append(p(f"{item['id']}: {item['finding']}. Reproduced only by isolated source functions with synthetic data and stubbed I/O. Retest: {item['retest']}."))
    story.append(p("No supplied evidence identifies the historical exploit payload, affected accounts, or a successful unauthorized data extraction. Do not call these tests a penetration-test certification or claim that the whole production application is vulnerability-free."))
    story.append(PageBreak())
    heading(story, "Manual Release Procedures: Still Required")
    procedures = [
        ("Student / Grantor / Admin / Root downloads", "Use controlled real accounts and a non-production document. Save the generated password, download, open with correct password, then retry absent/wrong password. Repeat across COR, ROG, identity, profile, requirements, signed SOE, reports and inventories.", "Protected file opens only with correct password; generic filename; private response; correct authorized content. Status: needs staging."),
        ("Live authorization matrix", "Swap resource IDs across two students and two grantors; use unrelated reviewer, anonymous, expired, revoked and Root-session-without-Root-header requests. Do not probe real unrelated users.", "All unauthorized reads rejected before private Storage; authorized relationship still works. Status: needs staging."),
        ("Preview versus approval", "Preview all applicable signup documents. Separately try downloading without previewing. Inspect Pending Accounts and review audit.", "Only true preview satisfies preview gate. COR/ROG/profile previews stay usable. Status: needs authenticated staging browser check."),
        ("Encrypted re-upload and signed original", "Re-upload an encrypted COR/ROG/PDF identity with correct/wrong passwords. Test two requirement PDFs with different passwords. Round-trip a genuinely digitally signed SOE and compare SHA-256 of original/extracted bytes.", "Policy validation still runs; original bytes retained; separate private preview copy; signature validity checked separately with a real certificate tool. Status: real-document/reader test outstanding."),
        ("Reports", "Test central and section reports with non-default filters, archive tabs, empty and multipage results. Compare preview count, decrypted PDF rows and extracted CSV rows. Verify Legal landscape header/footer and repeated table headings.", "Same complete filtered dataset and branding; preview creates no export history; protected successful export creates one. Existing report tests pass locally; real-role visual retest outstanding."),
        ("Failures and cancellation", "Cancel the password dialog, double-click Continue, fail encryption, disable audit writes in staging, navigate away, retry with a new password, and monitor object URLs and console/network.", "No plaintext fallback; no duplicate commit from a double-click; temporary state cleared. Staging network cancellation and application-route changes need end-to-end testing."),
        ("Secret handling", "Inspect application storage, audit rows, request logs and error logs without recording a real password in test notes. Disable request-body capture in third-party observability tools.", "No application persistence or logging of download/upload passwords; provider instrumentation configuration must be verified."),
        ("Provider/security checks", "Verify migration grants, private buckets, current RLS/Storage policies, service-role isolation, security/performance advisors and deployment versions in staging.", "No client access to download audit table/functions. No live Supabase advisor/deployment result is claimed by this report."),
    ]
    for title, procedure, expected in procedures:
        heading(story, title)
        story.extend([p("Procedure: " + procedure), p("Expected / evidence gap: " + expected)])
    heading(story, "Commands and Rollout")
    for command in ["py -3.12 scripts/run-romel-tests.py", "node --experimental-vm-modules scripts/test-romel-frontend.mjs", "node scripts/test-romel-download-audit.mjs <path-to-pglite/dist/index.js>", "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-romel-browser.ps1", "npm run test:frontend; npm run lint; npm run build"]:
        story.append(p(command, "RomelSmall"))
    story.append(p("Order: apply the additive migration and verify grants, deploy backend with cryptography/pyzipper, deploy frontend, then perform the controlled staging and live smoke checks. The connected Supabase account exposed the existing project but no preview branches; no staging branch was available for the live advisor/permission run. No production migration or deployment was performed. Do not enable plaintext fallback for older clients. Local lint/build status is reported in the completion message; do not infer deployment from a passing build."))
    heading(story, "Exact Test Traceability")
    for index, method in enumerate(ordered, 1):
        story.append(p(f"RM-{index:02}: backend/tests/test_romel_download_protection.py :: {method}", "RomelSmall"))
    story.append(p("Machine evidence: test-results/romel-backend.json, romel-sql.json, romel-frontend.json, romel-browser.json and romel-baseline.json. Browser fixture evidence is isolated; no real-role production login is implied.", "RomelSmall"))
    build("RomelRevisionsTest.pdf", story)


def paper_pdf():
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    with ZipFile(MANUSCRIPT) as archive:
        tree = ET.fromstring(archive.read("word/document.xml"))
    paragraphs = ["".join(node.text or "" for node in para.findall(".//w:t", ns)) for para in tree.findall(".//w:body/w:p", ns)]
    story = [p("Romel Paper Revisions", "RomelTitle"), p("Targeted locations, suggested wording, and evidence gaps | 24 October 2026", "RomelSmall")]
    story.append(p("Edit the manuscript yourself using this guide. It does not replace the thesis, rewrite unrelated chapters, or change the Solis PDFs. Every Find anchor below is checked against the supplied current DOCX. Source paragraph numbers are one-based body-paragraph indexes, NOT printed page numbers. Word pagination depends on layout; update the thesis table of contents and printed pages after editing."))
    story.append(p("Release wording: use 'the revised implementation' for this local work. Write 'the deployed system' only after migration/backend/frontend deployment and controlled verification. Do not turn local mocked tests into claims of production security or extraction accuracy."))
    locations = []
    def locate(section, anchor):
        matches = [(index + 1, value) for index, value in enumerate(paragraphs) if anchor in value]
        assert matches, f"Unverified manuscript anchor: {anchor}"
        locations.append({"section": section, "anchor": anchor, "sourceParagraphs": [item[0] for item in matches]})
        story.append(p("Where: " + section, "RomelSmall"))
        story.append(p('Find: "' + anchor + '" | Source paragraph(s): ' + ", ".join(str(item[0]) for item in matches), "RomelSmall"))
    def suggestion(text):
        story.append(p("Suggested wording: " + text))

    table(story, ["Edit", "Where", "Purpose"], [
        ("R1", "Chapter III: Data Privacy and Ethical Considerations", "Sensitive-data inventory; distinguish login, file encryption and CSV handling"),
        ("R2", "Chapter III: Data Privacy / Testing", "Download and password-assisted upload behavior, audit scope and limits"),
        ("R3", "Chapter II / III / IV recommendation passages", "Correct Decision Tree claims to Weighted Recommendation Scoring"),
        ("R4", "Chapter III: validation, account flow and algorithms", "Separate parsing, identity matching and scholarship authorization"),
        ("R5", "Figures 3.1-3.8 and corresponding explanations", "Manual/automatic activation, profile-only review and protected-download paths"),
        ("R6", "Chapter III Testing / Chapter IV evidence", "Traceable test cases, narrow reproduced gaps and unverified production checks"),
        ("R7", "Chapter I limitations / Chapter III deployment / Chapter V", "Keep real limitations, add verified local revision without certification claims"),
    ], [14, 76, 84])
    story.append(PageBreak())
    heading(story, "R1. Name the Sensitive Information")
    locate("Chapter III > Data Privacy and Ethical Considerations", "Sensitive information handled by the system may include")
    story.append(p("Action: expand this paragraph or insert a short inventory immediately after it. Do not describe every field as encrypted by the application just because Supabase encrypts hosted storage. The editable profile indexes guardian/contact/address and academic fields; family-income ranking is not implemented by the current recommendation function."))
    table(story, ["Category", "Specific information / artifacts"], [
        ("Personal / identity", "Student number, name, birth date, photo, signature, guardian identity/contact"),
        ("Contact / address", "Email, mobile, street, barangay, municipality/city, province, postal code"),
        ("Academic", "Course, college, year/section, COR, ROG, GWA and document-derived academic information"),
        ("Scholarship", "Applications, grantor relationships, waitlist, commitment, cycle progress, decisions and materials"),
        ("Profile / financial declarations", "Filled profile and any financial/family declarations actually present in submitted attachments; do not invent a structured bank-account subsystem"),
        ("Documents / reports", "Identity files, revisions, signed SOE, requirements, personalized forms, reports and file inventory"),
        ("Authentication / audits", "Provider credential/session data, account/security state and audit records; not recoverable stored download passwords"),
    ], [42, 132])
    suggestion("The system handles personal and identification information, contact and address details, academic records, scholarship applications and workflow records, profile forms, photographs, signatures, and uploaded scholarship documents. Reports and file inventories may also contain sensitive information. Any financial or family declaration actually contained in a submitted document is treated as sensitive document content. Access is limited by verified identity, role, permission, ownership and scholarship relationship. Downloaded copies receive a separate file-protection layer; this does not mean that each database field is separately encrypted by the application.")

    heading(story, "R2. Explain Download Protection, Not Just Login")
    locate("Chapter III > Data Privacy and Ethical Considerations > uploaded files", "Uploaded student and scholarship documents are stored using Supabase Storage.")
    story.append(p("Action: retain the private-storage/authorization explanation, then add the file-protection behavior below. Keep antivirus and retention limitations. Public images and empty templates are excluded."))
    suggestion("In the revised implementation, ordinary PDF download copies are encrypted using explicitly selected AES-256. CSV, Excel, image and other original-format attachments are placed in AES-256 password-protected ZIP archives. Signed PDFs are packaged without rewriting their original signed bytes. Stored originals and historical versions are preserved. Each official download uses a fresh, randomly generated 32-character password that the user must save before continuing. A forgotten password cannot be recovered; an authorized user can create a new protected copy. Download passwords are not account passwords or Student IDs.")
    suggestion("Authenticated previews remain readable inside the application. Official download actions use protected copies, but file encryption cannot prevent an authorized viewer from taking screenshots, copying displayed content, saving a browser preview, or sharing a password. Copying a password may also place it in the user's device clipboard history. This is a limitation of the user's device and readable previews, not a claim of digital-rights management.")
    suggestion("When a PDF re-upload requires a password, the back-end uses the supplied password temporarily to decrypt a processing copy before document validation. The original uploaded bytes are kept privately, and a separate private preview or processing copy may be stored. The password is not retained. A transformed processing copy is not represented as preserving the original digital signature; the original signed artifact remains authoritative.")
    locate("Chapter III > Data Privacy and Ethical Considerations > logs", "The system maintains selected security and activity records")
    suggestion("The revised download audit records the authorized actor, resource identifier, source-byte fingerprint, original format, protection method, timestamp and preparation result. Passwords and document contents are excluded. The download-audit table is append-only and service-role-only, and its events are available through the existing Root audit interface. A prepared event means that an encrypted copy was generated and audited; it does not prove the browser saved or opened it. Document previews do not create export-history entries, and downloading signup documents does not satisfy the administrator's preview requirement.")
    heading(story, "R3. Correct the Recommendation Algorithm")
    locate("Chapter II > Technical Background > description of the present system", "In the context of this study, the developed system uses a rule-based Decision Tree")
    locate("Chapter III > System Modules > 3. Scholarship Recommendation Module", "The scholarship recommendation module helps students identify scholarship programs")
    locate("Chapter III > System Modules > 4. recommendation-mechanism heading", "4. Rule-Based Decision Tree Scholarship Recommendation Mechanism")
    story.append(p("Action: replace the present-system Decision Tree claims and unsupported list of automatic ranking fields. Rename Module 4 to 'Weighted Recommendation Scoring Mechanism'. Keep genuine Decision Tree research in related literature, but explicitly contrast it with this system. Do not replace the working algorithm to fit old wording."))
    suggestion("The system uses Weighted Recommendation Scoring, a deterministic ranking method rather than a trained Decision Tree. Candidates are excluded when applications are blocked or disabled, or when the student's GWA does not meet the required minimum. Eligible candidates receive points for grade fit, normalized scholar-roster popularity, location fit and announcement completeness. The resulting score orders the suggestions. The score is not a probability or a percentage of scholarship acceptance, and final application authorization and approval remain separate.")
    table(story, ["Actual factor", "Implemented computation"], [
        ("Grade fit", "min(40, 24 + 12 x max(0, minimum GWA - student GWA)); lower eligible GWA is better"),
        ("Roster popularity", "rosterCount / maximum candidate rosterCount x 22; uses 30 when student GWA <= 1.75; zero if maximum is zero"),
        ("Location fit", "Up to 25: province, city and barangay matches; Pampanga-to-Bulacan gets lower priority. No-location fallback is 8; other configured province can contribute 2."),
        ("Announcement completeness", "8 baseline points plus 2 if a supported image field exists; not a family-income/profile-completion percentage"),
        ("Ordering", "Sum factor points, sort descending. Candidate mix can change popularity normalization. No trained model or learned classification accuracy."),
    ], [37, 137])
    story.append(p("Important distinctions: eligibility/application scope uses exact approved province-municipality pairs and ignores barangay; recommendation location ranking may use barangay. Family income, course, year and achievements are not weighted ranking inputs in scholarship_rules.recommend_scholarships. The browser also has a weighted local fallback; neither implementation is a Decision Tree."))
    story.append(p("Rationale you can state: a transparent, configurable point-based method supports explainable ordering using available records without requiring a labeled historical training dataset. This is an engineering rationale, not evidence that the method outperforms machine-learning models."))
    heading(story, "Other Present-System Recommendation Passages to Align")
    anchors = [
        ("Chapter III > Back-End Technology", "The back-end of the system was developed using Python"),
        ("Chapter III > Scholarship Recommendation Mechanism", "The system provides scholarship recommendations using a rule-based Decision Tree"),
        ("Chapter III > development/prototyping description", "The rule-based Decision Tree recommendation algorithm and the Record Linkage"),
        ("Chapter IV > System Presentation > recommendation module", "The Scholarship Recommendation Module compares student information"),
    ]
    for section, anchor in anchors:
        locate(section, anchor)
    story.append(p("Replace only the recommendation description in these passages with 'Weighted Recommendation Scoring with predefined eligibility filters'. Search remaining 'Decision Tree' occurrences: revise claims about THIS system, but do not erase the names of algorithms actually used by cited studies. Also remove unsupported present-system income/course/year/achievement ranking claims from Modules 3 and 4."))
    for index, text in enumerate(paragraphs, 1):
        if "Decision Tree" in text:
            story.append(p(f"Decision Tree search hit, source paragraph {index}: {text[:115]}...", "RomelSmall"))

    heading(story, "R4. Explain Three Separate Processes")
    locate("Chapter III > User Registration, Authentication, and Access Control", "The system uses Supabase Auth together with FastAPI-based authentication")
    suggestion("Account creation combines identifier availability and uniqueness checks, document parsing and validation, authentication-provider registration, email confirmation and account activation. In manual account-review mode, the administrator must preview every applicable signup document before the single Approve Account action. In automatic mode, confirmation activates the account only when all applicable signup documents meet the required system-approved state. A welcome email is attempted once for a newly activated account. Email delivery failure does not undo activation.")
    locate("Chapter III > System Modules > Validation Module", "5. Validation Module")
    suggestion("Document parsing first attempts embedded PDF text and layout extraction using pdfplumber. If usable text is absent, the document is converted to images for OCR. Field patterns, layout/table interpretation and document-specific policy checks are then applied. COR and ROG validity is determined by these checks, not by Levenshtein similarity. Valid school-document uploads are system-approved; the Student Application Profile always requires authorized administrator review. A student identity document is required at account creation, but is not a recurring semester requirement. An active student's optional identity replacement is automatically accepted through the existing upload policy.")
    story.append(p("Retain the already-correct duplicate-field and threshold paragraphs. Actual weighted fields: Student ID .32, full name .30, email .10, phone .08, course .08, year .04, city .04, province .04. Missing values are excluded and available weights renormalized. Exact Student ID is a strong match; exact email/phone requires name similarity >= .72; fuzzy duplicate flag requires name >= .82 and weighted score >= .84. Birth date and school are not weighted fields. Fuzzy matching is not only a fallback for missing IDs. Identity similarity flags and cycle-aware award/commitment guards are separate controls."))
    story.append(p("Do not add measured document-extraction accuracy, precision, recall or algorithm-superiority claims without a labeled authorized test set and actual results. Synthetic tests and successful compilation cannot establish real COR/ROG OCR accuracy."))

    heading(story, "R5. Flowcharts and Exact Captions")
    for anchor in ["Figure 3.1: Student Account Registration and Authentication Flowchart", "Figure 3.2: Student Profile and Document Verification Flowchart", "Figure 3.6: Scholarship Grantor Portal Flowchart", "Figure 3.7: Administrator Portal Flowchart", "Figure 3.8: Scholarship Requirements and Completion Flowchart"]:
        locate("Chapter III > system-flowchart figures", anchor)
    story.append(p("Use the revised Mermaid source in docs/SystemFlowchart.md. Figure 3.1 must show manual versus automatic activation, pending and correction endings, preview gating and one welcome-email attempt. Figure 3.2 must separate automatic COR/ROG/active-ID handling from profile-only administrator review; remove the old generic manual-document switch branch. Grantor/Admin/materials figures should connect official downloads to the protected-download subprocess and password-assisted re-upload subprocess. Use matching connector labels and explicit cancel/denied/failed/success endings. Do not treat a return connector as an unexplained dead end."))
    locate("Chapter III > explanation below Figure 3.1", "Figure 3.1 presents the student account registration and authentication process")
    suggestion("Figure 3.1 separates email confirmation from account activation. After confirmation, Manual Account Review keeps the account pending until the administrator previews the applicable signup documents and approves the account. Automatic Account Review activates the account only when all applicable signup requirements are system-approved. Missing or invalid requirements keep the account pending. Newly activated accounts receive one welcome-email attempt, and repeated callbacks do not create another activation.")
    locate("Chapter III > explanation below Figure 3.2", "Figure 3.2 presents the process for completing and verifying")
    suggestion("Figure 3.2 distinguishes document-specific validation from profile review. Valid COR and ROG uploads are approved automatically after the existing checks; identity verification is required at signup and is not renewed each semester. The Student Application Profile remains pending until an administrator decides on its latest revision. Authorized previews and protected downloads are separate operations, and an encrypted PDF re-upload may require a temporary file password for processing.")

    story.append(PageBreak())
    heading(story, "R6. Add Traceable Security Test Evidence")
    locate("Chapter III > Testing", "In this phase, the developed system underwent testing procedures")
    locate("Chapter III > Table 1 explanation", "Table 1 presents the summary of the selected core test cases")
    backend = evidence("romel-backend.json")
    focused = [row for row in backend["results"] if "test_romel_download_protection." in row["test"]]
    suggestion(f"Additional local security-regression tests evaluated protected download preparation, AES-256 PDF and ZIP behavior, wrong or missing passwords, preservation of original bytes, password-assisted PDF uploads, selected authorization boundaries, audit failures, preview separation and CSV formula-prefix escaping. The local backend suite completed {backend['count']} test methods, including {len(focused)} focused protection methods. Separate local PostgreSQL-compatible tests checked permissions and append-only audit behavior. Responsive browser tests used an isolated shared-dialog fixture. These results are not a substitute for real-role staging tests, a penetration test or proof that the deployed system is vulnerability-free.")
    story.append(p("Keep Table 1's existing 15 selected cases as a selected summary if still accurate. Add a separate Romel security-test table or appendix using RM IDs from RomelRevisionsTest.pdf. Do not relabel all automated test methods as 15 cases or add test counts to survey respondent counts. Preserve the existing TAM and ISO respondent counts and results."))
    locate("Chapter IV > System Presentation (insert immediately after the module discussion)", "The developed system reflects the research gap identified")
    story.append(p("Insert a short subsection 'Sensitive-Document Protection and Security Regression Results'. Include the RM table, one redacted-password dialog screenshot, one protected reader password prompt, a private audit event without secrets, and a live cross-owner denial after staging verification. If a screenshot or live test is not yet available, label it outstanding; never replace it with fabricated evidence."))
    suggestion("Two narrowly scoped export issues were reproduced offline using baseline functions and synthetic data: official export handlers returned readable download bytes, and the applicant CSV builder retained a formula-prefixed cell value. The revision introduces protected official copies and formula-prefix escaping, with regression tests confirming the expected output. This does not establish that an anonymous user accessed data or that a historical attack succeeded. The available defense transcripts do not supply a reproducible exploit request, affected account list or penetration-test certification.")
    story.append(p("Use the baseline commit and test names in test-results/romel-baseline.json. Report the actual affected paths as /admin/reports/export (plaintext preparation) and the grantor applicant export pipeline (CSV output). Do not invent attacker identities, SQL-injection payloads, severity ratings or historical incidents."))

    heading(story, "R7. Preserve Honest Limits and Deployment Wording")
    locate("Chapter I > Scope and Limitations", "The system implements authentication, authorization, private document access")
    story.append(p("Action: add the new protected-download layer as a revised implementation while retaining the listed operational limitations. Do not remove malware, retention, backup/restore or field-level-encryption limitations because a download password was added."))
    locate("Chapter III > Development Environment / deployment safeguards", "The deployed environment uses Supabase Auth for authentication")
    story.append(p("Action: retain the sentence that technical review is not penetration-test certification. Do not claim the new migration or deployment is live until verified. Distinguish provider-managed Auth/TLS/hosting controls from the application's authorization, preview logic, encryption and audit mechanisms."))
    locate("Chapter V > Recommendations > privacy and security", "The researchers also recommend further strengthening the system's privacy")
    suggestion("The revised implementation adds password-protected official downloads and download-preparation auditing. Future improvements should focus on remaining controls, including dedicated malware scanning, formal retention/deletion policies, broader field-change auditing, improved abuse protection and regularly verified database-and-document recovery. Provider backup availability and application download encryption do not demonstrate that a complete restore procedure or universal multi-factor authentication has been implemented.")
    heading(story, "Control Classification to Keep in the Paper")
    table(story, ["Implemented in application", "Provider-managed / verify configuration", "Not established by this revision"], [
        ("Role/ownership checks; private document endpoints; protected copies; password-assisted processing; append-only preparation audit", "Supabase Auth credentials/tokens; platform TLS; database/Storage infrastructure controls. Verify actual project policies and settings.", "Universal MFA, malware scanning, full field encryption, uniform retention, all-field before/after audit, tested production backup recovery"),
        ("CSV formula escaping is maintained separately", "User's reader/archive program must support the encryption format", "No screenshots/printing/password-sharing prevention or guaranteed runtime-memory zeroization"),
    ], [58, 58, 58])
    heading(story, "Plain-English Legend")
    for term, meaning in [
        ("Authentication", "Checking who is signing in."), ("Authorization", "Checking which records that person may use."),
        ("AES-256", "The file-locking encryption selected for the downloaded copy; not the user's login system."),
        ("ZIP archive", "A protected container. Extract its original-format files with the archive password."),
        ("SHA-256 fingerprint", "A short identifier calculated from file bytes; it is not reversible file encryption."),
        ("OCR", "Reading letters and numbers from document images."),
        ("Levenshtein similarity", "Comparing text using the number of insertions, deletions and replacements needed to make the strings match."),
        ("Weighted Recommendation Scoring", "Adding explained factor points to order scholarship suggestions."),
        ("RLS / service role", "Database row-access rules / the privileged backend identity; service access still requires application ownership checks."),
    ]:
        story.append(p(f"{term}: {meaning}", "RomelSmall"))
    heading(story, "References and Evidence Still Needed")
    for url in ["https://pypdf.readthedocs.io/en/6.1.1/user/encryption-decryption.html", "https://pypi.org/project/pyzipper/", "https://supabase.com/docs/guides/storage/security/access-control", "https://supabase.com/docs/guides/security/platform-security"]:
        story.append(p(url, "RomelSmall"))
    story.append(p("Outstanding: authenticated real-role browser checks, supported desktop/mobile PDF and AES ZIP readers, actual digital-signature verification, full report visual/count/history retest, staging advisors/grants and controlled release evidence. Keep any earlier deployed verification dated and separate from this local revision. The code/guide does not establish new real-document accuracy or production security findings."))
    build("RomelRevisionPaper.pdf", story)
    (ROOT / "test-results/romel-paper-anchors.json").write_text(json.dumps(locations, indent=2), encoding="utf-8")


if __name__ == "__main__":
    protected_sources = [MANUSCRIPT, FOLDER / "RevisionsTest.pdf", FOLDER / "RevisionPaper.pdf"]
    before = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in protected_sources}
    test_pdf()
    paper_pdf()
    assert all(hashlib.sha256(path.read_bytes()).hexdigest() == digest for path, digest in before.items()), "A protected source changed."
    print("Created RomelRevisionsTest.pdf and RomelRevisionPaper.pdf; manuscript anchors verified; manuscript and Solis PDFs unchanged.")
