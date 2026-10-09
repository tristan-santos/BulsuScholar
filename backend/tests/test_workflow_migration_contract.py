import unittest
from pathlib import Path


MIGRATION = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20261006054749_stabilize_scholarship_workflows.sql"


class WorkflowMigrationContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding="utf-8").lower()

    def test_preflight_and_commit_are_service_role_only(self):
        self.assertIn("function public.scholarship_materials_preflight", self.sql)
        self.assertIn("revoke all on function public.scholarship_materials_preflight(text,text) from public, anon, authenticated", self.sql)
        self.assertIn("grant execute on function public.scholarship_materials_preflight(text,text) to service_role", self.sql)
        self.assertIn("revoke all on function public.request_scholarship_materials(text,text) from public, anon, authenticated", self.sql)

    def test_material_request_is_idempotent_and_contains_both_materials(self):
        self.assertIn("student_data#>>'{scholarshipcommitment,applicationid}' = p_application_id", self.sql)
        self.assertIn("'application_form',true", self.sql)
        self.assertIn("'soe',true", self.sql)

    def test_failed_email_delivery_can_cancel_challenge(self):
        self.assertIn("function public.cancel_portal_email_challenge", self.sql)
        self.assertIn("set status = 'cancelled'", self.sql)
        self.assertIn("grant execute on function public.cancel_portal_email_challenge(text,uuid,text) to service_role", self.sql)

    def test_existing_roster_migration_finishes_only_after_document_completion(self):
        roster_sql = (MIGRATION.parent / "20260918130000_automatic_roster_and_login_security.sql").read_text(encoding="utf-8").lower()
        self.assertIn("assign_authoritative_roster_scholarship", roster_sql)
        self.assertIn("complete_authoritative_roster_application", roster_sql)
        self.assertIn("scholarship_documents_complete_for_application", roster_sql)


if __name__ == "__main__":
    unittest.main()
