from pathlib import Path
import unittest


class NationwideLocationScopeMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = Path(
            "supabase/migrations/20261019060236_nationwide_grantor_location_scope.sql"
        ).read_text(encoding="utf-8").lower()

    def test_v3_policy_function_accepts_structured_locations(self):
        self.assertIn("save_grantor_scope_policy_v3", self.sql)
        self.assertIn("'locations', normalized_locations", self.sql)
        self.assertNotIn("scope_province_outside_region_iii", self.sql)

    def test_v3_policy_function_is_service_role_only(self):
        signature = "public.save_grantor_scope_policy_v3(text, text, text, boolean, jsonb, text)"
        self.assertIn(f"revoke all on function {signature}", self.sql)
        self.assertIn("from public, anon, authenticated", self.sql)
        self.assertIn(f"grant execute on function {signature}", self.sql)
        self.assertIn("to service_role", self.sql)


if __name__ == "__main__":
    unittest.main()
