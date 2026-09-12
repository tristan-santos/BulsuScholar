import io
import os
import unittest
from unittest.mock import patch

import pdfplumber
from fastapi import HTTPException
from starlette.requests import Request

from backend.main import generate_pdf_report_endpoint, preview_top_students_report_endpoint
from backend.report_service import (
    MAX_CELL_LENGTH,
    MAX_REPORT_COLUMNS,
    MAX_REPORT_ROWS,
    build_report_pdf_bytes,
    sanitize_report_filename,
    validate_report_payload,
)


class ReportServiceTests(unittest.TestCase):
    @staticmethod
    def portal_request(actor_id="", actor_type=""):
        headers = []
        if actor_id:
            headers.append((b"x-portal-actor-id", actor_id.encode()))
        if actor_type:
            headers.append((b"x-portal-actor-type", actor_type.encode()))
        return Request({"type": "http", "method": "POST", "path": "/reports/top-students/preview", "headers": headers})

    def test_payload_validation_rejects_missing_columns_and_oversized_reports(self):
        with self.assertRaisesRegex(ValueError, "report_columns_required"):
            validate_report_payload({"columns": [], "rows": []})

        with self.assertRaisesRegex(ValueError, "report_column_limit_exceeded"):
            validate_report_payload({"columns": ["Value"] * (MAX_REPORT_COLUMNS + 1), "rows": []})

        with self.assertRaisesRegex(ValueError, "report_row_limit_exceeded"):
            validate_report_payload({"columns": ["Value"], "rows": [["row"]] * (MAX_REPORT_ROWS + 1)})

        with self.assertRaisesRegex(ValueError, "invalid_report_row_shape"):
            validate_report_payload({"columns": ["One", "Two"], "rows": [["one cell"]]})

        with self.assertRaisesRegex(ValueError, "report_cell_limit_exceeded"):
            validate_report_payload({"columns": ["Value"], "rows": [["x" * (MAX_CELL_LENGTH + 1)]]})

    def test_filename_is_sanitized_and_keeps_pdf_extension(self):
        self.assertEqual(sanitize_report_filename(" Students / Audit 2026 "), "Students-Audit-2026.pdf")
        self.assertEqual(sanitize_report_filename("requirements.pdf"), "requirements.pdf")

    def test_landscape_pdf_wraps_escaped_text_and_repeats_headers(self):
        payload = {
            "title": "Students <Audit> & Review",
            "subtitle": "Canonical report output",
            "filterLabel": "Status: Active",
            "stats": [
                {"label": "Rows", "value": 70},
                {"label": "Active", "value": 69},
            ],
            "columns": [
                {"label": "Student ID", "weight": 1},
                {"label": "Full Name", "weight": 2},
                {"label": "Notes", "weight": 3},
            ],
            "rows": [
                [f"2023{index:04d}", f"Student {index}", f"Review <{index}> & details, row {index}"]
                for index in range(70)
            ],
        }
        payload["rows"][0][1] = "Jos" + chr(233) + " " + chr(209) + "ez"

        result = build_report_pdf_bytes(payload)

        self.assertTrue(result.startswith(b"%PDF"))
        with pdfplumber.open(io.BytesIO(result)) as pdf:
            text = "\n".join(page.extract_text() or "" for page in pdf.pages)
            self.assertGreater(len(pdf.pages), 1)
            self.assertGreater(pdf.pages[0].width, pdf.pages[0].height)
            self.assertIn("Students <Audit> & Review", text)
            self.assertIn("Review <69> & details", text)
            self.assertIn("Student 69", text)
            self.assertEqual(text.count("Student ID"), len(pdf.pages))

    @patch.dict(os.environ, {"ENFORCE_PORTAL_ACTOR_HEADERS": "true"})
    def test_top_students_report_requires_admin_identity(self):
        with self.assertRaises(HTTPException) as missing_identity:
            preview_top_students_report_endpoint(self.portal_request(), {"students": [], "offerings": []})
        self.assertEqual(missing_identity.exception.status_code, 401)

        with self.assertRaises(HTTPException) as wrong_role:
            preview_top_students_report_endpoint(
                self.portal_request("student-1", "student"),
                {"actorType": "student", "students": [], "offerings": []},
            )
        self.assertEqual(wrong_role.exception.status_code, 403)

        with self.assertRaises(HTTPException) as pdf_wrong_role:
            generate_pdf_report_endpoint(
                self.portal_request("student-1", "student"),
                {"actorType": "student", "columns": ["Value"], "rows": [["row"]]},
            )
        self.assertEqual(pdf_wrong_role.exception.status_code, 403)

    def test_top_students_report_skips_only_student_ineligible_offerings(self):
        result = preview_top_students_report_endpoint(
            self.portal_request("admin-1", "admin"),
            {
                "actorType": "admin",
                "students": [{
                    "id": "student-1",
                    "studentId": "2023000001",
                    "fullName": "Ana Student",
                    "gwa": 1.5,
                    "ineligibleOfferingIds": ["offering-a"],
                }],
                "offerings": [
                    {
                        "id": "offering-a",
                        "title": "Scholarship A",
                        "grantorName": "Grantor A",
                        "minimumGwa": 2.0,
                        "applicationEnabled": True,
                    },
                    {
                        "id": "offering-b",
                        "title": "Scholarship B",
                        "grantorName": "Grantor B",
                        "minimumGwa": 2.0,
                        "applicationEnabled": True,
                    },
                ],
            },
        )

        groups = {group["announcementId"]: group for group in result["groups"]}
        self.assertEqual(groups["offering-a"]["rows"], [])
        self.assertEqual(groups["offering-b"]["rows"][0]["studentId"], "2023000001")


if __name__ == "__main__":
    unittest.main()
