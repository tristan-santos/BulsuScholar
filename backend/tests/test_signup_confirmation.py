import unittest
from unittest.mock import patch

from backend.signup_service import finalize_student_signup


class SignupConfirmationTests(unittest.TestCase):
    def base_payload(self):
        return {
            "studentId": "20230001",
            "isAutoVerified": True,
            "auth": {"userId": "auth-a", "email": "student@example.com", "createUser": False, "emailConfirm": False},
            "student": {"email": "student@example.com", "cpNumber": "09123456789", "fname": "Ana", "lname": "Student"},
        }

    @patch("backend.signup_service.create_log", return_value={"ok": True})
    @patch("backend.signup_service.create_admin_notification", return_value={"ok": True})
    @patch("backend.signup_service.create_student_notification", return_value={"ok": True})
    @patch("backend.signup_service.supabase_document_insert", return_value={"ok": True})
    @patch("backend.signup_service.supabase_document_upsert", return_value={"ok": True})
    @patch("backend.signup_service.validate_student_signup")
    def test_every_signup_stays_pending_until_email_confirmation(self, validate, upsert, _insert, _student_notice, _admin_notice, _log):
        validate.return_value = {"ok": True, "studentId": "20230001", "email": "student@example.com", "cpNumber": "09123456789", "cor": {}}
        result = finalize_student_signup(self.base_payload())
        self.assertTrue(result["ok"])
        self.assertEqual("pending_students", result["table"])
        self.assertEqual("pending_students", upsert.call_args.args[0])
        saved = upsert.call_args.args[2]
        self.assertFalse(saved["isValidated"])
        self.assertTrue(saved["isPending"])
        self.assertIsNone(saved["validatedAt"])

    @patch("backend.signup_service.validate_student_signup")
    def test_backend_refuses_automatic_email_confirmation(self, validate):
        validate.return_value = {"ok": True, "studentId": "20230001", "email": "student@example.com", "cpNumber": "09123456789", "cor": {}}
        payload = self.base_payload()
        payload["auth"]["emailConfirm"] = True
        self.assertEqual("automatic_email_confirmation_disabled", finalize_student_signup(payload)["reason"])


if __name__ == "__main__":
    unittest.main()
