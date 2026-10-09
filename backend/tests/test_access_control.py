import unittest
import io
import urllib.error
from unittest.mock import Mock, patch

from fastapi import HTTPException

from backend.access_control import _required_admin_permissions, require_supabase_user


class AdminPermissionTests(unittest.TestCase):
    def test_sensitive_admin_route_groups_have_permissions(self):
        self.assertEqual({"reports"}, _required_admin_permissions("/reports/pdf"))
        self.assertEqual({"grantors"}, _required_admin_permissions("/workflows/admin/grantors/archive-state"))
        self.assertEqual({"students"}, _required_admin_permissions("/admin/check-student-duplicates"))
        self.assertEqual({"requirements"}, _required_admin_permissions("/workflows/materials/update"))

    def test_general_notification_route_has_no_section_restriction(self):
        self.assertEqual(set(), _required_admin_permissions("/notifications/admin/update"))


class SupabaseUserAccessTests(unittest.TestCase):
    @patch.dict("os.environ", {
        "SUPABASE_URL": "https://project.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "service-key",
    }, clear=False)
    def test_missing_bearer_token_is_rejected(self):
        request = Mock(headers={})

        with self.assertRaises(HTTPException) as raised:
            require_supabase_user(request, require_verified=False)

        self.assertEqual(401, raised.exception.status_code)
        self.assertEqual("authentication_required", raised.exception.detail)

    @patch.dict("os.environ", {
        "SUPABASE_URL": "https://project.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "service-key",
    }, clear=False)
    @patch("backend.access_control.urllib.request.urlopen")
    def test_invalid_bearer_token_is_rejected(self, urlopen):
        urlopen.side_effect = urllib.error.HTTPError(
            "https://project.supabase.co/auth/v1/user", 401, "Unauthorized", {}, io.BytesIO(b"{}")
        )
        request = Mock(headers={"authorization": "Bearer invalid-token"})

        with self.assertRaises(HTTPException) as raised:
            require_supabase_user(request, require_verified=False)

        self.assertEqual(401, raised.exception.status_code)
        self.assertEqual("invalid_authentication_session", raised.exception.detail)

    @patch.dict("os.environ", {
        "SUPABASE_URL": "https://project.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "service-key",
    }, clear=False)
    @patch("backend.access_control.supabase_rpc")
    @patch("backend.access_control._require_unlocked_auth_user")
    @patch("backend.access_control.urllib.request.urlopen")
    def test_confirmation_mode_keeps_identity_and_lock_checks_without_portal_session(self, urlopen, unlocked, rpc):
        response = Mock()
        response.read.return_value = b'{"id":"auth-a","email":"student@example.com","email_confirmed_at":"2026-10-09T00:00:00Z"}'
        urlopen.return_value.__enter__.return_value = response
        request = Mock(headers={"authorization": "Bearer valid-token"})

        user = require_supabase_user(request, require_verified=False)

        self.assertEqual("auth-a", user["id"])
        unlocked.assert_called_once_with("auth-a")
        rpc.assert_not_called()

    @patch.dict("os.environ", {
        "SUPABASE_URL": "https://project.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "service-key",
    }, clear=False)
    @patch("backend.access_control.supabase_rpc", return_value={"ok": True, "data": {"valid": True}})
    @patch("backend.access_control._require_unlocked_auth_user")
    @patch("backend.access_control.urllib.request.urlopen")
    def test_normal_portal_auth_still_requires_verified_session(self, urlopen, _unlocked, rpc):
        response = Mock()
        response.read.return_value = b'{"id":"auth-a","email":"student@example.com"}'
        urlopen.return_value.__enter__.return_value = response
        token = "header.eyJzZXNzaW9uX2lkIjoic2Vzc2lvbi0xIn0.signature"
        request = Mock(headers={"authorization": f"Bearer {token}"})

        user = require_supabase_user(request)

        self.assertEqual("auth-a", user["id"])
        rpc.assert_called_once_with("validate_portal_verified_session", {
            "p_session_id": "session-1",
            "p_auth_user_id": "auth-a",
        })


if __name__ == "__main__":
    unittest.main()
