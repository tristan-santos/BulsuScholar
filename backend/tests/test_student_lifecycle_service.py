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

    @patch("backend.student_lifecycle_service.activate_student_account")
    @patch("backend.student_lifecycle_service.supabase_document_get", return_value={
        "ok": True, "row": {"id": "document_policy"}, "data": {"manualReviewEnabled": True},
    })
    @patch("backend.student_lifecycle_service.supabase_rpc", return_value={
        "ok": True, "data": {"pendingApproval": True, "studentId": "20230001"},
    })
    def test_manual_policy_keeps_confirmed_student_pending(self, _rpc, _document_get, activate):
        result = promote_email_confirmed_student({}, {
            "id": "auth-a", "email": "student@example.com",
            "email_confirmed_at": "2026-09-22T00:00:00Z",
            "user_metadata": {"user_id": "20230001"},
        })
        self.assertTrue(result["pendingApproval"])
        self.assertFalse(result["accountActivated"])
        self.assertFalse(result["welcomeEmailSent"])
        activate.assert_not_called()

    @patch("backend.student_lifecycle_service.activate_student_account", return_value={
        "ok": True, "approved": True, "newlyApproved": True, "alreadyActive": False,
        "welcomeEmailSent": True, "welcomeEmailDeliveryReason": None,
    })
    @patch("backend.student_lifecycle_service.load_signup_documents", return_value=([], True))
    @patch("backend.student_lifecycle_service.supabase_document_get")
    @patch("backend.student_lifecycle_service.supabase_rpc", return_value={
        "ok": True, "data": {"pendingApproval": True, "studentId": "20230001"},
    })
    def test_automatic_policy_activates_student_with_approved_documents(self, _rpc, document_get, _documents, activate):
        document_get.side_effect = [
            {"ok": True, "row": {"id": "document_policy"}, "data": {"manualReviewEnabled": False}},
            {"ok": True, "row": {"id": "20230001"}, "data": {
                "authUserId": "auth-a", "email": "student@example.com", "fname": "Ana",
            }},
        ]
        result = promote_email_confirmed_student({}, {
            "id": "auth-a", "email": "student@example.com",
            "email_confirmed_at": "2026-09-22T00:00:00Z",
            "user_metadata": {"user_id": "20230001"},
        })
        self.assertTrue(result["accountActivated"])
        self.assertFalse(result["pendingApproval"])
        self.assertTrue(result["welcomeEmailSent"])
        activate.assert_called_once_with(
            "20230001",
            {"authUserId": "auth-a", "email": "student@example.com", "fname": "Ana"},
            "system:auto_document_review",
            "automatic_document_review",
        )

    @patch("backend.student_lifecycle_service.activate_student_account")
    @patch("backend.student_lifecycle_service.load_signup_documents", return_value=([], False))
    @patch("backend.student_lifecycle_service.supabase_document_get")
    @patch("backend.student_lifecycle_service.supabase_rpc", return_value={
        "ok": True, "data": {"pendingApproval": True, "studentId": "20230001"},
    })
    def test_automatic_policy_keeps_student_pending_when_documents_are_not_approved(self, _rpc, document_get, _documents, activate):
        document_get.side_effect = [
            {"ok": True, "row": {"id": "document_policy"}, "data": {"manualReviewEnabled": False}},
            {"ok": True, "row": {"id": "20230001"}, "data": {"authUserId": "auth-a"}},
        ]
        result = promote_email_confirmed_student({}, {
            "id": "auth-a", "email": "student@example.com",
            "email_confirmed_at": "2026-09-22T00:00:00Z",
            "user_metadata": {"user_id": "20230001"},
        })
        self.assertFalse(result["accountActivated"])
        self.assertTrue(result["pendingApproval"])
        self.assertEqual("signup_documents_not_approved", result["automaticActivationBlocked"])
        activate.assert_not_called()

    @patch("backend.student_lifecycle_service.activate_student_account")
    @patch("backend.student_lifecycle_service.supabase_rpc", return_value={
        "ok": True, "data": {"alreadyActive": True, "studentId": "20230001"},
    })
    def test_repeated_confirmation_for_active_student_does_not_send_welcome_email(self, _rpc, activate):
        result = promote_email_confirmed_student({}, {
            "id": "auth-a", "email": "student@example.com",
            "email_confirmed_at": "2026-09-22T00:00:00Z",
            "user_metadata": {"user_id": "20230001"},
        })
        self.assertTrue(result["accountActivated"])
        self.assertTrue(result["alreadyActive"])
        self.assertFalse(result["welcomeEmailSent"])
        activate.assert_not_called()

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
