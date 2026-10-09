"""Authorized compatibility reads for legacy portal screens.

The browser has no direct Data API grants. This adapter keeps existing pages
working while their screen-specific endpoints are introduced.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request

try:
    from .access_control import enforce_portal_scope, require_admin_bearer
    from .supabase_ops import supabase_document_delete, supabase_document_upsert, supabase_select
except ImportError:  # pragma: no cover
    from access_control import enforce_portal_scope, require_admin_bearer
    from supabase_ops import supabase_document_delete, supabase_document_upsert, supabase_select


READ_TABLES = {
    "admins", "admin_settings", "students", "pending_students", "providers",
    "grantor_portals", "grantor_portal_scholars", "grantor_portal_applications",
    "grantor_portal_announcements", "scholarship_applications", "soe_requests",
    "student_scholarship_state", "student_scholarship_invitations",
    "soe_downloads", "announcements", "studentNotifications", "student_warnings", "systemLogs",
}
PUBLIC_REFERENCE_TABLES = {"announcements", "providers", "grantor_portals", "grantor_portal_announcements"}
ADMIN_PERMISSIONS = {
    "admins": {"full_admin"}, "admin_settings": set(), "students": {"students"},
    "pending_students": {"students"}, "providers": {"grantors"},
    "grantor_portals": {"grantors", "scholarships"},
    "grantor_portal_scholars": {"students", "grantors", "scholarships"},
    "grantor_portal_applications": {"students", "grantors", "scholarships"},
    "grantor_portal_announcements": {"announcements", "scholarships"},
    "scholarship_applications": {"students", "scholarships", "requirements"},
    "student_scholarship_state": {"students", "scholarships"},
    "student_scholarship_invitations": {"students", "scholarships"},
    "soe_requests": {"requirements"}, "soe_downloads": {"requirements"},
    "announcements": {"announcements"}, "studentNotifications": set(),
    "student_warnings": {"students"}, "systemLogs": {"full_admin"},
}
ADMIN_MUTABLE_TABLES = {
    "students", "providers", "grantor_portals", "grantor_portal_scholars",
    "grantor_portal_applications", "grantor_portal_announcements", "soe_requests",
    "soe_downloads", "announcements", "student_warnings", "admin_settings",
}
SENSITIVE_KEYS = {
    "password", "encryptedPassword", "passwordHash", "authUserId", "sessionValidAfter",
    "temporaryPassword", "resetToken", "recoveryToken", "failedAttempts", "blockedAt",
}


def _text(value: Any) -> str:
    return str(value or "").strip()


def _data(row: dict[str, Any]) -> dict[str, Any]:
    data = row.get("data")
    return data if isinstance(data, dict) else {}


def _student_id(row: dict[str, Any]) -> str:
    data = _data(row)
    return _text(data.get("studentId") or data.get("studentnumber") or data.get("studentNumber") or row.get("student_id"))


def _grantor_id(row: dict[str, Any]) -> str:
    data = _data(row)
    return _text(data.get("grantorId") or data.get("providerId") or row.get("parent_id") or row.get("grantor_id"))


def _all(table: str) -> list[dict[str, Any]]:
    result = supabase_select(table, limit=0)
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail=f"portal_data_{table}_unavailable")
    return [row for row in result.get("rows") or [] if isinstance(row, dict)]


def _require_admin_table_access(request: Request, actor_id: str, table: str) -> None:
    _, admin = require_admin_bearer(request, actor_id)
    if _text(admin.get("role")).lower() == "full_admin":
        return
    needed = ADMIN_PERMISSIONS.get(table, {"full_admin"})
    if needed and not needed.intersection(set(admin.get("permissions") or [])):
        raise HTTPException(status_code=403, detail="admin_permission_required")


def _grantor_student_ids(grantor_id: str) -> set[str]:
    related = _all("scholarship_applications") + _all("grantor_portal_scholars")
    return {_student_id(row) for row in related if _grantor_id(row) == grantor_id and _student_id(row)}


def _scope_rows(request: Request, role: str, actor_id: str, table: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if role == "admin":
        _require_admin_table_access(request, actor_id, table)
        return [row for row in rows if table != "admin_settings" or row.get("id") in {actor_id, "profile"}]
    if role == "student":
        if table in PUBLIC_REFERENCE_TABLES or table == "grantor_portal_scholars":
            return rows
        if table == "students":
            return [row for row in rows if _text(row.get("id")) == actor_id]
        if table in {"scholarship_applications", "soe_requests", "soe_downloads", "studentNotifications", "student_warnings"}:
            return [row for row in rows if _student_id(row) == actor_id]
        if table in {"student_scholarship_state", "student_scholarship_invitations"}:
            return [row for row in rows if _text(row.get("student_id")) == actor_id or _student_id(row) == actor_id]
        raise HTTPException(status_code=403, detail="portal_data_table_not_allowed")
    if role == "grantor":
        if table == "providers":
            return [row for row in rows if _text(row.get("id")) == actor_id]
        if table in {"grantor_portals", "grantor_portal_scholars", "grantor_portal_applications", "grantor_portal_announcements", "scholarship_applications"}:
            return [row for row in rows if _grantor_id(row) == actor_id or (table == "grantor_portals" and _text(row.get("id")) == actor_id)]
        if table in {"students", "pending_students", "soe_requests", "soe_downloads", "student_warnings", "student_scholarship_state", "student_scholarship_invitations"}:
            students = _grantor_student_ids(actor_id)
            return [row for row in rows if (_text(row.get("id")) if table in {"students", "pending_students"} else _text(row.get("student_id")) or _student_id(row)) in students]
        if table == "announcements":
            return rows
    raise HTTPException(status_code=403, detail="portal_data_table_not_allowed")


def _matches(row: dict[str, Any], condition: dict[str, Any]) -> bool:
    field = _text(condition.get("field"))
    operation = _text(condition.get("op") or "==")
    actual = row.get(field) if field in row else _data(row).get(field)
    expected = condition.get("value")
    if operation == "in":
        return str(actual) in {str(item) for item in expected or []}
    if operation == "!=":
        return str(actual) != str(expected)
    return str(actual) == str(expected)


def _redact(value: Any) -> Any:
    if isinstance(value, list):
        return [_redact(item) for item in value]
    if not isinstance(value, dict):
        return value
    return {key: _redact(child) for key, child in value.items() if key not in SENSITIVE_KEYS}


def _student_roster_summary(row: dict[str, Any]) -> dict[str, Any]:
    """Expose only recommendation-safe roster metadata to students."""
    data = _data(row)
    return {
        "id": row.get("id"),
        "parent_id": row.get("parent_id"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "data": {
            "grantorId": data.get("grantorId"),
            "archived": data.get("archived") is True,
        },
    }


def query_portal_data(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    identity: dict[str, Any] = {}
    enforce_portal_scope(request, identity, {"student", "grantor", "admin"})
    table = _text(payload.get("table"))
    if table not in READ_TABLES:
        raise HTTPException(status_code=403, detail="portal_data_table_not_allowed")
    rows = _scope_rows(request, identity["actorType"], identity["actorId"], table, _all(table))
    record_id, parent_id = _text(payload.get("id")), _text(payload.get("parentId"))
    if record_id:
        rows = [row for row in rows if _text(row.get("id")) == record_id]
    if parent_id:
        rows = [row for row in rows if _text(row.get("parent_id")) == parent_id]
    for condition in payload.get("filters") or []:
        if not isinstance(condition, dict) or condition.get("op") not in {"==", "!=", "in"}:
            raise HTTPException(status_code=422, detail="portal_data_filter_invalid")
        rows = [row for row in rows if _matches(row, condition)]
    order = payload.get("order") if isinstance(payload.get("order"), dict) else {}
    field = _text(order.get("field"))
    if field:
        rows.sort(key=lambda row: str(row.get(field) if field in row else _data(row).get(field) or ""), reverse=order.get("direction") == "desc")
    offset, limit = max(0, int(payload.get("from") or 0)), min(500, max(1, int(payload.get("limit") or 500)))
    visible_rows = rows[offset:offset + limit]
    if identity["actorType"] == "student" and table == "grantor_portal_scholars":
        visible_rows = [_student_roster_summary(row) for row in visible_rows]
    return {"ok": True, "rows": [_redact(row) for row in visible_rows]}


def mutate_portal_data(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    identity: dict[str, Any] = {}
    enforce_portal_scope(request, identity, {"admin", "grantor"})
    table, record_id = _text(payload.get("table")), _text(payload.get("id"))
    if identity["actorType"] == "grantor":
        allowed_fields = {"mustChangePassword", "passwordChangeCompletedAt", "passwordUpdatedAt"}
        data = payload.get("data")
        if table != "providers" or record_id != identity["actorId"] or not isinstance(data, dict) or not set(data).issubset(allowed_fields):
            raise HTTPException(status_code=403, detail="portal_data_mutation_not_allowed")
        result = supabase_document_upsert("providers", record_id, data, merge=True)
        if not result.get("ok"):
            raise HTTPException(status_code=503, detail=result.get("reason") or "portal_data_mutation_failed")
        return {"ok": True, "rows": result.get("data") or []}
    if table not in ADMIN_MUTABLE_TABLES or not record_id:
        raise HTTPException(status_code=403, detail="portal_data_mutation_not_allowed")
    _require_admin_table_access(request, identity["actorId"], table)
    data = payload.get("data")
    if not isinstance(data, dict):
        raise HTTPException(status_code=422, detail="portal_data_payload_invalid")
    result = supabase_document_upsert(table, record_id, data, merge=payload.get("merge") is True, parent_id=_text(payload.get("parentId")) or None)
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail=result.get("reason") or "portal_data_mutation_failed")
    return {"ok": True, "rows": result.get("data") or []}


def delete_portal_data(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    identity: dict[str, Any] = {}
    enforce_portal_scope(request, identity, {"admin"})
    table, record_id = _text(payload.get("table")), _text(payload.get("id"))
    if table not in ADMIN_MUTABLE_TABLES or not record_id:
        raise HTTPException(status_code=403, detail="portal_data_mutation_not_allowed")
    _require_admin_table_access(request, identity["actorId"], table)
    result = supabase_document_delete(table, record_id, parent_id=_text(payload.get("parentId")) or None)
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail=result.get("reason") or "portal_data_mutation_failed")
    return {"ok": True, "rows": result.get("data") or []}
