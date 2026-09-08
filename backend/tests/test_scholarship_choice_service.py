import os
import unittest
from unittest.mock import patch

from backend.scholarship_choice_service import mutate_scholarship_choice, reserve_scholarship_application, update_scholarship_documents


class ScholarshipChoiceServiceTests(unittest.TestCase):
    def setUp(self):
        self.payload = {"studentId": "student-a", "applicationId": "application-a",
                        "actorId": "student-a", "actorType": "student", "confirmed": True}
        self.env = patch.dict(os.environ, {"ENABLE_SCHOLARSHIP_CHOICE": "true"})
        self.env.start()
        self.addCleanup(self.env.stop)

    @patch("backend.scholarship_choice_service.supabase_rpc")
    def test_disabled_rollout_does_not_mutate(self, rpc):
        with patch.dict(os.environ, {"ENABLE_SCHOLARSHIP_CHOICE": "false"}):
            self.assertEqual(mutate_scholarship_choice(self.payload)["reason"], "scholarship_choice_not_enabled")
        rpc.assert_not_called()

    @patch("backend.scholarship_choice_service.supabase_rpc")
    def test_confirmation_is_required(self, rpc):
        for value in [None, False, "true", 1]:
            self.assertEqual(mutate_scholarship_choice({**self.payload, "confirmed": value})["reason"],
                             "confirmation_required")
        rpc.assert_not_called()

    @patch("backend.scholarship_choice_service.supabase_rpc")
    def test_identity_is_required(self, rpc):
        for key in ["studentId", "applicationId"]:
            self.assertEqual(mutate_scholarship_choice({**self.payload, key: " "})["reason"],
                             "missing_application_identity")
        rpc.assert_not_called()

    @patch("backend.scholarship_choice_service.supabase_rpc")
    def test_other_actor_cannot_choose(self, rpc):
        for changed in [{"actorId": "student-b"}, {"actorType": "grantor"}, {"actorType": "admin"}]:
            self.assertEqual(mutate_scholarship_choice({**self.payload, **changed})["reason"],
                             "portal_record_owner_mismatch")
        rpc.assert_not_called()

    @patch("backend.scholarship_choice_service.supabase_rpc")
    def test_only_identity_and_action_reach_database(self, rpc):
        rpc.return_value = {"ok": True, "data": {"student": {"id": "student-a"}, "idempotent": False}}
        result = mutate_scholarship_choice({**self.payload, "remainingSlots": 1000,
            "tracking": {"completedStepIds": ["document_review"]}, "grantorId": "forged"})
        rpc.assert_called_once_with("mutate_scholarship_choice", {
            "p_student_id": "student-a", "p_application_id": "application-a", "p_action": "choose"})
        self.assertTrue(result["ok"])
        self.assertEqual(result["student"], {"id": "student-a"})

    @patch("backend.scholarship_choice_service.supabase_rpc")
    def test_withdraw_uses_same_transaction_entry_point(self, rpc):
        rpc.return_value = {"ok": True, "data": {"idempotent": True}}
        self.assertTrue(mutate_scholarship_choice(self.payload, withdraw=True)["idempotent"])
        self.assertEqual(rpc.call_args.args[1]["p_action"], "withdraw")

    @patch("backend.scholarship_choice_service.supabase_document_get")
    @patch("backend.scholarship_choice_service.supabase_rpc")
    def test_choose_returns_persisted_enriched_material_request(self, rpc, document_get):
        rpc.return_value = {"ok": True, "data": {
            "materialRequest": {"id": "choice_application-a", "materials": {"soe": {"status": "pending"}}},
        }}
        document_get.return_value = {"ok": True, "data": {
            "id": "choice_application-a",
            "materials": {
                "soe": {"status": "pending"},
                "application_form": {"status": "pending"},
            },
            "customApplicationForm": {"url": "https://example.test/custom.pdf"},
        }}

        result = mutate_scholarship_choice(self.payload)

        document_get.assert_called_once_with("soe_requests", "choice_application-a")
        self.assertEqual(result["materialRequest"]["materials"]["application_form"]["status"], "pending")

    @patch("backend.scholarship_choice_service.supabase_rpc")
    def test_database_failure_is_not_reported_as_success(self, rpc):
        rpc.return_value = {"ok": False, "reason": "document_versions_changed"}
        result = mutate_scholarship_choice(self.payload)
        self.assertFalse(result["ok"])
        self.assertIn("new review", result["message"])

    @patch("backend.scholarship_choice_service.supabase_document_get", return_value={"ok": True, "data": {}})
    @patch("backend.scholarship_choice_service.supabase_rpc")
    def test_reservation_uses_server_identifiers_and_no_client_review_state(self, rpc, _student_get):
        rpc.return_value = {"ok": True, "data": {"remainingSlots": 8}}
        result = reserve_scholarship_application({**self.payload, "application": {
            "grantorId": "grantor-a", "announcementId": "offering-a", "id": "forged-id",
            "applicationNumber": "forged-number", "tracking": {"completedStepIds": ["document_review"]},
        }, "studentUpdate": {"scholarships": []}})
        parameters = rpc.call_args.args[1]
        self.assertNotEqual(parameters["p_application_id"], "forged-id")
        self.assertNotEqual(parameters["p_application_number"], "forged-number")
        self.assertEqual(set(parameters), {"p_student_id", "p_announcement_id", "p_grantor_id", "p_application_id", "p_application_number"})
        self.assertEqual(result["remainingSlots"], 8)

    @patch("backend.scholarship_choice_service.supabase_document_get")
    @patch("backend.scholarship_choice_service.supabase_rpc")
    def test_stored_invitation_can_resolve_announcement_identity(self, rpc, student_get):
        student_get.return_value = {"ok": True, "data": {"scholarshipInvitations": [{
            "id": "invite-a", "status": "Pending", "grantorId": "grantor-a",
            "announcementId": "offering-a", "scholarshipName": "Alpha",
        }]}}
        rpc.return_value = {"ok": True, "data": {"remainingSlots": 4}}
        result = reserve_scholarship_application({**self.payload, "invitationId": "invite-a", "application": {
            "grantorId": "grantor-a", "scholarshipName": "Alpha",
        }})
        self.assertTrue(result["ok"])
        self.assertEqual(rpc.call_args.args[1]["p_announcement_id"], "offering-a")

    @patch("backend.scholarship_choice_service.supabase_document_get", return_value={"ok": True, "data": {"scholarshipInvitations": []}})
    @patch("backend.scholarship_choice_service.supabase_rpc")
    def test_reapply_hint_without_stored_invitation_is_not_authorized(self, rpc, _student_get):
        result = reserve_scholarship_application({**self.payload, "invitationId": "forged", "application": {
            "grantorId": "grantor-a", "scholarshipName": "Alpha",
        }})
        self.assertEqual(result["reason"], "missing_application_identity")
        rpc.assert_not_called()

    @patch("backend.scholarship_choice_service.supabase_rpc")
    def test_documents_reject_external_or_other_student_paths(self, rpc):
        with patch.dict(os.environ, {"SUPABASE_URL": "https://test.supabase.co"}):
            for url in ["javascript:alert(1)", "https://elsewhere.test/students/student-a/file.pdf",
                        "https://test.supabase.co/storage/v1/object/public/docs/students/student-b/form.pdf"]:
                result = update_scholarship_documents({**self.payload, "field": "applicationFormFile", "value": {"url": url}})
                self.assertEqual(result["reason"], "invalid_application_documents")
        rpc.assert_not_called()

    @patch("backend.scholarship_choice_service.supabase_rpc")
    def test_documents_allow_only_the_students_uploaded_file(self, rpc):
        rpc.return_value = {"ok": True, "data": {"student": {"id": "student-a"}}}
        value = {"url": "https://test.supabase.co/storage/v1/object/public/docs/students/student-a/form.pdf"}
        with patch.dict(os.environ, {"SUPABASE_URL": "https://test.supabase.co"}):
            self.assertTrue(update_scholarship_documents({**self.payload, "field": "applicationFormFile", "value": value})["ok"])
        self.assertEqual(rpc.call_args.args[1]["p_field"], "applicationFormFile")


if __name__ == "__main__":
    unittest.main()
