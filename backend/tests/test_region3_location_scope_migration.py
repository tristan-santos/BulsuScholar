from pathlib import Path
import json
import re
import unittest


class RegionThreeLocationScopeMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw_sql = Path("supabase/migrations/20261019045159_region3_grantor_location_scope.sql").read_text(encoding="utf-8")
        cls.sql = cls.raw_sql.lower()

    def test_policy_uses_structured_locations(self):
        self.assertIn("save_grantor_scope_policy_v2", self.sql)
        self.assertIn("'locations', normalized_locations", self.sql)
        self.assertIn("'province', trim(item->>'province')", self.sql)
        self.assertIn("'municipality', trim(item->>'municipality')", self.sql)
        self.assertIn("region3_catalog->trim(item->>'province')", self.sql)

    def test_database_catalog_matches_shared_catalog(self):
        match = re.search(r"region3_catalog jsonb := \$catalog\$(.*?)\$catalog\$::jsonb", self.raw_sql, re.DOTALL)
        self.assertIsNotNone(match)
        database_catalog = json.loads(match.group(1))
        shared_catalog = json.loads(Path("shared/region3Locations.json").read_text(encoding="utf-8"))
        self.assertEqual(shared_catalog, database_catalog)

    def test_scope_snapshot_matches_both_province_and_municipality(self):
        self.assertIn("item->>'province') = normalized_province", self.sql)
        self.assertIn("item->>'municipality') = normalized_municipality", self.sql)
        self.assertIn("when normalized_province = '' or normalized_municipality = '' then false", self.sql)

    def test_waitlist_rechecks_current_location_scope(self):
        self.assertIn("scope := public.grantor_scope_snapshot(entry_row.grantor_id, student_data)", self.sql)
        self.assertIn("then return 'location_out_of_scope'", self.sql)
        self.assertIn("'scopesnapshot', current_scope", self.sql)
        self.assertIn("scope_snapshot = current_scope", self.sql)

    def test_privileged_functions_are_service_role_only(self):
        signature = "public.save_grantor_scope_policy_v2(text, text, text, boolean, jsonb, text)"
        self.assertIn(f"revoke all on function {signature} from public, anon, authenticated", self.sql)
        self.assertIn(f"grant execute on function {signature} to service_role", self.sql)
        waitlist_signature = "public.resolve_waitlist_offer(text, text, text)"
        self.assertIn(f"revoke all on function {waitlist_signature} from public, anon, authenticated", self.sql)
        self.assertIn(f"grant execute on function {waitlist_signature} to service_role", self.sql)


if __name__ == "__main__":
    unittest.main()
