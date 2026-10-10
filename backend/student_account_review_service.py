import math
import os
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, Request

try:
    from .access_control import require_admin_bearer
    from .email_service import send_email_notification
    from .student_lifecycle_service import promote_email_confirmed_student
    from .supabase_ops import create_log, supabase_admin_get_user, supabase_document_get, supabase_resend_signup_confirmation, supabase_rpc, supabase_select
except ImportError:  # pragma: no cover
    from access_control import require_admin_bearer
    from email_service import send_email_notification
    from student_lifecycle_service import promote_email_confirmed_student
    from supabase_ops import create_log, supabase_admin_get_user, supabase_document_get, supabase_resend_signup_confirmation, supabase_rpc, supabase_select


RESEND_COOLDOWN = timedelta(minutes=5)


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str) and value.strip():
        try:
            parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _resend_availability(row: dict[str, Any], data: dict[str, Any]) -> tuple[str | None, int]:
    if data.get("emailConfirmedAt"):
        return None, 0
    last_sent_at = (
        _parse_datetime(data.get("confirmationEmailLastSentAt"))
        or _parse_datetime(data.get("createdAt"))
        or _parse_datetime(row.get("created_at"))
    )
    if last_sent_at is None:
        return None, 0
    available_at = last_sent_at + RESEND_COOLDOWN
    remaining = max(0, math.ceil((available_at - datetime.now(timezone.utc)).total_seconds()))
    return available_at.isoformat(), remaining


def _require_full_admin(request: Request) -> str:
    admin_id = str(request.headers.get("x-portal-actor-id") or "").strip()
    if not admin_id:
        raise HTTPException(status_code=401, detail="admin_identity_required")
    _, record = require_admin_bearer(request, admin_id)
    if record.get("role") != "full_admin":
        raise HTTPException(status_code=403, detail="full_admin_required")
    return admin_id


def list_pending_student_accounts(request: Request) -> dict[str, Any]:
    _require_full_admin(request)
    result = supabase_select("pending_students", limit=500)
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail="pending_accounts_unavailable")
    accounts = []
    for row in result.get("rows") or []:
        data = row.get("data") or {}
        document_result = supabase_select("student_document_submissions", {"data->>studentId": row.get("id")}, limit=20)
        documents = []
        if document_result.get("ok"):
            documents = [
                {
                    "id": document.get("id"),
                    "documentType": (document.get("data") or {}).get("documentType"),
                    "documentKind": (document.get("data") or {}).get("documentKind"),
                    "name": (document.get("data") or {}).get("name"),
                    "status": (document.get("data") or {}).get("status"),
                    "submittedAt": (document.get("data") or {}).get("submittedAt"),
                }
                for document in document_result.get("rows") or []
            ]
        resend_available_at, resend_retry_after = _resend_availability(row, data)
        accounts.append({
            "id": row.get("id"),
            "name": " ".join(str(data.get(key) or "").strip() for key in ("fname", "mname", "lname")).strip(),
            "email": data.get("email"),
            "year": data.get("year"),
            "course": data.get("course"),
            "createdAt": data.get("createdAt"),
            "emailConfirmedAt": data.get("emailConfirmedAt"),
            "accountReviewStatus": data.get("accountReviewStatus") or "pending_email",
            "confirmationResendAvailableAt": resend_available_at,
            "confirmationResendRetryAfter": resend_retry_after,
            "yearLevelReview": data.get("yearLevelReview") if isinstance(data.get("yearLevelReview"), dict) else {},
            "documents": documents,
        })
    return {"ok": True, "accounts": accounts}


def approve_pending_student_account(request: Request, student_id: str) -> dict[str, Any]:
    admin_id = _require_full_admin(request)
    pending = supabase_document_get("pending_students", student_id)
    if not pending.get("ok"):
        raise HTTPException(status_code=503, detail="pending_account_unavailable")
    if not pending.get("row"):
        raise HTTPException(status_code=404, detail="pending_account_not_found")
    data = pending.get("data") or {}
    if not data.get("emailConfirmedAt"):
        raise HTTPException(status_code=409, detail="student_email_not_confirmed")
    result = supabase_rpc("approve_pending_student_account", {
        "p_student_id": student_id,
        "p_auth_user_id": str(data.get("authUserId") or ""),
        "p_email": str(data.get("email") or ""),
        "p_admin_id": admin_id,
    })
    if not result.get("ok"):
        raise HTTPException(status_code=409, detail="account_approval_failed")

    name = " ".join(str(data.get(key) or "").strip() for key in ("fname", "lname")).strip()
    email_result = send_email_notification({
        "to": data.get("email"),
        "toName": name,
        "subject": "Welcome to BulsuScholar",
        "html": "<p>Your BulsuScholar student account has been approved. You can now sign in with your Student ID.</p>",
    })
    return {
        "ok": True,
        "approved": True,
        "studentId": student_id,
        "emailSent": email_result.get("sent") is True,
        "emailDeliveryReason": None if email_result.get("sent") else email_result.get("reason"),
    }


def resend_pending_student_confirmation(request: Request, student_id: str) -> dict[str, Any]:
    admin_id = _require_full_admin(request)
    pending = supabase_document_get("pending_students", student_id)
    if not pending.get("ok"):
        raise HTTPException(status_code=503, detail="pending_account_unavailable")
    if not pending.get("row"):
        raise HTTPException(status_code=404, detail="pending_account_not_found")

    data = pending.get("data") or {}
    if data.get("emailConfirmedAt"):
        raise HTTPException(status_code=409, detail="student_email_already_confirmed")
    auth_user_id = str(data.get("authUserId") or "").strip()
    email = str(data.get("email") or "").strip().lower()
    if not auth_user_id or not email:
        raise HTTPException(status_code=409, detail="pending_account_auth_identity_missing")

    auth_result = supabase_admin_get_user(auth_user_id)
    if not auth_result.get("ok"):
        status = 409 if auth_result.get("reason") == "auth_user_not_found" else 503
        raise HTTPException(status_code=status, detail="pending_account_auth_user_unavailable")
    auth_user = auth_result.get("user") or {}
    auth_email = str(auth_user.get("email") or "").strip().lower()
    metadata = auth_user.get("user_metadata") if isinstance(auth_user.get("user_metadata"), dict) else {}
    metadata_student_id = str(metadata.get("user_id") or metadata.get("studentId") or "").strip()
    if str(auth_user.get("id") or "") != auth_user_id or auth_email != email or metadata_student_id != student_id:
        raise HTTPException(status_code=409, detail="pending_account_auth_identity_mismatch")

    if auth_user.get("email_confirmed_at"):
        promotion = promote_email_confirmed_student({}, auth_user)
        if not promotion.get("ok"):
            raise HTTPException(status_code=409, detail=promotion.get("reason") or "email_confirmation_reconciliation_failed")
        create_log({
            "action": "student_email_confirmation_reconciled",
            "actorId": admin_id,
            "actorType": "admin",
            "target": student_id,
            "details": {"authUserId": auth_user_id},
        })
        return {"ok": True, "studentId": student_id, "sent": False, "reconciled": True, "availableAt": None, "retryAfter": 0}

    request_id = uuid4().hex
    claim = supabase_rpc("claim_pending_student_confirmation_resend", {
        "p_student_id": student_id,
        "p_admin_id": admin_id,
        "p_request_id": request_id,
    })
    if not claim.get("ok"):
        raise HTTPException(status_code=503, detail="confirmation_resend_claim_failed")
    claim_data = claim.get("data") or {}
    if not claim_data.get("allowed"):
        reason = str(claim_data.get("reason") or "confirmation_resend_unavailable")
        status = 409 if reason == "student_email_already_confirmed" else 429
        raise HTTPException(status_code=status, detail={
            "reason": reason,
            "availableAt": claim_data.get("availableAt"),
            "retryAfter": int(claim_data.get("retryAfter") or 0),
        })

    frontend_url = str(os.getenv("FRONTEND_URL") or os.getenv("VITE_APP_URL") or "https://bulsuscholar.com").rstrip("/")
    delivery = supabase_resend_signup_confirmation(email, f"{frontend_url}/confirm-email")
    completion = supabase_rpc("complete_pending_student_confirmation_resend", {
        "p_student_id": student_id,
        "p_request_id": request_id,
        "p_succeeded": delivery.get("ok") is True,
    })
    if not completion.get("ok"):
        create_log({
            "action": "student_confirmation_email_resend_completion_failed",
            "actorId": admin_id,
            "actorType": "admin",
            "target": student_id,
            "details": {"requestId": request_id, "deliveryAccepted": delivery.get("ok") is True},
        })
        raise HTTPException(status_code=503, detail="confirmation_resend_completion_failed")

    if not delivery.get("ok"):
        reason = str(delivery.get("reason") or "confirmation_email_delivery_failed")
        create_log({
            "action": "student_confirmation_email_resend_failed",
            "actorId": admin_id,
            "actorType": "admin",
            "target": student_id,
            "details": {"requestId": request_id, "reason": reason},
        })
        raise HTTPException(status_code=429 if delivery.get("status") == 429 else 503, detail=reason)

    completion_data = completion.get("data") or {}
    create_log({
        "action": "student_confirmation_email_resent",
        "actorId": admin_id,
        "actorType": "admin",
        "target": student_id,
        "details": {"requestId": request_id},
    })
    return {
        "ok": True,
        "studentId": student_id,
        "sent": True,
        "reconciled": False,
        "availableAt": completion_data.get("availableAt"),
        "retryAfter": int(completion_data.get("retryAfter") or 300),
    }
