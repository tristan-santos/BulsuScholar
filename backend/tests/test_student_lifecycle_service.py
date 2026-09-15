import unittest
from unittest.mock import patch

from backend.student_lifecycle_service import (
    confirm_grantor_admin_decision,
    promote_email_confirmed_student,
    resolve_roster_scholarship,
)


class StudentLifecycleServiceTests(unittest.TestCase):
    @patch("backend.student_lifecycle_service.supabase_rpc")
    def test_email_confirmation_uses_verified_auth_identity(self, rpc):
        rpc.return_value = {"ok": True, "data": {"promoted": True}}
        result = promote_email_confirmed_student(
            {"studentId": "20230001"},
            {"id": "auth-a", "email": "student@example.com", "user_metadata": {"user_id": "20230001"}},
        )
        self.assertTrue(result["ok"])
        rpc.assert_called_once_with("promote_email_confirmed_student", {
            "p_student_id": "20230001", "p_auth_user_id": "auth-a", "p_email": "student@example.com",
        })

    @patch("backend.student_lifecycle_service.supabase_rpc")
    def test_roster_decision_requires_student_owner_and_confirmation(self, rpc):
        payload = {"studentId": "student-a", "actorType": "student", "actorId": "student-a",
                   "grantorId": "grantor-a", "rosterId": "roster-a", "action": "confirm"}
        auth_user = {"id": "auth-a"}
        self.assertEqual("confirmation_required", resolve_roster_scholarship(payload, auth_user)["reason"])
        self.assertEqual("portal_record_owner_mismatch", resolve_roster_scholarship({**payload, "actorId": "student-b"}, auth_user)["reason"])
        rpc.assert_not_called()

    @patch("backend.student_lifecycle_service.supabase_document_get")
    @patch("backend.student_lifecycle_service.supabase_rpc")
    def test_roster_confirmation_sends_only_stable_identity(self, rpc, document_get):
        document_get.return_value = {"ok": True, "data": {"authUserId": "auth-a"}}
        rpc.return_value = {"ok": True, "data": {"decision": "confirm"}}
        result = resolve_roster_scholarship({
            "studentId": "student-a", "actorType": "student", "actorId": "student-a",
            "grantorId": "grantor-a", "rosterId": "roster-a", "action": "confirm", "confirmed": True,
            "scholarshipName": "Forged",
        }, {"id": "auth-a"})
        self.assertTrue(result["ok"])
        self.assertEqual({"p_student_id", "p_grantor_id", "p_roster_id", "p_action"}, set(rpc.call_args.args[1]))

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
