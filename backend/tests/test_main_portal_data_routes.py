import unittest

from backend.main import app


class PortalDataRouteRegistrationTests(unittest.TestCase):
    def test_portal_data_compatibility_routes_are_registered_as_post(self):
        schema = app.openapi()

        for path in (
            "/portal/data/query",
            "/portal/data/mutate",
            "/portal/data/delete",
        ):
            self.assertIn(path, schema["paths"])
            self.assertIn("post", schema["paths"][path])


if __name__ == "__main__":
    unittest.main()
