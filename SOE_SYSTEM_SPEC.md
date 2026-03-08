# BulsuScholar: SOE Generation & Verification System Specification

This directive focuses on the automated creation, security, and administrative validation of the Statement of Expenses (SOE). It ensures that every issued SOE is legitimate, traceable, and tamper-proof.

---

## 1. The "Request Number" Security Protocol
**Objective:** Prevent forgery by linking every document to a unique, searchable ID.

- **Generation Logic:** 
  - Every SOE request must generate a unique `RequestNumber` (e.g., `SOE-2026-XXXXX`).
  - This number must be cryptographically or sequentially linked to the `StudentID` and `Timestamp`.
- **Database Storage (Firestore):**
  - Store the `RequestNumber` inside the `soeRequests` collection.
  - Fields: `requestNumber`, `studentId`, `studentName`, `expensesArray`, `totalAmount`, `status` (Pending/Signed/Rejected).
- **Admin Verification Workflow:**
  - Create a "Verify SOE" tool in the Admin Dashboard.
  - **Action:** Admin types in a `RequestNumber`.
  - **Validation:** The system fetches the student info associated with that number.
  - **Integrity Check:** If the student name/details on the physical/digital paper don't match the database result, the Admin flags it as "Invalid/Tampered" and rejects the signing.

---

## 2. Student Request UI: The "Expense Entry" Modal
**Objective:** A user-friendly popup to collect financial data before generation.

- **Design:**
  - Modern, centered modal with a progress stepper (if needed).
  - **Inputs:**
    - Dynamic list of "Expense Items" (e.g., Tuition, Books, Uniform).
    - "Amount" field for each item.
    - Automatic "Grand Total" calculator at the bottom.
- **Visuals:** Use the BulSU Green theme with clear "Submit" and "Cancel" actions.

---

## 3. Automated Document Mapping (Template Filling)
**Objective:** Map student data to the "SOE Template.docs/.pdf" fields automatically.

- **Mapping Logic:**
  - `Point of Origin` ➔ Student's **College Department**.
  - `Date` ➔ **Current Date**.
  - `Name of Scholar` ➔ Student's **Full Name**.
  - `Student Number` ➔ Student's **Official ID**.
  - `Program` ➔ Student's **Course/Major**.
  - `Nature of Scholarship` ➔ The **Scholarship Program Name** (e.g., Kuya Win).
  - `Registration Number` ➔ The newly generated **Request Number**.
- **The "Tamper-Proof" Footer:** Add the `Request Number` as a small QR code or text at the bottom of every page to ensure it can be verified in the field.

---

## 4. Technical Integration (React Tools)
**Objective:** Use specialized libraries to handle document parsing and generation.

- **Template Analysis:**
  - Use `docxtemplater` or a similar React-compatible library to parse the `.docx` template.
  - For PDF analysis, ensure the coordinates for "Autofill" fields are precisely mapped to the `SOE Template.pdf`.
- **Export Workflow (`@react-pdf/renderer`):**
  - Once the student submits the Expense Modal, the system generates a preview.
  - **Export Action:** Allow the student to download the final, filled-out SOE as a high-quality PDF.
  - **Constraint:** The PDF must be "Read-Only" to prevent further manual editing by the student after generation.

---

## 5. Admin Dashboard Logic (The Gatekeeper)
**Objective:** Empower admins to manage the flow of funds and signatures.

- **Search/Filter:** Admins can filter requests by "Pending Signature."
- **Approval Action:**
  - Clicking "Approve & Sign" updates the Firestore status to `Signed`.
  - This triggers a notification to the student that their SOE is ready for collection or digital use.
- **Rejection Logic:**
  - If a discrepancy is found (e.g., wrong Request Number), the Admin provides a "Reason for Rejection" which is sent back to the student.
