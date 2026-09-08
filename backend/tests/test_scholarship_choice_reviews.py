import unittest
from unittest.mock import patch

from backend import workflow_service as service


class ScholarshipChoiceReviewTests(unittest.TestCase):
    def test_closed_application_stops_the_entire_batch(self):
        payload = {"actorType": "admin", "updates": [
            {"table": "students", "id": "student", "data": {"scholarships": []}},
            {"table": "scholarship_applications", "id": "app", "data": {"status": "Approved"}},
        ]}
        with patch.object(service, "supabase_document_get", return_value={
            "ok": True, "data": {"closureReason": "selected_another_scholarship"}
        }), patch.object(service, "supabase_document_update") as update:
            result = service.update_admin_review(payload)
        self.assertEqual(result["reason"], "application_closed")
        update.assert_not_called()

    def test_review_cannot_change_application_identity(self):
        with patch.object(service, "supabase_document_get", return_value={
            "ok": True, "data": {"lifecycleVersion": 2, "grantorId": "owner"}
        }), patch.object(service, "supabase_document_update") as update:
            result = service.update_admin_review({"actorType": "admin", "updates": [
                {"table": "scholarship_applications", "id": "app", "data": {"grantorId": "other"}},
            ]})
        self.assertEqual(result["reason"], "application_identity_immutable")
        update.assert_not_called()

    def test_review_does_not_overwrite_reservations_or_documents(self):
        with patch.object(service, "supabase_document_get", return_value={
            "ok": True, "data": {"lifecycleVersion": 2, "grantorId": "owner"}
        }), patch.object(service, "supabase_document_update", return_value={"ok": True}) as update, \
                patch.object(service, "create_log", return_value={"ok": True}):
            result = service.update_admin_review({"actorType": "admin", "updates": [
                {"table": "scholarship_applications", "id": "app", "data": {
                    "status": "Pending", "slotReserved": False, "slotReleasedAt": "stale",
                    "applicationFormFile": {"url": "stale"}, "reviewedDocumentVersions": {},
                }},
            ]})
        self.assertTrue(result["ok"])
        update.assert_called_once_with("scholarship_applications", "app", {"status": "Pending"})

    def test_other_grantor_cannot_review_application(self):
        with patch.object(service, "supabase_document_get", return_value={
            "ok": True, "data": {"lifecycleVersion": 2, "grantorId": "owner"}
        }), patch.object(service, "supabase_document_update") as update:
            result = service.update_admin_review({"actorType": "grantor", "actorId": "other", "updates": [
                {"table": "scholarship_applications", "id": "app", "data": {"status": "Approved"}},
            ]})
        self.assertEqual(result["reason"], "cross_grantor_application_update_blocked")
        update.assert_not_called()


if __name__ == "__main__":
    unittest.main()
