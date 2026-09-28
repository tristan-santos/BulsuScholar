import base64
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from backend import student_profile_service as service


class StudentProfileRequirementTests(unittest.TestCase):
    def test_first_year_first_semester_rog_is_automatically_exempt(self):
        with patch.object(service, "_policy", return_value={"corMode": "cor_only"}):
            result = service._requirements({"year": "1"}, "2026-2027-1ST", "1ST")
        self.assertFalse(result["rogRequired"])
        self.assertEqual("first_year_first_semester", result["rogExemptionReason"])

    def test_first_year_second_semester_requires_rog(self):
        with patch.object(service, "_policy", return_value={"corMode": "cor_only"}):
            result = service._requirements({"year": "1"}, "2026-2027-2ND", "2ND")
        self.assertTrue(result["rogRequired"])
        self.assertEqual("", result["rogExemptionReason"])

    def test_upper_year_first_semester_requires_rog(self):
        with patch.object(service, "_policy", return_value={"corMode": "either"}):
            result = service._requirements({"year": "2"}, "2026-2027-1ST", "1ST")
        self.assertTrue(result["rogRequired"])
        self.assertEqual("student_id_required", result["identityRule"])

    def test_verification_summary_does_not_create_fake_rog_submission(self):
        with patch.object(service, "_data_rows", return_value=[]):
            summary = service._verification_summary("student-1", "cycle-1", {
                "rogRequired": False,
                "rogExemptionReason": "first_year_first_semester",
            })
        self.assertEqual("exempt", summary["rog"]["status"])
        self.assertNotIn("submissionId", summary["rog"])


class StudentProfileValidationTests(unittest.TestCase):
    def setUp(self):
        self.profile = {
            "fname": "Ana", "lname": "Santos", "email": "ana@example.com",
            "cpNumber": "09123456789", "birthDate": "2007-01-01",
            "guardianName": "Maria Santos", "guardianContact": "09112223333",
            "course": "BSIT", "year": "1", "section": "A",
            "permanentAddress": {
                "street": "1 Main", "barangay": "Poblacion", "city": "Bustos",
                "province": "Bulacan", "postalCode": "3007",
            },
        }

    def test_complete_profile_is_accepted(self):
        with patch.object(service, "_profile_photo_bytes", return_value=b"photo"):
            service._validate_profile(self.profile)

    def test_profile_photo_is_required(self):
        with patch.object(service, "_profile_photo_bytes", return_value=b""):
            with self.assertRaises(HTTPException) as raised:
                service._validate_profile(self.profile)
        self.assertEqual("profile_photo_required", raised.exception.detail["code"])

    def test_permanent_address_is_required(self):
        self.profile["permanentAddress"]["city"] = ""
        with patch.object(service, "_profile_photo_bytes", return_value=b"photo"), \
                self.assertRaises(HTTPException) as raised:
            service._validate_profile(self.profile)
        self.assertIn("permanentAddress.city", raised.exception.detail["fields"])

    def test_generated_profile_is_a_pdf(self):
        one_pixel_png = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
        )
        result = service._profile_pdf(self.profile, one_pixel_png)
        self.assertTrue(result.startswith(b"%PDF-"))


class StudentDocumentReviewTests(unittest.TestCase):
    def test_rejection_requires_a_reason_before_any_write(self):
        with patch.object(service, "_reviewer", return_value=("admin-1", {"role": "student_reviewer"})), \
                patch.object(service, "supabase_document_get") as get_record:
            with self.assertRaises(HTTPException) as raised:
                service.review_document_submission(object(), "submission-1", {"decision": "rejected"})
        self.assertEqual(422, raised.exception.status_code)
        get_record.assert_not_called()

    def test_reviewed_submission_is_immutable(self):
        with patch.object(service, "_reviewer", return_value=("admin-1", {"role": "student_reviewer"})), \
                patch.object(service, "supabase_document_get", return_value={
                    "row": {"id": "submission-1"}, "data": {"status": "approved"}
                }):
            with self.assertRaises(HTTPException) as raised:
                service.review_document_submission(object(), "submission-1", {"decision": "approved"})
        self.assertEqual(409, raised.exception.status_code)

    def test_invalid_cor_policy_is_rejected(self):
        with patch.object(service, "_reviewer", return_value=("admin-1", {"role": "full_admin"})):
            with self.assertRaises(HTTPException) as raised:
                service.update_document_policy(object(), {"corMode": "client_override"})
        self.assertEqual(422, raised.exception.status_code)

    def test_manual_review_policy_must_be_boolean(self):
        with patch.object(service, "_reviewer", return_value=("admin-1", {"role": "full_admin"})), \
                patch.object(service, "_policy", return_value={"corMode": "cor_only", "manualReviewEnabled": True}):
            with self.assertRaises(HTTPException) as raised:
                service.update_document_policy(object(), {"manualReviewEnabled": "no"})
        self.assertEqual(422, raised.exception.status_code)


if __name__ == "__main__":
    unittest.main()
