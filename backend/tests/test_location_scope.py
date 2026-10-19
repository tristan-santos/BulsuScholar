import unittest

from backend.location_scope import (
    canonicalize_scope_locations,
    legacy_scope_locations,
    normalize_location,
)


class LocationScopeTests(unittest.TestCase):
    def test_valid_multiple_region_three_locations_are_canonicalized(self):
        result = canonicalize_scope_locations([
            {"province": "bulacan", "municipality": "Baliwag"},
            {"province": "Pampanga", "municipality": "San Luis"},
        ])
        self.assertEqual([
            {"province": "Bulacan", "municipality": "Baliuag"},
            {"province": "Pampanga", "municipality": "San Luis"},
        ], result)

    def test_municipality_must_belong_to_selected_province(self):
        with self.assertRaisesRegex(ValueError, "scope_municipality_province_mismatch"):
            canonicalize_scope_locations([{"province": "Bulacan", "municipality": "Angeles City"}])

    def test_other_regions_are_supported(self):
        self.assertEqual(
            [{"province": "Cavite", "municipality": "Bacoor City"}],
            canonicalize_scope_locations([{"province": "Cavite", "municipality": "Bacoor"}]),
        )

    def test_unknown_province_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "scope_province_not_supported"):
            canonicalize_scope_locations([{"province": "Atlantis", "municipality": "Central"}])

    def test_duplicate_aliases_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "duplicate_scope_location"):
            canonicalize_scope_locations([
                {"province": "Bulacan", "municipality": "Baliuag"},
                {"province": "Bulacan", "municipality": "Baliwag"},
            ])

    def test_normalization_ignores_city_words_punctuation_and_accents(self):
        self.assertEqual("san jose del monte", normalize_location("City of San José del Monte"))

    def test_legacy_ambiguous_municipality_is_not_guessed(self):
        self.assertEqual([], legacy_scope_locations(["San Luis"]))
        self.assertEqual(
            [{"province": "Aurora", "municipality": "Maria Aurora"}],
            legacy_scope_locations(["Maria Aurora"]),
        )


if __name__ == "__main__":
    unittest.main()
