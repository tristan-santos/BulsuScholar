from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from typing import Any
import urllib.error
import urllib.parse
import urllib.request
from uuid import uuid4

from fastapi import HTTPException


ACTIVE_TICKET_STATUSES = {"open", "in_progress"}
VALID_TICKET_STATUSES = ACTIVE_TICKET_STATUSES | {"resolved", "closed"}
VALID_TICKET_PRIORITIES = {"low", "normal", "high", "urgent"}
PORTAL_TICKET_ROLES = {"student", "grantor", "admin"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _rest(
    table: str,
    *,
    method: str = "GET",
    query: str = "",
    payload: Any = None,
    prefer: str = "return=representation",
) -> Any:
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise HTTPException(status_code=503, detail="missing_supabase_server_config")
    request = urllib.request.Request(
        f"{url}/rest/v1/{table}{'?' + query if query else ''}",
        data=None if payload is None else json.dumps(payload).encode("utf-8"),
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Prefer": prefer,
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw or "[]")
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8")
        raise HTTPException(status_code=error.code, detail=detail or "support_storage_error") from error


def _ticket_number() -> str:
    return f"BST-{datetime.now(timezone.utc).year}-{uuid4().hex[:8].upper()}"


def _normalize_message(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "ticketId": row.get("ticket_id"),
        "senderType": row.get("sender_type"),
        "body": row.get("body"),
        "createdAt": row.get("created_at"),
    }


def _messages(ticket_id: str) -> list[dict[str, Any]]:
    encoded = urllib.parse.quote(ticket_id, safe="")
    rows = _rest(
        "support_ticket_messages",
        query=f"ticket_id=eq.{encoded}&select=*&order=created_at.asc,id.asc",
    ) or []
    return [_normalize_message(row) for row in rows]


def _normalize_ticket(row: dict[str, Any], *, include_messages: bool = False) -> dict[str, Any]:
    data = row.get("data") if isinstance(row.get("data"), dict) else {}
    ticket = {
        "id": row.get("id"),
        "ticketId": row.get("ticket_number") or row.get("id"),
        "subject": row.get("subject") or data.get("subject") or data.get("category") or "Support request",
        "category": data.get("category") or "general",
        "reason": data.get("reason") or data.get("message") or "",
        "message": data.get("message") or data.get("reason") or "",
        "userId": data.get("userId") or "",
        "userType": data.get("userType") or "",
        "status": row.get("status") or data.get("status") or "open",
        "priority": row.get("priority") or data.get("priority") or "normal",
        "assignedTo": row.get("assigned_to") or data.get("assignedTo") or "",
        "internalNotes": data.get("internalNotes") or "",
        "createdAt": row.get("created_at"),
        "updatedAt": row.get("updated_at"),
        "lastMessageAt": row.get("last_message_at") or row.get("updated_at") or row.get("created_at"),
        "resolvedAt": row.get("resolved_at"),
    }
    if include_messages:
        ticket["messages"] = _messages(str(row.get("id") or ""))
    return ticket


def _ticket_row(ticket_id: str) -> dict[str, Any]:
    encoded = urllib.parse.quote(ticket_id, safe="")
    rows = _rest(
        "support_feedback",
        query=f"or=(id.eq.{encoded},ticket_number.eq.{encoded})&select=*&limit=1",
    ) or []
    if not rows:
        raise HTTPException(status_code=404, detail="support_ticket_not_found")
    return rows[0]


def _assert_owner(row: dict[str, Any], actor_id: str, actor_type: str) -> None:
    data = row.get("data") if isinstance(row.get("data"), dict) else {}
    if str(data.get("userId") or "") != actor_id or str(data.get("userType") or "").lower() != actor_type:
        raise HTTPException(status_code=403, detail="support_ticket_access_denied")


def create_portal_ticket(payload: dict[str, Any]) -> dict[str, Any]:
    actor_id = str(payload.get("actorId") or "").strip()
    actor_type = str(payload.get("actorType") or "").strip().lower()
    category = str(payload.get("category") or "general").strip().lower()[:50]
    subject = str(payload.get("subject") or "Support request").strip()[:120]
    reason = str(payload.get("reason") or payload.get("message") or "").strip()[:4000]
    if not actor_id or actor_type not in PORTAL_TICKET_ROLES:
        raise HTTPException(status_code=401, detail="portal_identity_required")
    if not subject or not reason:
        raise HTTPException(status_code=422, detail="support_ticket_subject_and_reason_required")

    ticket_id = str(uuid4())
    ticket_number = _ticket_number()
    created_at = now_iso()
    data = {
        "id": ticket_id,
        "ticketId": ticket_number,
        "userId": actor_id,
        "userType": actor_type,
        "category": category,
        "subject": subject,
        "reason": reason,
        "message": reason,
        "status": "open",
        "priority": "normal",
        "rootOnly": True,
        "createdAt": created_at,
    }
    _rest(
        "support_feedback",
        method="POST",
        payload={
            "id": ticket_id,
            "ticket_number": ticket_number,
            "subject": subject,
            "data": data,
            "status": "open",
            "priority": "normal",
            "created_at": created_at,
            "updated_at": created_at,
            "last_message_at": created_at,
        },
    )
    try:
        _rest(
            "support_ticket_messages",
            method="POST",
            payload={
                "id": str(uuid4()),
                "ticket_id": ticket_id,
                "sender_id": actor_id,
                "sender_type": actor_type,
                "body": reason,
                "created_at": created_at,
            },
        )
    except HTTPException:
        _rest("support_feedback", method="DELETE", query=f"id=eq.{urllib.parse.quote(ticket_id, safe='')}")
        raise
    return {"ok": True, "ticket": _normalize_ticket(_ticket_row(ticket_id), include_messages=True)}


def list_portal_tickets(actor_id: str, actor_type: str) -> list[dict[str, Any]]:
    rows = _rest("support_feedback", query="select=*&order=created_at.desc&limit=500") or []
    owned = []
    for row in rows:
        data = row.get("data") if isinstance(row.get("data"), dict) else {}
        if str(data.get("userId") or "") == actor_id and str(data.get("userType") or "").lower() == actor_type:
            owned.append(_normalize_ticket(row, include_messages=True))
    return owned


def get_portal_ticket(ticket_id: str, actor_id: str, actor_type: str) -> dict[str, Any]:
    row = _ticket_row(ticket_id)
    _assert_owner(row, actor_id, actor_type)
    return _normalize_ticket(row, include_messages=True)


def add_portal_message(ticket_id: str, actor_id: str, actor_type: str, body: str) -> dict[str, Any]:
    row = _ticket_row(ticket_id)
    _assert_owner(row, actor_id, actor_type)
    message = str(body or "").strip()[:4000]
    if not message:
        raise HTTPException(status_code=422, detail="support_message_required")
    created_at = now_iso()
    _rest(
        "support_ticket_messages",
        method="POST",
        payload={"id": str(uuid4()), "ticket_id": row["id"], "sender_id": actor_id, "sender_type": actor_type, "body": message, "created_at": created_at},
    )
    next_status = "open" if str(row.get("status") or "open") in {"resolved", "closed"} else row.get("status") or "open"
    _rest(
        "support_feedback",
        method="PATCH",
        query=f"id=eq.{urllib.parse.quote(str(row['id']), safe='')}",
        payload={"status": next_status, "resolved_at": None, "last_message_at": created_at, "updated_at": created_at},
    )
    return {"ok": True, "ticket": get_portal_ticket(str(row["id"]), actor_id, actor_type)}


def delete_portal_ticket(ticket_id: str, actor_id: str, actor_type: str) -> dict[str, Any]:
    row = _ticket_row(ticket_id)
    _assert_owner(row, actor_id, actor_type)
    _rest("support_feedback", method="DELETE", query=f"id=eq.{urllib.parse.quote(str(row['id']), safe='')}")
    return {"ok": True, "deletedTicketId": row.get("ticket_number") or row.get("id")}


def list_root_tickets() -> list[dict[str, Any]]:
    rows = _rest("support_feedback", query="select=*&order=created_at.asc&limit=500") or []
    message_rows = _rest("support_ticket_messages", query="select=*&order=created_at.asc,id.asc&limit=5000") or []
    messages_by_ticket: dict[str, list[dict[str, Any]]] = {}
    for message_row in message_rows:
        messages_by_ticket.setdefault(str(message_row.get("ticket_id") or ""), []).append(_normalize_message(message_row))
    tickets = []
    for row in rows:
        ticket = _normalize_ticket(row)
        ticket["messages"] = messages_by_ticket.get(str(row.get("id") or ""), [])
        tickets.append(ticket)
    active = [ticket for ticket in tickets if ticket["status"] in ACTIVE_TICKET_STATUSES]
    completed = [ticket for ticket in tickets if ticket["status"] not in ACTIVE_TICKET_STATUSES]
    completed.sort(key=lambda item: str(item.get("createdAt") or ""), reverse=True)
    for index, ticket in enumerate(active, start=1):
        ticket["queuePosition"] = index
    return [*active, *completed]


def update_root_ticket(payload: dict[str, Any], root_id: str) -> dict[str, Any]:
    row = _ticket_row(str(payload.get("ticketId") or ""))
    status = str(payload.get("status") or row.get("status") or "open")
    priority = str(payload.get("priority") or row.get("priority") or "normal")
    if status not in VALID_TICKET_STATUSES or priority not in VALID_TICKET_PRIORITIES:
        raise HTTPException(status_code=422, detail="invalid_ticket_update")
    data = row.get("data") if isinstance(row.get("data"), dict) else {}
    data = {**data, "status": status, "priority": priority, "assignedTo": root_id, "internalNotes": str(payload.get("internalNotes") or data.get("internalNotes") or "")[:4000], "updatedAt": now_iso()}
    _rest(
        "support_feedback",
        method="PATCH",
        query=f"id=eq.{urllib.parse.quote(str(row['id']), safe='')}",
        payload={"data": data, "status": status, "priority": priority, "assigned_to": root_id, "resolved_at": now_iso() if status == "resolved" else None, "updated_at": now_iso()},
    )
    reply = str(payload.get("reply") or "").strip()[:4000]
    if reply:
        created_at = now_iso()
        _rest(
            "support_ticket_messages",
            method="POST",
            payload={"id": str(uuid4()), "ticket_id": row["id"], "sender_id": root_id, "sender_type": "root", "body": reply, "created_at": created_at},
        )
        _rest(
            "support_feedback",
            method="PATCH",
            query=f"id=eq.{urllib.parse.quote(str(row['id']), safe='')}",
            payload={"last_message_at": created_at, "updated_at": created_at},
        )
    return {"ok": True, "ticket": _normalize_ticket(_ticket_row(str(row["id"])), include_messages=True)}


def delete_root_ticket(ticket_id: str) -> dict[str, Any]:
    row = _ticket_row(ticket_id)
    _rest("support_feedback", method="DELETE", query=f"id=eq.{urllib.parse.quote(str(row['id']), safe='')}")
    return {"ok": True, "deletedTicketId": row.get("ticket_number") or row.get("id")}


def support_message_report_rows() -> list[dict[str, Any]]:
    ticket_rows = _rest(
        "support_feedback",
        query="select=id,ticket_number,subject,status&order=created_at.asc&limit=500",
    ) or []
    tickets = {
        row.get("id"): {
            "ticketId": row.get("ticket_number") or row.get("id"),
            "subject": row.get("subject") or "Support request",
            "status": row.get("status") or "open",
        }
        for row in ticket_rows
    }
    rows = _rest("support_ticket_messages", query="select=*&order=created_at.asc&limit=5000") or []
    return [
        {
            "ticketId": tickets.get(row.get("ticket_id"), {}).get("ticketId") or row.get("ticket_id"),
            "subject": tickets.get(row.get("ticket_id"), {}).get("subject") or "Support request",
            "senderType": row.get("sender_type"),
            "message": row.get("body"),
            "sentAt": row.get("created_at"),
            "status": tickets.get(row.get("ticket_id"), {}).get("status") or "unknown",
        }
        for row in rows
    ]
