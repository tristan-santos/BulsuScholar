import json
import os
import unittest
from unittest.mock import MagicMock, patch

from backend.email_service import BREVO_EMAIL_API_URL, send_email_notification


class EmailServiceTests(unittest.TestCase):
    @patch.dict(
        os.environ,
        {
            "EMAIL_PROVIDER": "brevo",
            "BREVO_API_KEY": "test-api-key",
            "BREVO_SENDER_NAME": "BulsuScholar",
            "BREVO_SENDER_EMAIL": "no-reply@bulsuscholar.com",
            "BREVO_REPLY_TO_EMAIL": "support@bulsuscholar.com",
        },
        clear=False,
    )
    @patch("backend.email_service.urllib.request.urlopen")
    def test_send_uses_brevo_contract(self, urlopen):
        response = MagicMock()
        response.read.return_value = b'{"messageId":"message-1"}'
        urlopen.return_value.__enter__.return_value = response

        result = send_email_notification(
            {
                "to": "student@example.com",
                "toName": "Ana Student",
                "subject": "Account update",
                "html": "<p>Your account is ready.</p>",
            }
        )

        self.assertTrue(result["sent"])
        self.assertEqual("brevo", result["provider"])
        request = urlopen.call_args.args[0]
        self.assertEqual(BREVO_EMAIL_API_URL, request.full_url)
        self.assertEqual("POST", request.method)
        body = json.loads(request.data.decode("utf-8"))
        self.assertEqual(
            {"name": "BulsuScholar", "email": "no-reply@bulsuscholar.com"},
            body["sender"],
        )
        self.assertEqual(
            [{"email": "student@example.com", "name": "Ana Student"}],
            body["to"],
        )
        self.assertEqual(
            {"name": "BulsuScholar Support", "email": "support@bulsuscholar.com"},
            body["replyTo"],
        )
        self.assertIn("Hello Ana Student", body["htmlContent"])

    @patch.dict(os.environ, {"EMAIL_PROVIDER": "brevo"}, clear=True)
    def test_missing_api_key_fails_without_network_request(self):
        result = send_email_notification(
            {"to": "student@example.com", "subject": "Test", "html": "<p>Test</p>"}
        )
        self.assertFalse(result["sent"])
        self.assertEqual("missing_brevo_api_key", result["reason"])

    @patch.dict(
        os.environ,
        {
            "EMAIL_PROVIDER": "brevo",
            "BREVO_API_KEY": "test-api-key",
            "BREVO_SENDER_EMAIL": "no-reply@bulsuscholar.com",
        },
        clear=True,
    )
    def test_missing_message_fields_fail_validation(self):
        result = send_email_notification({"subject": "Missing recipient", "html": "<p>Test</p>"})
        self.assertFalse(result["sent"])
        self.assertEqual("missing_to_subject_or_html", result["reason"])


if __name__ == "__main__":
    unittest.main()
