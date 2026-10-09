import unittest
from unittest.mock import Mock, patch

from backend.main import app, student_email_confirmed_endpoint


class PortalDataRouteRegistrationTests(unittest.TestCase):
    def test_portal_data_compatibility_routes_are_registered_as_post(self):
        schema = app.openapi()

        for path in (
            "/portal/data/query",
            "/portal/data/mutate",
            "/portal/data/delete",
        ):
            self.assertIn(path, schema["paths"])
            self.assertIn("post", schema["paths"][path])


class StudentEmailConfirmationRouteTests(unittest.TestCase):
    @patch("backend.main.promote_email_confirmed_student")
    @patch("backend.main.require_supabase_user")
    def test_confirmation_uses_supabase_identity_without_portal_session(self, require_user, promote):
        request = Mock()
        auth_user = {
            "id": "auth-a",
            "email": "student@example.com",
            "email_confirmed_at": "2026-10-09T00:00:00Z",
        }
        require_user.return_value = auth_user
        promote.return_value = {"ok": True, "pendingApproval": True}

        result = student_email_confirmed_endpoint(request, {})

        self.assertTrue(result["ok"])
        require_user.assert_called_once_with(request, require_verified=False)
        promote.assert_called_once_with({}, auth_user)


if __name__ == "__main__":
    unittest.main()
