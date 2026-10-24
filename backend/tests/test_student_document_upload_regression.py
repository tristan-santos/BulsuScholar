import unittest
from unittest.mock import AsyncMock, Mock, patch

from fastapi import HTTPException

from backend import student_profile_service as service
from backend.tests.pdf_fixtures import valid_pdf


class AutomaticDocumentReviewRegressionTests(unittest.TestCase):
    def test_approval_changes_only_fields_allowed_by_existing_immutable_guard(self):
        mutable = {"status", "rejectionReason", "reviewNotes", "fieldErrors", "reviewedBy", "reviewedAt", "updatedAt"}
        for document_type in ("cor", "rog", "identity"):
            with self.subTest(document_type=document_type):
                submission = {"studentId": "student-1", "documentType": document_type, "status": "pending", "file": {"path": "original"}}

                def guarded_update(table, _id, changes):
                    if table == "student_document_submissions":
                        self.assertTrue(set(changes).issubset(mutable))
                    return {"ok": True}

                with patch.object(service, "supabase_document_update", side_effect=guarded_update), \
                        patch.object(service, "supabase_document_upsert", return_value={"ok": True}), \
                        patch.object(service, "_require_student", return_value={}), \
                        patch.object(service, "_cycle", return_value=("cycle", "1ST")), \
                        patch.object(service, "_apply_approved_cor_academics"), \
                        patch.object(service, "_sync_verification", return_value={}), \
                        patch.object(service, "_notify_once"), \
                        patch.object(service, "_notify_next_requirement"), \
                        patch.object(service, "create_log"):
                    approved = service._system_approve_submission("existing", submission, {})
                self.assertEqual("approved", approved["status"])
                self.assertEqual({"path": "original"}, approved["file"])

    def test_student_cannot_preview_another_students_document(self):
        request = Mock(headers={"x-portal-actor-type": "student", "x-portal-actor-id": "student-1"})
        with patch.object(service, "supabase_document_get", return_value={"ok": True, "row": {"id": "doc"}, "data": {"studentId": "student-2"}}), \
                patch.object(service, "_student_id", return_value="student-1"), \
                patch.object(service, "_read_storage") as read:
            with self.assertRaises(HTTPException) as error:
                service.document_content(request, "doc")
        self.assertEqual(403, error.exception.status_code)
        read.assert_not_called()

    def test_student_can_preview_their_own_pending_upload(self):
        request = Mock(headers={"x-portal-actor-type": "student", "x-portal-actor-id": "student-1"})
        submission = {"studentId": "student-1", "status": "pending", "name": "cor.pdf", "file": {"path": "saved", "type": "application/pdf"}}
        with patch.object(service, "supabase_document_get", return_value={"ok": True, "row": {"id": "doc"}, "data": submission}), \
                patch.object(service, "_student_id", return_value="student-1"), \
                patch.object(service, "_read_storage", return_value=b"pdf"):
            response = service.document_content(request, "doc")
        self.assertEqual(b"pdf", response.body)
        self.assertEqual("application/pdf", response.media_type)


class StudentUploadPersistenceRegressionTests(unittest.IsolatedAsyncioTestCase):
    async def run_upload(self, document_type, *, save_ok=True, approve_ok=True):
        upload = Mock(filename="document.pdf", content_type="application/pdf")
        upload.read = AsyncMock(return_value=valid_pdf())
        stored = {"bucket": "private", "path": "new-file", "type": "application/pdf"}
        calls = []
        saved = []

        def save(_table, _id, data, **_kwargs):
            saved.append(dict(data))
            return {"ok": save_ok}

        def approve(_id, data, _student):
            calls.append("approve")
            if not approve_ok:
                raise HTTPException(status_code=503, detail="automatic_document_review_failed")
            return {**data, "status": "approved"}

        def update(_table, _id, changes):
            calls.append("pointer")
            self.assertEqual("approved", next(iter(changes.values()))["reviewStatus"])
            return {"ok": True}

        with patch.object(service, "_student_id", return_value="student-1"), \
                patch.object(service, "_require_student", return_value={"year": "2"}), \
                patch.object(service, "_cycle", return_value=("cycle", "1ST")), \
                patch.object(service, "_requirements", return_value={"corMode": "cor_only"}), \
                patch.object(service, "parse_pdf_document", return_value={"isValidCorDocument": True, "isValidCogDocument": True, "documentTitle": "Certificate of Registration"}), \
                patch.object(service, "_data_rows", return_value=[]), \
                patch.object(service, "_store_bytes", return_value=stored), \
                patch.object(service, "_delete_stored_bytes") as cleanup, \
                patch.object(service, "supabase_document_upsert", side_effect=save), \
                patch.object(service, "supabase_document_update", side_effect=update), \
                patch.object(service, "_system_approve_submission", side_effect=approve):
            if save_ok and approve_ok:
                result = await service.upload_student_document(object(), document_type, upload, "student_id")
                self.assertEqual("approved", result["submission"]["status"])
            else:
                with self.assertRaises(HTTPException):
                    await service.upload_student_document(object(), document_type, upload, "student_id")
            if not save_ok:
                cleanup.assert_called_once_with(stored)
        return calls, saved

    async def test_replacements_store_completion_metadata_before_immutable_review(self):
        for kind in ("cor", "rog", "identity"):
            calls, saved = await self.run_upload(kind)
            self.assertEqual(["approve", "pointer"], calls)
            self.assertEqual("automatic_document_validation", saved[0]["completionSource"])

    async def test_failed_submission_save_preserves_previous_document_pointer(self):
        calls, _ = await self.run_upload("identity", save_ok=False)
        self.assertEqual([], calls)

    async def test_failed_approval_preserves_previous_document_pointer(self):
        calls, _ = await self.run_upload("identity", approve_ok=False)
        self.assertEqual(["approve"], calls)
