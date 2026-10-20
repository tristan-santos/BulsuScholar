import io
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

from fastapi import HTTPException
from PIL import Image
from pypdf import PdfWriter

from backend import scholarship_requirement_service as service


def image_bytes():
    stream = io.BytesIO()
    Image.new("RGB", (2, 2)).save(stream, format="PNG")
    return stream.getvalue()


class RequirementValidationTests(unittest.TestCase):
    def test_canonical_key_matches_frontend(self):
        item = {"name": "Upload Valid ID/Student ID", "fileType": "PNG"}
        self.assertEqual(item, service._requirement({"otherRequirements": [item]}, "upload_valid_id_student_id"))

    def test_unknown_requirement_rejected(self):
        with self.assertRaises(HTTPException):
            service._requirement({"otherRequirements": [{"id": "other", "name": "Photo"}]}, "forged")

    def test_real_png_and_pdf_accepted(self):
        self.assertEqual(".png", service._validate_file(image_bytes(), "image/png", {"fileType": "PNG"}))
        stream = io.BytesIO()
        writer = PdfWriter()
        writer.add_blank_page(width=100, height=100)
        writer.write(stream)
        self.assertEqual(".pdf", service._validate_file(stream.getvalue(), "application/pdf", {}))

    def test_forged_mime_and_wrong_type_rejected(self):
        for body, mime, requirement in [(b"fake", "image/png", {"fileType": "PNG"}),
                                         (image_bytes(), "application/pdf", {}),
                                         (image_bytes(), "image/png", {"fileType": "PDF"})]:
            with self.subTest(mime=mime), self.assertRaises(HTTPException) as error:
                service._validate_file(body, mime, requirement)
            self.assertEqual(422, error.exception.status_code)

    def test_empty_and_oversized_files_rejected(self):
        for body in (b"", b"x" * (service.MAX_DOCUMENT_BYTES + 1)):
            with self.assertRaises(HTTPException) as error:
                service._validate_file(body, "image/png", {"fileType": "PNG"})
            self.assertEqual(413, error.exception.status_code)

    def test_foreign_students_and_grantors_cannot_access_application(self):
        def identity(_request, payload, _roles):
            payload.update(actorId="foreign", actorType=role)
        for role in ("student", "grantor"):
            with self.subTest(role=role), patch.object(service, "enforce_portal_scope", side_effect=identity), \
                    patch.object(service, "supabase_document_get", return_value={"ok": True, "row": {}, "data": {"studentId": "owner", "grantorId": "provider"}}):
                # Non-empty row mirrors the document adapter's existence signal.
                service.supabase_document_get.return_value["row"] = {"id": "application"}
                with self.assertRaises(HTTPException) as error:
                    service._application(object(), "application")
            self.assertEqual(403, error.exception.status_code)

    def test_authorized_content_uses_only_saved_file_reference(self):
        reference = {"id": "file", "path": "students/owner/other-requirements/application/file.png", "type": "image/png", "name": "photo.png"}
        app = {"studentId": "owner", "otherRequirementUploads": {"photo": {"files": [reference]}}}
        with patch.object(service, "_application", return_value=({}, app)), patch.object(service, "_read_storage", return_value=b"image") as read:
            response = service.requirement_file_content(object(), "application", "photo", "file")
        read.assert_called_once_with(reference)
        self.assertEqual("private, no-store", response.headers["Cache-Control"])
        self.assertEqual(b"image", response.body)

    def test_unregistered_file_or_foreign_path_cannot_be_read(self):
        for file in ({"id": "other"}, {"id": "file", "path": "students/foreign/other-requirements/file"}):
            with patch.object(service, "_application", return_value=({}, {"studentId": "owner", "otherRequirementUploads": {"photo": {"files": [file]}}})), \
                    patch.object(service, "_read_storage") as read, self.assertRaises(HTTPException):
                service.requirement_file_content(object(), "app", "photo", "file")
            read.assert_not_called()


class RequirementUploadTests(unittest.IsolatedAsyncioTestCase):
    async def upload(self, rpc_result=None, rpc_error=None, existing=None):
        file = Mock(filename="photo.png", content_type="image/png", read=AsyncMock(return_value=image_bytes()))
        app = {"studentId": "owner", "otherRequirements": [{"id": "photo", "name": "Photo", "fileType": "PNG"}], "otherRequirementUploads": existing or {}}
        with patch.object(service, "_application", return_value=({"actorId": "owner"}, app)), \
                patch.object(service, "_store_bytes", side_effect=lambda path, body, mime: {"bucket": "private", "path": path, "type": mime}) as store, \
                patch.object(service, "_delete_stored_bytes") as delete, \
                patch.object(service, "supabase_rpc", return_value=rpc_result or {"ok": True, "data": {"application": app}}, side_effect=rpc_error) as rpc:
            try:
                result = await service.upload_requirement_files(object(), "app", "photo", [file])
                return result, store, delete, rpc, file
            except HTTPException as error:
                return error, store, delete, rpc, file

    async def test_success_uses_private_server_storage_and_atomic_rpc(self):
        result, store, delete, rpc, file = await self.upload()
        self.assertTrue(result["ok"])
        self.assertTrue(store.call_args.args[0].startswith("students/owner/other-requirements/app/"))
        self.assertEqual("append_scholarship_requirement_files", rpc.call_args.args[0])
        self.assertTrue(rpc.call_args.args[1]["p_files"][0]["url"].startswith("/scholarship-applications/app/"))
        file.read.assert_awaited_once_with(service.MAX_DOCUMENT_BYTES + 1)
        delete.assert_not_called()

    async def test_limit_conflict_cleans_only_new_upload(self):
        result, _, delete, _, _ = await self.upload(rpc_result={"ok": False, "reason": "requirement_upload_limit_reached"})
        self.assertEqual(409, result.status_code)
        delete.assert_called_once()

    async def test_closed_application_cleans_new_upload(self):
        result, _, delete, _, _ = await self.upload(rpc_result={"ok": False, "reason": "application_closed"})
        self.assertEqual(409, result.status_code)
        delete.assert_called_once()

    async def test_full_requirement_does_not_upload(self):
        result, store, _, rpc, _ = await self.upload(existing={"photo": {"files": [{"id": "existing"}]}})
        self.assertEqual(409, result.status_code)
        store.assert_not_called()
        rpc.assert_not_called()

    async def test_unknown_commit_outcome_preserves_potentially_referenced_files(self):
        result, _, delete, _, _ = await self.upload(rpc_error=TimeoutError())
        self.assertEqual(503, result.status_code)
        delete.assert_not_called()


class RequirementMigrationContractTests(unittest.TestCase):
    def test_atomic_append_preserves_existing_workflow_and_privileges(self):
        sql = (Path(__file__).resolve().parents[2] / "supabase/migrations/20261020120000_private_scholarship_requirement_uploads.sql").read_text()
        for token in ("for update", "pg_advisory_xact_lock(734821, 1)", "existing_files || p_files",
                      "public.update_scholarship_application_documents", "requirement_upload_limit_reached",
                      "security invoker", "from public, anon, authenticated", "to service_role"):
            self.assertIn(token, sql)
        self.assertNotIn("delete from", sql.lower())
