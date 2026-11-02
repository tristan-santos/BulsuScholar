import unittest
from unittest.mock import patch

from fastapi import HTTPException
from backend import roster_workflow_service as service


class AdminSingleGrantorTests(unittest.TestCase):
    def preview(self, selection, rows=None, providers=None, committed=None):
        fixtures = {
            "providers": providers or [], "grantor_portals": [], "students": [],
            "grantor_portal_scholars": [], "scholarship_applications": [],
            "grantor_portal_announcements": [{"id": "program-1", "scholarshipTitle": "Future Leaders", "applicationEnabled": True}],
            "roster_programs": [],
        }
        payload = {"actorType": "admin", "actorId": "admin-1", "grantorSelection": selection,
                   "rows": rows or [{"rowNumber": 2, "studentId": "TEST-1", "fullName": "Sample Scholar", "scholarshipTitle": "Future Leaders"}]}
        with patch.object(service, "enforce_portal_scope"), \
                patch.object(service, "_current_cycle", return_value="2026-2027-1ST"), \
                patch.object(service, "_row_data_rows", side_effect=lambda table, filters=None: fixtures.get(table, [])), \
                patch.object(service, "_preview_response", return_value=committed), \
                patch.object(service, "supabase_document_upsert", return_value={"ok": True}) as save:
            result = service.preview_roster_import(object(), payload)
        return result, save

    def test_new_grantor_preview_creates_only_preview_records(self):
        result, save = self.preview({"mode": "new", "name": "  Example   Foundation "})
        self.assertEqual("ready", result["status"])
        self.assertTrue(result["rows"][0]["grantorId"].startswith("roster_grantor_"))
        self.assertEqual({"roster_import_batches", "roster_import_rows"}, {c.args[0] for c in save.call_args_list})
        batch = save.call_args_list[0].args[2]
        self.assertEqual("Example Foundation", batch["grantorSelection"]["name"])
        self.assertEqual("external", result["rows"][0]["grantorType"])

    def test_multiple_titles_register_private_programs_without_announcements(self):
        rows = [{"rowNumber": i + 2, "studentId": f"TEST-{i}", "fullName": f"Scholar {i}", "scholarshipTitle": title}
                for i, title in enumerate(["Award One", "Award Two"])]
        result, save = self.preview({"mode": "new", "name": "Example Foundation"}, rows)
        self.assertEqual("ready", result["status"])
        self.assertEqual(2, len(save.call_args_list[0].args[2]["pendingPrograms"]))
        self.assertEqual(1, len({r["grantorId"] for r in result["rows"]}))

    def test_existing_grantor_applies_to_all_rows(self):
        result, _ = self.preview({"mode": "existing", "grantorId": "g1"}, providers=[{"id": "g1", "name": "Existing"}])
        self.assertEqual("g1", result["rows"][0]["grantorId"])
        self.assertEqual("program-1", result["rows"][0]["scholarshipId"])

    def test_conflicting_row_grantor_is_rejected(self):
        with self.assertRaises(HTTPException) as error:
            self.preview({"mode": "existing", "grantorId": "g1"}, rows=[{"grantorId": "g2"}], providers=[{"id": "g1"}])
        self.assertEqual("roster_single_grantor_required", error.exception.detail)

    def test_existing_name_case_and_spacing_cannot_create_duplicate(self):
        with self.assertRaises(HTTPException) as error:
            self.preview({"mode": "new", "name": "example FOUNDATION"}, providers=[{"id": "g1", "providerName": "Example Foundation"}])
        self.assertEqual(409, error.exception.status_code)

    def test_invalid_or_inactive_selection_is_rejected(self):
        for selection in [{"mode": "new", "name": " "}, {"mode": "new", "name": "---"},
                          {"mode": "new", "name": "x" * 161}, {"mode": "existing", "grantorId": "missing"},
                          {"mode": "existing", "grantorId": "archived"}]:
            with self.subTest(selection=selection), self.assertRaises(HTTPException):
                self.preview(selection, providers=[{"id": "archived", "archived": True}])

    def test_grantor_cannot_create_non_login_grantor(self):
        with self.assertRaises(HTTPException) as error:
            service._admin_grantor_selection({"actorType": "grantor", "grantorSelection": {"mode": "new", "name": "Example"}}, {})
        self.assertEqual(403, error.exception.status_code)

    def test_committed_preview_retry_is_idempotent_even_after_grantor_exists(self):
        committed = {"ok": True, "status": "committed", "batchId": "batch", "rows": []}
        result, save = self.preview({"mode": "new", "name": "Example Foundation"},
                                    providers=[{"id": "g1", "providerName": "Example Foundation"}], committed=committed)
        self.assertTrue(result["idempotent"])
        save.assert_not_called()


if __name__ == "__main__":
    unittest.main()
