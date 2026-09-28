import json
import base64
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any
from datetime import datetime

from fastapi import HTTPException, Request

try:
    from .supabase_ops import supabase_document_get, supabase_rpc
except ImportError:  # pragma: no cover
    from supabase_ops import supabase_document_get, supabase_rpc


def _require_unlocked_auth_user(auth_user_id: str) -> None:
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not auth_user_id or not url or not key:
        raise HTTPException(status_code=401, detail="authentication_required")
    query = urllib.parse.urlencode({
        "auth_user_id": f"eq.{auth_user_id}",
        "select": "blocked_at",
        "limit": "1",
    })
    try:
        state_request = urllib.request.Request(
            f"{url}/rest/v1/login_security_state?{query}",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
        )
        with urllib.request.urlopen(state_request, timeout=10) as response:
            rows = json.loads(response.read().decode("utf-8") or "[]")
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError) as error:
        raise HTTPException(status_code=503, detail="login_security_unavailable") from error
    if rows and rows[0].get("blocked_at"):
        raise HTTPException(status_code=423, detail="account_locked")


def normalize_role(value: Any) -> str:
    role = str(value or "").strip().lower()
    return "grantor" if role in {"provider", "grantor"} else role


def _jwt_claims(token: str) -> dict[str, Any]:
    try:
        segment = token.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4)).decode("utf-8"))
    except (ValueError, IndexError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=401, detail="invalid_authentication_session") from error


def _require_session_after(token: str, valid_after: Any, detail: str) -> None:
    if not valid_after:
        return
    try:
        issued_at = int(_jwt_claims(token).get("iat") or 0)
        threshold = int(datetime.fromisoformat(str(valid_after).replace("Z", "+00:00")).timestamp())
        if issued_at < threshold:
            raise HTTPException(status_code=401, detail=detail)
    except HTTPException:
        raise
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=401, detail="invalid_authentication_session") from error


def require_supabase_user(request: Request, *, allow_locked: bool = False, require_verified: bool = True) -> dict[str, Any]:
    """Resolve the authenticated Supabase user without trusting portal headers."""
    authorization = request.headers.get("authorization", "")
    token = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not token or not url or not key:
        raise HTTPException(status_code=401, detail="authentication_required")
    try:
        user_request = urllib.request.Request(
            f"{url}/auth/v1/user",
            headers={"apikey": key, "Authorization": f"Bearer {token}"},
        )
        with urllib.request.urlopen(user_request, timeout=10) as response:
            user = json.loads(response.read().decode("utf-8") or "{}")
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError) as error:
        raise HTTPException(status_code=401, detail="invalid_authentication_session") from error
    if not user.get("id") or not user.get("email"):
        raise HTTPException(status_code=401, detail="invalid_authentication_session")
    if not allow_locked:
        _require_unlocked_auth_user(str(user["id"]))
    if require_verified:
        session_id = str(_jwt_claims(token).get("session_id") or "").strip()
        if not session_id:
            raise HTTPException(status_code=401, detail="invalid_authentication_session")
        verification = supabase_rpc("validate_portal_verified_session", {
            "p_session_id": session_id,
            "p_auth_user_id": str(user["id"]),
        })
        state = verification.get("data") or {}
        if not verification.get("ok"):
            raise HTTPException(status_code=503, detail="verified_session_check_failed")
        if state.get("valid") is not True:
            reason = state.get("reason") or "email_verification_required"
            raise HTTPException(status_code=423 if reason == "account_locked" else 401, detail=reason)
        user["portal_session"] = state
    return user


def require_admin_bearer(request: Request, actor_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    authorization = request.headers.get("authorization", "")
    token = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not token or not url or not key:
        raise HTTPException(status_code=401, detail="admin_authentication_required")
    try:
        user = require_supabase_user(request)
        record_request = urllib.request.Request(
            f"{url}/rest/v1/admins?id=eq.{urllib.parse.quote(actor_id)}&select=id,data&limit=1",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
        )
        with urllib.request.urlopen(record_request, timeout=10) as response:
            rows = json.loads(response.read().decode("utf-8") or "[]")
    except HTTPException:
        raise
    except (urllib.error.HTTPError, urllib.error.URLError, ValueError) as error:
        raise HTTPException(status_code=401, detail="invalid_admin_session") from error
    record = rows[0].get("data", {}) if rows else {}
    if not rows or str(record.get("authUserId") or "") != str(user.get("id") or "") or str(record.get("status") or "active").lower() == "disabled":
        raise HTTPException(status_code=403, detail="admin_account_not_authorized")
    _require_unlocked_auth_user(str(user.get("id") or ""))
    valid_after = str(record.get("sessionValidAfter") or "")
    _require_session_after(token, valid_after, "admin_session_revoked")
    return user, record


def _required_admin_permissions(path: str) -> set[str]:
    if path.startswith("/reports/"):
        return {"reports"}
    if path.startswith("/workflows/applicants/"):
        return {"students", "reports"}
    if path.startswith("/workflows/announcements/"):
        return {"announcements"}
    if path.startswith("/workflows/admin/grantor-scope"):
        return {"grantors", "scholarships"}
    if path.startswith("/workflows/admin/student-number"):
        return {"students"}
    if path.startswith("/workflows/admin/grantors/"):
        return {"grantors"}
    if path in {"/admin/match-grantor-students", "/admin/check-student-duplicates"}:
        return {"students"}
    if path.startswith("/workflows/grantor/scholars/import/"):
        return {"students", "scholarships"}
    if path.startswith("/workflows/admin/roster-conflicts"):
        return {"students", "scholarships"}
    if path.startswith("/admin/signed-soe"):
        return {"requirements"}
    if path == "/workflows/materials/update":
        return {"requirements"}
    if path == "/workflows/admin/review":
        return {"students", "grantors", "scholarships", "requirements"}
    return set()


def enforce_portal_scope(
    request: Request,
    payload: dict[str, Any],
    allowed_roles: set[str],
    *,
    owner_key: str = "",
) -> None:
    """Reject cross-role and cross-owner workflow calls."""

    actor_id = str(request.headers.get("x-portal-actor-id") or "").strip()
    actor_role = normalize_role(request.headers.get("x-portal-actor-type"))
    if not actor_id or not actor_role:
        raise HTTPException(status_code=401, detail="portal_identity_required")
    if actor_role not in allowed_roles:
        raise HTTPException(status_code=403, detail="portal_role_not_allowed")
    if actor_role == "admin":
        user, record = require_admin_bearer(request, actor_id)
        required = _required_admin_permissions(request.url.path)
        if required and not required.intersection(set(record.get("permissions") or [])):
            raise HTTPException(status_code=403, detail="admin_permission_required")
    else:
        user = require_supabase_user(request)
        table = "students" if actor_role == "student" else "providers"
        account = supabase_document_get(table, actor_id)
        data = account.get("data") or {}
        if (not account.get("ok") or not account.get("row")
                or str(data.get("authUserId") or "") != str(user.get("id") or "")
                or data.get("isPending") is True or data.get("isValidated") is False
                or data.get("disabled") is True or data.get("archived") is True
                or str(data.get("status") or "active").lower() in {"disabled", "inactive", "archived"}):
            raise HTTPException(status_code=403, detail="portal_account_not_authorized")
        authorization = request.headers.get("authorization", "")
        token = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
        _require_session_after(token, data.get("sessionValidAfter"), "portal_session_revoked")

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
