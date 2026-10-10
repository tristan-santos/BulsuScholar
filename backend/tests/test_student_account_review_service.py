import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException

from backend import student_account_review_service as service


class StudentAccountReviewTests(unittest.TestCase):
    def setUp(self):
        self.request = Mock()
        self.request.headers = {"x-portal-actor-id": "admin-1"}

    @patch.object(service, "require_admin_bearer", return_value=({"id": "auth-admin"}, {"role": "student_reviewer"}))
    def test_reviewer_cannot_approve(self, _):
        with self.assertRaises(HTTPException) as error:
            service.approve_pending_student_account(self.request, "student-1")
        self.assertEqual(error.exception.status_code, 403)

    @patch.object(service, "require_admin_bearer", return_value=({"id": "auth-admin"}, {"role": "student_reviewer"}))
    def test_reviewer_cannot_resend_confirmation(self, _):
        with self.assertRaises(HTTPException) as error:
            service.resend_pending_student_confirmation(self.request, "student-1")
        self.assertEqual(error.exception.status_code, 403)

    @patch.object(service, "require_admin_bearer", return_value=({"id": "auth-admin"}, {"role": "full_admin"}))
    @patch.object(service, "supabase_select")
    def test_pending_accounts_include_safe_signup_document_metadata(self, select, _):
        select.side_effect = [
            {"ok": True, "rows": [{"id": "student-1", "data": {"fname": "Ana", "lname": "Student", "year": "4", "course": "BSIT", "yearLevelReview": {"submittedYear": "4", "detectedCorYear": "2", "mismatch": True}}}]},
            {"ok": True, "rows": [{"id": "identity-1", "data": {
                "documentType": "identity", "documentKind": "government_id", "name": "id.jpg",
                "status": "pending", "submittedAt": "2026-09-29T00:00:00Z", "file": {"path": "private/file.jpg"},
            }}]},
        ]
        result = service.list_pending_student_accounts(self.request)
        self.assertEqual("government_id", result["accounts"][0]["documents"][0]["documentKind"])
        self.assertNotIn("file", result["accounts"][0]["documents"][0])
        self.assertEqual("BSIT", result["accounts"][0]["course"])
        self.assertTrue(result["accounts"][0]["yearLevelReview"]["mismatch"])
        self.assertIn("confirmationResendAvailableAt", result["accounts"][0])
        self.assertEqual(0, result["accounts"][0]["confirmationResendRetryAfter"])

    @patch.object(service, "require_admin_bearer", return_value=({"id": "auth-admin"}, {"role": "full_admin"}))
    @patch.object(service, "supabase_document_get", return_value={"ok": True, "row": {"id": "student-1"}, "data": {
        "authUserId": "auth-1", "email": "student@example.com", "fname": "Student",
    }})
    @patch.object(service, "supabase_rpc")
    def test_unconfirmed_student_cannot_be_approved(self, rpc, *_):
        with self.assertRaises(HTTPException) as error:
            service.approve_pending_student_account(self.request, "student-1")
        self.assertEqual(error.exception.status_code, 409)
        rpc.assert_not_called()

    @patch.object(service, "require_admin_bearer", return_value=({"id": "auth-admin"}, {"role": "full_admin"}))
    @patch.object(service, "supabase_document_get", return_value={"ok": True, "row": {"id": "student-1"}, "data": {
        "authUserId": "auth-1", "email": "student@example.com", "fname": "Student",
        "emailConfirmedAt": "2026-09-22T00:00:00Z",
    }})
    @patch.object(service, "supabase_rpc", return_value={"ok": True, "data": {"approved": True}})
    @patch.object(service, "send_email_notification", return_value={"sent": False, "reason": "mail_unavailable"})
    def test_approval_reports_email_failure_separately(self, send_email, rpc, *_):
        result = service.approve_pending_student_account(self.request, "student-1")
        self.assertTrue(result["approved"])
        self.assertFalse(result["emailSent"])
        self.assertEqual(result["emailDeliveryReason"], "mail_unavailable")
        rpc.assert_called_once_with("approve_pending_student_account", {
            "p_student_id": "student-1", "p_auth_user_id": "auth-1",
            "p_email": "student@example.com", "p_admin_id": "admin-1",
        })
        send_email.assert_called_once()

    @patch.object(service, "require_admin_bearer", return_value=({"id": "auth-admin"}, {"role": "full_admin"}))
    @patch.object(service, "supabase_document_get", return_value={"ok": True, "row": {"id": "student-1"}, "data": {
        "authUserId": "auth-1", "email": "student@example.com", "emailConfirmedAt": "2026-10-09T00:00:00Z",
    }})
    def test_confirmed_pending_record_cannot_be_resent(self, *_):
        with self.assertRaises(HTTPException) as error:
            service.resend_pending_student_confirmation(self.request, "student-1")
        self.assertEqual(409, error.exception.status_code)
        self.assertEqual("student_email_already_confirmed", error.exception.detail)

    @patch.object(service, "require_admin_bearer", return_value=({"id": "auth-admin"}, {"role": "full_admin"}))
    @patch.object(service, "supabase_document_get", return_value={"ok": True, "row": {"id": "student-1"}, "data": {
        "authUserId": "auth-1", "email": "student@example.com",
    }})
    @patch.object(service, "supabase_admin_get_user", return_value={"ok": True, "user": {
        "id": "auth-1", "email": "other@example.com", "user_metadata": {"user_id": "student-1"},
    }})
    def test_auth_email_mismatch_blocks_resend(self, *_):
        with self.assertRaises(HTTPException) as error:
            service.resend_pending_student_confirmation(self.request, "student-1")
        self.assertEqual(409, error.exception.status_code)
        self.assertEqual("pending_account_auth_identity_mismatch", error.exception.detail)

    @patch.object(service, "require_admin_bearer", return_value=({"id": "auth-admin"}, {"role": "full_admin"}))
    @patch.object(service, "supabase_document_get", return_value={"ok": True, "row": {"id": "student-1"}, "data": {
        "authUserId": "auth-1", "email": "student@example.com",
    }})
    @patch.object(service, "supabase_admin_get_user", return_value={"ok": True, "user": {
        "id": "auth-1", "email": "student@example.com", "email_confirmed_at": "2026-10-09T00:00:00Z",
        "user_metadata": {"user_id": "student-1"},
    }})
    @patch.object(service, "promote_email_confirmed_student", return_value={"ok": True, "pendingApproval": True})
    @patch.object(service, "create_log", return_value={"ok": True})
    def test_confirmed_auth_user_is_reconciled_without_resend(self, log, promote, *_):
        result = service.resend_pending_student_confirmation(self.request, "student-1")
        self.assertTrue(result["reconciled"])
        self.assertFalse(result["sent"])
        promote.assert_called_once()
        self.assertEqual("student_email_confirmation_reconciled", log.call_args.args[0]["action"])

    @patch.object(service, "require_admin_bearer", return_value=({"id": "auth-admin"}, {"role": "full_admin"}))
    @patch.object(service, "supabase_document_get", return_value={"ok": True, "row": {"id": "student-1"}, "data": {
        "authUserId": "auth-1", "email": "student@example.com",
    }})
    @patch.object(service, "supabase_admin_get_user", return_value={"ok": True, "user": {
        "id": "auth-1", "email": "student@example.com", "email_confirmed_at": None,
        "user_metadata": {"user_id": "student-1"},
    }})
    @patch.object(service, "supabase_rpc", return_value={"ok": True, "data": {
        "allowed": False, "reason": "confirmation_resend_cooldown", "availableAt": "2026-10-09T01:05:00Z", "retryAfter": 180,
    }})
    def test_server_cooldown_is_returned_as_structured_429(self, *_):
        with self.assertRaises(HTTPException) as error:
            service.resend_pending_student_confirmation(self.request, "student-1")
        self.assertEqual(429, error.exception.status_code)
        self.assertEqual("confirmation_resend_cooldown", error.exception.detail["reason"])
        self.assertEqual(180, error.exception.detail["retryAfter"])

    @patch.object(service, "require_admin_bearer", return_value=({"id": "auth-admin"}, {"role": "full_admin"}))
    @patch.object(service, "supabase_document_get", return_value={"ok": True, "row": {"id": "student-1"}, "data": {
        "authUserId": "auth-1", "email": "student@example.com",
    }})
    @patch.object(service, "supabase_admin_get_user", return_value={"ok": True, "user": {
        "id": "auth-1", "email": "student@example.com", "email_confirmed_at": None,
        "user_metadata": {"user_id": "student-1"},
    }})
    @patch.object(service, "supabase_rpc")
    @patch.object(service, "supabase_resend_signup_confirmation", return_value={"ok": True, "data": {}})
    @patch.object(service, "create_log", return_value={"ok": True})
    def test_successful_resend_completes_claim_and_audits(self, log, resend, rpc, *_):
        rpc.side_effect = [
            {"ok": True, "data": {"allowed": True}},
            {"ok": True, "data": {"sent": True, "availableAt": "2026-10-09T01:05:00Z", "retryAfter": 300}},
        ]
        result = service.resend_pending_student_confirmation(self.request, "student-1")
        self.assertTrue(result["sent"])
        self.assertFalse(result["reconciled"])
        self.assertEqual(300, result["retryAfter"])
        resend.assert_called_once_with("student@example.com", "https://bulsuscholar.com/confirm-email")
        self.assertTrue(rpc.call_args_list[1].args[1]["p_succeeded"])
        self.assertEqual("student_confirmation_email_resent", log.call_args.args[0]["action"])

    @patch.object(service, "require_admin_bearer", return_value=({"id": "auth-admin"}, {"role": "full_admin"}))
    @patch.object(service, "supabase_document_get", return_value={"ok": True, "row": {"id": "student-1"}, "data": {
        "authUserId": "auth-1", "email": "student@example.com",
    }})
    @patch.object(service, "supabase_admin_get_user", return_value={"ok": True, "user": {
        "id": "auth-1", "email": "student@example.com", "email_confirmed_at": None,
        "user_metadata": {"user_id": "student-1"},
    }})
    @patch.object(service, "supabase_rpc")
    @patch.object(service, "supabase_resend_signup_confirmation", return_value={
        "ok": False, "status": 503, "reason": "confirmation_email_delivery_failed",
    })
    @patch.object(service, "create_log", return_value={"ok": True})
    def test_delivery_failure_releases_claim(self, _log, _resend, rpc, *_):
        rpc.side_effect = [
            {"ok": True, "data": {"allowed": True}},
            {"ok": True, "data": {"sent": False, "retryAfter": 0}},
        ]
        with self.assertRaises(HTTPException) as error:
            service.resend_pending_student_confirmation(self.request, "student-1")
        self.assertEqual(503, error.exception.status_code)
        self.assertFalse(rpc.call_args_list[1].args[1]["p_succeeded"])


if __name__ == "__main__":
    unittest.main()
