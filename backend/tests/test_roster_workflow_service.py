import unittest
from unittest.mock import patch

from backend import roster_workflow_service as service


class RosterImportPreviewTests(unittest.TestCase):
    def setUp(self):
        self.payload = {
            "actorType": "grantor",
            "actorId": "grantor-1",
            "grantorId": "grantor-1",
            "rows": [{
                "rowNumber": 1,
                "studentId": "20260001",
                "fullName": "Ana Santos",
                "scholarshipTitle": "Future Leaders",
            }],
        }

    @staticmethod
    def _rows(table, filters=None):
        del filters
        fixtures = {
            "students": [{"id": "20260001", "fullName": "Ana Santos"}],
            "grantor_portal_scholars": [],
            "scholarship_applications": [],
            "providers": [{"id": "grantor-1", "providerType": "private"}],
            "grantor_portals": [],
            "grantor_portal_announcements": [{
                "id": "announcement-1",
                "scholarshipTitle": "Future Leaders",
                "applicationEnabled": True,
            }],
        }
        return fixtures.get(table, [])

    def _preview(self, payload=None, rows=None):
        with patch.object(service, "enforce_portal_scope"), \
                patch.object(service, "_preview_response", return_value=None), \
                patch.object(service, "_row_data_rows", side_effect=rows or self._rows), \
                patch.object(service, "supabase_document_upsert", return_value={"ok": True}):
            return service.preview_roster_import(object(), payload or self.payload)

    def test_active_account_without_application_is_new_assignment(self):
        result = self._preview()
        self.assertEqual("ready", result["status"])
        self.assertEqual("new_assignment", result["rows"][0]["disposition"])
        self.assertEqual("announcement-1", result["rows"][0]["scholarshipId"])

    def test_unknown_scholarship_blocks_batch(self):
        payload = {**self.payload, "rows": [{**self.payload["rows"][0], "scholarshipTitle": "Unknown Award"}]}
        result = self._preview(payload)
        self.assertEqual("blocked", result["status"])
        self.assertEqual("scholarship_not_recognized", result["rows"][0]["disposition"])

    def test_ambiguous_exact_title_blocks_batch(self):
        def rows(table, filters=None):
            values = self._rows(table, filters)
            if table == "grantor_portal_announcements":
                return [
                    {"id": "announcement-1", "scholarshipTitle": "Future Leaders", "applicationEnabled": True},
                    {"id": "announcement-2", "scholarshipTitle": "Future Leaders", "applicationEnabled": True},
                ]
            return values

        result = self._preview(rows=rows)
        self.assertEqual("blocked", result["status"])
        self.assertEqual("scholarship_ambiguous", result["rows"][0]["disposition"])

    def test_matching_application_is_converted_in_place(self):
        def rows(table, filters=None):
            values = self._rows(table, filters)
            if table == "scholarship_applications":
                return [{
                    "id": "application-1", "studentId": "20260001",
                    "grantorId": "grantor-1", "scholarshipId": "announcement-1",
                    "status": "Under Review",
                }]
            return values

        result = self._preview(rows=rows)
        self.assertEqual("convert_existing", result["rows"][0]["disposition"])
        self.assertEqual("application-1", result["rows"][0]["existingApplicationId"])

    def test_name_mismatch_creates_visible_conflict(self):
        payload = {**self.payload, "rows": [{**self.payload["rows"][0], "fullName": "Different Person"}]}
        saved = []
        with patch.object(service, "enforce_portal_scope"), \
                patch.object(service, "_preview_response", return_value=None), \
                patch.object(service, "_row_data_rows", side_effect=self._rows), \
                patch.object(service, "supabase_document_upsert", side_effect=lambda table, record_id, data, **kwargs: saved.append((table, record_id, data)) or {"ok": True}):
            result = service.preview_roster_import(object(), payload)
        self.assertEqual("identity_mismatch", result["rows"][0]["disposition"])
        self.assertTrue(any(table == "roster_assignment_conflicts" for table, _, _ in saved))

    def test_existing_preview_is_idempotent(self):
        stored = {"ok": True, "batchId": "batch-1", "status": "ready", "rows": []}
        with patch.object(service, "enforce_portal_scope"), \
                patch.object(service, "_preview_response", return_value=stored):
            result = service.preview_roster_import(object(), self.payload)
        self.assertTrue(result["idempotent"])


class RosterWorkflowRpcTests(unittest.TestCase):
    def test_commit_uses_authenticated_actor(self):
        with patch.object(service, "enforce_portal_scope"), \
                patch.object(service, "supabase_rpc", return_value={"ok": True, "data": {"batchId": "batch-1"}}) as rpc:
            result = service.commit_roster_import(object(), {
                "batchId": "batch-1", "actorType": "admin", "actorId": "admin-1",
            })
        self.assertTrue(result["ok"])
        rpc.assert_called_once_with("commit_roster_import_batch", {
            "p_batch_id": "batch-1", "p_actor_type": "admin", "p_actor_id": "admin-1",
        })

    def test_material_request_accepts_only_session_student_and_application(self):
        with patch.object(service, "enforce_portal_scope"), \
                patch.object(service, "supabase_rpc", return_value={"ok": True, "data": {"applicationId": "application-1"}}) as rpc:
            result = service.request_student_materials(object(), {
                "actorType": "student", "actorId": "20260001",
                "studentId": "forged-student", "applicationId": "application-1",
            })
        self.assertTrue(result["ok"])
        rpc.assert_called_once_with("request_scholarship_materials", {
            "p_student_id": "20260001", "p_application_id": "application-1",
        })

    def test_full_admin_conflict_resolution_is_audited_rpc(self):
        with patch.object(service, "enforce_portal_scope"), \
                patch.object(service, "require_admin_bearer", return_value=("admin-1", {"role": "full_admin"})), \
                patch.object(service, "supabase_rpc", return_value={"ok": True, "data": {"conflictId": "conflict-1"}}) as rpc:
            result = service.resolve_roster_conflict(object(), {
                "actorId": "admin-1", "conflictId": "conflict-1",
                "resolution": "existing", "selectedRosterId": "roster-1",
            })
        self.assertTrue(result["ok"])
        rpc.assert_called_once_with("resolve_roster_assignment_conflict", {
            "p_conflict_id": "conflict-1", "p_resolution": "existing",
            "p_selected_roster_id": "roster-1", "p_actor_id": "admin-1",
        })


if __name__ == "__main__":
    unittest.main()
