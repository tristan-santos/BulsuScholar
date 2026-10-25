"""Export the role-based manual testing checklist, not claimed test results."""
from generate_romel_revision_pdfs import build, heading, p, table
from reportlab.platypus import PageBreak


story = [p("Dr. Romel Testing Checklist", "RomelTitle"),
         p("Student, Grantor, and Admin | Manual testing procedures", "RomelSmall"),
         p("First, apply the migration and deploy the updated backend and frontend in your test environment. Use test accounts and non-sensitive documents."),
         p("This is a checklist of tests to perform and their expected results, not a record that these manual tests have already passed.", "RomelSmall")]

heading(story, "Student Side")
table(story, ["Test", "What To Do", "Expected Result"], [
    ("Document downloads", "In Profile > Document Vault, download COR, ROG, Student ID, and Application Profile.", "Password dialog appears before downloading."),
    ("Password requirement", "Try Continue without checking the acknowledgment.", "Continue stays disabled."),
    ("Protected files", "Save the password, download, then open with no password, a wrong password, and the correct password.", "Only the correct password opens the PDF or ZIP contents."),
    ("Document previews", "Preview the uploaded documents.", "Preview works without a download-password prompt."),
    ("Encrypted re-upload", "Upload a protected COR/ROG PDF. Enter a wrong password, then the correct one.", "Wrong password is rejected; correct password proceeds through normal document validation."),
    ("Scholarship files", "Download SOE, application materials, and other requirements.", "Sensitive files are protected; empty public templates remain unchanged."),
    ("Cancellation", "Cancel an SOE download at the password dialog.", "No file downloads and scholarship tracking must not advance."),
], [34, 72, 68])
story.append(p("For ZIP downloads, extract the file using an AES-compatible archive application before opening it."))

story.append(PageBreak())
heading(story, "Grantor Side")
table(story, ["Test", "What To Do", "Expected Result"], [
    ("Applicant documents", "Preview and download an authorized applicant's documents.", "Preview works normally; download requires saving a password."),
    ("Applicant reports", "Filter applicants, preview the report, then export PDF and CSV.", "Preview matches the filters; PDF is encrypted and CSV arrives in an encrypted ZIP."),
    ("Record consistency", "Compare preview records with the decrypted/extracted export.", "Counts and filtered records agree."),
    ("Access restriction", "Using controlled test records, attempt to access another grantor's applicant document.", "Access is denied."),
], [34, 72, 68])

heading(story, "Admin Side")
table(story, ["Test", "What To Do", "Expected Result"], [
    ("Pending Account gating", "Download signup documents without previewing them.", "Downloading alone does not enable Approve Account."),
    ("Actual previews", "Preview every applicable signup document for an email-confirmed test account.", "Existing approval requirements are satisfied normally."),
    ("Requirements documents", "Preview and download required documents, other requirements, and signed SOE.", "Previews remain usable; downloads are protected."),
    ("Report sections", "Export from Students, Grantors, Scholarships, Requirements, and Report Generation.", "Correct filtered data; protected PDF/CSV; landscape branding remains full-width."),
    ("Export history", "Preview a report, then export it once.", "Preview creates no export-history entry; successful export creates one."),
    ("Reviewer restrictions", "Repeat with a restricted reviewer account.", "Existing permission restrictions remain enforced."),
], [34, 72, 68])

story.append(PageBreak())
heading(story, "Final Checks")
for text in [
    "Cancel the password dialog: no download.",
    "Double-click Continue: one download preparation, not duplicates.",
    "Download again: a different password.",
    "Check Root Admin > Logs & Audit: preparation events appear, without passwords.",
    "Test desktop/mobile and light/dark modes.",
    "For signed SOE, compare the original with the file extracted from the ZIP: the bytes must remain identical.",
]:
    story.append(p("- " + text))
heading(story, "Recommended Starting Order")
story.append(p("Student COR download > Grantor applicant report > Admin Pending Account preview gating. These give you the quickest confirmation that the main workflows work."))

if __name__ == "__main__":
    build("DocRomelTest.pdf", story)
    print("Created docs/ThesisPaper/DocRomelTest.pdf")
