from datetime import datetime, timezone
from typing import Any
from uuid import uuid4
import re
import threading
import time

try:
    from .supabase_ops import supabase_document_insert
except ImportError:
    from supabase_ops import supabase_document_insert


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


_GUEST_TICKET_LOCK = threading.Lock()
_GUEST_TICKETS: dict[str, list[float]] = {}


def save_support_feedback(payload: dict[str, Any]) -> dict[str, Any]:
    message = str(payload.get("message") or "").strip()
    if not message:
        return {"ok": False, "reason": "feedback_message_required"}
    user_type = str(payload.get("userType") or "guest").strip().lower()
    email = str(payload.get("email") or "").strip()
    if user_type == "guest":
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
            return {"ok": False, "reason": "guest_reply_email_required"}
        key = f"{payload.get('_clientIp') or 'unknown'}:{email.lower()}"
        cutoff = time.time() - 3600
        with _GUEST_TICKET_LOCK:
            recent = [created for created in _GUEST_TICKETS.get(key, []) if created > cutoff]
            if len(recent) >= 5:
                return {"ok": False, "reason": "guest_ticket_rate_limited"}
            _GUEST_TICKETS[key] = [*recent, time.time()]
    record = {
        "id": str(uuid4()),
        "userId": str(payload.get("userId") or "guest"),
        "userType": user_type,
        "category": str(payload.get("category") or "general"),
        "email": email,
        "message": message[:4000],
        "status": "open",
        "priority": "normal",
        "rootOnly": True,
        "createdAt": now_iso(),
    }
    result = supabase_document_insert("support_feedback", record)
    return {
        "ok": bool(result.get("ok")),
        "feedback": record,
        **({} if result.get("ok") else {"reason": result.get("reason") or "feedback_save_failed"}),
    }
