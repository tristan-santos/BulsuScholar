"""Optional action authorization, independent of login and download encryption."""
import hashlib
import hmac
import json
import os
import re
import secrets
import time

from fastapi import APIRouter, Body, HTTPException, Request

try:
    from .access_control import enforce_portal_scope, _jwt_claims
    from .supabase_ops import supabase_document_get, supabase_rpc
    from .email_service import send_email_notification
except ImportError:  # Local uvicorn main:app entrypoint.
    from access_control import enforce_portal_scope, _jwt_claims
    from supabase_ops import supabase_document_get, supabase_rpc
    from email_service import send_email_notification

router = APIRouter(prefix="/security/mpin", tags=["MPIN"])
ACTION_PATHS = {
    "/reports/pdf", "/admin/reports/export", "/root/reports/pdf", "/workflows/applicants/export",
    "/workflows/scholarship/apply", "/workflows/scholarship/withdraw",
    "/workflows/waitlist/offer",
    "/workflows/grantor/announcements/create", "/workflows/grantor/announcements/republish",
    "/workflows/grantor/applications/confirm-admin-decision", "/workflows/admin/review",
    "/portal/data/mutate", "/workflows/grantor/scholars/update", "/workflows/grantor/scholars/update-many",
    "/workflows/grantor/scholars/create",
}


def fail(code, status=422):
    raise HTTPException(status, {"code": code, "message": code.replace("_", " ")})


def identity(request):
    cached = getattr(request.state, "mpin_identity", None)
    if cached:
        return cached
    if request.headers.get("x-root-session"):
        try:
            from .root_service import require_root
        except ImportError:
            from root_service import require_root
        root = require_root(request)
        result = {"id": root["root"]["id"], "type": "root", "session": root["session"]["id"], "email": root["root"]["email"]}
    else:
        payload = {}
        enforce_portal_scope(request, payload, {"student", "grantor", "admin"})
        role, actor = payload["actorType"], payload["actorId"]
        record = supabase_document_get({"student": "students", "grantor": "providers", "admin": "admins"}[role], actor)
        if not record.get("ok"):
            fail("mpin_identity_unavailable", 503)
        token = request.headers.get("authorization", "")[7:]
        result = {"id": actor, "type": role, "session": _jwt_claims(token).get("session_id"), "email": (record.get("data") or {}).get("email")}
    result["principal"] = f'{result["type"]}:{result["id"]}'
    request.state.mpin_identity = result
    return result


def transaction(actor, operation, **values):
    response = supabase_rpc("mpin_transaction", {"p_principal": actor["principal"], "p_operation": operation, "p_values": values})
    if not response.get("ok"):
        fail("mpin_service_unavailable", 503)
    result = response.get("data") or {}
    return result


def secret():
    value = os.getenv("PORTAL_EMAIL_CODE_SECRET", "")
    if len(value) < 32:
        fail("mpin_secret_not_configured", 503)
    return value.encode()


def digest(value):
    return hmac.new(secret(), value.encode(), hashlib.sha256).hexdigest()


def hash_pin(pin, salt):
    if not isinstance(pin, str) or not re.fullmatch(r"[0-9]{6}", pin):
        fail("enter_six_digit_mpin")
    return hashlib.pbkdf2_hmac("sha256", digest(pin).encode(), bytes.fromhex(salt), 600_000).hex()


def payload_digest(payload):
    # Passwords and authorization proofs are not part of the business operation.
    clean = {k: v for k, v in payload.items() if k not in {"downloadProtection", "mpinAuthorization"}}
    return hashlib.sha256(json.dumps(clean, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()).hexdigest()


def grants_approval(data):
    if not isinstance(data, dict):
        return False
    status = str(data.get("status") or data.get("applicationStatus") or "").lower()
    if status in {"rejected", "declined", "cancelled", "withdrawn", "terminated"}:
        return False
    if status in {"approved", "accepted", "awarded", "active"}:
        return True
    steps = (data.get("tracking") or {}).get("completedStepIds") or []
    return bool({"application_review", "final_screening"}.intersection(steps))


def action_kind(role, path, payload):
    if path.endswith("/download") or path == "/root/files/download":
        return "download" if role == "student" else ""
    if path in {"/reports/pdf", "/admin/reports/export", "/root/reports/pdf", "/workflows/applicants/export", "/downloads/generated-copy"}:
        return "download" if role == "student" else "report"
    if role == "student" and path in {"/workflows/scholarship/apply", "/workflows/scholarship/withdraw"}:
        return "application"
    if role == "student" and path == "/workflows/waitlist/offer" and payload.get("action") == "accept":
        return "application"
    if role == "grantor":
        if path in {"/workflows/grantor/announcements/create", "/workflows/grantor/announcements/republish"}:
            return "announcement"
        if path == "/workflows/grantor/applications/confirm-admin-decision":
            return "approval"
        if path in {"/workflows/admin/review", "/portal/data/mutate", "/workflows/grantor/scholars/update", "/workflows/grantor/scholars/update-many", "/workflows/grantor/scholars/create"}:
            # Inspect actual fields, not incidental words in names or document metadata.
            if path == "/workflows/admin/review":
                for update in payload.get("updates") or []:
                    if update.get("table") in {"scholarship_applications", "scholarshipApplications"} and grants_approval(update.get("data")):
                        return "approval"
                if (payload.get("stageCompletion") or {}).get("stepId") in {"application_review", "final_screening"}:
                    return "approval"
            elif grants_approval(payload.get("data")):
                return "approval"
            if path == "/portal/data/mutate" and payload.get("table") == "grantor_portal_announcements":
                return "announcement"
    return ""


def policy(request, path, payload):
    if not isinstance(path, str) or not path.startswith("/") or len(path) > 2048 or not isinstance(payload, dict):
        fail("invalid_mpin_action")
    actor = identity(request)
    state = transaction(actor, "read")
    kind = action_kind(actor["type"], path, payload)
    if kind == "approval" and path == "/workflows/grantor/applications/confirm-admin-decision" and state.get("enabled") and payload.get("applicationId"):
        current = supabase_document_get("scholarship_applications", str(payload.get("applicationId") or ""))
        data = current.get("data") or {}
        decision = (data.get("decisionConfirmation") or {}).get("decision")
        if current.get("ok") and (data.get("grantorId") or data.get("providerId")) == actor["id"] and decision in {"reject", "rejected"}:
            kind = ""
    return actor, state, {"required": bool(kind and state.get("enabled")), "encrypt": actor["type"] == "student", "action": kind, "role": actor["type"]}


def enforce_action(request, payload, path=None):
    path = path or request.url.path
    actor, state, rules = policy(request, path, payload)
    if not rules["required"]:
        return
    token = request.headers.get("x-mpin-authorization", "")
    if not token:
        fail("mpin_required", 428)
    result = transaction(actor, "consume", token=hashlib.sha256(token.encode()).hexdigest(), session=actor["session"], path=path, digest=payload_digest(payload), generation=state.get("generation", 0))
    if not result.get("consumed"):
        fail("mpin_authorization_expired_or_used", 403)


@router.get("/status")
def status(request: Request):
    state = transaction(identity(request), "read")
    return {"enabled": bool(state.get("enabled")), "configured": bool(state.get("pin_hash")), "lockedUntil": state.get("locked_until", 0)}


@router.post("/policy")
def read_policy(request: Request, payload: dict = Body(...)):
    return policy(request, payload.get("path"), payload.get("payload", {}))[2]


def commit(actor, old, updated, event, **extra):
    result = transaction(actor, "commit", version=old.get("version", 0), state=updated, event=event, **extra)
    if not result.get("committed"):
        fail("mpin_settings_changed_try_again", 409)


@router.post("/email")
def send_code(request: Request, payload: dict = Body(...)):
    actor = identity(request)
    old = transaction(actor, "read")
    now = int(time.time())
    history = [t for t in old.get("emails", []) if now - t < 3600]
    if history and now - history[-1] < 60 or len(history) >= 5:
        fail("mpin_code_resend_limited", 429)
    code = f"{secrets.randbelow(1_000_000):06d}"
    if actor["type"] == "root":
        try:
            from .root_service import verify_root_code
        except ImportError:
            from root_service import verify_root_code
        verify_root_code(request, {"code": payload.get("rootCode")}, issue_session=False)
    updated = {**old, "emails": history + [now], "email_hash": digest(actor["principal"] + code), "email_expires": now + 600, "email_attempts": 0, "email_session": actor["session"]}
    commit(actor, old, updated, "verification_requested")
    if actor["type"] == "root":
        # The fresh Root code is the recovery proof; no email or new Root session.
        return {"verifiedRoot": True, "code": code}
    delivery = send_email_notification({"to": actor["email"], "subject": "BulsuScholar MPIN security code", "html": '<div data-bulsuscholar-email="verification"><h2>MPIN Security</h2><p>Use this code to set or reset your MPIN:</p><p style="font-size:28px;font-weight:700">' + code + '</p><p>Expires in 10 minutes. Never share this code. If you did not request this, ignore this email.</p></div>'})
    if not delivery.get("sent"):
        fail("mpin_email_delivery_failed", 503)
    return {"sent": True, "resendAfter": 60}


@router.post("/settings")
def settings(request: Request, payload: dict = Body(...)):
    actor = identity(request)
    old = transaction(actor, "read")
    now = int(time.time())
    if old.get("locked_until", 0) > now:
        fail("mpin_locked_try_after_15_minutes", 429)
    operation = payload.get("operation")
    if operation not in {"enable", "reset", "change", "disable"}:
        fail("invalid_mpin_operation")
    updated = dict(old)
    if operation in {"enable", "reset"}:
        valid = old.get("email_session") == actor["session"] and old.get("email_expires", 0) > now and old.get("email_attempts", 0) < 5 and hmac.compare_digest(old.get("email_hash", ""), digest(actor["principal"] + str(payload.get("code") or "")))
        if not valid:
            updated["email_attempts"] = old.get("email_attempts", 0) + 1
            commit(actor, old, updated, "verification_rejected")
            fail("mpin_email_code_invalid_or_expired", 403)
    else:
        check_pin(actor, old, payload.get("pin"))
    if operation == "disable":
        updated["enabled"] = False
    else:
        salt = secrets.token_hex(16)
        updated.update(enabled=True, salt=salt, pin_hash=hash_pin(payload.get("newPin"), salt))
    for key in ("email_hash", "email_session", "email_expires", "email_attempts"):
        updated.pop(key, None)
    updated.update(generation=old.get("generation", 0) + 1, failures=0, locked_until=0)
    commit(actor, old, updated, operation)
    return {"enabled": updated["enabled"]}


def check_pin(actor, old, pin):
    if old.get("locked_until", 0) > time.time():
        fail("mpin_locked_try_after_15_minutes", 429)
    valid = bool(old.get("pin_hash")) and hmac.compare_digest(hash_pin(pin, old["salt"]), old["pin_hash"])
    if not valid:
        failures = (0 if old.get("locked_until") else old.get("failures", 0)) + 1
        commit(actor, old, {**old, "failures": failures, "locked_until": int(time.time()) + 900 if failures >= 5 else 0}, "pin_rejected")
        fail("mpin_locked_try_after_15_minutes" if failures >= 5 else "incorrect_mpin", 429 if failures >= 5 else 403)


@router.post("/verify")
def verify(request: Request, payload: dict = Body(...)):
    actor, old, rules = policy(request, payload.get("path"), payload.get("payload", {}))
    if not rules["required"]:
        return {"token": None}
    check_pin(actor, old, payload.get("pin"))
    token = secrets.token_urlsafe(32)
    commit(actor, old, {**old, "failures": 0, "locked_until": 0}, "action_verified", ticket={"token": hashlib.sha256(token.encode()).hexdigest(), "session": actor["session"], "path": payload["path"], "digest": payload_digest(payload.get("payload") or {}), "generation": old.get("generation", 0)})
    return {"token": token, "expiresIn": 120}
