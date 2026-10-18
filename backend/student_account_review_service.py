import logging
import math
import os
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, Request

try:
    from .access_control import require_admin_bearer
    from .student_activation_service import (
        activate_student_account,
        latest_signup_documents as _latest_signup_documents,
        load_signup_documents as _load_signup_documents,
        required_signup_document_types as _required_signup_document_types,
        required_signup_documents as _required_signup_documents,
        signup_documents_ready as _signup_documents_ready,
    )
    from .student_lifecycle_service import promote_email_confirmed_student
    from .supabase_ops import create_log, supabase_admin_get_user, supabase_document_get, supabase_resend_signup_confirmation, supabase_rpc, supabase_select
except ImportError:  # pragma: no cover
    from access_control import require_admin_bearer
    from student_activation_service import (
        activate_student_account,
        latest_signup_documents as _latest_signup_documents,
        load_signup_documents as _load_signup_documents,
        required_signup_document_types as _required_signup_document_types,
        required_signup_documents as _required_signup_documents,
        signup_documents_ready as _signup_documents_ready,
    )
    from student_lifecycle_service import promote_email_confirmed_student
    from supabase_ops import create_log, supabase_admin_get_user, supabase_document_get, supabase_resend_signup_confirmation, supabase_rpc, supabase_select


RESEND_COOLDOWN = timedelta(minutes=5)
logger = logging.getLogger(__name__)


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


def _previewed_signup_document_ids(student_id: str, admin_id: str) -> set[str]:
    result = supabase_select("student_document_reviews", {
        "data->>studentId": student_id,
        "data->>reviewerId": admin_id,
        "data->>decision": "previewed",
    }, limit=100)
    if not result.get("ok"):
        return set()
    return {
        str((row.get("data") or {}).get("submissionId") or "")
        for row in result.get("rows") or []
        if str((row.get("data") or {}).get("submissionId") or "")
    }


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
    admin_id = _require_full_admin(request)
    result = supabase_select("pending_students", limit=500)
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail="pending_accounts_unavailable")
    accounts = []
    for row in result.get("rows") or []:
        data = row.get("data") or {}
        document_rows, documents_ready = _load_signup_documents(str(row.get("id") or ""))
        required_documents = _required_signup_documents(document_rows)
        required_document_types = _required_signup_document_types(document_rows)
        previewed_ids = _previewed_signup_document_ids(str(row.get("id") or ""), admin_id)
        required_ids = {str(document.get("id") or "") for document in required_documents}
        has_all_required_documents = len(required_documents) == len(required_document_types)
        documents = []
        for document in document_rows:
            document_data = document.get("data") or {}
            file_data = document_data.get("file") if isinstance(document_data.get("file"), dict) else {}
            documents.append({
                "id": document.get("id"),
                "documentType": document_data.get("documentType"),
                "documentKind": document_data.get("documentKind"),
                "name": document_data.get("name"),
                "contentType": file_data.get("type"),
                "status": document_data.get("status"),
                "rejectionReason": document_data.get("rejectionReason"),
                "submittedAt": document_data.get("submittedAt"),
                "previewed": str(document.get("id") or "") in previewed_ids,
                "required": str(document.get("id") or "") in required_ids,
            })
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
            "documentsReady": documents_ready,
            "requiredDocumentCount": len(required_document_types),
            "previewedDocumentCount": len(required_ids & previewed_ids),
            "allDocumentsPreviewed": has_all_required_documents and required_ids.issubset(previewed_ids),
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
    documents, _documents_ready = _load_signup_documents(student_id)
    required_documents = _required_signup_documents(documents)
    required_document_types = _required_signup_document_types(documents)
    required_ids = {str(document.get("id") or "") for document in required_documents}
    if len(required_documents) != len(required_document_types):
        raise HTTPException(status_code=409, detail="signup_documents_missing")
    if any(str((document.get("data") or {}).get("status") or "").lower() == "rejected" for document in required_documents):
        raise HTTPException(status_code=409, detail="signup_document_replacement_required")
    if not required_ids.issubset(_previewed_signup_document_ids(student_id, admin_id)):
        raise HTTPException(status_code=409, detail="signup_documents_not_previewed")

    try:
        from .student_profile_service import review_document_submission
    except ImportError:  # pragma: no cover
        from student_profile_service import review_document_submission
    for document in required_documents:
        document_data = document.get("data") or {}
        if str(document_data.get("status") or "").lower() == "pending":
            submission_id = str(document.get("id") or "")
            try:
                review_document_submission(request, submission_id, {
                    "decision": "approved",
                    "notes": "Approved with the pending student account after all required documents were previewed.",
                })
            except HTTPException as error:
                # A concurrent approval or a repeated click is harmless. Confirm the
                # authoritative state before continuing instead of failing the account.
                if error.status_code != 409 or error.detail != "document_already_reviewed":
                    raise
                current = supabase_document_get("student_document_submissions", submission_id)
                if str((current.get("data") or {}).get("status") or "").lower() != "approved":
                    raise

    # Review operations and account activation are separate service calls. Re-read
    # the records so activation never relies on the card's stale document snapshot.
    verified_documents, documents_ready = _load_signup_documents(student_id)
    verified_required = _required_signup_documents(verified_documents)
    if len(verified_required) != len(_required_signup_document_types(verified_documents)):
        raise HTTPException(status_code=409, detail="signup_documents_missing")
    if not documents_ready:
        raise HTTPException(status_code=409, detail="signup_documents_not_approved")

    result = activate_student_account(student_id, data, admin_id, "manual_admin_review")
    if not result.get("ok"):
        failure_reason = str(result.get("reason") or "supabase_rpc_error")
        logger.error(
            "Pending account approval failed student_id=%s admin_id=%s stage=account_activation reason=%s upstream_status=%s",
            student_id,
            admin_id,
            failure_reason,
            result.get("status"),
        )
        raise HTTPException(status_code=409, detail={
            "code": "account_approval_failed",
            "reason": failure_reason,
            "stage": "account_activation",
        })

    return {
        "ok": True,
        "approved": True,
        "studentId": student_id,
        "newlyApproved": result.get("newlyApproved") is True,
        "alreadyActive": result.get("alreadyActive") is True,
        "emailSent": result.get("welcomeEmailSent") is True,
        "emailDeliveryReason": result.get("welcomeEmailDeliveryReason"),
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
