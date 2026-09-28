import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from backend import scope_announcement_waitlist_service as service


class ScopeAndApplicantTests(unittest.TestCase):
    def test_grantor_cannot_query_another_grantor(self):
        with self.assertRaises(HTTPException) as raised:
            service._provider_owner("grantor", "grantor-a", "grantor-b")
        self.assertEqual(403, raised.exception.status_code)

    def test_applicant_filters_are_applied_before_pagination(self):
        fixtures = {
            "students": [{"id": "student-1", "fname": "Ana", "lname": "Santos"}],
            "scholarship_applications": [
                {"id": "application-1", "studentId": "student-1", "grantorId": "grantor-a", "status": "Under Review", "scholarshipName": "A"},
                {"id": "application-2", "studentId": "student-1", "grantorId": "grantor-b", "status": "Approved", "scholarshipName": "B"},
            ],
        }
        with patch.object(service, "_actor", return_value=("grantor", "grantor-a")), \
                patch.object(service, "_all", side_effect=lambda table: fixtures[table]):
            result = service.list_filtered_applicants(object(), {"grantorId": "grantor-a", "status": "review", "page": 1, "pageSize": 25})
        self.assertEqual(1, result["total"])
        self.assertEqual("grantor-a", result["rows"][0]["grantorId"])


class AnnouncementAudienceTests(unittest.TestCase):
    def test_grantor_all_active_reaches_every_active_student_without_exposing_records(self):
        fixtures = {
            "students": [
                {"id": "one", "status": "Active"},
                {"id": "two", "status": "Active"},
                {"id": "disabled", "status": "Disabled"},
            ],
            "scholarship_applications": [],
            "grantor_portal_scholars": [],
        }
        inserted = []
        with patch.object(service, "_actor", return_value=("grantor", "grantor-a")), \
                patch.object(service, "_all", side_effect=lambda table: fixtures[table]), \
                patch.object(service, "supabase_rest_insert", return_value={"ok": True}), \
                patch.object(service, "supabase_rest_upsert_many", side_effect=lambda table, rows: inserted.extend(rows) or {"ok": True}):
            result = service.preview_announcement_audience(object(), {
                "target": {"type": "all_active", "grantorId": "grantor-a"},
            })
        self.assertEqual(2, result["recipientCount"])
        self.assertEqual({"one", "two"}, {row["student_id"] for row in inserted})

    def test_grantor_specific_recipients_are_intersected_with_owned_students(self):
        fixtures = {
            "students": [
                {"id": "owned", "status": "Active"},
                {"id": "outside", "status": "Active"},
            ],
            "scholarship_applications": [
                {"id": "app", "studentId": "owned", "grantorId": "grantor-a"},
            ],
            "grantor_portal_scholars": [],
        }
        inserted = []
        with patch.object(service, "_actor", return_value=("grantor", "grantor-a")), \
                patch.object(service, "_all", side_effect=lambda table: fixtures[table]), \
                patch.object(service, "supabase_rest_insert", return_value={"ok": True}), \
                patch.object(service, "supabase_rest_upsert_many", side_effect=lambda table, rows: inserted.extend(rows) or {"ok": True}):
            result = service.preview_announcement_audience(object(), {
                "target": {"type": "specific_students", "grantorId": "grantor-a", "studentIds": ["owned", "outside"]},
            })
        self.assertEqual(1, result["recipientCount"])
        self.assertEqual("owned", inserted[0]["student_id"])

    def test_publish_uses_atomic_database_workflow(self):
        preview = {"actorType": "admin", "actorId": "admin-1", "status": "ready", "expiresAt": "2099-01-01T00:00:00+00:00"}
        with patch.object(service, "_actor", return_value=("admin", "admin-1")), \
                patch.object(service, "supabase_document_get", return_value={"ok": True, "data": preview}), \
                patch.object(service, "supabase_rpc", return_value={"ok": True, "data": {"announcementId": "announcement-1", "delivered": 2}}) as rpc:
            result = service.publish_targeted_announcement(object(), {
                "previewId": "preview-1", "announcementId": "announcement-1",
                "title": "Update", "message": "Please review your application.",
            })
        self.assertEqual(2, result["delivered"])
        self.assertEqual("publish_announcement_preview", rpc.call_args.args[0])


class WaitlistTests(unittest.TestCase):
    def test_waitlist_status_returns_fifo_position_without_exposing_other_students(self):
        entries = [
            {"id": "entry-1", "student_id": "student-2", "announcement_id": "announcement-1", "status": "queued", "queued_at": "2026-01-01T00:00:00Z", "data": {}},
            {"id": "entry-2", "student_id": "student-1", "announcement_id": "announcement-1", "status": "queued", "queued_at": "2026-01-01T00:01:00Z", "data": {}},
        ]
        with patch.object(service, "_actor", return_value=("student", "student-1")), \
                patch.object(service, "_all", return_value=entries), \
                patch.object(service, "supabase_select", return_value={"ok": True, "rows": []}):
            result = service.list_waitlist(object(), {"studentId": "student-1"})
        self.assertEqual(1, len(result["entries"]))
        self.assertEqual(2, result["entries"][0]["queuePosition"])

    @patch.dict(os.environ, {"CRON_SECRET": "cron-secret"}, clear=False)
    def test_cron_rejects_wrong_secret(self):
        request = type("Request", (), {"headers": {"x-cron-secret": "wrong"}})()
        with self.assertRaises(HTTPException) as raised:
            service.expire_waitlist(request, {})
        self.assertEqual(401, raised.exception.status_code)

    @patch.dict(os.environ, {"CRON_SECRET": "cron-secret"}, clear=False)
    def test_cron_calls_idempotent_expiry_rpc(self):
        request = type("Request", (), {"headers": {"x-cron-secret": "cron-secret"}})()
        with patch.object(service, "supabase_rpc", return_value={"ok": True, "data": {"processed": 2}}) as rpc:
            result = service.expire_waitlist(request, {"limit": 20})
        self.assertEqual(2, result["processed"])
        rpc.assert_called_once_with("expire_waitlist_offers", {"p_limit": 20})

    def test_ineligible_acceptance_is_reported_after_slot_release(self):
        with patch.object(service, "_actor", return_value=("student", "student-1")), \
                patch.object(service, "supabase_rpc", return_value={"ok": True, "data": {"status": "closed", "reason": "grade_not_eligible"}}):
            with self.assertRaises(HTTPException) as raised:
                service.resolve_waitlist(object(), {"studentId": "student-1", "offerId": "offer-1", "action": "accept"})
        self.assertEqual(409, raised.exception.status_code)
        self.assertEqual("grade_not_eligible", raised.exception.detail)


if __name__ == "__main__":
    unittest.main()
