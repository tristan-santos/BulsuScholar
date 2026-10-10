import unittest
from pathlib import Path


class AdminConfirmationResendMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = Path(
            "supabase/migrations/20261009070831_admin_student_confirmation_resend.sql"
        ).read_text(encoding="utf-8").lower()

    def test_claim_is_atomic_and_uses_original_signup_timestamp(self):
        self.assertIn("pg_advisory_xact_lock", self.sql)
        self.assertIn("for update", self.sql)
        self.assertIn("confirmationemaillastsentat", self.sql)
        self.assertIn("pending_data->>'createdat'", self.sql)
        self.assertIn("interval '5 minutes'", self.sql)

    def test_failed_delivery_releases_claim_without_advancing_cooldown(self):
        self.assertIn("pending_data := pending_data - 'confirmationemailresendclaim'", self.sql)
        self.assertIn("if coalesce(p_succeeded, false)", self.sql)

    def test_functions_are_service_role_only(self):
        self.assertEqual(2, self.sql.count("from public, anon, authenticated"))
        self.assertEqual(2, self.sql.count("to service_role"))


if __name__ == "__main__":
    unittest.main()
