import io
import os
import unittest
import urllib.error
from contextlib import redirect_stderr, redirect_stdout
from unittest.mock import MagicMock, patch

from backend import waitlist_expiry_job


class WaitlistExpiryJobTests(unittest.TestCase):
    @patch.dict(os.environ, {"CRON_SECRET": "short"}, clear=True)
    def test_rejects_short_cron_secret_before_request(self):
        stderr = io.StringIO()

        with patch.object(waitlist_expiry_job.urllib.request, "urlopen") as urlopen, redirect_stderr(stderr):
            result = waitlist_expiry_job.main()

        self.assertEqual(2, result)
        urlopen.assert_not_called()
        self.assertIn("at least 32 characters", stderr.getvalue())

    @patch.dict(
        os.environ,
        {
            "BACKEND_API_URL": "https://api.example.test/",
            "CRON_SECRET": "x" * 32,
        },
        clear=True,
    )
    def test_sends_application_user_agent_and_cron_secret(self):
        response = MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = b'{"ok":true,"processed":0}'
        stdout = io.StringIO()

        with patch.object(waitlist_expiry_job.urllib.request, "urlopen", return_value=response) as urlopen, redirect_stdout(stdout):
            result = waitlist_expiry_job.main()

        self.assertEqual(0, result)
        request = urlopen.call_args.args[0]
        headers = dict(request.header_items())
        self.assertEqual("https://api.example.test/internal/cron/waitlist/expire", request.full_url)
        self.assertEqual(waitlist_expiry_job.USER_AGENT, headers["User-agent"])
        self.assertEqual("application/json", headers["Accept"])
        self.assertEqual("x" * 32, headers["X-cron-secret"])
        self.assertIn('"ok":true', stdout.getvalue())

    @patch.dict(
        os.environ,
        {
            "BACKEND_API_URL": "https://api.example.test",
            "CRON_SECRET": "x" * 32,
        },
        clear=True,
    )
    def test_http_error_includes_response_body_for_diagnosis(self):
        error = urllib.error.HTTPError(
            "https://api.example.test/internal/cron/waitlist/expire",
            403,
            "Forbidden",
            {},
            io.BytesIO(b"error code: 1010"),
        )
        stderr = io.StringIO()

        with patch.object(waitlist_expiry_job.urllib.request, "urlopen", side_effect=error), redirect_stderr(stderr):
            result = waitlist_expiry_job.main()

        self.assertEqual(1, result)
        self.assertIn("HTTP 403 Forbidden: error code: 1010", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
