import unittest
from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "supabase"
    / "migrations"
    / "20261011111108_replace_grantor_scholarship_announcement.sql"
)


class GrantorAnnouncementReplacementMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding="utf-8").lower()

    def test_replacement_is_created_before_the_previous_record_is_archived(self):
        insert_at = self.sql.index("insert into public.grantor_portal_announcements")
        archive_at = self.sql.index("update public.grantor_portal_announcements", insert_at)
        self.assertLess(insert_at, archive_at)

    def test_active_waitlist_records_follow_the_replacement(self):
        self.assertIn("update public.scholarship_waitlist_entries", self.sql)
        self.assertIn("update public.scholarship_waitlist_offers", self.sql)
        self.assertIn("status in ('queued', 'offered')", self.sql)

    def test_function_is_not_exposed_to_browser_roles(self):
        self.assertIn("from public, anon, authenticated", self.sql)
        self.assertIn("to service_role", self.sql)


if __name__ == "__main__":
    unittest.main()
