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


if __name__ == "__main__":
    unittest.main()
