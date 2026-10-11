import unittest
from unittest.mock import patch

from fastapi import HTTPException

from backend import academic_cycle_service, root_service


class AcademicCycleServiceTests(unittest.TestCase):
    def setUp(self):
        root_service.PUBLIC_CONFIG_CACHE.update({"value": None, "expires": 0.0})

    @patch("backend.academic_cycle_service.supabase_document_get")
    @patch("backend.academic_cycle_service.require_admin_bearer")
    def test_full_admin_can_read_cycle(self, require_admin, get_document):
        require_admin.return_value = ({"id": "auth-admin"}, {"role": "full_admin"})
        get_document.return_value = {
            "ok": True,
            "row": {"id": "academic_cycle"},
            "data": {"academicYear": "2026-2027", "semester": "1ST"},
        }
        request = type("Request", (), {"headers": {
            "x-portal-actor-id": "admin-1", "x-portal-actor-type": "admin",
        }})()

        result = academic_cycle_service.get_admin_academic_cycle(request)

        self.assertEqual("2026-2027-1ST", result["academicCycle"]["semesterTag"])
        require_admin.assert_called_once_with(request, "admin-1")

    @patch("backend.academic_cycle_service.require_admin_bearer")
    def test_non_full_admin_cannot_access_cycle(self, require_admin):
        require_admin.return_value = ({"id": "auth-reviewer"}, {"role": "student_reviewer"})
        request = type("Request", (), {"headers": {
            "x-portal-actor-id": "reviewer-1", "x-portal-actor-type": "admin",
        }})()

        with self.assertRaises(HTTPException) as raised:
            academic_cycle_service.get_admin_academic_cycle(request)

        self.assertEqual(403, raised.exception.status_code)
        self.assertEqual("full_admin_required", raised.exception.detail)

    @patch("backend.academic_cycle_service.create_log")
    @patch("backend.academic_cycle_service.supabase_rpc")
    def test_activation_uses_expected_cycle_and_returns_counts(self, rpc, create_log):
        rpc.return_value = {"ok": True, "data": {
            "academicCycle": "2026-2027-1ST",
            "previousCycle": "2026-2027-2ND",
            "academicYear": "2026-2027",
            "semester": "1ST",
            "direction": "rollback",
            "affectedApplicationCount": 2,
            "exactRestorationCount": 1,
            "reconstructedCount": 1,
        }}

        result = academic_cycle_service.activate_academic_cycle({
            "academicYear": "2026-2027",
            "semester": "1st",
            "expectedCurrentCycle": "2026-2027-2ND",
        }, actor_id="admin-1", actor_type="admin")

        self.assertEqual("rollback", result["data"]["direction"])
        rpc.assert_called_once_with("activate_academic_cycle", {
            "p_academic_year": "2026-2027",
            "p_semester": "1ST",
            "p_expected_current_cycle": "2026-2027-2ND",
            "p_actor_id": "admin-1",
            "p_actor_type": "admin",
        })
        create_log.assert_called_once()

    def test_activation_rejects_invalid_cycle(self):
        for payload in (
            {"academicYear": "2026-2028", "semester": "1ST", "expectedCurrentCycle": "2026-2027-1ST"},
            {"academicYear": "2026-2027", "semester": "3RD", "expectedCurrentCycle": "2026-2027-1ST"},
            {"academicYear": "2026-2027", "semester": "2ND"},
        ):
            with self.subTest(payload=payload), self.assertRaises(HTTPException) as raised:
                academic_cycle_service.activate_academic_cycle(payload, actor_id="admin-1", actor_type="admin")
            self.assertEqual(422, raised.exception.status_code)

    @patch("backend.academic_cycle_service.supabase_rpc", return_value={
        "ok": False, "reason": "academic_cycle_changed",
    })
    def test_stale_cycle_is_conflict(self, _rpc):
        with self.assertRaises(HTTPException) as raised:
            academic_cycle_service.activate_academic_cycle({
                "academicYear": "2026-2027",
                "semester": "2ND",
                "expectedCurrentCycle": "2026-2027-1ST",
            }, actor_id="root", actor_type="root")

        self.assertEqual(409, raised.exception.status_code)
        self.assertEqual("academic_cycle_changed", raised.exception.detail)

    @patch("backend.academic_cycle_service.activate_academic_cycle")
    def test_root_setting_uses_shared_transition(self, activate):
        activate.return_value = {"ok": True, "data": {"semesterTag": "2026-2027-2ND"}}

        result = root_service.update_config(None, {"root": {"id": "root-1"}}, "academic_cycle", {
            "academicYear": "2026-2027",
            "semester": "2ND",
            "expectedCurrentCycle": "2026-2027-1ST",
        })

        self.assertTrue(result["ok"])
        activate.assert_called_once_with({
            "academicYear": "2026-2027",
            "semester": "2ND",
            "expectedCurrentCycle": "2026-2027-1ST",
        }, actor_id="root-1", actor_type="root")


if __name__ == "__main__":
    unittest.main()
