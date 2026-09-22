import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException

from backend import access_control


class PortalScopeAuthTests(unittest.TestCase):
    def setUp(self):
        self.request = Mock()
        self.request.headers = {
            "x-portal-actor-id": "student-1",
            "x-portal-actor-type": "student",
        }
        self.request.url.path = "/workflows/materials/request"

    def test_student_workflow_requires_matching_auth_user(self):
        with patch.object(access_control, "require_supabase_user", return_value={"id": "auth-1"}), \
                patch.object(access_control, "supabase_document_get", return_value={
                    "ok": True, "row": {"id": "student-1"}, "data": {"authUserId": "auth-2"},
                }):
            with self.assertRaises(HTTPException) as raised:
                access_control.enforce_portal_scope(self.request, {}, {"student"})
        self.assertEqual(raised.exception.status_code, 403)

    def test_student_workflow_accepts_verified_owner(self):
        with patch.object(access_control, "require_supabase_user", return_value={"id": "auth-1"}), \
                patch.object(access_control, "supabase_document_get", return_value={
                    "ok": True, "row": {"id": "student-1"}, "data": {"authUserId": "auth-1"},
                }):
            payload = {}
            access_control.enforce_portal_scope(self.request, payload, {"student"})
        self.assertEqual(payload["actorId"], "student-1")


if __name__ == "__main__":
    unittest.main()
