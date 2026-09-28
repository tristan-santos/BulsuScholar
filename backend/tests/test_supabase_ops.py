import unittest
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


if __name__ == "__main__":
    unittest.main()
