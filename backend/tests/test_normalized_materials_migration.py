import unittest
from pathlib import Path


MIGRATION = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20261012100000_repair_normalized_materials_workflow.sql"
STABILITY_MIGRATION = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20261018090000_stable_materials_and_automatic_documents.sql"


class NormalizedMaterialsMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding="utf-8").lower()
        cls.stability_sql = STABILITY_MIGRATION.read_text(encoding="utf-8").lower()

    def test_preflight_and_commit_are_replaced_and_private(self):
        self.assertIn("function public.scholarship_materials_preflight", self.sql)
        self.assertIn("function public.request_scholarship_materials", self.sql)
        self.assertIn("revoke all on function public.scholarship_materials_preflight(text, text) from public, anon, authenticated", self.sql)
        self.assertIn("grant execute on function public.request_scholarship_materials(text, text) to service_role", self.sql)

    def test_commit_uses_normalized_state_without_reembedding_workflow(self):
        self.assertIn("insert into public.student_scholarship_state", self.sql)
        self.assertIn("from public.scholarship_applications", self.sql)
        self.assertNotIn("update public.students set data", self.sql)

    def test_request_is_idempotent_and_contains_both_materials(self):
        self.assertIn("'idempotent', true", self.sql)
        self.assertIn("'application_form', true", self.sql)
        self.assertIn("'soe', true", self.sql)
        self.assertIn("pg_advisory_xact_lock", self.sql)

    def test_stable_preflight_reads_normalized_submissions_and_is_private(self):
        self.assertIn("from public.student_document_submissions", self.stability_sql)
        self.assertIn("function public.scholarship_materials_preflight", self.stability_sql)
        self.assertIn("revoke all on function public.scholarship_materials_preflight(text, text) from public, anon, authenticated", self.stability_sql)
        self.assertIn("grant execute on function public.scholarship_materials_preflight(text, text) to service_role", self.stability_sql)

    def test_validated_replacement_backfill_preserves_rejections(self):
        self.assertIn("submission.data->>'status' = 'pending'", self.stability_sql)
        self.assertIn("submission.data->>'documenttype' in ('cor', 'rog', 'identity')", self.stability_sql)
        self.assertNotIn("delete from public.student_document_submissions", self.stability_sql)


if __name__ == "__main__":
    unittest.main()
