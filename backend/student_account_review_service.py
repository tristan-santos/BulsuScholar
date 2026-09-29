from typing import Any

from fastapi import HTTPException, Request

try:
    from .access_control import require_admin_bearer
    from .email_service import send_email_notification
    from .supabase_ops import supabase_document_get, supabase_rpc, supabase_select
except ImportError:  # pragma: no cover
    from access_control import require_admin_bearer
    from email_service import send_email_notification
    from supabase_ops import supabase_document_get, supabase_rpc, supabase_select


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
        accounts.append({
            "id": row.get("id"),
            "name": " ".join(str(data.get(key) or "").strip() for key in ("fname", "mname", "lname")).strip(),
            "email": data.get("email"),
            "year": data.get("year"),
            "course": data.get("course"),
            "createdAt": data.get("createdAt"),
            "emailConfirmedAt": data.get("emailConfirmedAt"),
            "accountReviewStatus": data.get("accountReviewStatus") or "pending_email",
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
