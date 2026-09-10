import unittest
from unittest.mock import patch

from backend.supabase_ops import update_grantor_notifications, update_student_notifications


class StudentNotificationUpdateTests(unittest.TestCase):
    @patch("backend.supabase_ops.update_student_notification", return_value={"ok": True})
    @patch("backend.supabase_ops.supabase_select")
    def test_bulk_update_deduplicates_owned_notifications(self, select, update):
        select.return_value = {
            "ok": True,
            "rows": [{"id": "notification-a", "data": {"studentId": "student-a"}}],
        }

        result = update_student_notifications(
            ["notification-a", "notification-a"],
            {"read": True},
            "student-a",
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["updated"], 1)
        update.assert_called_once_with("notification-a", {"read": True})

    @patch("backend.supabase_ops.update_student_notification")
    @patch("backend.supabase_ops.supabase_select")
    def test_bulk_update_rejects_another_students_notification(self, select, update):
        select.return_value = {
            "ok": True,
            "rows": [{"id": "notification-b", "data": {"studentId": "student-b"}}],
        }

        result = update_student_notifications(
            ["notification-b"],
            {"read": True},
            "student-a",
        )

        self.assertFalse(result["ok"])
        self.assertEqual(result["updated"], 0)
        self.assertEqual(result["failures"][0]["reason"], "student_notification_owner_mismatch")
        update.assert_not_called()


class GrantorNotificationUpdateTests(unittest.TestCase):
    @patch("backend.supabase_ops.update_grantor_notification", return_value={"ok": True})
    @patch("backend.supabase_ops.supabase_select")
    def test_bulk_update_deduplicates_owned_notifications(self, select, update):
        select.return_value = {
            "ok": True,
            "rows": [{"id": "notification-a", "data": {"grantorId": "grantor-a"}}],
        }

        result = update_grantor_notifications(
            ["notification-a", "notification-a"],
            {"read": True},
            "grantor-a",
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["updated"], 1)
        update.assert_called_once_with("notification-a", {"read": True})

    @patch("backend.supabase_ops.update_grantor_notification")
    @patch("backend.supabase_ops.supabase_select")
    def test_bulk_update_rejects_another_grantors_notification(self, select, update):
        select.return_value = {
            "ok": True,
            "rows": [{"id": "notification-b", "data": {"grantorId": "grantor-b"}}],
        }

        result = update_grantor_notifications(
            ["notification-b"],
            {"read": True},
            "grantor-a",
        )

        self.assertFalse(result["ok"])
        self.assertEqual(result["updated"], 0)
        self.assertEqual(result["failures"][0]["reason"], "grantor_notification_owner_mismatch")
        update.assert_not_called()


if __name__ == "__main__":
    unittest.main()
