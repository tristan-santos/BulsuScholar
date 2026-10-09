import unittest
from pathlib import Path
from unittest.mock import patch

from backend import supabase_ops


MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "supabase"
    / "migrations"
    / "20261009050000_normalize_student_scholarship_data.sql"
)
CLOSED_AT_MIGRATION = MIGRATION.parent / "20261009051000_backfill_normalized_application_closed_at.sql"


class StudentScholarshipMigrationContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding="utf-8").lower()

    def test_application_relational_columns_and_indexes_are_present(self):
        for column in ("student_id", "grantor_id", "scholarship_id", "academic_cycle", "status", "closed_at"):
            self.assertIn(f"add column if not exists {column}", self.sql)
        self.assertIn("foreign key(student_id) references public.students(id) on delete restrict", self.sql)
        self.assertIn("scholarship_applications_student_timeline_idx", self.sql)
        self.assertIn("scholarship_applications_grantor_status_idx", self.sql)

    def test_legacy_sources_are_backed_up_and_backfilled(self):
        self.assertIn("private.student_scholarship_migration_backup", self.sql)
        self.assertIn("data->'scholarships'", self.sql)
        self.assertIn("data->'scholarshipapplicationhistory'", self.sql)
        self.assertIn("data->'previousscholars'", self.sql)
        self.assertIn("on conflict(id) do nothing", self.sql)

    def test_compatibility_rpc_and_tables_are_service_role_only(self):
        self.assertIn("function public.persist_student_scholarship_compatibility", self.sql)
        self.assertIn(
            "revoke all on function public.persist_student_scholarship_compatibility(text, jsonb) from public, anon, authenticated",
            self.sql,
        )
        self.assertIn("revoke all on public.student_scholarship_invitations from public, anon, authenticated", self.sql)
        self.assertIn("revoke all on public.student_scholarship_state from public, anon, authenticated", self.sql)

    def test_legacy_profile_files_enter_revision_and_submission_workflows(self):
        self.assertIn("insert into public.student_profile_revisions", self.sql)
        self.assertIn("insert into public.student_document_submissions", self.sql)
        self.assertIn("'source', 'legacy_student_record'", self.sql)

    def test_closed_at_backfill_uses_historical_record_time(self):
        sql = CLOSED_AT_MIGRATION.read_text(encoding="utf-8").lower()
        self.assertIn("where not public.scholarship_application_open(data)", sql)
        self.assertIn("updated_at", sql)
        self.assertIn("and closed_at is null", sql)


class StudentScholarshipCompatibilityTests(unittest.TestCase):
    def test_terminal_application_classification(self):
        self.assertTrue(supabase_ops._scholarship_application_open({"status": "Under Review"}))
        self.assertFalse(supabase_ops._scholarship_application_open({"status": "Withdrawn"}))
        self.assertFalse(supabase_ops._scholarship_application_open({"status": "Active", "archived": True}))

    @patch("backend.supabase_ops.supabase_rpc", return_value={"ok": True, "data": {}})
    def test_student_write_persists_workflow_fields_and_strips_them(self, rpc):
        payload = {
            "fname": "Ada",
            "scholarships": [{"applicationId": "app-1", "status": "Pending"}],
            "scholarshipApplicationHistory": [],
            "scholarshipCommitment": {"applicationId": "app-1"},
            "scholarshipApplicationFile": {"path": "legacy.pdf"},
        }

        clean, error = supabase_ops._persist_student_workflow_fields("student-1", payload)

        self.assertIsNone(error)
        self.assertEqual(clean, {"fname": "Ada"})
        rpc.assert_called_once()
        rpc_payload = rpc.call_args.args[1]
        self.assertEqual(rpc_payload["p_student_id"], "student-1")
        self.assertIn("scholarships", rpc_payload["p_payload"])
        self.assertNotIn("scholarshipApplicationFile", rpc_payload["p_payload"])

    @patch("backend.supabase_ops._raw_select")
    def test_student_read_hydrates_current_and_historical_applications(self, raw_select):
        def rows(table, filters=None, limit=1):
            values = {
                "scholarship_applications": [
                    {"id": "active", "student_id": "student-1", "data": {"status": "Pending"}},
                    {"id": "old", "student_id": "student-1", "data": {"status": "Withdrawn"}},
                ],
                "student_scholarship_invitations": [],
                "student_scholarship_state": [
                    {"id": "student-1", "student_id": "student-1", "data": {"rosterMatchCount": 1}}
                ],
                "student_document_submissions": [],
            }
            return {"ok": True, "rows": values.get(table, [])}

        raw_select.side_effect = rows
        hydrated = supabase_ops._hydrate_student_rows([{"id": "student-1", "data": {"fname": "Ada"}}])[0]["data"]

        self.assertEqual([item["id"] for item in hydrated["scholarships"]], ["active"])
        self.assertEqual([item["id"] for item in hydrated["scholarshipApplicationHistory"]], ["old"])
        self.assertEqual(hydrated["rosterMatchCount"], 1)


if __name__ == "__main__":
    unittest.main()
