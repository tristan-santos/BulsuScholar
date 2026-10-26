import unittest
from unittest.mock import patch

from fastapi import HTTPException

from backend import roster_workflow_service as service


class RosterImportPreviewTests(unittest.TestCase):
    def setUp(self):
        cycle_patch = patch.object(service, "_current_cycle", return_value="2026-2027-1ST")
        cycle_patch.start()
        self.addCleanup(cycle_patch.stop)
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

    def test_missing_ids_and_titles_are_validation_errors_not_duplicates(self):
        payload = {**self.payload, "rows": [
            {"fullName": f"Scholar {index}", "rowNumber": index + 1}
            for index in range(43)
        ]}
        result = self._preview(payload)
        self.assertEqual("blocked", result["status"])
        self.assertEqual({"invalid_data": 43}, result["counts"])
        for row in result["rows"]:
            self.assertTrue(row["blocking"])
            self.assertIn("scholarship title, course, year level", row["reason"])

    def test_missing_student_id_requires_course_and_year(self):
        payload = {**self.payload, "rows": [{**self.payload["rows"][0], "studentId": ""}]}
        result = self._preview(payload)
        self.assertEqual("invalid_data", result["rows"][0]["disposition"])
        self.assertIn("Missing required fields: course, year level.", result["rows"][0]["reason"])

    def test_name_course_year_import_without_student_number(self):
        payload = {**self.payload, "rows": [
            {"fullName": f"Scholar {index}", "course": "BIT", "yearLevel": "4", "scholarshipTitle": "Future Leaders"}
            for index in range(43)
        ]}
        result = self._preview(payload)
        self.assertEqual("ready", result["status"])
        self.assertEqual({"ready_unlinked": 43}, result["counts"])
        self.assertTrue(all(not row["matchedAccount"] and not row["studentId"] for row in result["rows"]))

    def test_identical_name_course_year_rows_are_duplicates(self):
        row = {"fullName": "Ana Santos", "course": "BIT", "yearLevel": "4", "scholarshipTitle": "Future Leaders"}
        result = self._preview({**self.payload, "rows": [row, row]})
        self.assertEqual({"duplicate_import_row": 2}, result["counts"])

    def test_name_only_rows_do_not_assign_an_existing_account(self):
        row = {"fullName": "Ana Santos", "course": "BIT", "yearLevel": "4", "scholarshipTitle": "Future Leaders"}
        result = self._preview({**self.payload, "rows": [row]})
        self.assertEqual("ready_unlinked", result["rows"][0]["disposition"])
        self.assertFalse(result["rows"][0]["matchedAccount"])

    def test_name_course_year_duplicate_in_same_roster_is_already_imported(self):
        row = {"fullName": "Ana Santos", "course": "BIT", "yearLevel": "4", "scholarshipTitle": "Future Leaders"}
        def rows(table, filters=None):
            if table == "grantor_portal_scholars":
                return [{**row, "id": "unlinked", "parentId": "grantor-1", "academicCycle": "2026-2027-1ST"}]
            return self._rows(table, filters)
        result = self._preview({**self.payload, "rows": [row]}, rows=rows)
        self.assertEqual("already_imported", result["rows"][0]["disposition"])

    def test_cross_grantor_profile_match_blocks_when_either_number_is_missing(self):
        for incoming_id, existing_id in (("", ""), ("20260001", ""), ("", "20260001")):
            with self.subTest(incoming_id=incoming_id, existing_id=existing_id):
                row = {"studentId": incoming_id, "fullName": "Ana Santos", "course": "BIT", "yearLevel": "4", "scholarshipTitle": "Future Leaders"}
                def rows(table, filters=None):
                    if table == "grantor_portal_scholars":
                        return [{**row, "studentId": existing_id, "id": "other", "parentId": "grantor-2", "grantorName": "San Martin", "academicCycle": "2026-2027-1ST"}]
                    return self._rows(table, filters)
                result = self._preview({**self.payload, "rows": [row]}, rows=rows)
                self.assertEqual("blocked", result["status"])
                self.assertIn("San Martin", result["rows"][0]["reason"])
                self.assertEqual("conflicting_active_roster", result["rows"][0]["disposition"])

    def test_cross_grantor_conflict_is_not_hidden_by_same_list_duplicate(self):
        row = {"fullName": "Ana Santos", "course": "BIT", "yearLevel": "4", "scholarshipTitle": "Future Leaders"}
        def rows(table, filters=None):
            if table == "grantor_portal_scholars":
                return [{**row, "id": owner, "parentId": owner, "academicCycle": "2026-2027-1ST"} for owner in ("grantor-1", "grantor-2")]
            return self._rows(table, filters)
        result = self._preview({**self.payload, "rows": [row]}, rows=rows)
        self.assertEqual("blocked", result["status"])

    def test_profile_normalization_and_distinct_students(self):
        base = {"fullName": "Santos, Ana M.", "course": "B.S.I.T.", "yearLevel": "4th Year"}
        self.assertTrue(service._same_roster_identity(base, {"fullName": " santos ana m ", "course": "BSIT", "yearLevel": "Year 4"}))
        for different in ({"course": "BSBA"}, {"yearLevel": "3"}, {"fullName": "Santos, Bea M."}, {"course": ""}):
            self.assertFalse(service._same_roster_identity(base, {**base, **different}))
        self.assertFalse(service._same_roster_identity({**base, "studentId": "one"}, {**base, "studentId": "two"}))
        self.assertTrue(service._same_roster_identity({**base, "studentId": "one"}, {"studentId": "one"}))

    def test_historical_and_archived_cross_grantor_rows_do_not_block(self):
        row = {"fullName": "Ana Santos", "course": "BIT", "yearLevel": "4", "scholarshipTitle": "Future Leaders"}
        for override in ({"archived": True}, {"status": "Inactive"}, {"academicCycle": "2025-2026-2ND"}):
            with self.subTest(override=override):
                def rows(table, filters=None):
                    if table == "grantor_portal_scholars":
                        return [{**row, "id": "other", "parentId": "grantor-2", "academicCycle": "2026-2027-1ST", **override}]
                    return self._rows(table, filters)
                result = self._preview({**self.payload, "rows": [row]}, rows=rows)
                self.assertEqual("ready", result["status"])

    def test_legacy_cross_grantor_row_without_cycle_blocks(self):
        row = {"fullName": "Ana Santos", "course": "BIT", "yearLevel": "4", "scholarshipTitle": "Future Leaders"}
        def rows(table, filters=None):
            if table == "grantor_portal_scholars":
                return [{**row, "id": "other", "parentId": "grantor-2"}]
            return self._rows(table, filters)
        result = self._preview({**self.payload, "rows": [row]}, rows=rows)
        self.assertEqual("blocked", result["status"])

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
                    "academicCycle": "2026-2027-1ST",
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
        stored = {"ok": True, "batchId": "batch-1", "status": "committed", "rows": []}
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

    def test_material_preflight_uses_authenticated_student(self):
        readiness = {"eligible": False, "blockers": [{"code": "document_review_required"}]}
        with patch.object(service, "enforce_portal_scope"), \
                patch.object(service, "supabase_rpc", return_value={"ok": True, "data": readiness}) as rpc:
            result = service.preflight_student_materials(object(), {
                "actorType": "student", "actorId": "20260001",
                "studentId": "forged-student", "applicationId": "application-1",
            })
        self.assertFalse(result["eligible"])
        rpc.assert_called_once_with("scholarship_materials_preflight", {
            "p_student_id": "20260001", "p_application_id": "application-1",
        })

    def test_material_business_failure_returns_structured_conflict(self):
        rpc_results = [
            {"ok": False, "reason": "document_review_required"},
            {"ok": True, "data": {"blockers": [{
                "code": "document_review_required", "message": "Wait for approval.",
                "actionLabel": "Wait for Review", "route": "/student-dashboard/profile",
            }]}},
        ]
        with patch.object(service, "enforce_portal_scope"), \
                patch.object(service, "supabase_rpc", side_effect=rpc_results):
            with self.assertRaises(HTTPException) as raised:
                service.request_student_materials(object(), {
                    "actorType": "student", "actorId": "20260001", "applicationId": "application-1",
                })
        self.assertEqual(409, raised.exception.status_code)
        self.assertEqual("document_review_required", raised.exception.detail["code"])
        self.assertEqual("Wait for Review", raised.exception.detail["blockers"][0]["actionLabel"])

    def test_full_admin_conflict_resolution_is_audited_rpc(self):
        with patch.object(service, "enforce_portal_scope"), \
                patch.object(service, "require_admin_bearer", return_value=("admin-1", {"role": "full_admin"})), \
                patch.object(service, "supabase_rpc", return_value={"ok": True, "data": {"conflictId": "conflict-1"}}) as rpc:
            result = service.resolve_roster_conflict(object(), {
                "actorId": "admin-1", "conflictId": "conflict-1",
                "resolution": "existing", "selectedRosterId": "roster-1",
                "reason": "Verified the original award with the provider.",
            })
        self.assertTrue(result["ok"])
        rpc.assert_called_once_with("resolve_roster_assignment_conflict_v2", {
            "p_conflict_id": "conflict-1", "p_resolution": "existing",
            "p_selected_roster_id": "roster-1", "p_actor_id": "admin-1",
            "p_reason": "Verified the original award with the provider.",
        })


if __name__ == "__main__":
    unittest.main()
