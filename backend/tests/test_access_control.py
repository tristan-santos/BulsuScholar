import unittest

from backend.access_control import _required_admin_permissions


class AdminPermissionTests(unittest.TestCase):
    def test_sensitive_admin_route_groups_have_permissions(self):
        self.assertEqual({"reports"}, _required_admin_permissions("/reports/pdf"))
        self.assertEqual({"grantors"}, _required_admin_permissions("/workflows/admin/grantors/archive-state"))
        self.assertEqual({"students"}, _required_admin_permissions("/admin/check-student-duplicates"))
        self.assertEqual({"requirements"}, _required_admin_permissions("/workflows/materials/update"))

    def test_general_notification_route_has_no_section_restriction(self):
        self.assertEqual(set(), _required_admin_permissions("/notifications/admin/update"))


if __name__ == "__main__":
    unittest.main()
