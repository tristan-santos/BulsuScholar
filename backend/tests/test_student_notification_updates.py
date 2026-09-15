import unittest
from unittest.mock import patch

from backend.supabase_ops import (
    list_admin_notifications,
    list_grantor_notifications,
    list_student_notifications,
    update_grantor_notification,
    update_grantor_notifications,
    update_student_notification,
    update_student_notifications,
)


class StudentNotificationUpdateTests(unittest.TestCase):
    @patch("backend.supabase_ops.update_student_notification", return_value={"ok": True})
    def test_bulk_update_deduplicates_owned_notifications(self, update):
        result = update_student_notifications(
            ["notification-a", "notification-a"],
            {"read": True},
            "student-a",
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["updated"], 1)
        update.assert_called_once_with(
            "notification-a",
            {"read": True},
            "student-a",
            "studentNotifications",
        )

    @patch("backend.supabase_ops.supabase_select")
    @patch("backend.supabase_ops.supabase_document_update")
    def test_update_rejects_another_students_notification(self, update, select):
        select.return_value = {
            "ok": True,
            "rows": [{"id": "notification-b", "data": {"studentId": "student-b"}}],
        }

        result = update_student_notification(
            "notification-b",
            {"read": True},
            "student-a",
        )

        self.assertFalse(result["ok"])
        self.assertEqual(result["reason"], "student_notification_owner_mismatch")
        update.assert_not_called()


class GrantorNotificationUpdateTests(unittest.TestCase):
    @patch("backend.supabase_ops.update_grantor_notification", return_value={"ok": True})
    def test_bulk_update_deduplicates_owned_notifications(self, update):
        result = update_grantor_notifications(
            ["notification-a", "notification-a"],
            {"read": True},
            "grantor-a",
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["updated"], 1)
        update.assert_called_once_with(
            "notification-a",
            {"read": True},
            "grantor-a",
            "grantorNotifications",
        )

    @patch("backend.supabase_ops.supabase_select")
    @patch("backend.supabase_ops.supabase_document_update")
    def test_update_rejects_another_grantors_notification(self, update, select):
        select.return_value = {
            "ok": True,
            "rows": [{"id": "notification-b", "data": {"grantorId": "grantor-b"}}],
        }

        result = update_grantor_notification(
            "notification-b",
            {"read": True},
            "grantor-a",
        )

        self.assertFalse(result["ok"])
        self.assertEqual(result["reason"], "grantor_notification_owner_mismatch")
        update.assert_not_called()


class NotificationListTests(unittest.TestCase):
    @patch("backend.supabase_ops.supabase_select")
    def test_student_list_merges_primary_and_fallback_rows(self, select):
        select.side_effect = [
            {
                "ok": True,
                "rows": [{"id": "primary", "data": {"studentId": "student-a", "createdAt": "2026-01-01T00:00:00Z"}}],
            },
            {
                "ok": True,
                "rows": [{"id": "fallback", "data": {"studentId": "student-a", "createdAt": "2026-01-02T00:00:00Z"}}],
            },
        ]
        result = list_student_notifications("student-a")
        self.assertTrue(result["ok"])
        self.assertEqual(["fallback", "primary"], [row["id"] for row in result["notifications"]])
        self.assertEqual("student_warnings", result["notifications"][0]["sourceTable"])

    @patch("backend.supabase_ops.supabase_select")
    def test_grantor_list_scopes_both_sources(self, select):
        select.side_effect = [{"ok": True, "rows": []}, {"ok": True, "rows": []}]
        result = list_grantor_notifications("grantor-a")
        self.assertTrue(result["ok"])
        self.assertEqual(
            {"data->>grantorId": "grantor-a"},
            select.call_args_list[0].args[1],
        )
        self.assertEqual("systemLogs", select.call_args_list[1].args[0])

    @patch("backend.supabase_ops.supabase_select")
    def test_admin_list_returns_only_tagged_rows(self, select):
        select.return_value = {
            "ok": True,
            "rows": [{"id": "admin-message", "data": {"notificationFallbackTable": "adminNotifications"}}],
        }
        result = list_admin_notifications()
        self.assertTrue(result["ok"])
        self.assertEqual("systemLogs", result["notifications"][0]["sourceTable"])
        self.assertEqual(
            {"data->>notificationFallbackTable": "adminNotifications"},
            select.call_args.args[1],
        )


if __name__ == "__main__":
    unittest.main()
