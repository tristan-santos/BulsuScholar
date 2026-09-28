from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
import urllib.error
import urllib.parse
import urllib.request
from uuid import uuid4

from fastapi import HTTPException, Request, Response, UploadFile

try:
    from .access_control import enforce_portal_scope, require_admin_bearer
    from .auth_service import _find_account
    from .email_service import send_email_notification
    from .student_profile_service import _read_storage, _store_bytes
    from .supabase_ops import supabase_document_get, supabase_rpc
except ImportError:  # pragma: no cover
    from access_control import enforce_portal_scope, require_admin_bearer
    from auth_service import _find_account
    from email_service import send_email_notification
    from student_profile_service import _read_storage, _store_bytes
    from supabase_ops import supabase_document_get, supabase_rpc


SOE_TYPES = {"application/pdf", "image/png", "image/jpeg"}
RECOVERY_TYPES = SOE_TYPES | {"image/webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _config() -> tuple[str, str, str]:
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    bucket = os.getenv("SUPABASE_STORAGE_BUCKET", "bulsuscholar")
    if not url or not key:
        raise HTTPException(status_code=503, detail="server_storage_unavailable")
    return url, key, bucket


def _rest(table: str, *, method: str = "GET", query: str = "", payload: Any = None, prefer: str = "return=representation") -> Any:
    url, key, _ = _config()
    request = urllib.request.Request(
        f"{url}/rest/v1/{table}{'?' + query if query else ''}",
        data=None if payload is None else json.dumps(payload).encode("utf-8"),
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", "Accept": "application/json", "Prefer": prefer},
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8") or "[]")
    except urllib.error.HTTPError as error:
        raise HTTPException(status_code=503, detail="secure_workflow_storage_failed") from error


def _delete_storage(bucket: str, path: str) -> None:
    url, key, _ = _config()
    request = urllib.request.Request(
        f"{url}/storage/v1/object/{urllib.parse.quote(bucket)}/{urllib.parse.quote(path, safe='/')}",
        headers={"apikey": key, "Authorization": f"Bearer {key}"}, method="DELETE",
    )
    try:
        urllib.request.urlopen(request, timeout=20).close()
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
        pass


def _content_response(reference: dict[str, Any], name: str, content_type: str) -> Response:
    return Response(
        content=_read_storage(reference),
        media_type=content_type or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{name.replace(chr(34), "")}"', "Cache-Control": "private, no-store"},
    )


def list_student_history(request: Request, page: int, page_size: int, cycle: str = "", event_type: str = "") -> dict[str, Any]:
    payload: dict[str, Any] = {}
    enforce_portal_scope(request, payload, {"student"})
    student_id = payload["actorId"]
    filters = [f"student_id=eq.{urllib.parse.quote(student_id, safe='')}"]
    if cycle:
        filters.append(f"academic_cycle=eq.{urllib.parse.quote(cycle, safe='')}")
    if event_type:
        filters.append(f"event_type=eq.{urllib.parse.quote(event_type, safe='')}")
    offset = (page - 1) * page_size
    query = "&".join([*filters, "select=id,event_type,academic_cycle,occurred_at,related_type,related_id,route,description,safe_data", "order=occurred_at.desc,id.desc", f"limit={page_size}", f"offset={offset}"])
    rows = _rest("student_history_events", query=query) or []
    return {"ok": True, "events": rows, "page": page, "pageSize": page_size, "hasMore": len(rows) == page_size}


async def upload_signed_soe(request: Request, application_id: str, file: UploadFile) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    enforce_portal_scope(request, payload, {"student"})
    student_id = payload["actorId"]
    content_type = str(file.content_type or "").lower()
    if content_type not in SOE_TYPES:
        raise HTTPException(status_code=415, detail="signed_soe_file_type_not_allowed")
    body = await file.read(MAX_FILE_SIZE + 1)
    if not body:
        raise HTTPException(status_code=422, detail="signed_soe_file_required")
    if len(body) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="signed_soe_file_too_large")
    application = supabase_document_get("scholarship_applications", application_id)
    data = application.get("data") or {}
    if not application.get("row") or str(data.get("studentId") or "") != student_id:
        raise HTTPException(status_code=404, detail="application_not_found")
    cycle = str(data.get("academicCycle") or data.get("semesterTag") or "current-cycle").strip()
    submission_id = str(uuid4())
    extension = {"application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg"}[content_type]
    path = f"private/signed-soe/{student_id}/{application_id}/{submission_id}.{extension}"
    stored = _store_bytes(path, body, content_type)
    result = supabase_rpc("finalize_signed_soe_submission", {
        "p_submission_id": submission_id, "p_student_id": student_id, "p_application_id": application_id,
        "p_cycle": cycle, "p_bucket": stored["bucket"], "p_path": stored["path"],
        "p_file_name": (file.filename or f"signed-soe.{extension}")[:240], "p_content_type": content_type, "p_size": len(body),
    })
    if not result.get("ok"):
        _delete_storage(stored["bucket"], stored["path"])
        raise HTTPException(status_code=409, detail=result.get("reason") or "signed_soe_submission_failed")
    return {"ok": True, **(result.get("data") or {})}


def list_signed_soe(request: Request, application_id: str) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    enforce_portal_scope(request, payload, {"student", "admin"})
    if payload["actorType"] == "admin":
        _, admin = require_admin_bearer(request, payload["actorId"])
        if str(admin.get("role") or "").lower() != "full_admin" and "requirements" not in set(admin.get("permissions") or []):
            raise HTTPException(status_code=403, detail="requirements_permission_required")
    rows = _rest("signed_soe_submissions", query=f"application_id=eq.{urllib.parse.quote(application_id, safe='')}&select=*&order=version.desc") or []
    if payload["actorType"] == "student" and any(str(row.get("student_id") or "") != payload["actorId"] for row in rows):
        raise HTTPException(status_code=403, detail="signed_soe_access_denied")
    return {"ok": True, "submissions": rows}


def signed_soe_content(request: Request, submission_id: str) -> Response:
    payload: dict[str, Any] = {}
    enforce_portal_scope(request, payload, {"student", "admin"})
    if payload["actorType"] == "admin":
        _, admin = require_admin_bearer(request, payload["actorId"])
        if str(admin.get("role") or "").lower() != "full_admin" and "requirements" not in set(admin.get("permissions") or []):
            raise HTTPException(status_code=403, detail="requirements_permission_required")
    rows = _rest("signed_soe_submissions", query=f"id=eq.{urllib.parse.quote(submission_id, safe='')}&select=*&limit=1") or []
    if not rows:
        raise HTTPException(status_code=404, detail="signed_soe_not_found")
    row = rows[0]
    if payload["actorType"] == "student" and str(row.get("student_id") or "") != payload["actorId"]:
        raise HTTPException(status_code=403, detail="signed_soe_access_denied")
    return _content_response({"bucket": row["storage_bucket"], "path": row["storage_path"]}, row["file_name"], row["content_type"])


def reopen_signed_soe(request: Request, submission_id: str, reason: str) -> dict[str, Any]:
    actor_id = str(request.headers.get("x-portal-actor-id") or "").strip()
    _, admin = require_admin_bearer(request, actor_id)
    if str(admin.get("role") or "").lower() != "full_admin" and "requirements" not in set(admin.get("permissions") or []):
        raise HTTPException(status_code=403, detail="requirements_permission_required")
    result = supabase_rpc("reopen_signed_soe_submission", {"p_submission_id": submission_id, "p_actor_id": actor_id, "p_reason": reason})
    if not result.get("ok"):
        raise HTTPException(status_code=409, detail=result.get("reason") or "signed_soe_reopen_failed")
    return {"ok": True, **(result.get("data") or {})}


def _capability_hash(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def _recovery_code_hash(ticket_id: str, code: str) -> str:
    secret = os.getenv("PUBLIC_RECOVERY_CODE_SECRET", os.getenv("PORTAL_EMAIL_CODE_SECRET", "")).strip()
    if len(secret) < 32:
        raise HTTPException(status_code=503, detail="public_recovery_not_configured")
    return hmac.new(secret.encode("utf-8"), f"{ticket_id}:{code}".encode("utf-8"), hashlib.sha256).hexdigest()


def _recovery_ticket(ticket_id: str, secret: str) -> dict[str, Any]:
    rows = _rest("public_recovery_tickets", query=f"id=eq.{urllib.parse.quote(ticket_id, safe='')}&capability_hash=eq.{_capability_hash(secret)}&select=*&limit=1") or []
    if not rows:
        raise HTTPException(status_code=404, detail="recovery_ticket_not_found")
    return rows[0]


def create_public_recovery_ticket(payload: dict[str, Any]) -> dict[str, Any]:
    user_id = str(payload.get("userId") or "").strip()[:120]
    reason = str(payload.get("reason") or "").strip()[:4000]
    if not user_id or not reason:
        raise HTTPException(status_code=422, detail="user_id_and_reason_required")
    account = _find_account(user_id)
    if account and account["type"] not in {"student", "grantor"}:
        account = None
    ticket_id = str(uuid4())
    ticket_number = f"BER-{datetime.now(timezone.utc).year}-{secrets.token_hex(4).upper()}"
    secret = secrets.token_urlsafe(32)
    now = _now()
    _rest("public_recovery_tickets", method="POST", payload={
        "id": ticket_id, "ticket_number": ticket_number, "capability_hash": _capability_hash(secret),
        "supplied_user_id": user_id, "auth_user_id": account["data"].get("authUserId") if account else None,
        "account_type": account["type"] if account else None, "account_id": account["id"] if account else None,
        "data": {"subject": "Lost email access", "createdAt": now}, "created_at": now, "updated_at": now,
    })
    _rest("public_recovery_messages", method="POST", payload={"id": str(uuid4()), "ticket_id": ticket_id, "sender_type": "requester", "body": reason, "created_at": now})
    frontend = (os.getenv("FRONTEND_URL") or "https://bulsuscholar.com").rstrip("/")
    return {"ok": True, "ticketId": ticket_number, "accessUrl": f"{frontend}/help?recovery={ticket_id}&secret={urllib.parse.quote(secret, safe='')}", "ticket": {"id": ticket_id, "ticketId": ticket_number, "status": "open", "messages": [{"body": reason, "senderType": "requester", "createdAt": now}]}}


def get_public_recovery_ticket(ticket_id: str, secret: str) -> dict[str, Any]:
    ticket = _recovery_ticket(ticket_id, secret)
    messages = _rest("public_recovery_messages", query=f"ticket_id=eq.{urllib.parse.quote(ticket_id, safe='')}&select=id,sender_type,body,created_at&order=created_at.asc,id.asc") or []
    attachments = _rest("public_recovery_attachments", query=f"ticket_id=eq.{urllib.parse.quote(ticket_id, safe='')}&select=id,message_id,file_name,content_type,size_bytes,created_at&order=created_at.asc") or []
    return {"ok": True, "ticket": {"id": ticket["id"], "ticketId": ticket["ticket_number"], "status": ticket["status"], "messages": messages, "attachments": attachments}}


def add_public_recovery_message(ticket_id: str, secret: str, body: str) -> dict[str, Any]:
    ticket = _recovery_ticket(ticket_id, secret)
    if ticket["status"] in {"resolved", "rejected", "deleted"}:
        raise HTTPException(status_code=409, detail="recovery_ticket_closed")
    message = str(body or "").strip()[:4000]
    if not message:
        raise HTTPException(status_code=422, detail="recovery_message_required")
    _rest("public_recovery_messages", method="POST", payload={"id": str(uuid4()), "ticket_id": ticket_id, "sender_type": "requester", "body": message, "created_at": _now()})
    return get_public_recovery_ticket(ticket_id, secret)


def delete_public_recovery_ticket(ticket_id: str, secret: str) -> dict[str, Any]:
    ticket = _recovery_ticket(ticket_id, secret)
    attachments = _rest("public_recovery_attachments", query=f"ticket_id=eq.{urllib.parse.quote(ticket_id, safe='')}&select=storage_bucket,storage_path") or []
    for attachment in attachments:
        _delete_storage(str(attachment.get("storage_bucket") or ""), str(attachment.get("storage_path") or ""))
    _rest("public_recovery_messages", method="DELETE", query=f"ticket_id=eq.{urllib.parse.quote(ticket_id, safe='')}")
    _rest("public_recovery_attachments", method="DELETE", query=f"ticket_id=eq.{urllib.parse.quote(ticket_id, safe='')}")
    _rest("public_recovery_tickets", method="PATCH", query=f"id=eq.{urllib.parse.quote(ticket_id, safe='')}", payload={"status": "deleted", "capability_hash": hashlib.sha256(secrets.token_bytes(32)).hexdigest(), "confirmation_hash": None, "data": {}, "updated_at": _now()})
    _rest("public_recovery_audit_events", method="POST", payload={"id": f"recovery_deleted_{ticket_id}", "ticket_id": ticket_id, "event_type": "deleted_by_requester", "data": {"previousStatus": ticket["status"], "createdAt": _now()}})
    return {"ok": True, "deletedTicketId": ticket.get("ticket_number")}


async def upload_public_recovery_attachment(ticket_id: str, secret: str, file: UploadFile) -> dict[str, Any]:
    ticket = _recovery_ticket(ticket_id, secret)
    if ticket["status"] in {"resolved", "rejected", "deleted"}:
        raise HTTPException(status_code=409, detail="recovery_ticket_closed")
    existing = _rest("public_recovery_attachments", query=f"ticket_id=eq.{urllib.parse.quote(ticket_id, safe='')}&select=id") or []
    if len(existing) >= 5:
        raise HTTPException(status_code=409, detail="recovery_attachment_limit_reached")
    content_type = str(file.content_type or "").lower()
    if content_type not in RECOVERY_TYPES:
        raise HTTPException(status_code=415, detail="recovery_attachment_type_not_allowed")
    body = await file.read(MAX_FILE_SIZE + 1)
    if not body or len(body) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413 if body else 422, detail="recovery_attachment_invalid_size")
    attachment_id = str(uuid4())
    extension = {"application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}[content_type]
    stored = _store_bytes(f"private/recovery/{ticket_id}/{attachment_id}.{extension}", body, content_type)
    _rest("public_recovery_attachments", method="POST", payload={"id": attachment_id, "ticket_id": ticket_id, "storage_bucket": stored["bucket"], "storage_path": stored["path"], "file_name": (file.filename or f"evidence.{extension}")[:240], "content_type": content_type, "size_bytes": len(body)})
    return {"ok": True, "attachmentId": attachment_id}


def confirm_public_recovery_email(ticket_id: str, secret: str, code: str) -> dict[str, Any]:
    ticket = _recovery_ticket(ticket_id, secret)
    if ticket["status"] != "awaiting_email_confirmation" or not ticket.get("confirmation_hash"):
        raise HTTPException(status_code=409, detail="recovery_email_confirmation_not_ready")
    expires = datetime.fromisoformat(str(ticket["confirmation_expires_at"]).replace("Z", "+00:00"))
    if expires <= datetime.now(timezone.utc) or int(ticket.get("confirmation_attempts") or 0) >= 3:
        raise HTTPException(status_code=410, detail="recovery_email_code_expired")
    if not hmac.compare_digest(str(ticket["confirmation_hash"]), _recovery_code_hash(ticket_id, str(code).strip())):
        _rest("public_recovery_tickets", method="PATCH", query=f"id=eq.{ticket_id}", payload={"confirmation_attempts": int(ticket.get("confirmation_attempts") or 0) + 1, "updated_at": _now()})
        raise HTTPException(status_code=401, detail="invalid_recovery_email_code")
    url, key, _ = _config()
    auth_request = urllib.request.Request(f"{url}/auth/v1/admin/users/{ticket['auth_user_id']}", data=json.dumps({"email": ticket["proposed_email"], "email_confirm": True}).encode("utf-8"), headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}, method="PUT")
    try:
        urllib.request.urlopen(auth_request, timeout=20).close()
    except urllib.error.HTTPError as error:
        raise HTTPException(status_code=503, detail="recovery_auth_update_pending_retry") from error
    result = supabase_rpc("complete_public_recovery_profile", {"p_ticket_id": ticket_id, "p_email": ticket["proposed_email"]})
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail="recovery_profile_update_pending_retry")
    return {"ok": True, "status": "resolved", "message": "Email access was restored. Sign in again with your existing password."}


def list_root_recovery_tickets() -> list[dict[str, Any]]:
    rows = _rest("public_recovery_tickets", query="select=id,ticket_number,supplied_user_id,account_type,account_id,status,proposed_email,data,created_at,updated_at&order=created_at.asc") or []
    for row in rows:
        row["messages"] = _rest("public_recovery_messages", query=f"ticket_id=eq.{row['id']}&select=id,sender_type,body,created_at&order=created_at.asc") or []
        row["attachments"] = _rest("public_recovery_attachments", query=f"ticket_id=eq.{row['id']}&select=id,file_name,content_type,size_bytes,created_at") or []
    return rows


def root_review_recovery(ticket_id: str, payload: dict[str, Any], root_id: str) -> dict[str, Any]:
    rows = _rest("public_recovery_tickets", query=f"id=eq.{urllib.parse.quote(ticket_id, safe='')}&select=*&limit=1") or []
    if not rows:
        raise HTTPException(status_code=404, detail="recovery_ticket_not_found")
    ticket = rows[0]
    action = str(payload.get("action") or "").lower()
    reason = str(payload.get("reason") or "").strip()[:1000]
    if action == "reject":
        if not reason:
            raise HTTPException(status_code=422, detail="rejection_reason_required")
        _rest("public_recovery_tickets", method="PATCH", query=f"id=eq.{ticket_id}", payload={"status": "rejected", "updated_at": _now()})
        _rest("public_recovery_messages", method="POST", payload={"id": str(uuid4()), "ticket_id": ticket_id, "sender_type": "root", "body": reason, "created_at": _now()})
    elif action == "approve":
        email = str(payload.get("proposedEmail") or "").strip().lower()
        if not ticket.get("auth_user_id") or "@" not in email:
            raise HTTPException(status_code=422, detail="valid_recovery_account_and_email_required")
        uniqueness = supabase_rpc("portal_email_in_use", {"p_email": email, "p_exclude_auth_user_id": ticket["auth_user_id"]})
        if not uniqueness.get("ok"):
            raise HTTPException(status_code=503, detail="email_uniqueness_check_failed")
        if uniqueness.get("data") is True:
            raise HTTPException(status_code=409, detail="email_already_in_use")
        code = f"{secrets.randbelow(1_000_000):06d}"
        delivery = send_email_notification({"to": email, "subject": "Confirm your new BulsuScholar email", "html": f'<div data-bulsuscholar-email="recovery"><p>Your confirmation code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">{code}</p><p>This code expires in 10 minutes.</p></div>'})
        if not delivery.get("sent"):
            raise HTTPException(status_code=503, detail="recovery_confirmation_email_failed")
        _rest("public_recovery_tickets", method="PATCH", query=f"id=eq.{ticket_id}", payload={"status": "awaiting_email_confirmation", "proposed_email": email, "confirmation_hash": _recovery_code_hash(ticket_id, code), "confirmation_expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(), "confirmation_attempts": 0, "updated_at": _now()})
        _rest("public_recovery_messages", method="POST", payload={"id": str(uuid4()), "ticket_id": ticket_id, "sender_type": "root", "body": "Evidence approved. Enter the code sent to the proposed email address.", "created_at": _now()})
    else:
        raise HTTPException(status_code=422, detail="invalid_recovery_review_action")
    _rest("public_recovery_audit_events", method="POST", payload={"id": f"recovery_{action}_{ticket_id}", "ticket_id": ticket_id, "event_type": action, "data": {"rootId": root_id, "reason": reason, "createdAt": _now()}})
    return {"ok": True, "status": "rejected" if action == "reject" else "awaiting_email_confirmation"}


def root_recovery_attachment_content(attachment_id: str) -> Response:
    rows = _rest("public_recovery_attachments", query=f"id=eq.{urllib.parse.quote(attachment_id, safe='')}&select=*&limit=1") or []
    if not rows:
        raise HTTPException(status_code=404, detail="recovery_attachment_not_found")
    row = rows[0]
    return _content_response({"bucket": row["storage_bucket"], "path": row["storage_path"]}, row["file_name"], row["content_type"])
