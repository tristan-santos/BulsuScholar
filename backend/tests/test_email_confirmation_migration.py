import unittest
from pathlib import Path


class EmailConfirmationMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = Path(
            "supabase/migrations/20261009040000_fix_email_confirmation_pending_review.sql"
        ).read_text(encoding="utf-8").lower()

    def test_confirmation_keeps_student_pending_for_admin_review(self):
        self.assertIn("update public.pending_students", self.sql)
        self.assertIn("'accountreviewstatus', 'pending'", self.sql)
        self.assertNotIn("assign_authoritative_roster_scholarship", self.sql)
        self.assertNotIn("delete from public.pending_students", self.sql)

    def test_confirmation_function_is_service_role_only(self):
        self.assertIn("from public, anon, authenticated", self.sql)
        self.assertIn("to service_role", self.sql)


if __name__ == "__main__":
    unittest.main()
