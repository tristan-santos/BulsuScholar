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

    def test_province_must_be_in_region_three(self):
        with self.assertRaisesRegex(ValueError, "scope_province_outside_region_iii"):
            canonicalize_scope_locations([{"province": "Cavite", "municipality": "Bacoor"}])

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
        self.assertEqual([{"province": "Bulacan", "municipality": "Plaridel"}], legacy_scope_locations(["Plaridel"]))


if __name__ == "__main__":
    unittest.main()
