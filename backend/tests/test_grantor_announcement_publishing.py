import unittest
from unittest.mock import patch

from backend.workflow_service import create_grantor_announcement, republish_grantor_announcement, _send_low_slot_notifications


class GrantorAnnouncementPublishingTests(unittest.TestCase):
    def announcement_payload(self):
        return {
            "grantorId": "grantor-a",
            "actorId": "grantor-a",
            "actorType": "grantor",
            "clientRequestId": "publish-attempt-a",
            "announcement": {
                "title": "Scholarship A",
                "description": "Apply now.",
                "applicationEnabled": True,
                "totalSlots": 25,
                "grantorName": "Grantor A",
            },
        }

    @patch("backend.workflow_service.supabase_document_update", return_value={"ok": True})
    @patch("backend.workflow_service._send_low_slot_notifications", return_value={"ok": True, "skipped": True})
    @patch("backend.workflow_service._send_announcement_publication_notifications", return_value={"ok": True, "delivered": 0})
    @patch("backend.workflow_service._eligible_low_slot_students", return_value=[])
    @patch("backend.workflow_service.supabase_document_insert")
    @patch("backend.workflow_service.supabase_document_get")
    @patch("backend.workflow_service._archived_grantor_account", return_value=False)
    def test_retry_returns_existing_announcement_without_duplicate_insert(
        self,
        _archived,
        document_get,
        document_insert,
        _eligible,
        _publication_notifications,
        _low_slot_notifications,
        _update,
    ):
        existing = {
            "id": "grantor_announcement_existing",
            "title": "Scholarship A",
            "grantorId": "grantor-a",
            "applicationEnabled": True,
            "totalSlots": 25,
            "remainingSlots": 25,
        }
        document_get.return_value = {"ok": True, "row": {"id": "grantor_announcement_existing", "data": existing}, "data": existing}

        result = create_grantor_announcement(self.announcement_payload())

        self.assertTrue(result["ok"])
        self.assertTrue(result["duplicate"])
        self.assertEqual(result["id"], "grantor_announcement_existing")
        document_insert.assert_not_called()

    @patch("backend.workflow_service.supabase_document_update", return_value={"ok": True})
    @patch("backend.workflow_service._bulk_student_notifications", return_value={"ok": True, "data": [{"id": "one"}, {"id": "two"}]})
    def test_low_slot_notifications_are_written_in_one_bulk_operation(self, bulk_write, _update):
        result = _send_low_slot_notifications(
            "announcement-a",
            {
                "grantorId": "grantor-a",
                "grantorName": "Grantor A",
                "title": "Scholarship A",
                "remainingSlots": 9,
            },
            recipients=["student-a", "student-b"],
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["recipients"], 2)
        bulk_write.assert_called_once()
        self.assertEqual(len(bulk_write.call_args.args[0]), 2)

    @patch("backend.workflow_service.deliver_grantor_announcement_notifications")
    @patch("backend.workflow_service.supabase_document_insert")
    @patch("backend.workflow_service.supabase_document_get", return_value={"ok": True, "row": None, "data": {}})
    @patch("backend.workflow_service._archived_grantor_account", return_value=False)
    def test_deferred_creation_returns_before_notification_delivery(
        self,
        _archived,
        _document_get,
        document_insert,
        delivery,
    ):
        document_insert.return_value = {
            "ok": True,
            "data": [{"id": "announcement-a", "data": {"title": "Scholarship A"}}],
        }

        result = create_grantor_announcement(self.announcement_payload(), defer_notifications=True)

        self.assertTrue(result["ok"])
        self.assertTrue(result["studentNotification"]["queued"])
        self.assertIn("_announcementData", result)
        delivery.assert_not_called()

    @patch("backend.workflow_service._archived_grantor_account", return_value=False)
    @patch("backend.workflow_service.supabase_rpc")
    def test_republish_preserves_pool_and_stages_addition_atomically(self, rpc, _archived):
        rpc.return_value = {
            "ok": True,
            "data": {
                "announcementId": "announcement-a",
                "totalSlots": 50,
                "remainingSlots": 43,
                "additionalSlots": 25,
                "idempotent": False,
                "announcement": {"id": "announcement-a", "title": "Scholarship A", "remainingSlots": 43},
            },
        }

        result = republish_grantor_announcement({
            "grantorId": "grantor-a",
            "actorId": "grantor-a",
            "actorType": "grantor",
            "announcementId": "announcement-a",
            "clientRequestId": "republish-a",
            "expectedTotalSlots": 25,
            "expectedRemainingSlots": 18,
            "additionalSlots": 25,
            "announcement": {"title": "Scholarship A", "description": "Applications reopened."},
        }, defer_notifications=True)

        self.assertTrue(result["ok"])
        self.assertEqual(result["capacity"]["remainingSlots"], 43)
        rpc.assert_called_once_with("republish_grantor_scholarship", {
            "p_announcement_id": "announcement-a",
            "p_grantor_id": "grantor-a",
            "p_expected_total_slots": 25,
            "p_expected_remaining_slots": 18,
            "p_additional_slots": 25,
            "p_announcement_patch": {"title": "Scholarship A", "description": "Applications reopened."},
            "p_client_request_id": "republish-a",
        })

    @patch("backend.workflow_service._archived_grantor_account", return_value=False)
    @patch("backend.workflow_service.supabase_rpc", return_value={"ok": False, "reason": "stale_slot_capacity"})
    def test_republish_reports_stale_capacity(self, _rpc, _archived):
        result = republish_grantor_announcement({
            "grantorId": "grantor-a",
            "actorId": "grantor-a",
            "actorType": "grantor",
            "announcementId": "announcement-a",
            "clientRequestId": "republish-a",
            "expectedTotalSlots": 25,
            "expectedRemainingSlots": 18,
            "additionalSlots": 25,
            "announcement": {},
        })

        self.assertFalse(result["ok"])
        self.assertEqual(result["reason"], "stale_slot_capacity")


if __name__ == "__main__":
    unittest.main()
