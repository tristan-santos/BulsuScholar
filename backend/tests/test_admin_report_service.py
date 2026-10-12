import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException

from backend import admin_report_service


class AdminReportServiceTests(unittest.TestCase):
    def source(self):
        return {
            "columns": [
                {"key": "studentId", "label": "Student ID", "weight": 1},
                {"key": "fullName", "label": "Full Name", "weight": 1.5},
                {"key": "recordStatus", "label": "Record Status", "weight": 1},
            ],
            "records": [
                {"studentId": "1", "fullName": "Active Student", "recordStatus": "Active", "course": "BSIT", "yearLevel": "4", "grantorIds": ["g1"], "reportDate": "2026-10-01T00:00:00Z"},
                {"studentId": "2", "fullName": "Archived Student", "recordStatus": "Archived", "course": "BSED", "yearLevel": "3", "grantorIds": ["g2"], "reportDate": "2026-09-01T00:00:00Z"},
            ],
        }

    @patch.object(admin_report_service, "build_root_report")
    def test_preview_filters_authoritative_rows(self, build_report):
        build_report.return_value = self.source()
        result = admin_report_service.build_admin_report({
            "reportType": "students",
            "filters": {"status": "Active", "course": "BSIT", "grantor": "g1"},
            "page": 1,
            "pageSize": 25,
        })
        self.assertEqual(1, result["total"])
        self.assertEqual("1", result["rows"][0][0])
        build_report.assert_called_once_with("students")

    @patch.object(admin_report_service, "build_root_report")
    def test_csv_export_protects_spreadsheet_formulas(self, build_report):
        source = self.source()
        source["records"][0]["fullName"] = "=HYPERLINK(\"bad\")"
        build_report.return_value = source
        content, content_type, filename, report = admin_report_service.build_admin_report_export({
            "reportType": "students",
            "filters": {"status": "Active"},
            "format": "csv",
        })
        self.assertIn("text/csv", content_type)
        self.assertTrue(filename.endswith(".csv"))
        self.assertIn("'=HYPERLINK", content.decode("utf-8-sig"))
        self.assertEqual(1, report["total"])

    @patch.object(admin_report_service, "build_root_report")
    def test_invalid_pagination_is_rejected(self, build_report):
        build_report.return_value = self.source()
        with self.assertRaises(HTTPException) as raised:
            admin_report_service.build_admin_report({"reportType": "students", "page": "invalid"})
        self.assertEqual(422, raised.exception.status_code)

    @patch.object(admin_report_service, "supabase_rest_insert", return_value={"ok": True})
    def test_successful_export_records_metadata_only(self, insert):
        request = Mock()
        request.headers = {"x-portal-actor-id": "admin-1"}
        report = {
            "reportType": "students",
            "filters": {"status": "Active"},
            "total": 4,
            "generatedAt": "2026-10-12T00:00:00+00:00",
        }
        audit_id = admin_report_service.record_admin_report_export(request, report, "pdf")
        self.assertTrue(audit_id.startswith("admin_report_"))
        payload = insert.call_args.args[1]["data"]
        self.assertEqual("admin-1", payload["actorId"])
        self.assertEqual(4, payload["rowCount"])
        self.assertNotIn("rows", payload)
        self.assertNotIn("content", payload)


if __name__ == "__main__":
    unittest.main()
