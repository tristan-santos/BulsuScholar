import csv
import io
import unittest
from unittest.mock import patch
from starlette.requests import Request

from fastapi import HTTPException
from backend import admin_report_service as reports
from backend import admin_report_datasets as datasets


class AdminReportDatasetTests(unittest.TestCase):
    def setUp(self):
        self.tables = {
            "students": [{"id": "s1", "fname": "Test", "lname": "Student", "year": "4"}],
            "providers": [{"id": "g1", "name": "Test Grantor"}, {"id": "g2", "name": "Second Grantor", "archived": True}],
            "grantor_portal_announcements": [{"id": "a1", "grantorId": "g1", "minimumGwa": "2.25"}, {"id": "a2", "grantorId": "g2", "minimumGwa": "2.25", "archived": True}],
            "grantor_portal_scholars": [
                {"id": "r1", "studentId": "s1", "fullName": "Test Student", "grantorId": "g1", "scholarshipTitle": "Program One"},
                {"id": "r2", "studentId": "s1", "fullName": "Test Student", "grantorId": "g2", "scholarshipTitle": "Program Two"},
                {"id": "r3", "studentId": "s2", "fullName": "Archived Student", "grantorId": "g1", "scholarshipTitle": "Old Program", "archived": True},
            ],
            "scholarship_applications": [
                {"id": "app1", "studentId": "s1", "grantorId": "g1", "name": "Program One", "status": "Applied", "tracking": {"completedStepIds": ["document_uploading", "application_form", "document_review"]}},
                {"id": "app2", "studentId": "s1", "grantorId": "g2", "name": "Program Two", "status": "Applied", "servicingOwner": "admin"},
                {"id": "app3", "studentId": "s1", "grantorId": "g1", "name": "Closed", "status": "Withdrawn"},
            ],
            "scholarships": [{"id": "p1", "name": "Program One", "totalSlots": 5}],
            "soe_requests": [
                {"id": "req1", "requestNumber": "req1", "studentId": "s1", "scholarshipId": "app1", "providerType": "other", "materials": {"soe": {"requested": True, "status": "approved"}}},
                {"id": "req2", "requestNumber": "req2", "studentId": "s1", "scholarshipId": "app2", "materials": {"soe": {"status": "pending"}}},
                {"id": "req3", "requestNumber": "req3", "studentId": "s2", "scholarshipId": "app3", "reviewState": "non_compliant"},
            ],
            "soe_downloads": [
                {"id": "d1", "requestNumber": "req1", "studentId": "s1", "reviewState": "incoming", "semesterTag": "2026-2027-1ST"},
                {"id": "d2", "requestNumber": "req1", "studentId": "s1", "reviewState": "signed", "semesterTag": "2025-2026-2ND"},
            ],
        }
        self.reads = patch.object(datasets, "_all", side_effect=lambda table: self.tables.get(table, []))
        self.reads.start()
        self.addCleanup(self.reads.stop)

    @staticmethod
    def root_source(kind):
        records = {
            "students": [
                {"studentId": "s1", "fullName": "Active", "recordStatus": "Active", "course": "BSIT", "yearLevel": "4"},
                {"studentId": "s2", "fullName": "Archived", "recordStatus": "Archived", "course": "BSIT", "yearLevel": "3"},
            ],
            "grantors": [{"grantorId": "g1", "accountStatus": "Active"}, {"grantorId": "g2", "accountStatus": "Active"}],
            "scholarships": [{"scholarshipId": "a1", "title": "Program One"}, {"scholarshipId": "a2", "title": "Old Offering"}],
            "requirements": [{"requestNumber": f"req{i}", "studentId": f"s{i}", "applicationNumber": f"app{i}", "reviewState": "Pending Approval", "requestedAt": "2026-10-20"} for i in range(1, 4)],
        }[kind]
        return {"records": records, "columns": [{"key": key, "label": key} for key in records[0]]}

    def test_section_account_datasets_and_filters(self):
        with patch.object(datasets, "build_root_report", side_effect=self.root_source):
            for kind, dataset, expected in [("students", "students", "s1"), ("students", "archived", "s2"),
                                             ("grantors", "grantors", "g1"), ("grantors", "archived", "g2")]:
                result = reports.build_admin_report({"reportType": kind, "dataset": dataset, "filters": {}})
                self.assertEqual(1, result["total"])
                self.assertIn(expected, result["rows"][0])

    def test_student_view_is_not_sent_as_a_filter_and_unknown_filters_still_fail(self):
        with self.assertRaises(HTTPException) as error:
            reports.build_admin_report({"reportType": "students", "filters": {"view": "students"}})
        self.assertEqual("unsupported_report_filter", error.exception.detail)
        with patch.object(datasets, "build_root_report", side_effect=self.root_source):
            result = reports.build_admin_report({"reportType": "students", "dataset": "students", "filters": {"course": "BSIT", "year": "4"}})
        self.assertEqual(1, result["total"])

    def test_scholarship_tabs_have_distinct_rows_and_columns(self):
        with patch.object(datasets, "build_root_report", side_effect=self.root_source):
            expected = {"scholarships": 2, "overview": 2, "scholars": 1, "archived": 1, "warning": 1, "tracking": 2, "serviced": 1}
            for dataset, count in expected.items():
                with self.subTest(dataset=dataset):
                    result = reports.build_admin_report({"reportType": "scholarships", "dataset": dataset})
                    self.assertEqual(count, result["total"])
                    labels = [column["label"] for column in result["columns"]]
                    if dataset in {"tracking", "serviced"}:
                        self.assertIn("Current Step", labels)
                    if dataset == "archived":
                        self.assertIn("Archived At", labels)
                    if dataset == "warning":
                        self.assertEqual(["Student ID", "Full Name"], labels)

    def test_tracking_uses_persisted_completed_steps(self):
        result = reports.build_admin_report({"reportType": "scholarships", "dataset": "tracking", "filters": {"grantor": "g1"}})
        self.assertEqual(1, result["total"])
        self.assertIn("Request Materials", result["rows"][0])

    def test_roster_filter_matches_one_of_the_grouped_programs(self):
        result = reports.build_admin_report({"reportType": "scholarships", "dataset": "scholars", "filters": {"scholarship": "Program Two", "grantor": "g2"}})
        self.assertEqual(1, result["total"])
        self.assertTrue(any("Program Two" in cell for cell in result["rows"][0]))

    def test_requirements_tabs_use_material_decisions_and_signing_subfilter(self):
        with patch.object(datasets, "build_root_report", side_effect=self.root_source):
            for dataset in ("requesting", "approved", "rejected"):
                result = reports.build_admin_report({"reportType": "requirements", "dataset": dataset})
                self.assertEqual(1, result["total"])
            result = reports.build_admin_report({"reportType": "requirements", "dataset": "approved", "filters": {"material": "soe", "providerType": "other"}})
            self.assertEqual(1, result["total"])
            result = reports.build_admin_report({"reportType": "requirements", "dataset": "signing", "filters": {"signing": "Pending Signature", "academicCycle": "2026-2027-1ST"}})
            self.assertEqual(1, result["total"])

    def test_csv_export_contains_all_matching_rows_across_preview_pages(self):
        source = self.root_source("students")
        source["records"] = [{**source["records"][0], "studentId": f"s{i}"} for i in range(61)]
        with patch.object(datasets, "build_root_report", return_value=source):
            payload = {"reportType": "students", "dataset": "students", "pageSize": 25, "filters": {"course": "BSIT"}}
            preview = reports.build_admin_report(payload)
            content, _, _, exported = reports.build_admin_report_export({**payload, "format": "csv"})
        self.assertEqual(25, len(preview["rows"]))
        self.assertEqual(61, preview["total"])
        self.assertEqual(3, preview["totalPages"])
        self.assertEqual(61, exported["total"])
        self.assertEqual(62, len(list(csv.reader(io.StringIO(content.decode("utf-8-sig"))))))

    def test_invalid_dataset_is_rejected_and_empty_dataset_keeps_columns(self):
        with self.assertRaises(HTTPException):
            reports.build_admin_report({"reportType": "students", "dataset": "tracking"})
        result = reports.build_admin_report({"reportType": "scholarships", "dataset": "tracking", "filters": {"search": "not present"}})
        self.assertEqual(0, result["total"])
        self.assertTrue(result["columns"])

    def test_default_dataset_retains_central_report_behavior(self):
        with patch.object(reports, "build_root_report", return_value=self.root_source("students")) as source:
            result = reports.build_admin_report({"reportType": "students"})
        source.assert_called_once_with("students")
        self.assertEqual("all", result["dataset"])
        self.assertEqual(2, result["total"])

    def test_file_preview_does_not_audit_but_export_does(self):
        from backend import main
        request = Request({"type": "http", "method": "POST", "path": "/admin/reports/file-preview", "headers": []})
        report = {"reportType": "students", "dataset": "archived", "filters": {}, "total": 1, "generatedAt": "2026-10-20"}
        with patch.object(main, "enforce_portal_scope"), \
                patch.object(main, "public_config", return_value={}), \
                patch.object(main, "build_admin_report_export", return_value=(b"%PDF-fixture", "application/pdf", "report.pdf", report)) as builder, \
                patch.object(main, "record_admin_report_export", return_value="audit-1") as audit:
            payload = {"reportType": "students", "dataset": "archived", "format": "pdf"}
            response = main.preview_admin_report_file_endpoint(request, payload)
            self.assertEqual(200, response.status_code)
            audit.assert_not_called()
            self.assertEqual("archived", builder.call_args.args[0]["dataset"])
            response = main.export_admin_report_endpoint(request, payload)
            audit.assert_called_once()
            self.assertEqual("audit-1", response.headers["x-report-audit-id"])


if __name__ == "__main__":
    unittest.main()
