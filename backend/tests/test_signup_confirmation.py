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
    @patch("backend.signup_service.supabase_document_update", return_value={"ok": True})
    @patch("backend.signup_service.supabase_document_upsert", return_value={"ok": True})
    @patch("backend.signup_service.supabase_rpc")
    @patch("backend.signup_service.validate_student_signup")
    def test_every_signup_stays_pending_until_email_confirmation(self, validate, rpc, upsert, _update, _insert, _student_notice, _admin_notice, _log):
        batch = {
            "id": "batch-a", "suppliedSecretHash": "a" * 64, "academicCycle": "2026-2027-1ST",
            "year": "1", "rogRequired": False, "rogExemptionReason": "first_year_first_semester",
            "identityKind": "government_id", "manualReviewEnabled": True,
            "documents": {
                "cor": {"name": "cor.pdf", "type": "application/pdf", "size": 100, "bucket": "student-documents", "path": "cor.pdf", "scan": {}},
                "identity": {"name": "id.jpg", "type": "image/jpeg", "size": 100, "bucket": "student-documents", "path": "id.jpg", "scan": {}},
            },
        }
        validate.return_value = {"ok": True, "studentId": "20230001", "email": "student@example.com", "cpNumber": "09123456789", "year": "1", "cor": {}, "documentBatch": batch}
        rpc.return_value = {"ok": True, "data": {key: value for key, value in batch.items() if key not in {"id", "suppliedSecretHash"}}}
        result = finalize_student_signup(self.base_payload())
        self.assertTrue(result["ok"])
        self.assertEqual("pending_students", result["table"])
        pending_call = next(call for call in upsert.call_args_list if call.args[0] == "pending_students")
        saved = pending_call.args[2]
        self.assertFalse(saved["isValidated"])
        self.assertTrue(saved["isPending"])
        self.assertIsNone(saved["validatedAt"])
        self.assertEqual("government_id", saved["schoolIdFile"]["documentKind"])
        self.assertEqual("pending", saved["documentVerification"]["identity"]["status"])
        self.assertTrue(saved["confirmationEmailLastSentAt"])

    @patch("backend.signup_service.validate_student_signup")
    def test_backend_refuses_automatic_email_confirmation(self, validate):
        validate.return_value = {"ok": True, "studentId": "20230001", "email": "student@example.com", "cpNumber": "09123456789", "cor": {}}
        payload = self.base_payload()
        payload["auth"]["emailConfirm"] = True
        self.assertEqual("automatic_email_confirmation_disabled", finalize_student_signup(payload)["reason"])

    @patch("backend.signup_service.supabase_document_get")
    @patch("backend.signup_service.supabase_rpc", return_value={"ok": True, "data": {"status": "consumed"}})
    @patch("backend.signup_service.validate_student_signup")
    def test_consumed_batch_is_idempotent_only_for_matching_account(self, validate, _rpc, get):
        validate.return_value = {
            "ok": True, "studentId": "20230001", "email": "student@example.com", "cpNumber": "09123456789",
            "cor": {}, "documentBatch": {"id": "batch-a", "suppliedSecretHash": "a" * 64},
        }
        get.return_value = {"ok": True, "row": {"id": "20230001"}, "data": {"authUserId": "auth-a"}}
        result = finalize_student_signup(self.base_payload())
        self.assertTrue(result["ok"])
        self.assertTrue(result["idempotent"])


if __name__ == "__main__":
    unittest.main()
