from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

try:
    from .supabase_ops import (
        build_admin_notification_payload,
        create_admin_notification,
        supabase_document_insert,
    )
except ImportError:
    from supabase_ops import (
        build_admin_notification_payload,
        create_admin_notification,
        supabase_document_insert,
    )


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def save_support_feedback(payload: dict[str, Any]) -> dict[str, Any]:
    message = str(payload.get("message") or "").strip()
    if not message:
        return {"ok": False, "reason": "feedback_message_required"}
    record = {
        "id": str(uuid4()),
        "userId": str(payload.get("userId") or "guest"),
        "userType": str(payload.get("userType") or "guest"),
        "category": str(payload.get("category") or "general"),
        "email": str(payload.get("email") or "").strip(),
        "message": message[:4000],
        "status": "open",
        "createdAt": now_iso(),
    }
    result = supabase_document_insert("support_feedback", record)
    if result.get("ok"):
        create_admin_notification(build_admin_notification_payload(
            "New Help Request",
            f"A {record['userType']} submitted a {record['category']} support request.",
            "support_feedback",
            {"feedbackId": record["id"], "route": "/admin/inbox"},
        ))
    return {
        "ok": bool(result.get("ok")),
        "feedback": record,
        **({} if result.get("ok") else {"reason": result.get("reason") or "feedback_save_failed"}),
    }
