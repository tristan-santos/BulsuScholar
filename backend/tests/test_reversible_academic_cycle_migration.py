import pathlib
import unittest


MIGRATION = pathlib.Path(__file__).parents[2] / "supabase" / "migrations" / "20261011135631_reversible_academic_cycle_management.sql"


class ReversibleAcademicCycleMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding="utf-8").lower()

    def test_snapshot_and_audit_tables_are_additive_and_protected(self):
        self.assertIn("create table if not exists public.scholarship_cycle_snapshots", self.sql)
        self.assertIn("create table if not exists public.academic_cycle_transition_events", self.sql)
        self.assertIn("on delete restrict", self.sql)
        self.assertIn("restoration_method text not null", self.sql)
        self.assertIn("enable row level security", self.sql)
        self.assertIn("from public, anon, authenticated", self.sql)

    def test_transition_is_atomic_and_stale_safe(self):
        self.assertIn("for update", self.sql)
        self.assertIn("raise exception 'academic_cycle_changed'", self.sql)
        self.assertIn("on conflict(application_id, academic_cycle) do update", self.sql)
        self.assertIn("exactrestorationcount", self.sql)
        self.assertIn("reconstructedcount", self.sql)
        self.assertIn("'restorationmethod'", self.sql)

    def test_old_one_way_trigger_is_removed(self):
        self.assertIn("drop trigger if exists restart_scholarships_after_cycle_change", self.sql)

    def test_transition_restores_documents_without_mutating_submission_history(self):
        self.assertIn("perform public.refresh_student_cycle_documents(target_cycle, p_semester)", self.sql)
        self.assertNotIn("delete from public.student_document_submissions", self.sql)
        self.assertNotIn("update public.student_document_submissions", self.sql)

    def test_privileged_transition_is_service_role_only(self):
        signature = "function public.activate_academic_cycle(text, text, text, text, text)"
        self.assertIn(f"revoke all on {signature} from public, anon, authenticated", self.sql)
        self.assertIn(f"grant execute on {signature} to service_role", self.sql)


if __name__ == "__main__":
    unittest.main()
