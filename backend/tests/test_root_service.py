import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from backend import root_service


class RootServiceTests(unittest.TestCase):
    @patch.dict(os.environ, {"ROOT_SESSION_SECRET": "test-secret-that-is-longer-than-thirty-two-characters"})
    def test_secure_hash_is_deterministic_and_does_not_expose_value(self):
        first = root_service.secure_hash("020423")
        self.assertEqual(first, root_service.secure_hash("020423"))
        self.assertNotIn("020423", first)
        self.assertEqual(64, len(first))

    @patch.dict(os.environ, {"ROOT_SESSION_SECRET": "short"}, clear=False)
    def test_short_root_session_secret_fails_closed(self):
        with self.assertRaises(HTTPException) as raised:
            root_service.secure_hash("value")
        self.assertEqual(503, raised.exception.status_code)

    def test_sql_rejects_writes_before_opening_connection(self):
        for statement in [
            "update students set data = '{}'",
            "select 1; delete from students",
            "select * from auth.users",
            "select pg_read_file('/etc/passwd')",
            "select pg_terminate_backend(42)",
            "select set_config('search_path', 'public', false)",
        ]:
            with self.subTest(statement=statement), self.assertRaises(HTTPException) as raised:
                root_service.sql_query(None, {"root": {"id": "root"}}, statement)
            self.assertEqual(422, raised.exception.status_code)

    @patch("backend.root_service._rest")
    def test_public_config_exposes_only_expected_groups(self, rest):
        root_service.PUBLIC_CONFIG_CACHE.update({"value": None, "expires": 0})
        rest.return_value = [
            {"id": "portal", "data": {"maintenanceMode": False}},
            {"id": "academic_cycle", "data": {"semesterTag": "2026-2027-1ST"}},
            {"id": "branding", "data": {"productName": "BulsuScholar"}},
        ]
        result = root_service.public_config()
        self.assertEqual({"ok", "portal", "academicCycle", "branding"}, set(result))
        self.assertEqual("2026-2027-1ST", root_service.configured_semester_tag())

    def test_metrics_capture_status_and_duration(self):
        before = root_service.metrics_snapshot()["requests"]
        started = root_service.metric_started()
        root_service.metric_finished("/root/test/1234567890abcdef", 503, started)
        result = root_service.metrics_snapshot()
        self.assertEqual(before + 1, result["requests"])
        self.assertGreaterEqual(result["errors"], 1)
        self.assertIn("503", result["statuses"])

    def test_root_password_policy(self):
        for weak in ["short", "alllowercase123!", "ALLUPPERCASE123!", "NoNumberHere!"]:
            with self.subTest(weak=weak), self.assertRaises(HTTPException) as raised:
                root_service._validate_root_password(weak)
            self.assertEqual(422, raised.exception.status_code)
        root_service._validate_root_password("StrongRoot123!")

    @patch("backend.root_service._rest")
    def test_admin_contact_is_normalized_and_only_updates_contact(self, rest):
        record = {"fullName": "Admin User", "role": "full_admin", "authUserId": "auth-1"}
        result = root_service.update_admin_contact("admin-1", record, "+63 912 345 6789")

        self.assertEqual("09123456789", result["contactNumber"])
        payload = rest.call_args.kwargs["payload"]
        self.assertEqual("Admin User", payload["data"]["fullName"])
        self.assertEqual("09123456789", payload["data"]["contactNumber"])
        self.assertNotIn("email", result)

    def test_admin_contact_rejects_invalid_number(self):
        with self.assertRaises(HTTPException) as raised:
            root_service.update_admin_contact("admin-1", {}, "12345")
        self.assertEqual(422, raised.exception.status_code)

    def test_admin_temporary_password_requires_complexity(self):
        with self.assertRaises(HTTPException) as raised:
            root_service._validate_admin_password("short")
        self.assertEqual("admin_password_too_weak", raised.exception.detail)
        root_service._validate_admin_password("StrongPass1!")

    @patch("backend.root_service._all_data_rows")
    def test_root_student_report_uses_fixed_schema_and_active_application_count(self, all_rows):
        datasets = {
            "students": [{"id": "20230001", "fullName": "Ana Santos", "course": "BSIT", "year": "2", "gwa": "1.50"}],
            "providers": [],
            "grantor_portal_announcements": [],
            "scholarship_applications": [
                {"id": "active", "studentId": "20230001", "status": "Pending", "currentStage": "Document Review"},
                {"id": "closed", "studentId": "20230001", "status": "Rejected"},
            ],
        }
        all_rows.side_effect = lambda table: datasets[table]

        result = root_service.build_root_report("students")

        self.assertEqual(1, result["rowCount"])
        self.assertEqual("Active Applications", result["columns"][6]["label"])
        self.assertEqual(1, result["records"][0]["activeApplications"])
        self.assertEqual("Document Review", result["records"][0]["currentStage"])

    def test_unknown_root_report_is_rejected(self):
        with self.assertRaises(HTTPException) as raised:
            root_service.build_root_report("secrets")
        self.assertEqual(404, raised.exception.status_code)

    def test_sensitive_fields_are_redacted_recursively(self):
        result = root_service._redact_sensitive({
            "name": "Ana",
            "password": "hidden",
            "nested": {"accessToken": "hidden", "status": "active"},
            "items": [{"apiKey": "hidden", "value": 1}],
        })
        self.assertEqual({"name": "Ana", "nested": {"status": "active"}, "items": [{"value": 1}]}, result)

    @patch("backend.root_service._first", return_value={"data": {}})
    def test_branding_rejects_untrusted_asset_urls(self, first):
        identity = {"root": {"id": "Tristan@Root"}}
        with self.assertRaises(HTTPException) as raised:
            root_service.update_config(None, identity, "branding", {
                "productName": "BulsuScholar", "fontFamily": "Inter",
                "primaryColor": "#006b3c", "accentColor": "#16a34a",
                "logoUrl": "javascript:alert(1)", "faviconUrl": "",
                "maintenanceMessage": "Maintenance",
            })
        self.assertEqual(422, raised.exception.status_code)


if __name__ == "__main__":
    unittest.main()
