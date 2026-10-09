import io
import unittest
from unittest.mock import patch

import pdfplumber
from fastapi import HTTPException
from PIL import Image, ImageDraw

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
            "college": "CICS", "course": "BSIT", "year": "1", "section": "A",
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

    def test_street_and_postal_code_are_optional(self):
        self.profile["permanentAddress"]["street"] = ""
        self.profile["permanentAddress"]["postalCode"] = ""
        with patch.object(service, "_profile_photo_bytes", return_value=b"photo"):
            service._validate_profile(self.profile)

    def test_college_must_match_the_official_template_options(self):
        self.profile["college"] = "Unknown"
        with patch.object(service, "_profile_photo_bytes", return_value=b"photo"), \
                self.assertRaises(HTTPException) as raised:
            service._validate_profile(self.profile)
        self.assertEqual("invalid_college", raised.exception.detail["code"])

    def test_future_birth_date_is_rejected(self):
        self.profile["birthDate"] = "2999-01-01"
        with patch.object(service, "_profile_photo_bytes", return_value=b"photo"), \
                self.assertRaises(HTTPException) as raised:
            service._validate_profile(self.profile)
        self.assertEqual("invalid_birth_date", raised.exception.detail["code"])

    def test_locked_profile_fields_always_come_from_student_record(self):
        student = {"email": "official@example.com", "cpNumber": "09111111111", "course": "BSIT", "year": "2", "section": "B"}
        supplied = {"email": "attacker@example.com", "cpNumber": "09999999999", "course": "Other", "year": "5", "section": "Z", "fname": "Updated"}
        result = service._merge_profile_input(student, supplied)
        self.assertEqual("official@example.com", result["email"])
        self.assertEqual("09111111111", result["cpNumber"])
        self.assertEqual("BSIT", result["course"])
        self.assertEqual("2", result["year"])
        self.assertEqual("B", result["section"])
        self.assertEqual("Updated", result["fname"])

    @staticmethod
    def _image_bytes(width: int, height: int, *, signature: bool = False) -> bytes:
        image = Image.new("RGBA", (width, height), (255, 255, 255, 0) if signature else (220, 238, 229, 255))
        if signature:
            ImageDraw.Draw(image).line((8, height - 12, width // 3, 8, width - 8, height // 2), fill=(16, 42, 34, 255), width=4)
        output = io.BytesIO()
        image.save(output, format="PNG")
        return output.getvalue()

    def test_generated_profile_uses_official_template_and_a4_geometry(self):
        photo = self._image_bytes(600, 800)
        signature = self._image_bytes(420, 120, signature=True)
        with patch.object(service, "_profile_photo_bytes", return_value=photo):
            result = service._profile_pdf(self.profile, signature)
        self.assertTrue(result.startswith(b"%PDF-"))

        generated = service.PdfReader(io.BytesIO(result))
        template = service.PdfReader(str(service.PROFILE_TEMPLATE_PATH))
        self.assertEqual(1, len(generated.pages))
        self.assertAlmostEqual(float(template.pages[0].mediabox.width), float(generated.pages[0].mediabox.width), places=2)
        self.assertAlmostEqual(float(template.pages[0].mediabox.height), float(generated.pages[0].mediabox.height), places=2)

        text = generated.pages[0].extract_text() or ""
        self.assertIn("SCHOLARSHIP AND", text)
        self.assertIn("FINANCIAL ASSISTANCE", text)
        self.assertIn("APPLICANT’S PROFILE", text)
        self.assertIn("SANTOS, ANA", text)
        self.assertIn("ana@example.com", text)
        self.assertIn("TYPE OF SCHOLARSHIP", text)
        self.assertNotIn("BulsuScholar official application profile export", text)

        with pdfplumber.open(io.BytesIO(result)) as rendered:
            page = rendered.pages[0]
            photo_image = next(image for image in page.images if abs(float(image["width"]) - 144.0) < 0.1)
            self.assertAlmostEqual(392.25, float(photo_image["x0"]), places=2)
            self.assertAlmostEqual(90.85, float(photo_image["top"]), places=2)
            self.assertAlmostEqual(234.85, float(photo_image["bottom"]), places=2)

            signature_image = next(image for image in page.images if abs(float(image["x0"]) - 65.0) < 0.1)
            self.assertGreaterEqual(float(signature_image["top"]), 681.0)
            self.assertLessEqual(float(signature_image["bottom"]), 728.0)

            words = page.extract_words(x_tolerance=1, y_tolerance=1)
            surname = next(word for word in words if word["text"] == "SANTOS,")
            email = next(word for word in words if word["text"] == "ana@example.com")
            self.assertTrue(284.0 <= float(surname["top"]) <= 301.0)
            self.assertTrue(315.0 <= float(email["top"]) <= 332.0)
            self.assertTrue(any(word["text"] == "☐X" for word in words))

    def test_profile_preview_keeps_template_and_adds_draft_watermark(self):
        photo = self._image_bytes(600, 800)
        signature = self._image_bytes(420, 120, signature=True)
        with patch.object(service, "_profile_photo_bytes", return_value=photo):
            result = service._profile_pdf(self.profile, signature, preview=True)
        text = service.PdfReader(io.BytesIO(result)).pages[0].extract_text() or ""
        self.assertIn("APPLICANT’S PROFILE", text)
        self.assertIn("DRAFT PREVIEW", text)


class StudentDocumentReviewTests(unittest.TestCase):
    def test_latest_profile_submission_is_selected_globally_across_cycles(self):
        rows = [
            {"id": "old", "studentId": "student-1", "documentType": "profile", "academicCycle": "2025", "version": 9, "submittedAt": "2026-09-01T00:00:00Z"},
            {"id": "new", "studentId": "student-1", "documentType": "profile", "academicCycle": "2026", "version": 1, "submittedAt": "2026-10-01T00:00:00Z"},
            {"id": "other", "studentId": "student-2", "documentType": "profile", "academicCycle": "2025", "version": 2, "submittedAt": "2026-08-01T00:00:00Z"},
        ]
        latest = service._latest_profile_submissions(rows)
        self.assertEqual("new", latest["student-1"]["id"])
        self.assertEqual("other", latest["student-2"]["id"])

    @patch.object(service, "create_log")
    @patch.object(service, "supabase_document_update", return_value={"ok": True})
    def test_resubmission_supersedes_only_older_pending_profile_requests(self, update, _log):
        service._supersede_pending_profile_submissions([
            {"id": "pending-old", "status": "pending", "profileRevisionId": "revision-old"},
            {"id": "approved-old", "status": "approved", "profileRevisionId": "revision-approved"},
            {"id": "replacement", "status": "pending", "profileRevisionId": "revision-new"},
        ], "replacement")

        self.assertEqual(2, update.call_count)
        self.assertEqual(("student_document_submissions", "pending-old"), update.call_args_list[0].args[:2])
        self.assertEqual("superseded", update.call_args_list[0].args[2]["status"])
        self.assertEqual(("student_profile_revisions", "revision-old"), update.call_args_list[1].args[:2])

    def test_admin_queue_returns_one_latest_profile_and_keeps_other_documents(self):
        old_profile = {
            "id": "profile-old", "studentId": "student-1", "documentType": "profile",
            "status": "approved", "version": 1, "submittedAt": "2026-09-01T00:00:00Z",
        }
        new_profile = {
            "id": "profile-new", "studentId": "student-1", "documentType": "profile",
            "status": "pending", "version": 2, "submittedAt": "2026-10-01T00:00:00Z",
        }
        cor = {
            "id": "cor-1", "studentId": "student-1", "documentType": "cor",
            "status": "pending", "version": 1, "submittedAt": "2026-09-15T00:00:00Z",
        }
        with patch.object(service, "_reviewer", return_value=("admin-1", {"role": "full_admin"})), \
                patch.object(service, "_data_rows", side_effect=[[old_profile, new_profile, cor], [old_profile, new_profile]]), \
                patch.object(service, "supabase_document_get", return_value={"row": {"id": "student-1"}, "data": {"fname": "Ana", "lname": "Santos", "year": "2", "course": "BSIT"}}), \
                patch.object(service, "_policy", return_value={"corMode": "cor_only", "manualReviewEnabled": True}):
            result = service.list_document_review_queue(object())

        self.assertEqual({"cor-1", "profile-new"}, {item["id"] for item in result["submissions"]})
        self.assertEqual(1, sum(item["documentType"] == "profile" for item in result["submissions"]))

    def test_profile_status_filter_is_applied_after_latest_selection(self):
        rows = [
            {"id": "profile-old", "studentId": "student-1", "documentType": "profile", "status": "approved", "version": 1, "submittedAt": "2026-09-01T00:00:00Z"},
            {"id": "profile-new", "studentId": "student-1", "documentType": "profile", "status": "pending", "version": 2, "submittedAt": "2026-10-01T00:00:00Z"},
        ]
        with patch.object(service, "_reviewer", return_value=("admin-1", {"role": "full_admin"})), \
                patch.object(service, "_data_rows", return_value=rows), \
                patch.object(service, "_policy", return_value={"corMode": "cor_only", "manualReviewEnabled": True}):
            result = service.list_document_review_queue(object(), status="approved", document_type="profile")
        self.assertEqual([], result["submissions"])

    def test_stale_profile_review_is_rejected_as_superseded(self):
        old = {
            "id": "profile-old", "studentId": "student-1", "documentType": "profile",
            "status": "pending", "version": 1, "submittedAt": "2026-09-01T00:00:00Z",
        }
        new = {
            "id": "profile-new", "studentId": "student-1", "documentType": "profile",
            "status": "pending", "version": 2, "submittedAt": "2026-10-01T00:00:00Z",
        }
        with patch.object(service, "_reviewer", return_value=("admin-1", {"role": "full_admin"})), \
                patch.object(service, "supabase_document_get", return_value={"row": {"id": "profile-old"}, "data": old}), \
                patch.object(service, "_data_rows", return_value=[old, new]), \
                patch.object(service, "supabase_document_update") as update:
            with self.assertRaises(HTTPException) as raised:
                service.review_document_submission(object(), "profile-old", {"decision": "approved"})
        self.assertEqual(409, raised.exception.status_code)
        self.assertEqual("profile_submission_superseded", raised.exception.detail)
        update.assert_not_called()

    @patch.object(service, "create_log")
    @patch.object(service, "supabase_rest_insert", return_value={"ok": True})
    @patch.object(service, "supabase_document_get", return_value={"ok": True, "row": None})
    @patch.object(service, "supabase_document_update", return_value={"ok": True})
    @patch.object(service, "_require_review_student", return_value=({"course": "Old", "year": "1", "section": "A", "email": "fixed@example.com", "cpNumber": "09111111111"}, "students"))
    @patch.object(service, "_cycle", return_value=("2026-2027-1ST", "1ST"))
    def test_approved_current_cycle_cor_updates_only_academic_fields(self, _cycle, _student, update, _draft, history, _log):
        submission = {
            "id": "cor-1", "documentType": "cor", "academicCycle": "2026-2027-1ST",
            "scan": {"studentId": "20260001", "academicYear": "2026-2027", "semester": "1ST", "course": "BSIT", "year": "2", "section": "B"},
        }
        changed = service._apply_approved_cor_academics("20260001", "students", submission, "admin-1")
        self.assertEqual({"course", "year", "section"}, set(changed))
        student_update = update.call_args_list[0].args[2]
        self.assertEqual("BSIT", student_update["course"])
        self.assertNotIn("email", student_update)
        self.assertNotIn("cpNumber", student_update)
        history.assert_called_once()

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
