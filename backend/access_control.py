import os
import json
import base64
import urllib.error
import urllib.parse
import urllib.request
from typing import Any
from datetime import datetime

from fastapi import HTTPException, Request


def normalize_role(value: Any) -> str:
    role = str(value or "").strip().lower()
    return "grantor" if role in {"provider", "grantor"} else role


def require_admin_bearer(request: Request, actor_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    authorization = request.headers.get("authorization", "")
    token = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not token or not url or not key:
        raise HTTPException(status_code=401, detail="admin_authentication_required")
    try:
        user_request = urllib.request.Request(f"{url}/auth/v1/user", headers={"apikey": key, "Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(user_request, timeout=10) as response:
            user = json.loads(response.read().decode("utf-8") or "{}")
        record_request = urllib.request.Request(
            f"{url}/rest/v1/admins?id=eq.{urllib.parse.quote(actor_id)}&select=id,data&limit=1",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
        )
        with urllib.request.urlopen(record_request, timeout=10) as response:
            rows = json.loads(response.read().decode("utf-8") or "[]")
    except (urllib.error.HTTPError, urllib.error.URLError, ValueError) as error:
        raise HTTPException(status_code=401, detail="invalid_admin_session") from error
    record = rows[0].get("data", {}) if rows else {}
    if not rows or str(record.get("authUserId") or "") != str(user.get("id") or "") or str(record.get("status") or "active").lower() == "disabled":
        raise HTTPException(status_code=403, detail="admin_account_not_authorized")
    valid_after = str(record.get("sessionValidAfter") or "")
    if valid_after:
        try:
            segment = token.split(".")[1]
            claims = json.loads(base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4)).decode("utf-8"))
            issued_at = int(claims.get("iat") or 0)
            threshold = int(datetime.fromisoformat(valid_after.replace("Z", "+00:00")).timestamp())
            if issued_at < threshold:
                raise HTTPException(status_code=401, detail="admin_session_revoked")
        except HTTPException:
            raise
        except (ValueError, IndexError, KeyError, json.JSONDecodeError) as error:
            raise HTTPException(status_code=401, detail="invalid_admin_session") from error
    return user, record


def _required_admin_permissions(path: str) -> set[str]:
    if path.startswith("/reports/"):
        return {"reports"}
    if path.startswith("/workflows/admin/grantors/"):
        return {"grantors"}
    if path in {"/admin/match-grantor-students", "/admin/check-student-duplicates"}:
        return {"students"}
    if path == "/workflows/materials/update":
        return {"requirements"}
    if path == "/workflows/admin/review":
        return {"students", "grantors", "scholarships", "requirements"}
    return set()


def verify_admin_bearer(request: Request, actor_id: str) -> None:
    if os.getenv("ENFORCE_ADMIN_JWT", "false").lower() not in {"1", "true", "yes"}:
        return
    _, record = require_admin_bearer(request, actor_id)
    required = _required_admin_permissions(request.url.path)
    permissions = set(record.get("permissions") or [])
    if required and not required.intersection(permissions):
        raise HTTPException(status_code=403, detail="admin_permission_required")


def enforce_portal_scope(
    request: Request,
    payload: dict[str, Any],
    allowed_roles: set[str],
    *,
    owner_key: str = "",
) -> None:
    """Reject cross-role and cross-owner workflow calls.

    Supabase Auth-backed users also send their bearer token. Legacy grantor/admin
    accounts use the portal identity headers until their Auth migration is complete.
    """

    actor_id = str(request.headers.get("x-portal-actor-id") or "").strip()
    actor_role = normalize_role(request.headers.get("x-portal-actor-type"))
    require_headers = os.getenv("ENFORCE_PORTAL_ACTOR_HEADERS", "true").lower() not in {
        "0",
        "false",
        "no",
    }

    if require_headers and (not actor_id or not actor_role):
        raise HTTPException(status_code=401, detail="portal_identity_required")
    if not actor_id and not actor_role:
        return
    if actor_role not in allowed_roles:
        raise HTTPException(status_code=403, detail="portal_role_not_allowed")
    if actor_role == "admin":
        verify_admin_bearer(request, actor_id)

    payload_role = normalize_role(payload.get("actorType"))
    payload_actor_id = str(payload.get("actorId") or "").strip()
    if payload_role and payload_role != actor_role:
        raise HTTPException(status_code=403, detail="portal_actor_role_mismatch")
    if payload_actor_id and payload_actor_id != actor_id:
        raise HTTPException(status_code=403, detail="portal_actor_id_mismatch")

    payload.setdefault("actorType", actor_role)
    payload.setdefault("actorId", actor_id)

    if owner_key and actor_role != "admin":
        owner_id = str(payload.get(owner_key) or "").strip()
        if owner_id and owner_id != actor_id:
            raise HTTPException(status_code=403, detail="portal_record_owner_mismatch")


def enforce_material_update_scope(payload: dict[str, Any]) -> None:
    if normalize_role(payload.get("actorType")) != "student":
        return
    actor_id = str(payload.get("actorId") or "").strip()
    for update in payload.get("updates") or []:
        if not isinstance(update, dict):
            continue
        table = str(update.get("table") or "").strip()
        record_id = str(update.get("id") or "").strip()
        data = update.get("data") if isinstance(update.get("data"), dict) else {}
        target_student = str(data.get("studentId") or data.get("studentnumber") or "").strip()
        if table == "students" and record_id != actor_id:
            raise HTTPException(status_code=403, detail="student_record_owner_mismatch")
        if table in {"soe_requests", "soe_downloads"} and target_student and target_student != actor_id:
            raise HTTPException(status_code=403, detail="student_material_owner_mismatch")
