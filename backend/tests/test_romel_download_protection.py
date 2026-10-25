import asyncio
import io
import json
import unittest
from unittest.mock import patch

import pyzipper
from fastapi import HTTPException, UploadFile
from pypdf import PdfReader
from starlette.requests import Request

from backend import download_protection as protection
from backend import main
from backend import student_profile_service as profiles
from backend import scholarship_requirement_service as requirements
from backend import scope_announcement_waitlist_service as applicants
from backend.tests.pdf_fixtures import valid_pdf

PASSWORD = "AbCD_123" * 3


def request(role="student", actor="s1"):
    result = Request({"type": "http", "method": "POST", "path": "/download", "headers": [
        (b"x-portal-actor-type", role.encode()), (b"x-portal-actor-id", actor.encode())]})
    # Unit fixture: resource authorization remains exercised inside document_content.
    result.state.mpin_identity = {"id": actor, "type": role}
    return result


class RomelProtectionTests(unittest.TestCase):
    def test_pdf_is_explicit_aes256(self):
        body, mime, name, method = protection.encrypt_download(valid_pdf(), "application/pdf", PASSWORD)
        reader = PdfReader(io.BytesIO(body))
        self.assertTrue(reader.is_encrypted)
        self.assertEqual(256, reader.trailer["/Encrypt"]["/Length"])
        self.assertEqual(6, reader.trailer["/Encrypt"]["/R"])
        self.assertEqual((mime, name, method), ("application/pdf", "protected-document.pdf", "pdf-aes-256"))

    def test_pdf_rejects_wrong_or_missing_password(self):
        body, *_ = protection.encrypt_download(valid_pdf(), "application/pdf", PASSWORD)
        for password in ("", "wrong"):
            reader = PdfReader(io.BytesIO(body))
            self.assertFalse(reader.decrypt(password))
            with self.assertRaises(Exception):
                len(reader.pages)

    def test_pdf_opens_with_correct_password_and_preserves_page(self):
        original = valid_pdf()
        body, *_ = protection.encrypt_download(original, "application/pdf", PASSWORD)
        self.assertEqual(1, len(PdfReader(io.BytesIO(body), password=PASSWORD).pages))
        self.assertFalse(PdfReader(io.BytesIO(original)).is_encrypted)

    def test_encryption_does_not_flatten_editable_pdf_fields(self):
        from pypdf import PdfWriter
        from pypdf.generic import ArrayObject, DictionaryObject, NameObject, TextStringObject
        writer = PdfWriter()
        writer.add_blank_page(width=612, height=792)
        field = DictionaryObject({NameObject("/FT"): NameObject("/Tx"), NameObject("/T"): TextStringObject("student_field"), NameObject("/V"): TextStringObject("editable")})
        writer._root_object[NameObject("/AcroForm")] = DictionaryObject({NameObject("/Fields"): ArrayObject([writer._add_object(field)])})
        original = io.BytesIO()
        writer.write(original)
        protected, *_ = protection.encrypt_download(original.getvalue(), "application/pdf", PASSWORD)
        fields = PdfReader(io.BytesIO(protected), password=PASSWORD).get_fields()
        self.assertEqual("/Tx", fields["student_field"]["/FT"])
        self.assertEqual("editable", fields["student_field"]["/V"])

    def test_archive_aes256_preserves_originals(self):
        for mime, content in [("text/csv", b"name,grade\r\n'=1+1,1.25"), ("image/png", b"image-original"),
                              ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", b"excel-original")]:
            with self.subTest(mime=mime):
                body, mime, name, method = protection.encrypt_download(content, mime, PASSWORD)
                with pyzipper.AESZipFile(io.BytesIO(body)) as archive:
                    info = archive.infolist()[0]
                    self.assertEqual(3, info.wz_aes_strength)
                    self.assertTrue(info.flag_bits & 1)
                    for password in (None, b"wrong"):
                        with self.assertRaises(RuntimeError):
                            archive.read(info.filename, pwd=password)
                    self.assertEqual(content, archive.read(info.filename, pwd=PASSWORD.encode()))
                self.assertEqual((mime, name, method), ("application/zip", "protected-document.zip", "zip-aes-256"))

    def test_signed_pdf_is_not_rewritten(self):
        from pypdf import PdfWriter
        from pypdf.generic import DictionaryObject, NameObject
        writer = PdfWriter(clone_from=PdfReader(io.BytesIO(valid_pdf())))
        writer._root_object[NameObject("/Perms")] = DictionaryObject({NameObject("/DocMDP"): DictionaryObject()})
        certificate_marker = io.BytesIO()
        writer.write(certificate_marker)
        for original in (valid_pdf() + b"\n% /ByteRange signed-original-test-marker\n", certificate_marker.getvalue()):
            body, mime, *_ = protection.encrypt_download(original, "application/pdf", PASSWORD)
            self.assertEqual("application/zip", mime)
            with pyzipper.AESZipFile(io.BytesIO(body)) as archive:
                self.assertEqual(original, archive.read("document.pdf", pwd=PASSWORD.encode()))

    def test_explicit_original_archive_is_byte_identical(self):
        original = valid_pdf()
        body, *_ = protection.encrypt_download(original, "application/pdf", PASSWORD, preserve_original=True)
        with pyzipper.AESZipFile(io.BytesIO(body)) as archive:
            self.assertEqual(original, archive.read("document.pdf", pwd=PASSWORD.encode()))

    def test_encrypted_original_can_be_archived_without_its_old_password(self):
        original, *_ = protection.encrypt_download(valid_pdf(), "application/pdf", PASSWORD)
        body, mime, *_ = protection.encrypt_download(original, "application/pdf", "Z" * 32)
        self.assertEqual("application/zip", mime)
        with pyzipper.AESZipFile(io.BytesIO(body)) as archive:
            self.assertEqual(original, archive.read("document.pdf", pwd=b"Z" * 32))

    def test_password_required_for_old_clients(self):
        for payload in ({}, {"downloadProtection": {}}, {"downloadProtection": {"password": "student-id"}}, {"downloadProtection": {"password": 42}}):
            with self.assertRaises(HTTPException) as error:
                protection.protection_password(payload)
            self.assertEqual(422, error.exception.status_code)
            self.assertEqual("download_protection_required", error.exception.detail["code"])

    def test_audit_failure_withholds_file(self):
        with patch.object(protection, "supabase_rest_insert", return_value={"ok": False}):
            with self.assertRaises(HTTPException) as error:
                protection.protected_response(request(), {"downloadProtection": {"password": PASSWORD}}, valid_pdf(), "application/pdf", "submission:version-1")
        self.assertEqual("download_audit_unavailable", error.exception.detail)

    def test_protection_failure_has_safe_audit_and_no_fallback(self):
        with patch.object(protection, "encrypt_download", side_effect=RuntimeError(PASSWORD)), \
                patch.object(protection, "supabase_rest_insert", return_value={"ok": True}) as insert:
            with self.assertRaises(HTTPException) as error:
                protection.protected_response(request(), {"downloadProtection": {"password": PASSWORD}}, b"private", "application/pdf", "submission:version-1")
        self.assertEqual("download_protection_failed", error.exception.detail)
        self.assertNotIn(PASSWORD, json.dumps(insert.call_args.args))
        self.assertEqual("failed", insert.call_args.args[1]["outcome"])

    def test_headers_filename_and_audit_contain_no_password(self):
        import hashlib
        original = valid_pdf()
        with patch.object(protection, "supabase_rest_insert", return_value={"ok": True}) as insert:
            response = protection.protected_response(request(), {"downloadProtection": {"password": PASSWORD}}, original, "application/pdf", "submission:version-1")
        self.assertEqual("private, no-store", response.headers["cache-control"])
        self.assertEqual("nosniff", response.headers["x-content-type-options"])
        self.assertNotIn(PASSWORD, str(response.headers) + json.dumps(insert.call_args.args))
        self.assertEqual(hashlib.sha256(original).hexdigest(), insert.call_args.args[1]["resource_version"])

    def test_password_assisted_processing_retains_original(self):
        original, *_ = protection.encrypt_download(valid_pdf(), "application/pdf", PASSWORD)
        processed = protection.processing_pdf(original, PASSWORD)
        self.assertFalse(PdfReader(io.BytesIO(processed)).is_encrypted)
        self.assertTrue(PdfReader(io.BytesIO(original)).is_encrypted)

    def test_password_assisted_processing_rejects_wrong_and_missing(self):
        encrypted, *_ = protection.encrypt_download(valid_pdf(), "application/pdf", PASSWORD)
        for password, reason in [("", "file_password_required"), ("wrong", "file_password_incorrect")]:
            with self.assertRaises(HTTPException) as error:
                protection.processing_pdf(encrypted, password)
            self.assertEqual(reason, error.exception.detail)

    def test_malformed_pdf_rejected(self):
        with self.assertRaises(HTTPException) as error:
            protection.processing_pdf(b"not a PDF", "")
        self.assertEqual("invalid_pdf_document", error.exception.detail)

    def test_password_mapping_validation(self):
        self.assertEqual({"0": "one", "1": "two"}, protection.parse_file_passwords('{"0":"one","1":"two"}'))
        for value in ("not json", "[]", '{"0":42}'):
            with self.assertRaises(HTTPException):
                protection.parse_file_passwords(value)

    def test_download_does_not_mark_signup_preview(self):
        submission = {"studentId": "s1", "source": "student_signup", "file": {"type": "application/pdf"}, "name": "private.pdf"}
        with patch.object(profiles, "supabase_document_get", return_value={"row": {"id": "doc"}, "data": submission}), \
                patch.object(profiles, "require_admin_bearer", return_value=({}, {"role": "full_admin"})), \
                patch.object(profiles, "_read_storage", return_value=valid_pdf()), \
                patch.object(profiles, "supabase_document_insert") as preview_audit, \
                patch.object(protection, "supabase_rest_insert", return_value={"ok": True}):
            main.protected_document_endpoint("doc", request("admin", "a1"), {"downloadProtection": {"password": PASSWORD}})
        preview_audit.assert_not_called()

    def test_cross_student_download_denied_before_storage_read(self):
        with patch.object(profiles, "supabase_document_get", return_value={"row": {"id": "doc"}, "data": {"studentId": "s2"}}), \
                patch.object(profiles, "_student_id", return_value="s1"), patch.object(profiles, "_read_storage") as read:
            with self.assertRaises(HTTPException) as error:
                main.protected_document_endpoint("doc", request(), {"downloadProtection": {"password": PASSWORD}})
        self.assertEqual(403, error.exception.status_code)
        read.assert_not_called()

    def test_cross_grantor_download_denied_before_storage_read(self):
        submission = {"studentId": "s1", "status": "approved"}
        with patch.object(profiles, "supabase_document_get", return_value={"row": {"id": "doc"}, "data": submission}), \
                patch.object(profiles, "enforce_portal_scope"), patch.object(profiles, "_data_rows", return_value=[]), \
                patch.object(profiles, "_read_storage") as read:
            with self.assertRaises(HTTPException) as error:
                main.protected_document_endpoint("doc", request("grantor", "g2"), {"downloadProtection": {"password": PASSWORD}})
        self.assertEqual(403, error.exception.status_code)
        read.assert_not_called()

    def test_anonymous_or_unrelated_admin_denied(self):
        for role in ("", "admin"):
            with patch.object(profiles, "supabase_document_get", return_value={"row": {"id": "doc"}, "data": {}}), \
                    patch.object(profiles, "require_admin_bearer", return_value=({}, {"role": "grantor_reviewer", "permissions": []})), \
                    patch.object(profiles, "_read_storage") as read:
                with self.assertRaises(HTTPException):
                    main.protected_document_endpoint("doc", request(role), {"downloadProtection": {"password": PASSWORD}})
                read.assert_not_called()

    def test_expired_and_revoked_sessions_do_not_read_files(self):
        for reason in ("invalid_authentication_session", "admin_session_revoked"):
            with patch.object(profiles, "supabase_document_get", return_value={"row": {"id": "doc"}, "data": {}}), \
                    patch.object(profiles, "require_admin_bearer", side_effect=HTTPException(401, reason)), \
                    patch.object(profiles, "_read_storage") as read:
                with self.assertRaises(HTTPException) as error:
                    main.protected_document_endpoint("doc", request("admin"), {"downloadProtection": {"password": PASSWORD}})
                self.assertEqual(401, error.exception.status_code)
                read.assert_not_called()

    def test_mixed_password_batch_validates_before_writes(self):
        first, *_ = protection.encrypt_download(valid_pdf(), "application/pdf", PASSWORD)
        second, *_ = protection.encrypt_download(valid_pdf(), "application/pdf", "B" * 32)
        files = [UploadFile(io.BytesIO(body), filename="document.pdf", headers={"content-type": "application/pdf"}) for body in (first, second)]
        with patch.object(requirements, "_application", return_value=({"actorId": "s1"}, {})), \
                patch.object(requirements, "_requirement", return_value={"uploadCount": 2, "fileType": "pdf"}), \
                patch.object(requirements, "_store_bytes") as store:
            with self.assertRaises(HTTPException) as error:
                asyncio.run(requirements.upload_requirement_files(request(), "app", "key", files, {"0": PASSWORD, "1": "wrong"}))
        self.assertEqual({"code": "file_password_incorrect", "fileIndex": 1}, error.exception.detail)
        store.assert_not_called()

    def test_applicant_csv_preserves_formula_injection_protection(self):
        import csv
        result = {"rows": [{"studentId": "s1", "studentName": "  =1+1"}], "total": 1, "filters": {"status": "Applied"}}
        with patch.object(applicants, "list_filtered_applicants", return_value=result), \
                patch.object(applicants, "supabase_rest_insert") as audit:
            body, mime, _, metadata = applicants.build_applicant_export(request("grantor"), {"format": "csv"})
        audit.assert_not_called()
        row = next(csv.DictReader(io.StringIO(body.decode("utf-8-sig"))))
        self.assertEqual("'  =1+1", row["studentName"])
        self.assertEqual(1, metadata["rowCount"])
        self.assertTrue(mime.startswith("text/csv"))

    def test_applicant_preview_never_records_an_export(self):
        with patch.object(main, "build_applicant_export", return_value=(valid_pdf(), "application/pdf", "report.pdf", {})), \
                patch.object(main, "record_applicant_export") as audit, patch.object(main, "protected_response") as protect:
            response = main.preview_filtered_applicants_endpoint(request("grantor"), {"format": "pdf"})
        self.assertEqual(200, response.status_code)
        audit.assert_not_called()
        protect.assert_not_called()

    def test_applicant_protection_failure_does_not_record_export_history(self):
        with patch.object(main, "build_applicant_export", return_value=(valid_pdf(), "application/pdf", "report.pdf", {})), \
                patch.object(main, "record_applicant_export") as history, \
                patch.object(main, "protected_response", side_effect=HTTPException(503, "download_protection_failed")):
            with self.assertRaises(HTTPException):
                main.export_filtered_applicants_endpoint(request("grantor"), {"downloadProtection": {"password": PASSWORD}})
        history.assert_not_called()

    def test_encrypted_cor_upload_preserves_original_and_separate_private_preview(self):
        encrypted, *_ = protection.encrypt_download(valid_pdf(), "application/pdf", PASSWORD)
        upload = UploadFile(io.BytesIO(encrypted), filename="cor.pdf", headers={"content-type": "application/pdf"})
        stored = []
        def store(path, body, mime):
            stored.append((path, body, mime))
            return {"bucket": "private", "path": path, "type": mime}
        with patch.object(profiles, "_student_id", return_value="s1"), \
                patch.object(profiles, "_require_student", return_value={"year": "2"}), \
                patch.object(profiles, "_cycle", return_value=("2026-2027-1ST", "1ST")), \
                patch.object(profiles, "_requirements", return_value={"corMode": "cor_only"}), \
                patch.object(profiles, "parse_pdf_document", return_value={"isValidCorDocument": True, "documentTitle": "Certificate of Registration"}) as scan, \
                patch.object(profiles, "_data_rows", return_value=[]), patch.object(profiles, "_store_bytes", side_effect=store), \
                patch.object(profiles, "supabase_document_upsert", return_value={"ok": True}) as save, \
                patch.object(profiles, "supabase_document_update", return_value={"ok": True}), \
                patch.object(profiles, "_system_approve_submission", side_effect=lambda _id, data, _student: {**data, "status": "approved"}):
            result = asyncio.run(profiles.upload_student_document(request(), "cor", upload, "", PASSWORD))
        self.assertEqual(2, len(stored))
        self.assertEqual(encrypted, stored[0][1])
        self.assertFalse(PdfReader(io.BytesIO(stored[1][1])).is_encrypted)
        self.assertEqual(stored[1][1], scan.call_args.args[0])
        self.assertEqual("private", result["submission"]["processingFile"]["bucket"])
        self.assertNotIn(PASSWORD, json.dumps(save.call_args.args[2]))

    def test_wrong_upload_password_creates_no_storage_or_submission(self):
        encrypted, *_ = protection.encrypt_download(valid_pdf(), "application/pdf", PASSWORD)
        upload = UploadFile(io.BytesIO(encrypted), filename="id.pdf", headers={"content-type": "application/pdf"})
        with patch.object(profiles, "_student_id", return_value="s1"), patch.object(profiles, "_require_student", return_value={}), \
                patch.object(profiles, "_store_bytes") as store, patch.object(profiles, "supabase_document_upsert") as save:
            with self.assertRaises(HTTPException) as error:
                asyncio.run(profiles.upload_student_document(request(), "identity", upload, "student_id", "wrong"))
        self.assertEqual("file_password_incorrect", error.exception.detail)
        store.assert_not_called()
        save.assert_not_called()

    def test_protected_signed_soe_upload_uses_atomic_derivative_rpc(self):
        from backend import security_history_service as history
        encrypted, *_ = protection.encrypt_download(valid_pdf(), "application/pdf", PASSWORD)
        upload = UploadFile(io.BytesIO(encrypted), filename="signed.pdf", headers={"content-type": "application/pdf"})
        saved = []
        def store(path, body, mime):
            saved.append(body)
            return {"bucket": "private", "path": path, "type": mime}
        with patch.object(history, "enforce_portal_scope", side_effect=lambda _r, payload, _roles: payload.update(actorId="s1")), \
                patch.object(history, "supabase_document_get", return_value={"row": {"id": "a1"}, "data": {"studentId": "s1"}}), \
                patch.object(history, "_store_bytes", side_effect=store), patch.object(history, "supabase_rpc", return_value={"ok": True, "data": {}}) as rpc:
            asyncio.run(history.upload_signed_soe(request(), "a1", upload, PASSWORD))
        self.assertEqual(encrypted, saved[0])
        self.assertFalse(PdfReader(io.BytesIO(saved[1])).is_encrypted)
        self.assertEqual("finalize_protected_signed_soe_submission", rpc.call_args.args[0])
        self.assertIsNotNone(rpc.call_args.args[1]["p_processing_file"])
        self.assertNotIn(PASSWORD, json.dumps(rpc.call_args.args))

    def test_root_files_cannot_use_arbitrary_storage_paths(self):
        from backend import root_service
        with patch.object(root_service, "_supabase_config") as config:
            with self.assertRaises(HTTPException) as error:
                root_service.fetch_root_file(request("root"), {}, {"bucket": "private", "path": "another-file"})
        self.assertEqual("stored_file_identifier_required", error.exception.detail)
        config.assert_not_called()

    def test_root_audit_shows_actor_version_and_protection(self):
        from backend import root_service
        event = {"id": "event", "actor_id": "s1", "actor_type": "student", "resource": "submission:v1",
                 "resource_version": "a" * 64, "format": "application/pdf", "protection": "pdf-aes-256",
                 "outcome": "prepared", "reason": "", "created_at": "2026-10-24T00:00:00Z"}
        with patch.object(root_service, "_rest", side_effect=lambda table, **_: [event] if table == "protected_download_events" else []):
            result = root_service.list_logs()
        row = result["auditLogs"][0]
        self.assertEqual("protected_download_prepared", row["action"])
        self.assertEqual("s1", row["actor_id"])
        self.assertEqual("a" * 64, row["details"]["resourceVersion"])
        self.assertEqual("pdf-aes-256", row["details"]["protection"])
