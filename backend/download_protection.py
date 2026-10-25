"""In-memory download encryption. Passwords must never enter persistent metadata."""
import io
import hashlib
import json
import re
import secrets
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException, Response
from pypdf import PdfReader, PdfWriter
import pyzipper

try:
    from .supabase_ops import supabase_rest_insert
except ImportError:  # pragma: no cover
    from supabase_ops import supabase_rest_insert


PRIVATE_HEADERS = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"}
SAFE_MEDIA_TYPES = {"application/pdf", "text/csv", "image/png", "image/jpeg", "image/webp", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}


def protection_password(payload):
    protection = payload.get("downloadProtection")
    password = protection.get("password") if isinstance(protection, dict) else None
    if not isinstance(password, str) or not re.fullmatch(r"[A-Za-z0-9_-]{24}", password):
        raise HTTPException(422, {"code": "download_protection_required", "message": "Generate and save a new download password before exporting."})
    return password


def audit_download(request, resource, method, outcome, reason="", media_type="", version=""):
    # Only allowlisted fields: never serialize request payloads or exceptions.
    actor = getattr(request.state, "download_actor", {})
    event = {
        "id": str(uuid4()), "actor_id": str(actor.get("id") or request.headers.get("x-portal-actor-id") or "unknown"),
        "actor_type": str(actor.get("type") or request.headers.get("x-portal-actor-type") or "unknown"),
        "resource": str(resource)[:240], "protection": method, "outcome": outcome,
        "resource_version": version,
        "reason": reason, "format": media_type.split(";")[0] if media_type.split(";")[0] in SAFE_MEDIA_TYPES else "application/octet-stream", "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = supabase_rest_insert("protected_download_events", event)
    if not result.get("ok"):
        raise HTTPException(503, "download_audit_unavailable")


def encrypt_download(content, media_type, password, *, preserve_original=False):
    """Return a PDF copy or a ZIP holding the exact original bytes."""
    output = io.BytesIO()
    if media_type.split(";")[0] == "application/pdf" and not preserve_original:
        reader = PdfReader(io.BytesIO(content), strict=True)
        # Signed/encrypted originals must not be rewritten or have signature bytes lost.
        signed = b"/ByteRange" in content or (
            bool(reader.trailer["/Root"].get("/Perms"))
            or any(field.get("/FT") == "/Sig" for field in (reader.get_fields() or {}).values())
        ) if not reader.is_encrypted else False
        if not reader.is_encrypted and not signed:
            writer = PdfWriter(clone_from=reader)
            writer.encrypt(password, owner_password=secrets.token_urlsafe(32), algorithm="AES-256")
            writer.write(output)
            return output.getvalue(), "application/pdf", "protected-document.pdf", "pdf-aes-256"
    extension = {"application/pdf": "pdf", "text/csv": "csv", "text/plain": "txt", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/vnd.ms-excel": "xls", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx", "application/msword": "doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx"}.get(media_type.split(";")[0], "bin")
    with pyzipper.AESZipFile(output, "w", compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES) as archive:
        archive.setpassword(password.encode("ascii"))
        archive.setencryption(pyzipper.WZ_AES, nbits=256)
        archive.writestr(f"document.{extension}", content)
    return output.getvalue(), "application/zip", "protected-document.zip", "zip-aes-256"


def protected_response(request, payload, content, media_type, resource, *, preserve_original=False):
    try:
        from .mpin_service import identity
    except ImportError:
        from mpin_service import identity
    actor = identity(request)
    request.state.download_actor = actor
    version = hashlib.sha256(content).hexdigest()
    if actor["type"] != "student":
        audit_download(request, resource, "authorized-original", "prepared", media_type=media_type, version=version)
        extension = {"application/pdf": "pdf", "text/csv": "csv", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx"}.get(media_type.split(";")[0], "bin")
        return Response(content, media_type=media_type, headers={**PRIVATE_HEADERS, "Content-Disposition": f'attachment; filename="document.{extension}"'})
    password = protection_password(payload)
    version = hashlib.sha256(content).hexdigest()
    try:
        body, mime, filename, method = encrypt_download(content, media_type, password, preserve_original=preserve_original)
    except Exception:
        audit_download(request, resource, "aes-256", "failed", "protection_failed", media_type, version)
        raise HTTPException(503, "download_protection_failed") from None
    audit_download(request, resource, method, "prepared", media_type=media_type, version=version)
    return Response(body, media_type=mime, headers={**PRIVATE_HEADERS, "Content-Disposition": f'attachment; filename="{filename}"'})


def processing_pdf(content, password=""):
    """Decrypt only a processing copy. Caller retains the original uploaded bytes."""
    try:
        reader = PdfReader(io.BytesIO(content), strict=True)
        if not reader.is_encrypted:
            return content
        if not password:
            raise HTTPException(422, "file_password_required")
        if not reader.decrypt(password):
            raise HTTPException(422, "file_password_incorrect")
        writer = PdfWriter(clone_from=reader)
        output = io.BytesIO()
        writer.write(output)
        if len(output.getvalue()) > 20 * 1024 * 1024:
            raise HTTPException(413, "decrypted_file_too_large")
        return output.getvalue()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(422, "invalid_pdf_document") from None


def parse_file_passwords(value):
    try:
        mapping = json.loads(value or "{}") if isinstance(value, str) else value or {}
        if not isinstance(mapping, dict) or len(mapping) > 50 or any(not isinstance(k, str) or not isinstance(v, str) or len(v) > 1024 for k, v in mapping.items()):
            raise ValueError()
        return mapping
    except (ValueError, TypeError):
        raise HTTPException(422, "invalid_file_passwords") from None
