import unittest
from unittest.mock import patch

from backend.student_lifecycle_service import (
    confirm_grantor_admin_decision,
    promote_email_confirmed_student,
)


class StudentLifecycleServiceTests(unittest.TestCase):
    @patch("backend.student_lifecycle_service.supabase_rpc")
    def test_email_confirmation_uses_verified_auth_identity(self, rpc):
        rpc.return_value = {"ok": True, "data": {"pendingApproval": True}}
        result = promote_email_confirmed_student(
            {"studentId": "20230001"},
            {"id": "auth-a", "email": "student@example.com", "email_confirmed_at": "2026-09-22T00:00:00Z", "user_metadata": {"user_id": "20230001"}},
        )
        self.assertTrue(result["ok"])
        rpc.assert_called_once_with("promote_email_confirmed_student", {
            "p_student_id": "20230001", "p_auth_user_id": "auth-a", "p_email": "student@example.com",
        })

    @patch("backend.student_lifecycle_service.supabase_rpc")
    def test_unconfirmed_email_cannot_enter_approval_queue(self, rpc):
        result = promote_email_confirmed_student(
            {"studentId": "20230001"},
            {"id": "auth-a", "email": "student@example.com", "user_metadata": {"user_id": "20230001"}},
        )
        self.assertFalse(result["ok"])
        rpc.assert_not_called()

    @patch("backend.student_lifecycle_service.supabase_rpc")
    def test_email_confirmation_ignores_spoofed_student_id(self, rpc):
        rpc.return_value = {"ok": True, "data": {"pendingApproval": True}}
        result = promote_email_confirmed_student(
            {"studentId": "victim-id"},
            {"id": "auth-a", "email": "student@example.com", "email_confirmed_at": "2026-09-22T00:00:00Z", "user_metadata": {"user_id": "real-id"}},
        )
        self.assertTrue(result["ok"])
        self.assertEqual("real-id", rpc.call_args.args[1]["p_student_id"])

    @patch("backend.student_lifecycle_service.supabase_rpc")
    def test_repeated_email_confirmation_returns_existing_pending_state(self, rpc):
        rpc.return_value = {"ok": True, "data": {"pendingApproval": True, "studentId": "20230001"}}
        auth_user = {
            "id": "auth-a",
            "email": "student@example.com",
            "email_confirmed_at": "2026-09-22T00:00:00Z",
            "user_metadata": {"user_id": "20230001"},
        }

        first = promote_email_confirmed_student({}, auth_user)
        second = promote_email_confirmed_student({}, auth_user)

        self.assertTrue(first["ok"])
        self.assertTrue(second["ok"])
        self.assertEqual(2, rpc.call_count)

    @patch("backend.student_lifecycle_service.supabase_document_get")
    @patch("backend.student_lifecycle_service.supabase_rpc")
    def test_grantor_confirmation_uses_stored_pending_decision(self, rpc, document_get):
        document_get.return_value = {"ok": True, "data": {
            "grantorId": "grantor-a",
            "decisionConfirmation": {"status": "pending", "decision": "approve", "stepId": "document_review"},
        }}
        rpc.return_value = {"ok": True, "data": {"decision": "approve", "stepId": "document_review"}}
        result = confirm_grantor_admin_decision({
            "actorType": "grantor", "actorId": "grantor-a", "grantorId": "grantor-a",
            "applicationId": "application-a", "decision": "reject",
        })
        self.assertTrue(result["ok"])
        rpc.assert_called_once_with("confirm_grantor_admin_decision", {
            "p_grantor_id": "grantor-a", "p_application_id": "application-a",
        })


if __name__ == "__main__":
    unittest.main()
