# Dr. Romel Revision: Download Protection and Evidence

## Release State

Local implementation, not a production security certification or deployment.
Apply `20261023140524_protected_download_audit.sql` before the backend and frontend.
The manuscript and existing Solis PDFs are not edited by this revision.

## Sensitive Data Inventory

| Category | Examples actually handled by the system | Authorized use and protection |
| --- | --- | --- |
| Identity and personal | Student ID number, name, birth date, photograph, signature, guardian information | Student owner; relevant authorized reviewers and scholarship relationships. Private document routes and protected official copies. |
| Contact and address | Email, mobile, guardian contact, street, barangay, municipality/city, province, postal code | Profile and scholarship eligibility. Exact scope pairs use province and municipality, not barangay; recommendation ranking separately considers location. |
| Academic | Course, college, year/section, COR, ROG, GWA and parsed grades | Validated school documents and academic eligibility; original immutable submissions retained. |
| Scholarship | Applications, decisions, grantor assignment, commitment, waitlist, cycle progress and materials | Existing role/relationship/ownership checks. Grantor sees only authorized relationships. |
| Profile and financial declarations | Filled Student Application Profile, including any financial/family details contained in the uploaded/generated form | Treat the entire profile artifact as sensitive, not just the indexed database fields. No claim that a separate financial-account subsystem exists. |
| Uploaded documents | COR, ROG, IDs, profile revisions/snapshots, grantor requirements, personalized SOE/forms, signed SOE | Private originals and separate processing derivatives; authenticated previews; encrypted official downloads. |
| Reports and inventories | Filtered student/grantor/scholarship/requirements reports, CSV exports and file inventory | Report/Root permissions retained. Encryption is separate from CSV formula escaping. |
| Authentication/security | Provider password hashes, auth user IDs, sessions, verification state, Root session records, recovery capabilities, audit records | Provider-managed authentication plus application authorization. Download passwords are independent, temporary, and not stored in these records. |

## Download Contract

- Ordinary unsigned, unencrypted PDF copies explicitly use pypdf `algorithm="AES-256"`.
- Signed or already encrypted PDFs, image/CSV/Excel/other attachments use WinZip AES-256 ZIP. Signed bytes are not rewritten.
- Signed-SOE downloads always use original-byte archives, even when an electronic signature field is absent.
- External and archive-entry names are generic. ZIP does not encrypt its directory names.
- All stored originals remain untouched. Downloading an already encrypted original retains its old password inside the newly protected archive; the new archive password cannot remove the old PDF password.
- PDF forms are not flattened by the encryption layer. Existing SOE-generation behavior is unchanged; do not describe a previously flattened generated document as newly editable.
- POST identifier routes reuse existing authorization; a document download never records a signup `previewed` review.
- Generated browser forms and legacy authorized blobs use `/downloads/generated-copy`: bounded multipart bytes, never arbitrary server URLs or filesystem paths. Its audit resource is `browser-generated-copy`, not a claimed immutable stored version. Identifier-based routes provide stronger traceability and are preferred.
- Root files are resolved against the student's current server inventory using Student ID plus document metadata key; submitted Storage paths are not trusted.
- Report preview endpoints remain inline and separate. Old export clients without `downloadProtection.password` fail closed with `download_protection_required`.
- Audit outcome `prepared` means encryption and audit completed; it cannot prove the user saved or opened the file. Export history likewise cannot prove browser delivery.
- The resource version is bound to the source bytes by SHA-256, not by storing their contents. Browser-generated copies have a content fingerprint, not an invented stored submission ID.
- Sensitive responses use `private, no-store` and `nosniff`; CORS exposes only disposition and existing report-audit ID, never a password.

## Password-Assisted Uploads

Single file endpoints accept optional `file_password`. Signup and requirement batches accept JSON `file_passwords`: signup keys `cor`, `rog`, `identity`; requirement keys are zero-based file indexes as strings.
Wrong/missing passwords return structured correction errors. The shared dialog prompts and retries only password failures, never arbitrary mutation failures.
PDFs are decrypted into processing copies for existing scanner/policy validation. Original uploaded bytes remain private and authoritative. Private processing derivatives are not claimed to preserve digital signatures. Passwords are neither saved with file metadata nor audited.
The newest Student Application Profile remains subject to administrator review; school-document auto-validation semantics are unchanged.

## Security Findings and Limits

Reproduced control gap: baseline official export handlers returned plaintext PDF/CSV download copies. This was a missing download-at-rest control, not proof of anonymous access, SQL injection, or a historical data breach. The new tests verify explicit encryption and no plaintext fallback on protection/audit failure.

An isolated replay of the baseline applicant CSV builder also retained a leading formula prefix from a synthetic student-name value. The updated builder escapes it, including leading whitespace. This is verified output handling, not a demonstrated Excel execution exploit or a claim about a past attacker. The baseline commit and narrowly scoped reproductions are recorded in `test-results/romel-baseline.json` by `scripts/evaluate-romel-baseline.py`.
Cross-student/cross-grantor, unrelated reviewer, anonymous, expired and revoked-session tests exercise authorization boundaries with controlled fixtures/mocks. They are not proof that every deployed permission has been tested.
No historical attack request, exploit payload, affected account list, or signed penetration-test report was supplied. Do not invent the attack discussed during the defense.

Limitations: authorized previews expose readable content; screenshots, browser save/print tools, copied bytes, password sharing and endpoint-device compromise cannot be prevented by download encryption. Clipboard history belongs to the user's device; copying a password may retain it there. Browser/backend strings are released from application state, not guaranteed zeroized by their runtimes. Upload passwords travel only over the configured HTTPS connection. Malware scanning, uniform retention, production backup recovery, and field-level encryption remain separate unverified/unimplemented controls.

## Algorithms to Describe Accurately

1. Account creation: identifier availability/uniqueness, document parsing and policy validation, Supabase Auth, confirmation, manual/automatic activation. This is a workflow, not one Levenshtein classifier.
2. Document parsing: pdfplumber embedded text/layout extraction; when text is absent, image conversion/OCR; regular-expression/field/table parsing and policy checks. OCR is not authentication or encryption. Accuracy needs a labeled authorized document sample.
3. Duplicate matching: normalized exact Student ID; weighted Levenshtein/name-token matching. ID .32, name .30, email .10, phone .08, course .08, year .04, city .04, province .04. Missing fields excluded and weights renormalized. Exact email/phone requires name >= .72; fuzzy match requires name >= .82 and weighted score >= .84. Fuzzy matching is not limited to missing IDs. Scholarship authorization is enforced separately by cycle-aware commitment/assignment guards.
4. Recommendations: **Weighted Recommendation Scoring**, not a trained Decision Tree. Open applications and grade eligibility filter candidates; grade margin, normalized roster popularity, location and announcement completeness contribute to ranking. Scope/application authorization is a separate authoritative eligibility layer. See current `scholarship_rules.py`; do not claim ML training, decision-tree accuracy or predictive guarantees.

## Verification and Rollout

Use `backend/tests/test_romel_download_protection.py`, `scripts/test-romel-download-audit.mjs`, and `scripts/test-romel-browser.ps1`. Local browser fixtures never mutate external production records. Detailed test procedures and paper anchors are in the two Romel PDFs.

Before release: apply additive migration; verify service-role-only grants and advisors in staging; deploy backend dependencies; deploy frontend; test real authorized Student/Grantor/Admin/Root sessions and cross-owner denials; open encrypted PDFs in supported desktop/mobile readers and AES ZIPs in an AES-capable archive tool; verify upload round trips, report rows/branding/history, Root audit events and failure paths. Do not disable protection to accommodate old clients.

The connected Supabase account exposed only the existing project and no preview branches during this revision. No staging branch was available for the requested live permission/advisor run. Production migrations and deployments were deliberately not performed in this local change.

References: https://pypdf.readthedocs.io/en/6.1.1/user/encryption-decryption.html and https://pypi.org/project/pyzipper/.
