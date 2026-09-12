import csv
import hashlib
import hmac
import html
import io
import json
import os
import re
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, deque
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, Request

try:
    import psutil
except ImportError:  # pragma: no cover - deployment dependency
    psutil = None

try:
    from PIL import Image
except ImportError:  # pragma: no cover - deployment dependency
    Image = None

try:
    from psycopg import connect
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover - SQL is disabled until configured
    connect = None
    dict_row = None

try:
    from .email_service import send_email_notification
    from .scholarship_rules import recommend_scholarships
except ImportError:  # pragma: no cover
    from email_service import send_email_notification
    from scholarship_rules import recommend_scholarships


ROOT_SESSION_HOURS = 8
TRUSTED_DEVICE_DAYS = 30
OTP_MINUTES = 10
MAX_OTP_ATTEMPTS = 5
MAX_QUERY_ROWS = 500
DATA_TABLES = {
    "students": "students",
    "grantors": "providers",
    "scholarships": "grantor_portal_announcements",
    "applications": "scholarship_applications",
    "announcements": "grantor_portal_announcements",
    "requirements": "soe_requests",
    "materials": "soe_downloads",
    "notifications": "studentNotifications",
}
FORBIDDEN_SQL = re.compile(
    r"\b(insert|update|delete|merge|alter|drop|truncate|create|grant|revoke|copy|call|do|execute|vacuum|refresh|reindex|cluster|comment|security|pg_read_file|pg_ls_dir|lo_import|lo_export|dblink|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|set_config|nextval|setval|pg_advisory_lock|pg_advisory_xact_lock)\b",
    re.IGNORECASE,
)
SENSITIVE_SQL = re.compile(r"\b(auth\.|vault\.|pg_authid|pg_shadow|root_(otp|sessions|trusted|admins)|recovery_code)\b", re.IGNORECASE)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now_utc().isoformat()


def _secret() -> bytes:
    value = os.getenv("ROOT_SESSION_SECRET", "").strip()
    if len(value) < 32:
        raise HTTPException(status_code=503, detail="root_session_secret_not_configured")
    return value.encode("utf-8")


def secure_hash(value: str) -> str:
    return hmac.new(_secret(), value.encode("utf-8"), hashlib.sha256).hexdigest()


def _supabase_config() -> tuple[str, str]:
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise HTTPException(status_code=503, detail="supabase_server_not_configured")
    return url, key


def _http_json(
    url: str,
    *,
    method: str = "GET",
    payload: Any = None,
    headers: dict[str, str] | None = None,
    timeout: int = 20,
) -> tuple[Any, dict[str, str]]:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            return (json.loads(raw) if raw else None), dict(response.headers.items())
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8")
        try:
            parsed = json.loads(detail)
        except ValueError:
            parsed = detail
        raise HTTPException(status_code=error.code, detail=parsed) from error
    except urllib.error.URLError as error:
        raise HTTPException(status_code=503, detail=f"upstream_unavailable:{error.reason}") from error


def _rest(
    table: str,
    *,
    method: str = "GET",
    query: str = "",
    payload: Any = None,
    prefer: str = "return=representation",
) -> Any:
    url, key = _supabase_config()
    suffix = f"?{query}" if query else ""
    data, _ = _http_json(
        f"{url}/rest/v1/{urllib.parse.quote(table, safe='')}{suffix}",
        method=method,
        payload=payload,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Prefer": prefer,
        },
    )
    return data


def _first(table: str, query: str) -> dict[str, Any] | None:
    rows = _rest(table, query=f"{query}&limit=1") or []
    return rows[0] if rows else None


def _redact_sensitive(value: Any) -> Any:
    if isinstance(value, list):
        return [_redact_sensitive(item) for item in value]
    if not isinstance(value, dict):
        return value
    return {
        key: _redact_sensitive(item)
        for key, item in value.items()
        if not re.search(r"password|token|secret|recovery|service.?role|api.?key", str(key), re.IGNORECASE)
    }


def _auth_password(email: str, password: str) -> dict[str, Any]:
    url, key = _supabase_config()
    data, _ = _http_json(
        f"{url}/auth/v1/token?grant_type=password",
        method="POST",
        payload={"email": email, "password": password},
        headers={"apikey": key, "Content-Type": "application/json"},
    )
    return data or {}


def _auth_user(access_token: str) -> dict[str, Any]:
    url, key = _supabase_config()
    data, _ = _http_json(
        f"{url}/auth/v1/user",
        headers={"apikey": key, "Authorization": f"Bearer {access_token}"},
    )
    return data or {}


def _admin_update_auth_user(auth_user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    url, key = _supabase_config()
    data, _ = _http_json(
        f"{url}/auth/v1/admin/users/{urllib.parse.quote(auth_user_id)}",
        method="PUT",
        payload=payload,
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    return data or {}


def _root_by_id(root_id: str) -> dict[str, Any] | None:
    return _first("root_admins", f"id=eq.{urllib.parse.quote(root_id)}&select=*")


def _root_by_auth(auth_user_id: str) -> dict[str, Any] | None:
    return _first("root_admins", f"auth_user_id=eq.{urllib.parse.quote(auth_user_id)}&select=*")


def audit(request: Request | None, root_id: str, action: str, target: str = "", details: dict[str, Any] | None = None) -> None:
    safe_details = {key: value for key, value in (details or {}).items() if "password" not in key.lower() and "token" not in key.lower()}
    _rest("root_audit_logs", method="POST", payload={
        "id": str(uuid4()),
        "root_id": root_id,
        "action": action,
        "target": target,
        "details": safe_details,
        "ip_address": request.client.host if request and request.client else "",
        "user_agent": request.headers.get("user-agent", "")[:500] if request else "",
    })


def _new_session(request: Request, root_id: str) -> str:
    token = secrets.token_urlsafe(48)
    _rest("root_sessions", method="POST", payload={
        "id": str(uuid4()),
        "root_id": root_id,
        "token_hash": secure_hash(token),
        "user_agent": request.headers.get("user-agent", "")[:500],
        "expires_at": (now_utc() + timedelta(hours=ROOT_SESSION_HOURS)).isoformat(),
        "reauthenticated_at": now_iso(),
    })
    return token


def require_root(request: Request, *, require_recent: bool = False) -> dict[str, Any]:
    authorization = request.headers.get("authorization", "")
    access_token = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
    session_token = request.headers.get("x-root-session", "").strip()
    if not access_token or not session_token:
        raise HTTPException(status_code=401, detail="root_authentication_required")
    user = _auth_user(access_token)
    root = _root_by_auth(str(user.get("id") or ""))
    if not root or not root.get("active"):
        raise HTTPException(status_code=403, detail="root_role_required")
    session = _first(
        "root_sessions",
        "token_hash=eq.{}&root_id=eq.{}&revoked_at=is.null&expires_at=gt.{}&select=*".format(
            secure_hash(session_token), urllib.parse.quote(root["id"]), urllib.parse.quote(now_iso())
        ),
    )
    if not session:
        raise HTTPException(status_code=401, detail="root_session_expired")
    recent_at = session.get("reauthenticated_at") or session.get("created_at")
    if require_recent and datetime.fromisoformat(recent_at.replace("Z", "+00:00")) < now_utc() - timedelta(minutes=15):
        raise HTTPException(status_code=403, detail="recent_root_authentication_required")
    _rest("root_sessions", method="PATCH", query=f"id=eq.{session['id']}", payload={"last_used_at": now_iso()}, prefer="return=minimal")
    return {"root": root, "user": user, "session": session}


def login_root(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    root_id = str(payload.get("userId") or "").strip()
    password = str(payload.get("password") or "")
    root = _root_by_id(root_id)
    if not root or not root.get("active"):
        raise HTTPException(status_code=401, detail="invalid_root_credentials")
    try:
        auth = _auth_password(root["email"], password)
    except HTTPException as error:
        if error.status_code in {400, 401}:
            raise HTTPException(status_code=401, detail="invalid_root_credentials") from error
        raise
    access_token = str(auth.get("access_token") or "")
    refresh_token = str(auth.get("refresh_token") or "")
    if root.get("must_change_password"):
        audit(request, root_id, "root_login_password_change_required")
        return {"ok": True, "stage": "change_password", "accessToken": access_token, "refreshToken": refresh_token}

    device_token = str(payload.get("deviceToken") or "")
    if device_token:
        device = _first(
            "root_trusted_devices",
            "token_hash=eq.{}&root_id=eq.{}&revoked_at=is.null&expires_at=gt.{}&select=*".format(
                secure_hash(device_token), urllib.parse.quote(root_id), urllib.parse.quote(now_iso())
            ),
        )
        if device:
            _rest("root_trusted_devices", method="PATCH", query=f"id=eq.{device['id']}", payload={"last_used_at": now_iso()}, prefer="return=minimal")
            session_token = _new_session(request, root_id)
            audit(request, root_id, "root_login_trusted_device", str(device["id"]))
            return {"ok": True, "stage": "authenticated", "accessToken": access_token, "refreshToken": refresh_token, "rootSession": session_token}
    try:
        challenge = create_otp_challenge(request, root)
        challenge_id = challenge["id"]
        delivery_failed = False
    except HTTPException as error:
        if error.status_code != 503 or not root.get("recovery_code_hashes"):
            raise
        challenge_id = ""
        delivery_failed = True
    return {"ok": True, "stage": "otp", "challengeId": challenge_id, "accessToken": access_token, "refreshToken": refresh_token, "maskedEmail": mask_email(root["email"]), "deliveryFailed": delivery_failed}


def mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    return f"{local[:2]}***@{domain}" if domain else "***"


def create_otp_challenge(request: Request, root: dict[str, Any]) -> dict[str, Any]:
    recent = _first("root_otp_challenges", f"root_id=eq.{urllib.parse.quote(root['id'])}&created_at=gt.{urllib.parse.quote((now_utc() - timedelta(seconds=60)).isoformat())}&select=*")
    if recent:
        raise HTTPException(status_code=429, detail="otp_resend_wait")
    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge = {
        "id": str(uuid4()), "root_id": root["id"], "code_hash": secure_hash(code),
        "attempts": 0, "expires_at": (now_utc() + timedelta(minutes=OTP_MINUTES)).isoformat(),
    }
    _rest("root_otp_challenges", method="POST", payload=challenge)
    delivery = send_email_notification({
        "to": root["email"], "toName": root.get("display_name") or "Root Administrator",
        "subject": "Your BulsuScholar root verification code",
        "html": f'<div data-bulsuscholar-email="true"><h2>Root sign-in verification</h2><p>Your six-digit code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:8px">{code}</p><p>This code expires in 10 minutes. If you did not sign in, reset your password.</p></div>',
    })
    if not delivery.get("sent"):
        _rest("root_otp_challenges", method="DELETE", query=f"id=eq.{challenge['id']}", prefer="return=minimal")
        raise HTTPException(status_code=503, detail={"reason": "otp_delivery_failed", "delivery": delivery.get("reason")})
    audit(request, root["id"], "root_otp_sent")
    return challenge


def change_root_password(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    authorization = request.headers.get("authorization", "")
    access_token = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
    user = _auth_user(access_token) if access_token else {}
    root = _root_by_auth(str(user.get("id") or ""))
    if not root:
        raise HTTPException(status_code=401, detail="root_authentication_required")
    password = str(payload.get("newPassword") or "")
    if len(password) < 12 or not re.search(r"[A-Z]", password) or not re.search(r"[a-z]", password) or not re.search(r"\d", password) or not re.search(r"[^A-Za-z0-9]", password):
        raise HTTPException(status_code=422, detail="root_password_too_weak")
    _admin_update_auth_user(str(root["auth_user_id"]), {"password": password})
    recovery_codes = [secrets.token_hex(5).upper() for _ in range(10)]
    _rest("root_admins", method="PATCH", query=f"id=eq.{urllib.parse.quote(root['id'])}", payload={
        "must_change_password": False,
        "recovery_code_hashes": [secure_hash(code) for code in recovery_codes],
        "updated_at": now_iso(),
    })
    root["must_change_password"] = False
    try:
        challenge = create_otp_challenge(request, root)
        challenge_id = challenge["id"]
        delivery_failed = False
    except HTTPException as error:
        if error.status_code != 503:
            raise
        challenge_id = ""
        delivery_failed = True
    audit(request, root["id"], "root_password_changed")
    return {"ok": True, "stage": "otp", "challengeId": challenge_id, "maskedEmail": mask_email(root["email"]), "recoveryCodes": recovery_codes, "deliveryFailed": delivery_failed}


def request_root_otp(request: Request) -> dict[str, Any]:
    authorization = request.headers.get("authorization", "")
    access_token = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
    user = _auth_user(access_token) if access_token else {}
    root = _root_by_auth(str(user.get("id") or ""))
    if not root or not root.get("active"):
        raise HTTPException(status_code=401, detail="root_authentication_required")
    challenge = create_otp_challenge(request, root)
    return {"ok": True, "challengeId": challenge["id"], "maskedEmail": mask_email(root["email"])}


def _validate_root_password(password: str) -> None:
    if len(password) < 12 or not re.search(r"[A-Z]", password) or not re.search(r"[a-z]", password) or not re.search(r"\d", password) or not re.search(r"[^A-Za-z0-9]", password):
        raise HTTPException(status_code=422, detail="root_password_too_weak")


def reauthenticate_root(request: Request, identity: dict[str, Any], password: str) -> dict[str, Any]:
    if not password:
        raise HTTPException(status_code=422, detail="root_password_required")
    try:
        _auth_password(identity["root"]["email"], password)
    except HTTPException as error:
        if error.status_code in {400, 401}:
            raise HTTPException(status_code=401, detail="invalid_root_credentials") from error
        raise
    _rest(
        "root_sessions",
        method="PATCH",
        query=f"id=eq.{identity['session']['id']}",
        payload={"reauthenticated_at": now_iso(), "last_used_at": now_iso()},
        prefer="return=minimal",
    )
    audit(request, identity["root"]["id"], "root_reauthenticated")
    return {"ok": True, "validForSeconds": 900}


def update_authenticated_root_password(request: Request, identity: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    reauthenticate_root(request, identity, str(payload.get("currentPassword") or ""))
    new_password = str(payload.get("newPassword") or "")
    _validate_root_password(new_password)
    _admin_update_auth_user(str(identity["root"]["auth_user_id"]), {"password": new_password})
    _rest(
        "root_sessions",
        method="PATCH",
        query=f"root_id=eq.{urllib.parse.quote(identity['root']['id'])}&id=neq.{identity['session']['id']}&revoked_at=is.null",
        payload={"revoked_at": now_iso()},
        prefer="return=minimal",
    )
    _rest("root_trusted_devices", method="PATCH", query=f"root_id=eq.{urllib.parse.quote(identity['root']['id'])}&revoked_at=is.null", payload={"revoked_at": now_iso()}, prefer="return=minimal")
    audit(request, identity["root"]["id"], "root_password_changed_authenticated")
    return {"ok": True, "otherSessionsRevoked": True}


def regenerate_recovery_codes(request: Request, identity: dict[str, Any]) -> dict[str, Any]:
    recovery_codes = [secrets.token_hex(5).upper() for _ in range(10)]
    _rest(
        "root_admins",
        method="PATCH",
        query=f"id=eq.{urllib.parse.quote(identity['root']['id'])}",
        payload={"recovery_code_hashes": [secure_hash(code) for code in recovery_codes], "updated_at": now_iso()},
        prefer="return=minimal",
    )
    audit(request, identity["root"]["id"], "root_recovery_codes_regenerated")
    return {"ok": True, "recoveryCodes": recovery_codes}


def verify_root_otp(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    authorization = request.headers.get("authorization", "")
    access_token = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
    user = _auth_user(access_token) if access_token else {}
    root = _root_by_auth(str(user.get("id") or ""))
    if not root:
        raise HTTPException(status_code=401, detail="root_authentication_required")
    challenge_id = str(payload.get("challengeId") or "")
    code = str(payload.get("code") or "").strip().upper()
    challenge = _first("root_otp_challenges", f"id=eq.{urllib.parse.quote(challenge_id)}&root_id=eq.{urllib.parse.quote(root['id'])}&select=*")
    valid_challenge = challenge and not challenge.get("consumed_at") and challenge.get("attempts", 0) < MAX_OTP_ATTEMPTS and datetime.fromisoformat(challenge["expires_at"].replace("Z", "+00:00")) > now_utc()
    recovery_hashes = list(root.get("recovery_code_hashes") or [])
    recovery_hash = secure_hash(code) if code else ""
    used_recovery = recovery_hash in recovery_hashes
    if not used_recovery and (not valid_challenge or not hmac.compare_digest(challenge["code_hash"], recovery_hash)):
        if challenge:
            _rest("root_otp_challenges", method="PATCH", query=f"id=eq.{challenge_id}", payload={"attempts": int(challenge.get("attempts") or 0) + 1}, prefer="return=minimal")
        raise HTTPException(status_code=401, detail="invalid_or_expired_root_code")
    if used_recovery:
        recovery_hashes.remove(recovery_hash)
        _rest("root_admins", method="PATCH", query=f"id=eq.{urllib.parse.quote(root['id'])}", payload={"recovery_code_hashes": recovery_hashes}, prefer="return=minimal")
    elif challenge:
        _rest("root_otp_challenges", method="PATCH", query=f"id=eq.{challenge_id}", payload={"consumed_at": now_iso()}, prefer="return=minimal")
    root_session = _new_session(request, root["id"])
    trusted_token = ""
    if payload.get("rememberDevice", True):
        trusted_token = secrets.token_urlsafe(48)
        _rest("root_trusted_devices", method="POST", payload={
            "id": str(uuid4()), "root_id": root["id"], "token_hash": secure_hash(trusted_token),
            "label": str(payload.get("deviceLabel") or "Browser")[:120],
            "user_agent": request.headers.get("user-agent", "")[:500],
            "expires_at": (now_utc() + timedelta(days=TRUSTED_DEVICE_DAYS)).isoformat(),
        })
    audit(request, root["id"], "root_otp_verified", details={"recoveryCode": used_recovery})
    return {"ok": True, "rootSession": root_session, "trustedDeviceToken": trusted_token, "root": {"id": root["id"], "displayName": root.get("display_name")}}


METRIC_LOCK = threading.Lock()
STARTED_AT = time.time()
RECENT_DURATIONS: deque[float] = deque(maxlen=5000)
METRICS = {"requests": 0, "errors": 0, "inFlight": 0, "routes": Counter(), "statuses": Counter()}
HOURLY_METRICS = {"bucket": "", "requests": 0, "errors": 0, "duration": 0.0, "maxDuration": 0.0, "routes": Counter(), "statuses": Counter()}
LAST_METRIC_FLUSH = 0.0
PUBLIC_CONFIG_CACHE: dict[str, Any] = {"value": None, "expires": 0.0}


def metric_started() -> float:
    with METRIC_LOCK:
        METRICS["inFlight"] += 1
    return time.perf_counter()


def metric_finished(path: str, status: int, started: float) -> None:
    global LAST_METRIC_FLUSH
    duration = (time.perf_counter() - started) * 1000
    route = re.sub(r"/[0-9a-fA-F-]{16,}", "/:id", path)
    bucket = now_utc().replace(minute=0, second=0, microsecond=0).isoformat()
    with METRIC_LOCK:
        METRICS["inFlight"] = max(0, METRICS["inFlight"] - 1)
        METRICS["requests"] += 1
        METRICS["errors"] += int(status >= 500)
        METRICS["routes"][route] += 1
        METRICS["statuses"][str(status)] += 1
        RECENT_DURATIONS.append(duration)
        if HOURLY_METRICS["bucket"] != bucket:
            HOURLY_METRICS.update({"bucket": bucket, "requests": 0, "errors": 0, "duration": 0.0, "maxDuration": 0.0, "routes": Counter(), "statuses": Counter()})
        HOURLY_METRICS["requests"] += 1
        HOURLY_METRICS["errors"] += int(status >= 500)
        HOURLY_METRICS["duration"] += duration
        HOURLY_METRICS["maxDuration"] = max(HOURLY_METRICS["maxDuration"], duration)
        HOURLY_METRICS["routes"][route] += 1
        HOURLY_METRICS["statuses"][str(status)] += 1
        should_flush = time.time() - LAST_METRIC_FLUSH >= 60
        if should_flush:
            LAST_METRIC_FLUSH = time.time()
            snapshot = {
                "bucket_start": bucket,
                "request_count": HOURLY_METRICS["requests"],
                "error_count": HOURLY_METRICS["errors"],
                "total_duration_ms": HOURLY_METRICS["duration"],
                "max_duration_ms": HOURLY_METRICS["maxDuration"],
                "route_counts": dict(HOURLY_METRICS["routes"]),
                "status_counts": dict(HOURLY_METRICS["statuses"]),
                "updated_at": now_iso(),
            }
    if should_flush:
        threading.Thread(target=_persist_metric_bucket, args=(snapshot,), daemon=True).start()


def _persist_metric_bucket(snapshot: dict[str, Any]) -> None:
    try:
        _rest("request_metric_buckets", method="POST", query="on_conflict=bucket_start", payload=snapshot, prefer="resolution=merge-duplicates,return=minimal")
        cutoff = urllib.parse.quote((now_utc() - timedelta(days=90)).isoformat())
        _rest("request_metric_buckets", method="DELETE", query=f"bucket_start=lt.{cutoff}", prefer="return=minimal")
    except Exception:
        return


def metrics_snapshot() -> dict[str, Any]:
    with METRIC_LOCK:
        durations = sorted(RECENT_DURATIONS)
        percentile = lambda p: round(durations[min(len(durations) - 1, int(len(durations) * p))], 2) if durations else 0
        result = {
            "uptimeSeconds": int(time.time() - STARTED_AT), "requests": METRICS["requests"],
            "errors": METRICS["errors"], "inFlight": METRICS["inFlight"],
            "routes": dict(METRICS["routes"].most_common(20)), "statuses": dict(METRICS["statuses"]),
            "latencyMs": {"p50": percentile(.50), "p95": percentile(.95), "p99": percentile(.99)},
        }
    if psutil:
        process = psutil.Process()
        result["process"] = {"cpuPercent": process.cpu_percent(), "memoryBytes": process.memory_info().rss, "threads": process.num_threads()}
    return result


def historical_metrics() -> list[dict[str, Any]]:
    try:
        return _rest("request_metric_buckets", query="select=*&order=bucket_start.desc&limit=2160") or []
    except HTTPException:
        return []


def dependency_health() -> dict[str, Any]:
    started = time.perf_counter()
    try:
        _rest("system_configuration", query="select=id&limit=1")
        supabase = {"configured": True, "reachable": True, "latencyMs": round((time.perf_counter() - started) * 1000, 2)}
    except HTTPException as error:
        supabase = {"configured": bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_ROLE_KEY")), "reachable": False, "latencyMs": round((time.perf_counter() - started) * 1000, 2), "status": error.status_code}
    return {
        "supabase": supabase,
        "email": {"configured": bool(os.getenv("RESEND_API_KEY") or os.getenv("BREVO_API_KEY"))},
        "sqlConsole": {"configured": bool(os.getenv("ROOT_DATABASE_URL"))},
        "railway": {"configured": bool(os.getenv("RAILWAY_PROJECT_TOKEN") and os.getenv("RAILWAY_SERVICE_ID"))},
        "vercel": {"configured": bool(os.getenv("VERCEL_DEPLOY_HOOK_URL") or (os.getenv("VERCEL_ACCESS_TOKEN") and os.getenv("VERCEL_PROJECT_ID")))},
        "openai": {"configured": bool(os.getenv("OPENAI_API_KEY"))},
    }


def list_rows(table: str, page: int = 1, page_size: int = 25, search: str = "") -> dict[str, Any]:
    if table not in DATA_TABLES:
        raise HTTPException(status_code=404, detail="root_dataset_not_found")
    actual = DATA_TABLES[table]
    offset = max(0, (page - 1) * page_size)
    if search:
        rows = _rest(actual, query="select=*&order=updated_at.desc&limit=1000") or []
        normalized = [_redact_sensitive({"id": row.get("id"), **(row.get("data") or {}), "updatedAt": row.get("updated_at")}) for row in rows]
        term = search.lower()
        normalized = [row for row in normalized if term in json.dumps(row, default=str).lower()]
        page_rows = normalized[offset:offset + page_size]
        return {"ok": True, "rows": page_rows, "page": page, "pageSize": page_size, "hasMore": offset + page_size < len(normalized), "total": len(normalized)}
    rows = _rest(actual, query=f"select=*&order=updated_at.desc&offset={offset}&limit={min(100, page_size)}") or []
    normalized = [_redact_sensitive({"id": row.get("id"), **(row.get("data") or {}), "updatedAt": row.get("updated_at")}) for row in rows]
    return {"ok": True, "rows": normalized, "page": page, "pageSize": page_size, "hasMore": len(rows) == page_size}


def _all_data_rows(table: str, limit: int = 10_000) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for offset in range(0, limit, 1000):
        page = _rest(table, query=f"select=*&order=updated_at.desc&offset={offset}&limit=1000") or []
        rows.extend({"id": row.get("id"), **(row.get("data") or {}), "updatedAt": row.get("updated_at")} for row in page)
        if len(page) < 1000:
            break
    return rows


def _text(value: Any, fallback: str = "-") -> str:
    if value is None or value == "":
        return fallback
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, default=str)
    return str(value)


def _full_name(record: dict[str, Any]) -> str:
    return _text(record.get("fullName") or record.get("name") or " ".join(filter(None, [record.get("fname"), record.get("mname"), record.get("lname")])).strip())


def _is_open_record(record: dict[str, Any]) -> bool:
    status = str(record.get("status") or record.get("recordStatus") or "active").lower()
    return not record.get("archived") and not record.get("hiddenFromStudents") and not any(value in status for value in ("archived", "rejected", "withdrawn", "cancelled", "closed", "expired", "disabled"))


ROOT_REPORT_COLUMNS = {
    "students": [("studentId", "Student ID"), ("fullName", "Full Name"), ("course", "Course"), ("yearLevel", "Year Level"), ("gwa", "GWA"), ("grantor", "Grantor"), ("activeApplications", "Active Applications"), ("currentStage", "Current Stage"), ("recordStatus", "Record Status")],
    "grantors": [("grantorId", "Grantor ID"), ("name", "Name"), ("email", "Email"), ("organization", "Organization"), ("activeScholarships", "Active Scholarships"), ("scholars", "Scholars"), ("accountStatus", "Account Status"), ("createdAt", "Creation Date")],
    "scholarships": [("title", "Scholarship"), ("grantor", "Grantor"), ("minimumGwa", "Minimum GWA"), ("totalSlots", "Total Slots"), ("occupiedSlots", "Occupied Slots"), ("remainingSlots", "Remaining Slots"), ("applications", "Applications"), ("window", "Application Window"), ("status", "Status")],
    "requirements": [("applicationNumber", "Application Number"), ("requestNumber", "Request Number"), ("student", "Student"), ("scholarship", "Scholarship"), ("grantor", "Grantor"), ("materials", "Materials"), ("requestState", "Request State"), ("reviewState", "Review State"), ("downloadState", "Download State"), ("signingState", "Signing State"), ("requestedAt", "Requested"), ("reviewedAt", "Reviewed"), ("downloadedAt", "Downloaded"), ("signedAt", "Signed")],
    "compliance": [("student", "Student"), ("scholarship", "Scholarship"), ("grantor", "Grantor"), ("status", "Status"), ("violations", "Violations"), ("blocked", "Blocked"), ("lastReview", "Last Review")],
    "top_students": [("rank", "Rank"), ("scholarship", "Scholarship"), ("grantor", "Grantor"), ("studentId", "Student ID"), ("fullName", "Student"), ("course", "Course"), ("yearLevel", "Year"), ("gwa", "GWA"), ("score", "Score"), ("reasons", "Eligibility Reasons")],
}


def build_root_report(report_type: str) -> dict[str, Any]:
    if report_type not in ROOT_REPORT_COLUMNS:
        raise HTTPException(status_code=404, detail="root_report_not_found")
    students = _all_data_rows("students")
    grantors = _all_data_rows("providers")
    announcements = _all_data_rows("grantor_portal_announcements")
    applications = _all_data_rows("scholarship_applications")
    student_by_id = {str(row.get("studentId") or row.get("studentnumber") or row.get("id")): row for row in students}
    grantor_by_id = {str(row.get("grantorId") or row.get("providerId") or row.get("id")): row for row in grantors}
    announcement_by_id = {str(row.get("announcementId") or row.get("id")): row for row in announcements}
    active_applications = [row for row in applications if _is_open_record(row)]
    records: list[dict[str, Any]] = []

    if report_type == "students":
        for student in students:
            student_id = str(student.get("studentId") or student.get("studentnumber") or student.get("id"))
            owned = [item for item in active_applications if str(item.get("studentId") or item.get("studentnumber")) == student_id]
            scholarship_entries = [item for item in student.get("scholarships") or [] if isinstance(item, dict) and _is_open_record(item)]
            grantor_name = student.get("grantorName") or student.get("providerName")
            if not grantor_name and scholarship_entries:
                grantor_name = scholarship_entries[0].get("grantorName") or scholarship_entries[0].get("providerName") or scholarship_entries[0].get("provider")
            records.append({"studentId": student_id, "fullName": _full_name(student), "course": _text(student.get("course")), "yearLevel": _text(student.get("yearLevel") or student.get("year")), "gwa": _text(student.get("gwa") or student.get("currentGwa")), "grantor": _text(grantor_name), "activeApplications": len(owned), "currentStage": _text((owned[0] if owned else {}).get("currentStage") or (owned[0] if owned else {}).get("trackingStage")), "recordStatus": _text(student.get("recordStatus") or student.get("status") or "Active")})
    elif report_type == "grantors":
        for grantor in grantors:
            grantor_id = str(grantor.get("grantorId") or grantor.get("providerId") or grantor.get("id"))
            owned_announcements = [row for row in announcements if str(row.get("grantorId") or row.get("providerId")) == grantor_id and _is_open_record(row)]
            owned_students = {str(row.get("studentId") or row.get("studentnumber")) for row in active_applications if str(row.get("grantorId") or row.get("providerId")) == grantor_id}
            records.append({"grantorId": grantor_id, "name": _text(grantor.get("grantorName") or grantor.get("providerName") or grantor.get("name")), "email": _text(grantor.get("email")), "organization": _text(grantor.get("organization") or grantor.get("organizationName")), "activeScholarships": len(owned_announcements), "scholars": len(owned_students), "accountStatus": _text(grantor.get("status") or ("Archived" if grantor.get("archived") else "Active")), "createdAt": _text(grantor.get("createdAt"))})
    elif report_type == "scholarships":
        for item in announcements:
            announcement_id = str(item.get("announcementId") or item.get("id"))
            grantor = grantor_by_id.get(str(item.get("grantorId") or item.get("providerId")), {})
            related = [row for row in applications if str(row.get("announcementId")) == announcement_id]
            total = int(item.get("totalSlots") or 0)
            remaining = int(item.get("remainingSlots") or 0)
            records.append({"title": _text(item.get("scholarshipTitle") or item.get("title")), "grantor": _text(item.get("grantorName") or item.get("providerLabel") or grantor.get("grantorName") or grantor.get("providerName")), "minimumGwa": _text(item.get("minimumGwa") or item.get("minGwa")), "totalSlots": total, "occupiedSlots": max(0, total - remaining), "remainingSlots": remaining, "applications": len(related), "window": f"{_text(item.get('applicationStart') or item.get('startDate'))} to {_text(item.get('applicationEnd') or item.get('endDate'))}", "status": _text(item.get("status") or ("Active" if _is_open_record(item) else "Closed"))})
    elif report_type == "requirements":
        requests = _all_data_rows("soe_requests")
        downloads = _all_data_rows("soe_downloads")
        for request_row in requests:
            application_number = str(request_row.get("applicationNumber") or "")
            request_number = str(request_row.get("requestNumber") or request_row.get("id") or "")
            application = next((row for row in applications if application_number and str(row.get("applicationNumber")) == application_number), {})
            download = next((row for row in downloads if (application_number and str(row.get("applicationNumber")) == application_number) or str(row.get("requestNumber")) == request_number), {})
            student = student_by_id.get(str(request_row.get("studentId") or application.get("studentId")), {})
            announcement = announcement_by_id.get(str(request_row.get("announcementId") or application.get("announcementId")), {})
            materials = request_row.get("materials") or request_row.get("requestedMaterials") or {}
            records.append({"applicationNumber": _text(application_number), "requestNumber": _text(request_number), "student": _full_name(student) if student else _text(request_row.get("studentName")), "scholarship": _text(request_row.get("scholarshipTitle") or application.get("scholarshipTitle") or announcement.get("scholarshipTitle") or announcement.get("title")), "grantor": _text(request_row.get("grantorName") or application.get("grantorName") or announcement.get("grantorName")), "materials": _text(materials), "requestState": _text(request_row.get("status") or request_row.get("requestState")), "reviewState": _text(request_row.get("reviewState") or request_row.get("adminStatus")), "downloadState": _text(download.get("status") or download.get("downloadState")), "signingState": _text(download.get("signingState") or download.get("signatureStatus")), "requestedAt": _text(request_row.get("createdAt") or request_row.get("requestedAt")), "reviewedAt": _text(request_row.get("reviewedAt") or request_row.get("updatedAt")), "downloadedAt": _text(download.get("downloadedAt")), "signedAt": _text(download.get("signedAt") or download.get("updatedAt"))})
    elif report_type == "compliance":
        for student in students:
            entries = [item for item in student.get("scholarships") or [] if isinstance(item, dict)]
            entry = next((item for item in entries if _is_open_record(item)), entries[0] if entries else {})
            violations = student.get("violations") or student.get("complianceViolations") or []
            records.append({"student": _full_name(student), "scholarship": _text(entry.get("name") or entry.get("scholarshipTitle")), "grantor": _text(entry.get("grantorName") or entry.get("providerName") or student.get("grantorName")), "status": _text(student.get("complianceStatus") or student.get("status") or "Active"), "violations": _text(violations), "blocked": "Yes" if student.get("blocked") or student.get("applicationBlocked") else "No", "lastReview": _text(student.get("complianceReviewedAt") or student.get("updatedAt"))})
    else:
        active_offerings = [row for row in announcements if _is_open_record(row) and (row.get("openForApplications") or row.get("isApplicationAnnouncement") or row.get("slotsConfigured"))]
        eligible_students = [row for row in students if not row.get("scholarshipCommitment") and not row.get("selectedScholarshipId") and not row.get("blocked") and _is_open_record(row)]
        groups: dict[str, list[dict[str, Any]]] = {str(item.get("announcementId") or item.get("id")): [] for item in active_offerings}
        for student in eligible_students:
            ranked = recommend_scholarships({"student": student, "scholarships": active_offerings})
            for recommendation in ranked.get("recommendations") or []:
                offering = recommendation.get("item") or {}
                offering_id = str(offering.get("announcementId") or offering.get("id"))
                if offering_id in groups:
                    groups[offering_id].append({"student": student, "recommendation": recommendation, "offering": offering})
        for offering_id, candidates in groups.items():
            candidates.sort(key=lambda value: (-float(value["recommendation"].get("score") or 0), _full_name(value["student"]).lower()))
            for rank, candidate in enumerate(candidates[:10], 1):
                student, recommendation, offering = candidate["student"], candidate["recommendation"], candidate["offering"]
                records.append({"rank": rank, "scholarship": _text(offering.get("scholarshipTitle") or offering.get("title")), "grantor": _text(offering.get("grantorName") or offering.get("providerLabel")), "studentId": _text(student.get("studentId") or student.get("studentnumber") or student.get("id")), "fullName": _full_name(student), "course": _text(student.get("course")), "yearLevel": _text(student.get("yearLevel") or student.get("year")), "gwa": _text(student.get("gwa") or student.get("currentGwa")), "score": recommendation.get("score") or 0, "reasons": ", ".join(recommendation.get("reasons") or []) or "Eligible"})

    columns = [{"key": key, "label": label, "weight": 1} for key, label in ROOT_REPORT_COLUMNS[report_type]]
    rows = [[_text(record.get(column["key"])) for column in columns] for record in records]
    return {"ok": True, "reportType": report_type, "title": report_type.replace("_", " ").title(), "columns": columns, "records": records, "rows": rows, "rowCount": len(rows), "generatedAt": now_iso(), "filterLabel": "All records"}


def table_count(table: str) -> int:
    url, key = _supabase_config()
    _, headers = _http_json(
        f"{url}/rest/v1/{table}?select=id&limit=1",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Prefer": "count=exact", "Range": "0-0"},
    )
    value = headers.get("Content-Range", "0/0").split("/")[-1]
    return int(value) if value.isdigit() else 0


def overview() -> dict[str, Any]:
    counts = {}
    for label, table in {"students": "students", "grantors": "providers", "scholarships": "grantor_portal_announcements", "applications": "scholarship_applications", "tickets": "support_feedback"}.items():
        try:
            counts[label] = table_count(table)
        except HTTPException:
            counts[label] = None
    return {"ok": True, "counts": counts, "metrics": metrics_snapshot(), "dependencies": dependency_health(), "config": public_config(), "version": os.getenv("RAILWAY_GIT_COMMIT_SHA", "local")[:12]}


def public_config() -> dict[str, Any]:
    if PUBLIC_CONFIG_CACHE["value"] is not None and PUBLIC_CONFIG_CACHE["expires"] > time.time():
        return PUBLIC_CONFIG_CACHE["value"]
    rows = _rest("system_configuration", query="id=in.(portal,academic_cycle,branding)&select=id,data") or []
    values = {row["id"]: row.get("data") or {} for row in rows}
    result = {"ok": True, "portal": values.get("portal", {}), "academicCycle": values.get("academic_cycle", {}), "branding": values.get("branding", {})}
    PUBLIC_CONFIG_CACHE.update({"value": result, "expires": time.time() + 30})
    return result


def configured_semester_tag() -> str:
    cycle = public_config().get("academicCycle", {})
    return str(cycle.get("semesterTag") or (f"{cycle.get('academicYear')}-{cycle.get('semester')}" if cycle.get("academicYear") and cycle.get("semester") else ""))


def _validate_branding(data: dict[str, Any]) -> dict[str, Any]:
    fields = {"productName", "fontFamily", "primaryColor", "accentColor", "logoUrl", "faviconUrl", "maintenanceMessage"}
    branding = {key: value for key, value in data.items() if key in fields}
    if branding.get("fontFamily") not in {"Inter", "Segoe UI", "Arial", "Georgia"}:
        raise HTTPException(status_code=422, detail="unsupported_brand_font")
    if not re.fullmatch(r"#[0-9A-Fa-f]{6}", str(branding.get("primaryColor") or "")) or not re.fullmatch(r"#[0-9A-Fa-f]{6}", str(branding.get("accentColor") or "")):
        raise HTTPException(status_code=422, detail="invalid_brand_color")
    for field in ("logoUrl", "faviconUrl"):
        value = str(branding.get(field) or "").strip()
        if value and not value.startswith("https://"):
            raise HTTPException(status_code=422, detail="brand_asset_https_required")
        branding[field] = value
    branding["productName"] = str(branding.get("productName") or "BulsuScholar")[:80]
    branding["maintenanceMessage"] = str(branding.get("maintenanceMessage") or "")[:500]
    return branding


def update_config(request: Request, identity: dict[str, Any], key: str, data: dict[str, Any]) -> dict[str, Any]:
    if key not in {"portal", "academic_cycle", "branding"}:
        raise HTTPException(status_code=404, detail="system_setting_not_found")
    current = _first("system_configuration", f"id=eq.{key}&select=*") or {"data": {}}
    allowed_fields = {
        "portal": {"maintenanceMode", "allowStudentSignup", "allowGrantorAnnouncements", "reportExportEnabled"},
        "academic_cycle": {"academicYear", "semester"},
        "branding": {"productName", "fontFamily", "primaryColor", "accentColor", "logoUrl", "faviconUrl", "maintenanceMessage"},
    }
    unknown = set(data) - allowed_fields[key]
    if unknown:
        raise HTTPException(status_code=422, detail="unsupported_system_setting")
    merged = {**(current.get("data") or {}), **data, "updatedBy": identity["root"]["id"], "updatedAt": now_iso()}
    if key == "academic_cycle":
        if not re.fullmatch(r"\d{4}-\d{4}", str(merged.get("academicYear") or "")) or merged.get("semester") not in {"1ST", "2ND"}:
            raise HTTPException(status_code=422, detail="invalid_academic_cycle")
        merged["semesterTag"] = f"{merged['academicYear']}-{merged['semester']}"
        merged["activatedAt"] = now_iso()
    if key == "branding":
        merged = {**merged, **_validate_branding(merged)}
    _rest("system_configuration", method="POST", query="on_conflict=id", payload={"id": key, "data": merged, "updated_at": now_iso()}, prefer="resolution=merge-duplicates,return=representation")
    PUBLIC_CONFIG_CACHE.update({"value": None, "expires": 0.0})
    audit(request, identity["root"]["id"], f"system_{key}_updated", key, {"fields": sorted(data.keys())})
    return {"ok": True, "id": key, "data": merged}


def list_branding_versions() -> list[dict[str, Any]]:
    return _rest("branding_versions", query="select=*&order=created_at.desc&limit=50") or []


def save_branding_draft(request: Request, identity: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
    current = public_config().get("branding", {})
    clean = _validate_branding({**current, **data})
    record = {"id": str(uuid4()), "data": clean, "status": "draft", "created_by": identity["root"]["id"]}
    saved = _rest("branding_versions", method="POST", payload=record) or [record]
    audit(request, identity["root"]["id"], "branding_draft_created", record["id"])
    return {"ok": True, "version": saved[0] if isinstance(saved, list) else saved}


def publish_branding_version(request: Request, identity: dict[str, Any], version_id: str) -> dict[str, Any]:
    version = _first("branding_versions", f"id=eq.{urllib.parse.quote(version_id)}&select=*")
    if not version:
        raise HTTPException(status_code=404, detail="branding_version_not_found")
    _rest("branding_versions", method="PATCH", query="status=eq.published", payload={"status": "archived"}, prefer="return=minimal")
    _rest("branding_versions", method="PATCH", query=f"id=eq.{urllib.parse.quote(version_id)}", payload={"status": "published", "published_at": now_iso()}, prefer="return=minimal")
    result = update_config(request, identity, "branding", version.get("data") or {})
    audit(request, identity["root"]["id"], "branding_version_published", version_id)
    return {"ok": True, "versionId": version_id, "data": result["data"]}


def upload_branding_asset(request: Request, identity: dict[str, Any], filename: str, content_type: str, content: bytes) -> dict[str, Any]:
    allowed = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/x-icon": ".ico", "image/vnd.microsoft.icon": ".ico"}
    if content_type not in allowed or not content or len(content) > 3 * 1024 * 1024 or Image is None:
        raise HTTPException(status_code=422, detail="valid_brand_raster_required")
    try:
        with Image.open(io.BytesIO(content)) as image:
            image.verify()
            if image.width < 16 or image.height < 16 or image.width > 4096 or image.height > 4096:
                raise ValueError("invalid_dimensions")
    except Exception as error:
        raise HTTPException(status_code=422, detail="valid_brand_raster_required") from error
    supabase_url, key = _supabase_config()
    path = f"root-branding/{uuid4().hex}{allowed[content_type]}"
    upload_request = urllib.request.Request(
        f"{supabase_url}/storage/v1/object/bulsuscholar/{urllib.parse.quote(path, safe='/')}",
        data=content,
        method="POST",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": content_type, "x-upsert": "false"},
    )
    try:
        with urllib.request.urlopen(upload_request, timeout=30):
            pass
    except urllib.error.HTTPError as error:
        raise HTTPException(status_code=502, detail="brand_asset_upload_failed") from error
    public_url = f"{supabase_url}/storage/v1/object/public/bulsuscholar/{urllib.parse.quote(path, safe='/')}"
    audit(request, identity["root"]["id"], "branding_asset_uploaded", path, {"filename": filename[:160], "size": len(content), "contentType": content_type})
    return {"ok": True, "url": public_url, "path": path}


def sql_query(request: Request, identity: dict[str, Any], statement: str) -> dict[str, Any]:
    sql = statement.strip()
    compact = re.sub(r"\s+", " ", sql)
    if not sql or not re.match(r"^(select|explain)\b", compact, re.IGNORECASE):
        raise HTTPException(status_code=422, detail="read_only_sql_required")
    if ";" in sql.rstrip(";") or FORBIDDEN_SQL.search(sql) or SENSITIVE_SQL.search(sql) or "--" in sql or "/*" in sql:
        raise HTTPException(status_code=422, detail="sql_statement_not_allowed")
    database_url = os.getenv("ROOT_DATABASE_URL") or os.getenv("SUPABASE_DB_URL", "")
    if not database_url or not connect:
        raise HTTPException(status_code=503, detail="root_sql_not_configured")
    started = time.perf_counter()
    try:
        with connect(database_url, autocommit=False, row_factory=dict_row, connect_timeout=10) as connection:
            with connection.cursor() as cursor:
                cursor.execute("set local transaction read only")
                cursor.execute("set local statement_timeout = '10s'")
                cursor.execute(sql)
                rows = cursor.fetchmany(MAX_QUERY_ROWS + 1) if cursor.description else []
                columns = [item.name for item in cursor.description] if cursor.description else []
            connection.rollback()
    except Exception as error:
        audit(request, identity["root"]["id"], "sql_query_failed", details={"queryHash": hashlib.sha256(sql.encode()).hexdigest(), "error": str(error)[:300]})
        raise HTTPException(status_code=422, detail=f"sql_query_failed:{str(error)[:300]}") from error
    truncated = len(rows) > MAX_QUERY_ROWS
    output = [dict(row) for row in rows[:MAX_QUERY_ROWS]]
    audit(request, identity["root"]["id"], "sql_query_executed", details={"queryHash": hashlib.sha256(sql.encode()).hexdigest(), "rows": len(output)})
    return {"ok": True, "columns": columns, "rows": output, "truncated": truncated, "durationMs": round((time.perf_counter() - started) * 1000, 2)}


SQL_PRESETS = [
    {"id": "table_sizes", "label": "Largest public tables", "sql": "select relname as table_name, pg_size_pretty(pg_total_relation_size(relid)) as total_size from pg_catalog.pg_statio_user_tables order by pg_total_relation_size(relid) desc limit 25"},
    {"id": "active_connections", "label": "Active database connections", "sql": "select application_name, state, count(*) as connections from pg_stat_activity where datname = current_database() group by application_name, state order by connections desc"},
    {"id": "long_queries", "label": "Long-running queries", "sql": "select pid, application_name, state, now() - query_start as duration from pg_stat_activity where state <> 'idle' and pid <> pg_backend_pid() order by query_start limit 50"},
    {"id": "index_usage", "label": "Lowest index usage", "sql": "select relname as table_name, seq_scan, idx_scan from pg_stat_user_tables order by seq_scan desc limit 50"},
    {"id": "record_counts", "label": "Core record counts", "sql": "select 'students' as dataset, count(*) from public.students union all select 'providers', count(*) from public.providers union all select 'applications', count(*) from public.scholarship_applications"},
]

SQL_MAINTENANCE_ACTIONS = [
    {"id": "cleanup_expired_root_security", "label": "Clean expired root sessions, devices, and OTP challenges"},
    {"id": "cleanup_old_metrics", "label": "Clean request metrics older than 90 days"},
    {"id": "analyze_core_tables", "label": "Analyze core application tables"},
]


def run_sql_maintenance(request: Request, identity: dict[str, Any], action: str) -> dict[str, Any]:
    if action == "cleanup_expired_root_security":
        cutoff = urllib.parse.quote(now_iso())
        counts = {}
        for table, condition in {
            "root_otp_challenges": f"expires_at=lt.{cutoff}",
            "root_trusted_devices": f"expires_at=lt.{cutoff}",
            "root_sessions": f"expires_at=lt.{cutoff}",
        }.items():
            deleted = _rest(table, method="DELETE", query=f"{condition}&select=id", prefer="return=representation") or []
            counts[table] = len(deleted)
        result = {"deleted": counts}
    elif action == "cleanup_old_metrics":
        cutoff = urllib.parse.quote((now_utc() - timedelta(days=90)).isoformat())
        deleted = _rest("request_metric_buckets", method="DELETE", query=f"bucket_start=lt.{cutoff}&select=bucket_start", prefer="return=representation") or []
        result = {"deleted": len(deleted)}
    elif action == "analyze_core_tables":
        database_url = os.getenv("ROOT_DATABASE_URL") or os.getenv("SUPABASE_DB_URL", "")
        if not database_url or not connect:
            raise HTTPException(status_code=503, detail="root_sql_not_configured")
        try:
            with connect(database_url, autocommit=True, connect_timeout=10) as connection:
                with connection.cursor() as cursor:
                    cursor.execute("set statement_timeout = '10s'")
                    cursor.execute("analyze public.students, public.providers, public.scholarship_applications, public.grantor_portal_announcements")
            result = {"analyzed": True}
        except Exception as error:
            raise HTTPException(status_code=422, detail="database_analyze_failed") from error
    else:
        raise HTTPException(status_code=422, detail="sql_maintenance_action_not_allowed")
    audit(request, identity["root"]["id"], "sql_maintenance_executed", action, result)
    return {"ok": True, "action": action, "result": result}


def collect_file_inventory(limit: int = 250) -> dict[str, Any]:
    students = _rest("students", query=f"select=id,data&limit={min(1000, limit)}") or []
    files: list[dict[str, Any]] = []
    keys = {"corFile", "cogFile", "rogFile", "idFile", "studentApplicationProfile", "applicationFormFile", "otherRequirementUploads"}

    def walk(value: Any, student_id: str, path: str = "") -> None:
        if len(files) >= limit:
            return
        if isinstance(value, dict):
            if (value.get("url") or value.get("publicUrl") or value.get("path")) and (path.split(".")[-1] in keys or value.get("name") or value.get("filename")):
                files.append({"studentId": student_id, "document": path or "file", "name": value.get("name") or value.get("filename") or "Document", "bucket": value.get("bucket") or "bulsuscholar", "path": value.get("path") or value.get("publicId") or "", "url": value.get("url") or value.get("publicUrl") or "", "size": value.get("size") or 0})
            for key, child in value.items():
                walk(child, student_id, f"{path}.{key}".strip("."))
        elif isinstance(value, list):
            for index, child in enumerate(value):
                walk(child, student_id, f"{path}[{index}]")

    for row in students:
        walk(row.get("data") or {}, row.get("id") or "")
    return {"ok": True, "files": files, "count": len(files), "totalBytes": sum(int(item.get("size") or 0) for item in files), "truncated": len(files) >= limit}


def fetch_root_file(request: Request, identity: dict[str, Any], payload: dict[str, Any]) -> tuple[bytes, str, str]:
    supabase_url, key = _supabase_config()
    bucket = str(payload.get("bucket") or "bulsuscholar").strip()
    path = str(payload.get("path") or "").strip().lstrip("/")
    legacy_url = str(payload.get("url") or "").strip()
    if not path and legacy_url.startswith(supabase_url):
        marker = "/storage/v1/object/public/"
        if marker in legacy_url:
            remainder = urllib.parse.unquote(legacy_url.split(marker, 1)[1])
            bucket, _, path = remainder.partition("/")
    if not bucket or not path or ".." in path.split("/"):
        raise HTTPException(status_code=422, detail="valid_storage_file_required")
    url = f"{supabase_url}/storage/v1/object/{urllib.parse.quote(bucket)}/{urllib.parse.quote(path, safe='/')}"
    file_request = urllib.request.Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(file_request, timeout=30) as response:
            content = response.read(20 * 1024 * 1024 + 1)
            content_type = response.headers.get("Content-Type", "application/octet-stream")
    except urllib.error.HTTPError as error:
        raise HTTPException(status_code=error.code, detail="student_file_unavailable") from error
    if not content or len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=422, detail="student_file_invalid_or_too_large")
    filename = re.sub(r"[^A-Za-z0-9._-]+", "-", str(payload.get("name") or path.rsplit("/", 1)[-1])) or "student-document"
    audit(request, identity["root"]["id"], "student_file_downloaded", path, {"studentId": payload.get("studentId"), "size": len(content)})
    return content, content_type, filename


def integration_status() -> dict[str, Any]:
    status: dict[str, Any] = {
        "railway": {"configured": bool(os.getenv("RAILWAY_PROJECT_TOKEN")), "serviceId": os.getenv("RAILWAY_SERVICE_ID", "")},
        "vercel": {"configured": bool(os.getenv("VERCEL_ACCESS_TOKEN")), "projectId": os.getenv("VERCEL_PROJECT_ID", "")},
        "email": {"provider": "resend", "configured": bool(os.getenv("RESEND_API_KEY")), "brevoConfigured": bool(os.getenv("BREVO_API_KEY"))},
        "supabase": {"configured": bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_ROLE_KEY")), "databaseSqlConfigured": bool(os.getenv("ROOT_DATABASE_URL") or os.getenv("SUPABASE_DB_URL"))},
    }
    token = os.getenv("RAILWAY_PROJECT_TOKEN", "")
    if token:
        try:
            data, _ = _http_json("https://backboard.railway.com/graphql/v2", method="POST", payload={"query": "query { projectToken { projectId environmentId } }"}, headers={"Project-Access-Token": token, "Content-Type": "application/json"})
            status["railway"]["reachable"] = not bool((data or {}).get("errors"))
        except HTTPException:
            status["railway"]["reachable"] = False
    return {"ok": True, "integrations": status}


def integration_action(request: Request, identity: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    action = str(payload.get("action") or "")
    if action in {"railway_restart", "railway_redeploy"}:
        token = os.getenv("RAILWAY_PROJECT_TOKEN", "")
        deployment_id = str(payload.get("deploymentId") or "")
        if not token or not deployment_id:
            raise HTTPException(status_code=503, detail="railway_action_not_configured")
        mutation = "deploymentRestart" if action.endswith("restart") else "deploymentRedeploy"
        data, _ = _http_json("https://backboard.railway.com/graphql/v2", method="POST", payload={"query": f"mutation($id: String!) {{ {mutation}(id: $id) }}", "variables": {"id": deployment_id}}, headers={"Project-Access-Token": token, "Content-Type": "application/json"})
        if (data or {}).get("errors"):
            raise HTTPException(status_code=502, detail=data["errors"])
    elif action == "vercel_redeploy":
        hook = os.getenv("VERCEL_DEPLOY_HOOK_URL", "")
        if not hook:
            raise HTTPException(status_code=503, detail="vercel_deploy_hook_not_configured")
        data, _ = _http_json(hook, method="POST", payload={})
    else:
        raise HTTPException(status_code=422, detail="integration_action_not_allowed")
    audit(request, identity["root"]["id"], action)
    return {"ok": True, "result": data}


def list_admins() -> list[dict[str, Any]]:
    rows = _rest("admins", query="select=*&order=updated_at.desc&limit=500") or []
    return [_redact_sensitive({"id": row.get("id"), **(row.get("data") or {}), "updatedAt": row.get("updated_at")}) for row in rows]


ADMIN_ROLES = {
    "full_admin": ["students", "grantors", "scholarships", "requirements", "announcements", "reports"],
    "student_reviewer": ["students", "requirements"],
    "grantor_manager": ["grantors", "scholarships", "announcements"],
    "reports_viewer": ["reports"],
}


def _validate_admin_password(password: str) -> None:
    if (
        len(password) < 12
        or not re.search(r"[A-Z]", password)
        or not re.search(r"[a-z]", password)
        or not re.search(r"\d", password)
        or not re.search(r"[^A-Za-z0-9]", password)
    ):
        raise HTTPException(status_code=422, detail="admin_password_too_weak")


def update_admin(request: Request, identity: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    admin_id = str(payload.get("adminId") or "").strip()
    role = str(payload.get("role") or "full_admin")
    if not admin_id or role not in ADMIN_ROLES:
        raise HTTPException(status_code=422, detail="invalid_admin_record")
    current = _first("admins", f"id=eq.{urllib.parse.quote(admin_id)}&select=*")
    data = {**((current or {}).get("data") or {}), "adminId": admin_id, "email": str(payload.get("email") or (current or {}).get("data", {}).get("email") or ""), "fullName": str(payload.get("fullName") or (current or {}).get("data", {}).get("fullName") or "Administrator"), "contactNumber": str(payload.get("contactNumber") or ""), "role": role, "permissions": ADMIN_ROLES[role], "status": "Active" if payload.get("active", True) else "Disabled", "userType": "admin", "updatedAt": now_iso()}
    if not current:
        temporary_password = str(payload.get("temporaryPassword") or "")
        if not data["email"]:
            raise HTTPException(status_code=422, detail="admin_email_and_temporary_password_required")
        _validate_admin_password(temporary_password)
        url, key = _supabase_config()
        auth_user, _ = _http_json(f"{url}/auth/v1/admin/users", method="POST", payload={"email": data["email"], "password": temporary_password, "email_confirm": True, "user_metadata": {"user_id": admin_id, "user_type": "admin"}, "app_metadata": {"portal_role": "admin"}}, headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
        data["authUserId"] = auth_user.get("id")
        data["mustChangePassword"] = True
    elif payload.get("temporaryPassword"):
        temporary_password = str(payload.get("temporaryPassword") or "")
        if not data.get("authUserId"):
            raise HTTPException(status_code=422, detail="valid_temporary_password_and_auth_identity_required")
        _validate_admin_password(temporary_password)
        _admin_update_auth_user(str(data["authUserId"]), {"password": temporary_password})
        data["mustChangePassword"] = True
        data["passwordResetAt"] = now_iso()
        data["passwordResetBy"] = identity["root"]["id"]
        data["sessionValidAfter"] = now_iso()
    if current and data.get("authUserId"):
        previous = current.get("data") or {}
        auth_changes: dict[str, Any] = {"ban_duration": "none" if payload.get("active", True) else "876000h"}
        if data.get("email") and data.get("email") != previous.get("email"):
            auth_changes["email"] = data["email"]
            auth_changes["email_confirm"] = True
        _admin_update_auth_user(str(data["authUserId"]), auth_changes)
        if str(data.get("status") or "").lower() == "disabled" and str((current.get("data") or {}).get("status") or "").lower() != "disabled":
            data["sessionValidAfter"] = now_iso()
    _rest("admins", method="POST", query="on_conflict=id", payload={"id": admin_id, "data": data, "updated_at": now_iso()}, prefer="resolution=merge-duplicates,return=representation")
    audit(request, identity["root"]["id"], "admin_created" if not current else "admin_updated", admin_id, {"role": role, "active": payload.get("active", True)})
    return {"ok": True, "admin": {key: value for key, value in data.items() if "password" not in key.lower()}}


def change_admin_temporary_password(admin_id: str, record: dict[str, Any], new_password: str) -> dict[str, Any]:
    if not record.get("mustChangePassword"):
        raise HTTPException(status_code=409, detail="temporary_password_change_not_required")
    _validate_admin_password(new_password)
    auth_user_id = str(record.get("authUserId") or "")
    if not auth_user_id:
        raise HTTPException(status_code=409, detail="admin_auth_identity_missing")
    _admin_update_auth_user(auth_user_id, {"password": new_password})
    updated = {**record, "mustChangePassword": False, "passwordUpdatedAt": now_iso(), "updatedAt": now_iso()}
    _rest("admins", method="POST", query="on_conflict=id", payload={"id": admin_id, "data": updated, "updated_at": now_iso()}, prefer="resolution=merge-duplicates,return=representation")
    return {"ok": True}


def update_admin_contact(admin_id: str, record: dict[str, Any], contact_number: str) -> dict[str, Any]:
    normalized = re.sub(r"\D", "", str(contact_number or ""))
    if normalized.startswith("63") and len(normalized) == 12:
        normalized = f"0{normalized[2:]}"
    elif len(normalized) == 10 and normalized.startswith("9"):
        normalized = f"0{normalized}"
    if normalized and not re.fullmatch(r"09\d{9}", normalized):
        raise HTTPException(status_code=422, detail="invalid_admin_contact_number")
    updated = {**record, "contactNumber": normalized, "updatedAt": now_iso()}
    _rest(
        "admins",
        method="POST",
        query="on_conflict=id",
        payload={"id": admin_id, "data": updated, "updated_at": now_iso()},
        prefer="resolution=merge-duplicates,return=representation",
    )
    return {"ok": True, "contactNumber": normalized}


def list_support() -> list[dict[str, Any]]:
    rows = _rest("support_feedback", query="select=*&order=created_at.desc&limit=500") or []
    return [_redact_sensitive({"id": row.get("id"), **(row.get("data") or {}), "status": row.get("status") or (row.get("data") or {}).get("status") or "open", "priority": row.get("priority") or "normal", "assignedTo": row.get("assigned_to"), "createdAt": row.get("created_at")}) for row in rows]


def update_support(request: Request, identity: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    ticket_id = str(payload.get("ticketId") or "")
    status = str(payload.get("status") or "open")
    priority = str(payload.get("priority") or "normal")
    if status not in {"open", "in_progress", "resolved", "closed"} or priority not in {"low", "normal", "high", "urgent"}:
        raise HTTPException(status_code=422, detail="invalid_ticket_update")
    row = _first("support_feedback", f"id=eq.{urllib.parse.quote(ticket_id)}&select=*")
    if not row:
        raise HTTPException(status_code=404, detail="support_ticket_not_found")
    data = {**(row.get("data") or {}), "status": status, "priority": priority, "assignedTo": payload.get("assignedTo") or identity["root"]["id"], "internalNotes": payload.get("internalNotes") or (row.get("data") or {}).get("internalNotes") or "", "updatedAt": now_iso()}
    _rest("support_feedback", method="PATCH", query=f"id=eq.{urllib.parse.quote(ticket_id)}", payload={"data": data, "status": status, "priority": priority, "assigned_to": data["assignedTo"], "resolved_at": now_iso() if status == "resolved" else None, "updated_at": now_iso()})
    reply = str(payload.get("reply") or "").strip()
    delivery = None
    in_app_delivery = None
    if reply and data.get("email"):
        delivery = send_email_notification({"to": data["email"], "subject": "BulsuScholar support update", "html": f'<div data-bulsuscholar-email="true"><p>{html.escape(reply)}</p></div>'})
    user_id = str(data.get("userId") or "").strip()
    user_type = str(data.get("userType") or "").strip().lower()
    notification_table = {"student": "studentNotifications", "grantor": "grantorNotifications", "provider": "grantorNotifications", "admin": "adminNotifications"}.get(user_type)
    if reply and user_id and user_id != "guest" and notification_table:
        notification_id = f"support-reply-{ticket_id}-{hashlib.sha256(reply.encode('utf-8')).hexdigest()[:16]}"
        notification = {
            "id": notification_id,
            "userId": user_id,
            "studentId": user_id if user_type == "student" else "",
            "grantorId": user_id if user_type in {"grantor", "provider"} else "",
            "adminId": user_id if user_type == "admin" else "",
            "type": "support_reply",
            "title": "Support ticket update",
            "message": reply[:1000],
            "ticketId": ticket_id,
            "read": False,
            "createdAt": now_iso(),
        }
        try:
            in_app_delivery = _rest(
                notification_table,
                method="POST",
                query="on_conflict=id",
                payload={"id": notification_id, "data": notification, "updated_at": now_iso()},
                prefer="resolution=merge-duplicates,return=representation",
            )
        except HTTPException:
            in_app_delivery = {"ok": False}
    audit(request, identity["root"]["id"], "support_ticket_updated", ticket_id, {"status": status, "priority": priority, "emailReplySent": bool(delivery and delivery.get("sent")), "inAppReplySent": bool(in_app_delivery)})
    return {"ok": True, "ticket": data, "delivery": delivery, "inAppDelivery": in_app_delivery}


def list_logs() -> dict[str, Any]:
    system = _rest("systemLogs", query="select=*&order=created_at.desc&limit=500") or []
    audit_rows = _rest("root_audit_logs", query="select=*&order=created_at.desc&limit=500") or []
    return {"ok": True, "systemLogs": [_redact_sensitive({"id": row.get("id"), **(row.get("data") or {}), "createdAt": row.get("created_at")}) for row in system], "auditLogs": _redact_sensitive(audit_rows)}


def list_devices(identity: dict[str, Any]) -> list[dict[str, Any]]:
    rows = _rest("root_trusted_devices", query=f"root_id=eq.{urllib.parse.quote(identity['root']['id'])}&select=id,label,user_agent,last_used_at,expires_at,revoked_at,created_at&order=created_at.desc") or []
    return rows


def list_sessions(identity: dict[str, Any]) -> list[dict[str, Any]]:
    return _rest("root_sessions", query=f"root_id=eq.{urllib.parse.quote(identity['root']['id'])}&select=id,user_agent,last_used_at,expires_at,revoked_at,created_at&order=created_at.desc") or []


def revoke_session(request: Request, identity: dict[str, Any], session_id: str) -> dict[str, Any]:
    if session_id == str(identity["session"]["id"]):
        raise HTTPException(status_code=422, detail="use_logout_for_current_session")
    _rest("root_sessions", method="PATCH", query=f"id=eq.{urllib.parse.quote(session_id)}&root_id=eq.{urllib.parse.quote(identity['root']['id'])}", payload={"revoked_at": now_iso()}, prefer="return=minimal")
    audit(request, identity["root"]["id"], "root_session_revoked", session_id)
    return {"ok": True}


def revoke_device(request: Request, identity: dict[str, Any], device_id: str) -> dict[str, Any]:
    _rest("root_trusted_devices", method="PATCH", query=f"id=eq.{urllib.parse.quote(device_id)}&root_id=eq.{urllib.parse.quote(identity['root']['id'])}", payload={"revoked_at": now_iso()}, prefer="return=minimal")
    audit(request, identity["root"]["id"], "trusted_device_revoked", device_id)
    return {"ok": True}


def logout_root(request: Request, identity: dict[str, Any]) -> dict[str, Any]:
    _rest("root_sessions", method="PATCH", query=f"id=eq.{identity['session']['id']}", payload={"revoked_at": now_iso()}, prefer="return=minimal")
    audit(request, identity["root"]["id"], "root_logout")
    return {"ok": True}


def is_maintenance_enabled() -> bool:
    try:
        row = _first("system_configuration", "id=eq.portal&select=data")
        return bool((row or {}).get("data", {}).get("maintenanceMode"))
    except Exception:
        return False
