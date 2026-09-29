import unittest

from backend.document_scanner import extract_year, extract_year_from_positioned_words, parse_document


class DocumentScannerYearLevelTests(unittest.TestCase):
    def test_explicit_year_level_wins_over_academic_year(self):
        text = """
        Certificate of Registration
        Academic Year 2025-2026 2nd Semester
        College             BC - ICT Dept
        Program             Bachelor of Science in Information Technology
        Major
        Year Level          4th Year
        """
        self.assertEqual("4", extract_year(text))
        self.assertEqual("4", parse_document(text, "cor")["year"])

    def test_year_level_value_may_follow_label_on_next_line(self):
        text = "Academic Year 2025-2026\nYear Level\nFourth Year\n"
        self.assertEqual("4", extract_year(text))

    def test_academic_year_alone_is_not_a_year_level(self):
        self.assertEqual("", extract_year("Academic Year 2025-2026\nSecond Semester"))

    def test_numeric_year_section_remains_supported(self):
        self.assertEqual("3", extract_year("Year Level / Section: 3 - A"))

    def test_positioned_pdf_words_read_value_to_right_of_label(self):
        words = [
            {"text": "Academic", "x0": 20, "top": 10},
            {"text": "Year", "x0": 70, "top": 10},
            {"text": "2025-2026", "x0": 105, "top": 10},
            {"text": "2nd", "x0": 180, "top": 10},
            {"text": "Semester", "x0": 210, "top": 10},
            {"text": "Year", "x0": 20, "top": 80},
            {"text": "Level", "x0": 50, "top": 81},
            {"text": "4th", "x0": 150, "top": 80},
            {"text": "Year", "x0": 180, "top": 80},
        ]
        self.assertEqual("4", extract_year_from_positioned_words(words))


if __name__ == "__main__":
    unittest.main()
