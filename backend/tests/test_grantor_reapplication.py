import unittest
from unittest.mock import patch

from backend.workflow_service import (
    _entry_matches_archived_grantor,
    _find_pending_scholarship_invitation,
    invite_archived_grantor_scholars,
    reject_scholarship_invitation,
    update_grantor_archive_state,
)


class GrantorReapplicationPolicyTests(unittest.TestCase):
    def test_manual_archive_blocks_only_same_stable_grantor(self):
        record = {"archived": True, "grantorId": "grantor-a", "providerType": "private"}
        self.assertTrue(_entry_matches_archived_grantor(record, "grantor-a", "private"))
        self.assertFalse(_entry_matches_archived_grantor(record, "grantor-b", "private"))

    def test_non_manual_closures_do_not_create_permanent_block(self):
        records = [
            {"archived": True, "grantorId": "grantor-a", "closureReason": "selected_another_scholarship"},
            {"archived": True, "grantorId": "grantor-a", "closureReason": "student_withdrawal"},
            {"archived": True, "grantorId": "grantor-a", "rejectedAt": "2026-09-08T00:00:00Z"},
            {"archived": True, "grantorId": "grantor-a", "status": "Withdrawn"},
        ]
        for record in records:
            with self.subTest(record=record):
                self.assertFalse(_entry_matches_archived_grantor(record, "grantor-a"))

    def test_invitation_requires_same_grantor_and_scholarship(self):
        student = {"scholarshipInvitations": [{
            "id": "invite-a", "status": "Pending", "grantorId": "grantor-a",
            "announcementId": "offering-a", "scholarshipName": "Alpha",
        }]}
        self.assertIsNotNone(_find_pending_scholarship_invitation(student, {
            "grantorId": "grantor-a", "announcementId": "offering-a", "scholarshipName": "Alpha",
        }))
        self.assertIsNone(_find_pending_scholarship_invitation(student, {
            "grantorId": "grantor-a", "announcementId": "offering-b", "scholarshipName": "Beta",
        }))
        self.assertIsNone(_find_pending_scholarship_invitation(student, {
            "grantorId": "grantor-b", "announcementId": "offering-a", "scholarshipName": "Alpha",
        }))

    def test_legacy_invitation_uses_title_only_without_announcement_id(self):
        student = {"scholarshipInvitations": [{
            "id": "legacy", "status": "Invited", "grantorId": "grantor-a", "scholarshipName": "Alpha",
        }]}
        self.assertIsNotNone(_find_pending_scholarship_invitation(student, {
            "grantorId": "grantor-a", "announcementId": "offering-new", "scholarshipName": " alpha ",
        }))
        self.assertIsNone(_find_pending_scholarship_invitation(student, {
            "grantorId": "grantor-a", "announcementId": "offering-new", "scholarshipName": "Beta",
        }))


class GrantorArchiveWorkflowTests(unittest.TestCase):
    @patch("backend.workflow_service.create_log")
    @patch("backend.workflow_service.supabase_select")
    @patch("backend.workflow_service.supabase_document_update")
    @patch("backend.workflow_service.supabase_document_upsert")
    def test_restore_updates_account_only(self, upsert, update, select, _log):
        upsert.return_value = {"ok": True}
        result = update_grantor_archive_state({
            "grantorIds": ["grantor-a"], "archived": False, "actorId": "admin-a",
            "restoreData": {"password": "encrypted", "mustChangePassword": True},
        })
        self.assertTrue(result["ok"])
        self.assertFalse(result["partial"])
        select.assert_not_called()
        update.assert_not_called()
        provider_call = upsert.call_args_list[0]
        portal_call = upsert.call_args_list[1]
        self.assertEqual(provider_call.args[0], "providers")
        self.assertEqual(provider_call.args[2]["password"], "encrypted")
        self.assertEqual(portal_call.args[0], "grantor_portals")
        self.assertNotIn("password", portal_call.args[2])

    @patch("backend.workflow_service.create_log")
    @patch("backend.workflow_service.supabase_select")
    @patch("backend.workflow_service.supabase_document_update")
    @patch("backend.workflow_service.supabase_document_upsert")
    def test_archive_cascades_owned_announcements(self, upsert, update, select, _log):
        upsert.return_value = {"ok": True}
        select.return_value = {"ok": True, "rows": [{"id": "announcement-a", "data": {"status": "Published"}}]}
        update.return_value = {"ok": True}
        result = update_grantor_archive_state({"grantorIds": ["grantor-a"], "archived": True, "actorId": "admin-a"})
        self.assertEqual(result["announcementCount"], 1)
        archive_data = update.call_args.args[2]
        self.assertTrue(archive_data["hiddenFromStudents"])
        self.assertTrue(archive_data["archivedByAccountAction"])

    @patch("backend.workflow_service.create_log")
    @patch("backend.workflow_service.supabase_select")
    @patch("backend.workflow_service.supabase_document_update")
    @patch("backend.workflow_service.supabase_document_upsert")
    def test_archive_cancels_pending_invitations_and_preserves_history(self, upsert, update, select, _log):
        upsert.return_value = {"ok": True}
        update.return_value = {"ok": True}
        select.side_effect = [
            {"ok": True, "rows": []},
            {"ok": True, "rows": [{"id": "student-a", "data": {"scholarshipInvitations": [
                {"id": "invite-a", "grantorId": "grantor-a", "status": "Pending"},
                {"id": "invite-b", "grantorId": "grantor-b", "status": "Pending"},
            ]}}]},
            {"ok": True, "rows": [{"id": "history-a", "data": {
                "archived": True, "status": "Archived", "unarchiveInvitationPending": True,
            }}]},
        ]
        result = update_grantor_archive_state({"grantorIds": ["grantor-a"], "archived": True, "actorId": "admin-a"})
        self.assertEqual(result["invitationCount"], 1)
        self.assertEqual(result["notificationCount"], 1)
        student_patch = next(call.args[2] for call in upsert.call_args_list if call.args[0] == "students")
        self.assertEqual(student_patch["scholarshipInvitations"][0]["status"], "Cancelled")
        self.assertEqual(student_patch["scholarshipInvitations"][1]["status"], "Pending")
        roster_patch = next(call.args[2] for call in update.call_args_list if call.args[0] == "grantor_portal_scholars")
        self.assertTrue(roster_patch["archived"])
        self.assertEqual(roster_patch["status"], "Archived")


class GrantorInvitationWorkflowTests(unittest.TestCase):
    @patch("backend.workflow_service._archived_grantor_account", return_value=None)
    @patch("backend.workflow_service.supabase_document_update", return_value={"ok": True})
    @patch("backend.workflow_service.supabase_document_upsert", return_value={"ok": True})
    @patch("backend.workflow_service.supabase_document_get")
    def test_invite_back_uses_exact_open_announcement_and_keeps_history_archived(self, document_get, _upsert, update, _archive_check):
        def get_record(table, _record_id, parent_id=None):
            records = {
                "grantor_portal_announcements": {"applicationEnabled": True, "status": "Published", "slotsConfigured": True,
                    "totalSlots": 25, "remainingSlots": 4, "scholarshipTitle": "Alpha", "minimumGrade": 2.5},
                "grantor_portals": {"name": "Grantor A"},
                "grantor_portal_scholars": {"archived": True, "status": "Archived", "studentId": "student-a"},
                "students": {"gwa": 2.0, "scholarships": [], "scholarshipInvitations": []},
            }
            return {"ok": True, "row": {"id": _record_id}, "data": records[table]}
        document_get.side_effect = get_record
        result = invite_archived_grantor_scholars({
            "grantorId": "grantor-a", "announcementId": "announcement-a", "scholarIds": ["history-a"],
        })
        self.assertTrue(result["ok"])
        self.assertEqual(result["invitationCount"], 1)
        roster_patch = update.call_args.args[2]
        self.assertTrue(roster_patch["archived"])
        self.assertEqual(roster_patch["status"], "Archived")

    @patch("backend.workflow_service.create_student_notification", return_value={"ok": True})
    @patch("backend.workflow_service.supabase_document_update", return_value={"ok": True})
    @patch("backend.workflow_service.supabase_document_upsert", return_value={"ok": True})
    @patch("backend.workflow_service.supabase_document_get")
    def test_student_can_reject_only_a_pending_stored_invitation(self, document_get, _upsert, update, _notification):
        document_get.return_value = {"ok": True, "row": {"id": "student-a"}, "data": {"scholarshipInvitations": [{
            "id": "invite-a", "status": "Pending", "grantorId": "grantor-a", "scholarId": "history-a",
        }]}}
        result = reject_scholarship_invitation({"studentId": "student-a", "invitationId": "invite-a", "reason": "Not interested"})
        self.assertTrue(result["ok"])
        self.assertEqual(result["invitation"]["status"], "Rejected")
        self.assertTrue(update.call_args.args[2]["archived"])

        document_get.return_value = {"ok": True, "row": {"id": "student-a"}, "data": {"scholarshipInvitations": [{
            "id": "invite-a", "status": "Cancelled", "grantorId": "grantor-a",
        }]}}
        self.assertEqual(reject_scholarship_invitation({"studentId": "student-a", "invitationId": "invite-a"})["reason"], "invitation_not_pending")


if __name__ == "__main__":
    unittest.main()
