import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException

from backend import student_profile_service as profile
from backend import scholarship_requirement_service as requirements


class RequirementsAdminDocumentTests(unittest.TestCase):
    def test_requirements_permission_allows_reading_but_not_reviewing_student_documents(self):
        request = Mock(headers={"x-portal-actor-type": "admin", "x-portal-actor-id": "admin"})
        record = {"row": {"id": "cor"}, "data": {"studentId": "student", "name": "cor.pdf", "file": {"type": "application/pdf", "path": "private-cor"}}}
        admin = {"role": "requirements_reviewer", "permissions": ["requirements"]}
        with patch.object(profile, "supabase_document_get", return_value=record), \
                patch.object(profile, "require_admin_bearer", return_value=({}, admin)), \
                patch.object(profile, "_read_storage", return_value=b"pdf") as read:
            result = profile.document_content(request, "cor")
            self.assertEqual("private, no-store", result.headers["Cache-Control"])
            self.assertEqual(b"pdf", result.body)
            with self.assertRaises(HTTPException) as error:
                profile.document_content(request, "cor", "preview")
            self.assertEqual(403, error.exception.status_code)
            self.assertEqual(1, read.call_count)

    def test_unrelated_admin_cannot_read_private_student_file(self):
        request = Mock(headers={"x-portal-actor-type": "admin", "x-portal-actor-id": "admin"})
        with patch.object(profile, "supabase_document_get", return_value={"row": {"id": "cor"}, "data": {}}), \
                patch.object(profile, "require_admin_bearer", return_value=({}, {"role": "announcement_reviewer", "permissions": ["announcements"]})), \
                patch.object(profile, "_read_storage") as read, self.assertRaises(HTTPException) as error:
            profile.document_content(request, "cor")
        self.assertEqual(403, error.exception.status_code)
        read.assert_not_called()


class LegacyRequirementPreviewTests(unittest.TestCase):
    def read_file(self, upload, *, key="photo", file_id="legacy-0", storage_url="https://project.supabase.co"):
        application = {"studentId": "student", "otherRequirements": [{"id": "photo", "name": "Photo"}], "otherRequirementUploads": upload}
        with patch.object(requirements, "_application", return_value=({}, application)), \
                patch.dict("os.environ", {"SUPABASE_URL": storage_url}), \
                patch.object(requirements, "_read_storage", return_value=b"image") as read:
            response = requirements.requirement_file_content(object(), "app", key, file_id)
            return response, read.call_args.args[0]

    def test_legacy_reference_without_id_uses_saved_index(self):
        response, reference = self.read_file({"photo": {"files": [{"path": "students/student/other-requirements/app/photo.png", "type": "image/png"}]}})
        self.assertEqual(b"image", response.body)
        self.assertEqual("image/png", response.media_type)
        self.assertEqual("students/student/other-requirements/app/photo.png", reference["path"])

    def test_legacy_public_url_is_resolved_without_public_bucket_access(self):
        _, reference = self.read_file({"Photo": {"files": [{"url": "https://project.supabase.co/storage/v1/object/public/private/students/student/other-requirements/app/photo%20name.png"}]}})
        self.assertEqual("private", reference["bucket"])
        self.assertEqual("students/student/other-requirements/app/photo name.png", reference["path"])

    def test_legacy_array_entries_are_supported(self):
        _, reference = self.read_file([{"name": "Photo", "files": [{"path": "students/student/other-requirements/app/photo.png"}]}])
        self.assertTrue(reference["path"].endswith("photo.png"))

    def test_external_urls_and_other_student_paths_are_blocked(self):
        for url in ("https://attacker.test/storage/v1/object/public/private/students/student/other-requirements/photo.png",
                    "https://project.supabase.co/storage/v1/object/public/private/students/other/other-requirements/photo.png",
                    "https://project.supabase.co/storage/v1/object/public/private/students/student/other-requirements/../secret.png"):
            with self.subTest(url=url), self.assertRaises(HTTPException) as error:
                self.read_file({"photo": {"files": [{"url": url}]}})
            self.assertEqual(403, error.exception.status_code)

    def test_legacy_index_does_not_alias_an_identified_file(self):
        with self.assertRaises(HTTPException) as error:
            self.read_file({"photo": {"files": [{"id": "current", "path": "students/student/other-requirements/photo.png"}]}})
        self.assertEqual(404, error.exception.status_code)
