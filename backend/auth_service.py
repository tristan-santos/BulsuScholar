import json
import base64
import hashlib
import os
import secrets
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from fastapi import HTTPException, Request

try:
    from .access_control import require_admin_bearer, require_supabase_user
    from .supabase_ops import supabase_admin_create_user, supabase_document_get, supabase_document_upsert, supabase_rpc, supabase_select
except ImportError:  # pragma: no cover
    from access_control import require_admin_bearer, require_supabase_user
    from supabase_ops import supabase_admin_create_user, supabase_document_get, supabase_document_upsert, supabase_rpc, supabase_select


ACCOUNT_TABLES = (
    ("student", "students"),
    ("student", "pending_students"),
    ("admin", "admins"),
    ("grantor", "providers"),
)


def _config() -> tuple[str, str]:
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise HTTPException(status_code=503, detail="authentication_service_unavailable")
    return url, key


def _request_json(url: str, *, payload: dict[str, Any], headers: dict[str, str]) -> tuple[dict[str, Any], int]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8") or "{}"), response.status
    except urllib.error.HTTPError as error:
        try:
            detail = json.loads(error.read().decode("utf-8") or "{}")
        except (ValueError, TypeError):
            detail = {}
        return detail, error.code
    except (urllib.error.URLError, TimeoutError) as error:
        raise HTTPException(status_code=503, detail="authentication_service_unavailable") from error


def _find_account(user_id: str) -> dict[str, Any] | None:
    matches: list[dict[str, Any]] = []
    for account_type, table in ACCOUNT_TABLES:
        result = supabase_document_get(table, user_id)
        if result.get("ok") and result.get("row"):
            matches.append({
                "type": account_type,
                "table": table,
                "id": user_id,
                "data": result.get("data") or {},
            })
    if len(matches) > 1:
        raise HTTPException(status_code=409, detail="portal_identity_conflict")
    return matches[0] if matches else None


def _security_state(auth_user_id: str) -> dict[str, Any]:
    result = supabase_select("login_security_state", {"auth_user_id": auth_user_id})
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail="login_security_unavailable")
    rows = result.get("rows") or []
    return rows[0] if rows else {}


def _record_attempt(account: dict[str, Any], succeeded: bool) -> dict[str, Any]:
    auth_user_id = str(account["data"].get("authUserId") or "").strip()
    result = supabase_rpc("record_portal_login_attempt", {
        "p_auth_user_id": auth_user_id,
        "p_account_type": account["type"],
        "p_account_id": account["id"],
        "p_succeeded": succeeded,
    })
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail="login_security_unavailable")
    return result.get("data") or {}


def _account_disabled(account: dict[str, Any]) -> bool:
    data = account.get("data") or {}
    status = str(data.get("status") or data.get("accountStatus") or "active").lower()
    return data.get("disabled") is True or data.get("archived") is True or status in {"disabled", "inactive", "archived"}


def login(payload: dict[str, Any]) -> dict[str, Any]:
    user_id = str(payload.get("userId") or "").strip()
    password = str(payload.get("password") or "")
    if not user_id or not password:
        raise HTTPException(status_code=422, detail="user_id_and_password_required")

    account = _find_account(user_id)
    if not account:
        raise HTTPException(status_code=401, detail="invalid_credentials")
    data = account["data"]
    auth_user_id = str(data.get("authUserId") or "").strip()
    email = str(data.get("email") or "").strip().lower()
    if not auth_user_id or not email:
        raise HTTPException(status_code=409, detail="auth_migration_required")
    if _account_disabled(account):
        raise HTTPException(status_code=403, detail="account_unavailable")

    state = _security_state(auth_user_id)
    if state.get("blocked_at"):
        detail = "admin_account_locked" if account["type"] == "admin" else "account_locked_reset_required"
        raise HTTPException(status_code=423, detail=detail)

    url, key = _config()
    auth, status = _request_json(
        f"{url}/auth/v1/token?grant_type=password",
        payload={"email": email, "password": password},
        headers={"apikey": key, "Content-Type": "application/json"},
    )
    if status >= 500:
        raise HTTPException(status_code=503, detail="authentication_service_unavailable")
    if status < 200 or status >= 300 or not auth.get("access_token"):
        security = _record_attempt(account, False)
        if security.get("blocked"):
            detail = "admin_account_locked" if account["type"] == "admin" else "account_locked_reset_required"
            raise HTTPException(status_code=423, detail=detail)
        raise HTTPException(status_code=401, detail={
            "code": "invalid_credentials",
            "remainingAttempts": security.get("remainingAttempts"),
        })

    auth_user = auth.get("user") or {}
    if str(auth_user.get("id") or "") != auth_user_id:
        raise HTTPException(status_code=403, detail="auth_identity_mismatch")
    security = _record_attempt(account, True)
    if security.get("blocked"):
        detail = "admin_account_locked" if account["type"] == "admin" else "account_locked_reset_required"
        raise HTTPException(status_code=423, detail=detail)
    safe_account = {
        "id": user_id,
        "type": "provider" if account["type"] == "grantor" else account["type"],
        "table": account["table"],
        "isPending": account["table"] == "pending_students",
        "mustChangePassword": data.get("mustChangePassword") is True,
    }
    return {
        "ok": True,
        "session": {
            "access_token": auth.get("access_token"),
            "refresh_token": auth.get("refresh_token"),
        },
        "account": safe_account,
    }


def validate_portal_session(request: Request) -> dict[str, Any]:
    user = require_supabase_user(request)
    actor_id = str(request.headers.get("x-portal-actor-id") or "").strip()
    actor_type = str(request.headers.get("x-portal-actor-type") or "").strip().lower()
    if not actor_id or actor_type not in {"student", "provider", "grantor", "admin"}:
        raise HTTPException(status_code=401, detail="portal_identity_required")
    account = _find_account(actor_id)
    expected_type = "grantor" if actor_type in {"provider", "grantor"} else actor_type
    if (not account or account["type"] != expected_type
            or str(account["data"].get("authUserId") or "") != str(user.get("id") or "")
            or _account_disabled(account)):
        raise HTTPException(status_code=403, detail="portal_session_not_authorized")
    return {"ok": True, "account": {"id": actor_id, "type": actor_type}}


def request_password_recovery(payload: dict[str, Any]) -> dict[str, Any]:
    user_id = str(payload.get("userId") or "").strip()
    generic = {"ok": True, "message": "If the account is eligible, password reset instructions were sent to its registered email."}
    if not user_id:
        return generic
    account = _find_account(user_id)
    if not account or account["type"] not in {"student", "grantor"}:
        return generic
    email = str(account["data"].get("email") or "").strip().lower()
    auth_user_id = str(account["data"].get("authUserId") or "").strip()
    if not email or not auth_user_id:
        return generic

    frontend = (os.getenv("FRONTEND_URL") or os.getenv("VITE_APP_URL") or "https://bulsuscholar.com").rstrip("/")
    challenge = secrets.token_urlsafe(32)
    challenge_hash = hashlib.sha256(challenge.encode("utf-8")).hexdigest()
    issued = supabase_rpc("issue_portal_recovery_challenge", {
        "p_auth_user_id": auth_user_id,
        "p_token_hash": challenge_hash,
        "p_account_type": account["type"],
        "p_account_id": account["id"],
    })
    if not issued.get("ok"):
        return generic
    url, key = _config()
    redirect = f"{frontend}/reset-password?challenge={urllib.parse.quote(challenge, safe='')}"
    _request_json(
        f"{url}/auth/v1/recover?redirect_to={urllib.parse.quote(redirect, safe='')}",
        payload={"email": email},
        headers={"apikey": key, "Content-Type": "application/json"},
    )
    return generic


def complete_password_recovery(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    user = require_supabase_user(request, allow_locked=True)
    auth_user_id = str(user.get("id") or "")
    challenge = str(payload.get("challenge") or "").strip()
    if len(challenge) < 32 or len(challenge) > 128:
        raise HTTPException(status_code=403, detail="invalid_recovery_challenge")
    result = supabase_rpc("complete_portal_recovery_challenge", {
        "p_auth_user_id": auth_user_id,
        "p_token_hash": hashlib.sha256(challenge.encode("utf-8")).hexdigest(),
    })
    if not result.get("ok"):
        raise HTTPException(status_code=403, detail="recovery_challenge_not_verified")
    return {"ok": True}


def get_security_settings(request: Request) -> dict[str, Any]:
    actor_id = str(request.headers.get("x-portal-actor-id") or "").strip()
    _, record = require_admin_bearer(request, actor_id)
    if record.get("role") != "full_admin":
        raise HTTPException(status_code=403, detail="full_admin_required")
    result = supabase_document_get("system_configuration", "portal_security")
    limit = int((result.get("data") or {}).get("loginAttemptLimit") or 3)
    return {"ok": True, "loginAttemptLimit": max(3, min(10, limit))}


def update_security_settings(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    actor_id = str(request.headers.get("x-portal-actor-id") or "").strip()
    _, record = require_admin_bearer(request, actor_id)
    if record.get("role") != "full_admin":
        raise HTTPException(status_code=403, detail="full_admin_required")
    try:
        limit = int(payload.get("loginAttemptLimit"))
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=422, detail="invalid_login_attempt_limit") from error
    if limit < 3 or limit > 10:
        raise HTTPException(status_code=422, detail="invalid_login_attempt_limit")
    url, key = _config()
    config_payload = {"id": "portal_security", "data": {"loginAttemptLimit": limit}}
    result, status = _request_json(
        f"{url}/rest/v1/system_configuration?on_conflict=id",
        payload=config_payload,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=representation",
        },
    )
    if status < 200 or status >= 300:
        raise HTTPException(status_code=503, detail="security_settings_update_failed")
    return {"ok": True, "loginAttemptLimit": limit, "updatedBy": actor_id}


def create_grantor_account(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    actor_id = str(request.headers.get("x-portal-actor-id") or "").strip()
    _, admin = require_admin_bearer(request, actor_id)
    if "grantors" not in set(admin.get("permissions") or []):
        raise HTTPException(status_code=403, detail="grantor_management_permission_required")
    grantor_id = str(payload.get("providerId") or "").strip()
    email = str(payload.get("email") or "").strip().lower()
    password = str(payload.get("temporaryPassword") or "")
    if not grantor_id or not email or len(password) < 8:
        raise HTTPException(status_code=422, detail="invalid_grantor_auth_record")
    if supabase_document_get("providers", grantor_id).get("row"):
        raise HTTPException(status_code=409, detail="grantor_id_already_exists")
    auth = supabase_admin_create_user(
        email,
        password,
        {"user_id": grantor_id, "user_type": "grantor"},
        True,
        {"portal_role": "grantor"},
    )
    if not auth.get("ok"):
        raise HTTPException(status_code=409, detail=auth.get("reason") or "grantor_auth_creation_failed")
    auth_user_id = str((auth.get("user") or {}).get("id") or "")
    record = {
        **{key: value for key, value in payload.items() if key not in {"temporaryPassword", "password"}},
        "providerId": grantor_id,
        "email": email,
        "authUserId": auth_user_id,
        "mustChangePassword": True,
        "role": "provider",
        "userType": "provider",
        "status": "Active",
        "archived": False,
    }
    provider = supabase_document_upsert("providers", grantor_id, record, merge=False)
    portal = supabase_document_upsert("grantor_portals", grantor_id, record, merge=True)
    if not provider.get("ok") or not portal.get("ok"):
        raise HTTPException(status_code=503, detail="grantor_record_creation_failed")
    return {"ok": True, "grantor": {key: value for key, value in record.items() if "password" not in key.lower()}}
