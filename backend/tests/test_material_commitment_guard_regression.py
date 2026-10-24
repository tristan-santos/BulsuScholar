import unittest
from unittest.mock import patch

from backend import workflow_service as service


class MaterialWriteFailureRegressionTests(unittest.TestCase):
    def test_database_choice_failure_is_structured_and_sends_no_success_notification(self):
        failure = {"ok": False, "status": 400, "detail": '{"code":"P0001","message":"scholarship_choice_required"}'}
        payload = {"actorType": "admin", "actorId": "admin", "updates": [
            {"table": "soe_requests", "id": "request", "data": {"studentId": "student", "status": "Approved"}},
            {"table": "students", "id": "student", "data": {"soeSignedAt": "now"}},
        ]}
        with patch.object(service, "supabase_document_update", return_value=failure) as write, \
                patch.object(service, "create_student_notification") as student_notice, \
                patch.object(service, "create_admin_notification") as admin_notice, \
                patch.object(service, "create_grantor_notification") as grantor_notice, \
                patch.object(service, "create_log") as log:
            result = service.update_material_request(payload)
        self.assertFalse(result["ok"])
        self.assertEqual("scholarship_choice_required", result["reason"])
        self.assertIn("commitment", result["message"])
        self.assertEqual(1, write.call_count)
        for mock in (student_notice, admin_notice, grantor_notice, log):
            mock.assert_not_called()

    def test_failed_insert_stops_following_updates(self):
        with patch.object(service, "supabase_document_insert", return_value={"ok": False, "detail": "invalid JSON"}), \
                patch.object(service, "supabase_document_update") as update:
            result = service.update_material_request({"actorType": "admin", "inserts": [{"table": "soe_requests", "data": {}}],
                "updates": [{"table": "students", "id": "student", "data": {}}]})
        self.assertEqual("material_request_update_failed", result["reason"])
        update.assert_not_called()

    def test_unrecognized_error_does_not_expose_provider_details_as_message(self):
        result = service._material_write_failure([{"ok": False, "detail": '{"message":"internal SQL contents"}'}])
        self.assertNotIn("internal SQL contents", result["message"])

    def test_success_is_not_a_failure(self):
        self.assertIsNone(service._material_write_failure([{"ok": True}]))
