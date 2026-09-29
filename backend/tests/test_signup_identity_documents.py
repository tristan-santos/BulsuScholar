import unittest
from unittest.mock import patch

from fastapi import HTTPException

from backend import signup_service
from backend.signup_service import check_signup_availability, create_signup_document_batch


class MemoryUpload:
    def __init__(self, name, content_type, body=b"document"):
        self.filename = name
        self.content_type = content_type
        self._body = body

    async def read(self):
        return self._body


def cor_scan(year, cycle="2026-2027-1ST"):
    academic_year, semester = cycle.rsplit("-", 1)
    return {
        "isValidCorDocument": True,
        "documentTitle": "Certificate of Registration",
        "studentId": "20260001",
        "year": str(year),
        "academicYear": academic_year,
        "semester": semester,
    }


def rog_scan(cycle):
    academic_year, semester = cycle.rsplit("-", 1)
    return {
        "isValidCogDocument": True,
        "hasAcademicConcern": False,
        "academicYear": academic_year,
        "semester": semester,
    }


class SignupIdentityDocumentTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        signup_service._availability_requests.clear()

    def files(self):
        return (
            MemoryUpload("cor.pdf", "application/pdf"),
            MemoryUpload("rog.pdf", "application/pdf"),
            MemoryUpload("identity.jpg", "image/jpeg"),
        )

    def test_signup_year_accepts_only_years_one_through_four(self):
        self.assertEqual("1", signup_service._signup_year("Year 1"))
        self.assertEqual("4", signup_service._signup_year("4th Year"))
        self.assertEqual("", signup_service._signup_year("Year 5"))

    @patch("backend.signup_service.supabase_document_upsert", return_value={"ok": True})
    @patch("backend.signup_service._store_bytes", side_effect=lambda path, body, content_type: {"bucket": "private", "path": path, "size": len(body)})
    @patch("backend.signup_service._signup_document_policy", return_value={"corMode": "cor_only", "manualReviewEnabled": True})
    @patch("backend.signup_service.get_current_semester_tag", return_value="2026-2027-1ST")
    @patch("backend.signup_service.parse_pdf_document")
    async def test_first_year_first_semester_skips_rog_and_accepts_government_id(self, parse, _cycle, _policy, _store, _upsert):
        parse.return_value = cor_scan(1)
        cor, _rog, identity = self.files()
        result = await create_signup_document_batch("20260001", "student@example.com", "government_id", cor, identity)
        self.assertFalse(result["rogRequired"])
        self.assertEqual("1", result["year"])
        self.assertEqual("government_id", result["identityKind"])

    @patch("backend.signup_service.supabase_document_upsert", return_value={"ok": True})
    @patch("backend.signup_service._store_bytes", side_effect=lambda path, body, content_type: {"bucket": "private", "path": path, "size": len(body)})
    @patch("backend.signup_service._signup_document_policy", return_value={"corMode": "cor_only", "manualReviewEnabled": False})
    @patch("backend.signup_service.previous_semester_tag", return_value="2026-2027-1ST")
    @patch("backend.signup_service.get_current_semester_tag", return_value="2026-2027-2ND")
    @patch("backend.signup_service.parse_pdf_document")
    async def test_first_year_later_semester_requires_rog(self, parse, _cycle, _previous, _policy, _store, _upsert):
        parse.side_effect = [cor_scan(1, "2026-2027-2ND"), rog_scan("2026-2027-1ST")]
        cor, rog, identity = self.files()
        result = await create_signup_document_batch("20260001", "student@example.com", "previous_school_id", cor, identity, rog)
        self.assertTrue(result["rogRequired"])

    @patch("backend.signup_service._signup_document_policy", return_value={"corMode": "cor_only", "manualReviewEnabled": True})
    @patch("backend.signup_service.previous_semester_tag", return_value="2025-2026-2ND")
    @patch("backend.signup_service.get_current_semester_tag", return_value="2026-2027-1ST")
    @patch("backend.signup_service.parse_pdf_document")
    async def test_upper_year_rejects_non_student_id(self, parse, _cycle, _previous, _policy):
        parse.side_effect = [cor_scan(2), rog_scan("2025-2026-2ND")]
        cor, rog, identity = self.files()
        with self.assertRaises(HTTPException) as error:
            await create_signup_document_batch("20260001", "student@example.com", "government_id", cor, identity, rog)
        self.assertEqual("identity_document_not_allowed", error.exception.detail)

    @patch("backend.signup_service._signup_document_policy", return_value={"corMode": "cor_only", "manualReviewEnabled": True})
    @patch("backend.signup_service.get_current_semester_tag", return_value="2026-2027-1ST")
    @patch("backend.signup_service.parse_pdf_document")
    async def test_upper_year_requires_rog_before_identity_batch(self, parse, _cycle, _policy):
        parse.return_value = cor_scan(2)
        cor, _rog, identity = self.files()
        with self.assertRaises(HTTPException) as error:
            await create_signup_document_batch("20260001", "student@example.com", "student_id", cor, identity)
        self.assertEqual("missing_rog_document", error.exception.detail)

    @patch("backend.signup_service._delete_stored_bytes")
    @patch("backend.signup_service.supabase_document_upsert", return_value={"ok": False})
    @patch("backend.signup_service._store_bytes", side_effect=lambda path, body, content_type: {"bucket": "private", "path": path, "size": len(body)})
    @patch("backend.signup_service._signup_document_policy", return_value={"corMode": "cor_only", "manualReviewEnabled": True})
    @patch("backend.signup_service.get_current_semester_tag", return_value="2026-2027-1ST")
    @patch("backend.signup_service.parse_pdf_document")
    async def test_failed_batch_save_removes_uploaded_private_files(self, parse, _cycle, _policy, _store, _upsert, delete):
        parse.return_value = cor_scan(1)
        cor, _rog, identity = self.files()
        with self.assertRaises(HTTPException) as error:
            await create_signup_document_batch("20260001", "student@example.com", "government_id", cor, identity)
        self.assertEqual("signup_document_batch_save_failed", error.exception.detail)
        self.assertEqual(2, delete.call_count)
        deleted_paths = {call.args[0]["path"] for call in delete.call_args_list}
        self.assertTrue(any(path.endswith("/cor.pdf") for path in deleted_paths))
        self.assertTrue(any(path.endswith("/identity.jpg") for path in deleted_paths))

    @patch("backend.signup_service.supabase_document_get")
    def test_student_id_availability_checks_every_portal_id_table(self, get_record):
        get_record.side_effect = lambda table, _record_id: {"ok": True, "row": {"id": "20260001"}} if table == "providers" else {"ok": True, "row": None}
        result = check_signup_availability({"field": "studentId", "value": "2026-0001"}, "test-client")
        self.assertFalse(result["available"])
        self.assertEqual("already_in_use", result["reason"])

    @patch("backend.signup_service.first_existing_record")
    def test_phone_availability_normalizes_local_mobile_number(self, existing):
        existing.return_value = None
        result = check_signup_availability({"field": "phone", "value": "912 345 6789"}, "test-client")
        self.assertTrue(result["available"])
        checked_values = [call.args[0][0][1]["contact_number"] for call in existing.call_args_list]
        self.assertEqual(["09123456789", "9123456789"], checked_values)

    @patch("backend.signup_service.supabase_rpc", return_value={"ok": True, "data": True})
    def test_email_availability_uses_cross_portal_email_registry(self, rpc):
        result = check_signup_availability({"field": "email", "value": " Student@Example.com "}, "test-client")
        self.assertFalse(result["available"])
        self.assertEqual("student@example.com", rpc.call_args.args[1]["p_email"])


if __name__ == "__main__":
    unittest.main()
