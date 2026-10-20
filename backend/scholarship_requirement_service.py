"""Private, authenticated uploads for grantor-added application requirements."""

import io
import re
import urllib.error
from urllib.parse import quote
from uuid import uuid4

from fastapi import HTTPException, Request, UploadFile
from fastapi.responses import Response
from PIL import Image
from pypdf import PdfReader

try:
    from .access_control import enforce_portal_scope, require_admin_bearer
    from .student_profile_service import MAX_DOCUMENT_BYTES, _store_bytes, _delete_stored_bytes, _read_storage, _now
    from .supabase_ops import supabase_document_get, supabase_rpc
except ImportError:  # pragma: no cover
    from access_control import enforce_portal_scope, require_admin_bearer
    from student_profile_service import MAX_DOCUMENT_BYTES, _store_bytes, _delete_stored_bytes, _read_storage, _now
    from supabase_ops import supabase_document_get, supabase_rpc


def _application(request: Request, application_id: str, *, uploading: bool = False) -> tuple[dict, dict]:
    identity = {}
    enforce_portal_scope(request, identity, {"student"} if uploading else {"student", "grantor", "admin"})
    result = supabase_document_get("scholarship_applications", application_id)
    if not result.get("ok"):
        raise HTTPException(503, "application_unavailable")
    if not result.get("row"):
        raise HTTPException(404, "application_not_found")
    application = result.get("data") or {}
    role, actor = identity["actorType"], identity["actorId"]
    if role == "student" and application.get("studentId") != actor:
        raise HTTPException(403, "application_owner_mismatch")
    if role == "grantor" and (application.get("grantorId") or application.get("providerId")) != actor:
        raise HTTPException(403, "application_owner_mismatch")
    if role == "admin":
        _, admin = require_admin_bearer(request, actor)
        if admin.get("role") != "full_admin" and not {"students", "scholarships", "requirements"}.intersection(admin.get("permissions") or []):
            raise HTTPException(403, "admin_permission_required")
    return identity, application


def _requirement(application: dict, key: str) -> dict:
    for index, item in enumerate(application.get("otherRequirements") or []):
        if not isinstance(item, dict) or not (item.get("name") or item.get("label")):
            continue
        source = next((item.get(field) for field in ("id", "requirementId", "key", "name", "label") if item.get(field)), f"requirement_{index + 1}")
        normalized = re.sub(r"[^a-z0-9]+", "_", str(source).strip().lower()).strip("_") or f"requirement_{index + 1}"
        if normalized == key:
            return item
    raise HTTPException(404, "scholarship_requirement_not_found")


def _validate_file(body: bytes, content_type: str, requirement: dict) -> str:
    if not body or len(body) > MAX_DOCUMENT_BYTES:
        raise HTTPException(413, "Upload a non-empty file no larger than 10 MB.")
    expected = str(requirement.get("fileType") or "PDF").upper()
    allowed = {"application/pdf", "image/png"} if expected == "BOTH" else {"image/png"} if expected == "PNG" else {"application/pdf"}
    if content_type not in allowed:
        raise HTTPException(422, f"This requirement accepts {expected} files only.")
    try:
        if content_type == "application/pdf":
            if not body.startswith(b"%PDF-") or not PdfReader(io.BytesIO(body)).pages:
                raise ValueError("invalid PDF")
        else:
            with Image.open(io.BytesIO(body)) as image:
                if image.format != "PNG":
                    raise ValueError("invalid PNG")
                image.verify()
    except Exception as error:
        raise HTTPException(422, "The file is damaged or does not match its PDF/PNG format.") from error
    return ".pdf" if content_type == "application/pdf" else ".png"


async def upload_requirement_files(request: Request, application_id: str, requirement_key: str, files: list[UploadFile]) -> dict:
    identity, application = _application(request, application_id, uploading=True)
    requirement = _requirement(application, requirement_key)
    limit = max(1, int(requirement.get("uploadCount") or requirement.get("uploadsNeeded") or requirement.get("count") or 1))
    existing = (application.get("otherRequirementUploads") or {}).get(requirement_key) or {}
    if not files or len(files) + len(existing.get("files") or []) > limit:
        raise HTTPException(409, "requirement_upload_limit_reached")
    # Validate the entire batch before creating any objects in private Storage.
    prepared = []
    for file in files:
        body = await file.read(MAX_DOCUMENT_BYTES + 1)
        mime = str(file.content_type or "").lower()
        extension = _validate_file(body, mime, requirement)
        prepared.append((file, body, mime, extension))
    stored = []
    cleanup_allowed = True
    try:
        for file, body, mime, extension in prepared:
            file_id = uuid4().hex
            path = f"students/{identity['actorId']}/other-requirements/{quote(application_id, safe='')}/{file_id}{extension}"
            reference = _store_bytes(path, body, mime)
            stored.append({**reference, "id": file_id, "name": (file.filename or f"document{extension}").replace("\\", "/").split("/")[-1],
                           "uploadedAt": _now(), "url": f"/scholarship-applications/{quote(application_id, safe='')}/requirements/{quote(requirement_key, safe='')}/files/{file_id}"})
        # A transport timeout has an unknown commit outcome. Never delete files
        # that the transaction may already reference.
        cleanup_allowed = False
        result = supabase_rpc("append_scholarship_requirement_files", {
            "p_student_id": identity["actorId"], "p_application_id": application_id,
            "p_requirement_key": requirement_key, "p_files": stored,
        })
        if not result.get("ok"):
            cleanup_allowed = result.get("reason") == "missing_supabase_server_config" or 400 <= int(result.get("status") or 0) < 500 or result.get("reason") in {
                "application_not_found", "application_closed", "student_account_blocked",
                "scholarship_requirement_not_found", "requirement_upload_limit_reached", "invalid_application_documents",
            }
            reason = result.get("reason") or "application_documents_failed"
            raise HTTPException(503 if reason in {"supabase_rpc_error", "missing_supabase_server_config"} else 409, reason)
        return {"ok": True, "application": (result.get("data") or {}).get("application")}
    except (urllib.error.URLError, TimeoutError) as error:
        raise HTTPException(503, "Upload result unavailable. Refresh your application before trying again.") from error
    finally:
        if cleanup_allowed:
            for reference in stored:
                _delete_stored_bytes(reference)


def requirement_file_content(request: Request, application_id: str, requirement_key: str, file_id: str) -> Response:
    _, application = _application(request, application_id)
    entry = (application.get("otherRequirementUploads") or {}).get(requirement_key) or {}
    reference = next((file for file in entry.get("files") or [] if file.get("id") == file_id), None)
    if not reference:
        raise HTTPException(404, "requirement_file_not_found")
    if not str(reference.get("path") or "").startswith(f"students/{application.get('studentId')}/other-requirements/"):
        raise HTTPException(403, "invalid_document_path")
    return Response(_read_storage(reference), media_type=reference.get("type") or "application/octet-stream",
                    headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
                             "Content-Disposition": f"inline; filename*=UTF-8''{quote(reference.get('name') or 'document', safe='')}"})
