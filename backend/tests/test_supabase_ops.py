import unittest
import json
from unittest.mock import Mock, patch

from backend import supabase_ops


class SupabaseTableStatusTests(unittest.TestCase):
    @patch.dict("os.environ", {
        "SUPABASE_URL": "https://project.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "service-key",
    }, clear=False)
    @patch("backend.supabase_ops.urllib.request.urlopen")
    def test_health_probe_does_not_assume_an_id_column(self, urlopen):
        response = Mock()
        response.read.return_value = b"[]"
        response.status = 200
        urlopen.return_value.__enter__.return_value = response

        result = supabase_ops.supabase_table_status("login_security_state")

        self.assertTrue(result["ok"])
        request = urlopen.call_args.args[0]
        self.assertIn("select=*&limit=1", request.full_url)
        self.assertNotIn("select=id", request.full_url)

    @patch.dict("os.environ", {
        "SUPABASE_URL": "https://project.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "service-key",
    }, clear=False)
    @patch("backend.supabase_ops.urllib.request.urlopen")
    def test_signup_resend_uses_official_auth_endpoint_and_redirect(self, urlopen):
        response = Mock()
        response.read.return_value = b"{}"
        urlopen.return_value.__enter__.return_value = response

        result = supabase_ops.supabase_resend_signup_confirmation(
            "STUDENT@EXAMPLE.COM", "https://bulsuscholar.com/confirm-email"
        )

        self.assertTrue(result["ok"])
        request = urlopen.call_args.args[0]
        self.assertEqual("POST", request.method)
        self.assertIn("/auth/v1/resend?", request.full_url)
        self.assertIn("redirect_to=https%3A%2F%2Fbulsuscholar.com%2Fconfirm-email", request.full_url)
        self.assertEqual({"email": "student@example.com", "type": "signup"}, json.loads(request.data))

    @patch.dict("os.environ", {
        "SUPABASE_URL": "https://project.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "service-key",
    }, clear=False)
    @patch("backend.supabase_ops.urllib.request.urlopen")
    def test_admin_user_lookup_uses_auth_user_id(self, urlopen):
        response = Mock()
        response.read.return_value = b'{"id":"auth-1"}'
        urlopen.return_value.__enter__.return_value = response

        result = supabase_ops.supabase_admin_get_user("auth-1")

        self.assertTrue(result["ok"])
        self.assertTrue(urlopen.call_args.args[0].full_url.endswith("/auth/v1/admin/users/auth-1"))


if __name__ == "__main__":
    unittest.main()
