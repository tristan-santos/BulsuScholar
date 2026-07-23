import json
import os
import urllib.parse
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_log_payload(action: str, actor_id: str = "", actor_type: str = "", target: str = "", details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "action": action,
        "actorId": actor_id,
        "actorType": actor_type,
        "target": target,
        "details": details or {},
        "createdAt": utc_now_iso(),
    }


def build_student_notification_payload(student_id: str, title: str, message: str, notification_type: str = "notification", extra: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "studentId": student_id,
        "title": title,
        "message": message,
        "type": notification_type,
        "read": False,
        "createdAt": utc_now_iso(),
        **(extra or {}),
    }


def build_grantor_notification_payload(grantor_id: str, title: str, message: str, notification_type: str = "notification", extra: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "grantorId": grantor_id,
        "title": title,
        "message": message,
        "type": notification_type,
        "read": False,
        "createdAt": utc_now_iso(),
        **(extra or {}),
    }


def build_admin_notification_payload(title: str, message: str, notification_type: str = "notification", extra: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "title": title,
        "message": message,
        "type": notification_type,
        "read": False,
        "archived": False,
        "createdAt": utc_now_iso(),
        **(extra or {}),
    }


def expand_dotted_keys(payload: dict[str, Any]) -> dict[str, Any]:
    expanded: dict[str, Any] = {}
    for key, value in (payload or {}).items():
        if "." not in key:
            expanded[key] = value
            continue
        cursor = expanded
        parts = [part for part in key.split(".") if part]
        for part in parts[:-1]:
            if not isinstance(cursor.get(part), dict):
                cursor[part] = {}
            cursor = cursor[part]
        cursor[parts[-1]] = value
    return expanded


def deep_merge(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    output = {**(left or {})}
    for key, value in (right or {}).items():
        if isinstance(value, dict) and isinstance(output.get(key), dict):
            output[key] = deep_merge(output[key], value)
        else:
            output[key] = value
    return output


def build_relational_columns(table: str, data: dict[str, Any]) -> dict[str, Any]:
    if table in {"students", "pending_students"}:
        return {
            "email": data.get("email"),
            "user_type": data.get("userType") or "student",
            "auth_user_id": data.get("authUserId"),
            "first_name": data.get("fname"),
            "middle_name": data.get("mname"),
            "last_name": data.get("lname"),
            "course": data.get("course"),
            "year_level": str(data.get("year")) if data.get("year") is not None else None,
            "section": data.get("section"),
            "contact_number": data.get("cpNumber"),
        }
    if table == "admins":
        return {
            "email": data.get("email"),
            "user_type": data.get("userType") or "admin",
            "first_name": data.get("fname"),
            "last_name": data.get("lname"),
        }
    if table == "providers":
        return {
            "email": data.get("email"),
            "user_type": data.get("userType") or "provider",
            "name": data.get("name") or data.get("providerName"),
        }
    if table == "student_document_usage":
        return {
            "student_id": data.get("student_id") or data.get("studentId"),
            "academic_year": data.get("academic_year") or data.get("academicYear"),
            "semester": data.get("semester"),
            "cor_hash": data.get("cor_hash") or data.get("corHash"),
            "account_id": data.get("account_id") or data.get("accountId"),
        }
    return {}


def clean_relational_columns(columns: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in columns.items() if value is not None}


def supabase_rest_insert(table: str, payload: dict[str, Any]) -> dict[str, Any]:
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        return {"ok": False, "reason": "missing_supabase_server_config", "payload": payload}

    request = urllib.request.Request(
        f"{supabase_url}/rest/v1/{table}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8") or "[]")
            return {"ok": True, "data": data}
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8")
        reason = "supabase_http_error"
        if error.code == 404 and "PGRST205" in detail:
            reason = "missing_or_unloaded_supabase_table"
        return {"ok": False, "status": error.code, "reason": reason, "table": table, "detail": detail}


def supabase_document_insert(table: str, payload: dict[str, Any], parent_id: str | None = None) -> dict[str, Any]:
    row = {
        "id": payload.get("id") or str(uuid4()),
        "data": payload,
        "updated_at": utc_now_iso(),
        **clean_relational_columns(build_relational_columns(table, payload)),
    }
    if parent_id:
        row["parent_id"] = parent_id
    return supabase_rest_insert(table, row)


def supabase_document_upsert(table: str, record_id: str, payload: dict[str, Any], merge: bool = True, parent_id: str | None = None) -> dict[str, Any]:
    payload = expand_dotted_keys(payload)
    if merge:
        current = supabase_document_get(table, record_id, parent_id=parent_id)
        existing_data = current.get("data", {}) if current.get("ok") else {}
        if not isinstance(existing_data, dict):
            existing_data = {}
        payload = deep_merge(existing_data, payload)
    row = {
        "id": record_id,
        "data": payload,
        "updated_at": utc_now_iso(),
        **clean_relational_columns(build_relational_columns(table, payload)),
    }
    if parent_id:
        row["parent_id"] = parent_id
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        return {"ok": False, "reason": "missing_supabase_server_config", "payload": payload}
    request = urllib.request.Request(
        f"{supabase_url}/rest/v1/{table}?on_conflict=id",
        data=json.dumps(row).encode("utf-8"),
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=representation",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8") or "[]")
            return {"ok": True, "data": data}
    except urllib.error.HTTPError as error:
        return {"ok": False, "status": error.code, "detail": error.read().decode("utf-8")}


def supabase_document_get(table: str, record_id: str, parent_id: str | None = None) -> dict[str, Any]:
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        return {"ok": False, "reason": "missing_supabase_server_config"}
    filters = f"id=eq.{record_id}"
    if parent_id:
        filters = f"{filters}&parent_id=eq.{parent_id}"
    request = urllib.request.Request(
        f"{supabase_url}/rest/v1/{table}?{filters}&select=*",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            rows = json.loads(response.read().decode("utf-8") or "[]")
            row = rows[0] if rows else None
            return {"ok": True, "row": row, "data": row.get("data", {}) if row else {}}
    except urllib.error.HTTPError as error:
        return {"ok": False, "status": error.code, "detail": error.read().decode("utf-8")}


def supabase_select(table: str, filters: dict[str, Any] | None = None, limit: int = 1) -> dict[str, Any]:
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        return {"ok": False, "reason": "missing_supabase_server_config"}

    query_parts = ["select=*"]
    for field, value in (filters or {}).items():
        query_parts.append(f"{urllib.parse.quote(str(field), safe='->')}=eq.{urllib.parse.quote(str(value or ''))}")
    if limit:
        query_parts.append(f"limit={int(limit)}")

    request = urllib.request.Request(
        f"{supabase_url}/rest/v1/{table}?{'&'.join(query_parts)}",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            rows = json.loads(response.read().decode("utf-8") or "[]")
            return {"ok": True, "rows": rows}
    except urllib.error.HTTPError as error:
        return {"ok": False, "status": error.code, "detail": error.read().decode("utf-8")}


def supabase_table_status(table: str) -> dict[str, Any]:
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        return {"ok": False, "reason": "missing_supabase_server_config", "table": table}

    request = urllib.request.Request(
        f"{supabase_url}/rest/v1/{table}?select=id&limit=1",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            rows = json.loads(response.read().decode("utf-8") or "[]")
            return {"ok": True, "table": table, "sampleRows": len(rows)}
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8")
        reason = "supabase_http_error"
        if error.code == 404 and "PGRST205" in detail:
            reason = "missing_or_unloaded_supabase_table"
        return {"ok": False, "table": table, "status": error.code, "reason": reason, "detail": detail}


def supabase_document_update(table: str, record_id: str, payload: dict[str, Any], parent_id: str | None = None) -> dict[str, Any]:
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        return {"ok": False, "reason": "missing_supabase_server_config", "payload": payload}

    filters = f"id=eq.{record_id}"
    if parent_id:
        filters = f"{filters}&parent_id=eq.{parent_id}"

    existing_request = urllib.request.Request(
        f"{supabase_url}/rest/v1/{table}?{filters}&select=*",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(existing_request, timeout=20) as response:
            rows = json.loads(response.read().decode("utf-8") or "[]")
    except urllib.error.HTTPError as error:
        return {"ok": False, "status": error.code, "detail": error.read().decode("utf-8")}

    existing_data = rows[0].get("data") if rows else {}
    if not isinstance(existing_data, dict):
        existing_data = {}
    merged_data = deep_merge(existing_data, expand_dotted_keys(payload))
    body = {
        "data": merged_data,
        "updated_at": utc_now_iso(),
        **clean_relational_columns(build_relational_columns(table, merged_data)),
    }
    request = urllib.request.Request(
        f"{supabase_url}/rest/v1/{table}?{filters}",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        method="PATCH",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8") or "[]")
            return {"ok": True, "data": data}
    except urllib.error.HTTPError as error:
        return {"ok": False, "status": error.code, "detail": error.read().decode("utf-8")}


def supabase_document_delete(table: str, record_id: str, parent_id: str | None = None) -> dict[str, Any]:
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        return {"ok": False, "reason": "missing_supabase_server_config"}

    filters = f"id=eq.{record_id}"
    if parent_id:
        filters = f"{filters}&parent_id=eq.{parent_id}"

    request = urllib.request.Request(
        f"{supabase_url}/rest/v1/{table}?{filters}",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Prefer": "return=representation",
        },
        method="DELETE",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8") or "[]")
            return {"ok": True, "data": data}
    except urllib.error.HTTPError as error:
        return {"ok": False, "status": error.code, "detail": error.read().decode("utf-8")}


def create_log(payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    data.setdefault("createdAt", utc_now_iso())
    return supabase_document_insert("systemLogs", data)


def create_student_notification(payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    if not isinstance(data.get("createdAt"), str):
        data["createdAt"] = utc_now_iso()
    result = supabase_document_insert("studentNotifications", data)
    if result.get("reason") == "missing_or_unloaded_supabase_table":
        fallback_data = {
            **data,
            "source": data.get("source") or "personal",
            "notificationFallbackTable": "student_warnings",
        }
        fallback_result = supabase_document_insert("student_warnings", fallback_data)
        return {
            **fallback_result,
            "fallback": True,
            "requestedTable": "studentNotifications",
            "table": "student_warnings",
            "originalError": result,
        }
    return result


def create_grantor_notification(payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    if not isinstance(data.get("createdAt"), str):
        data["createdAt"] = utc_now_iso()
    result = supabase_document_insert("grantorNotifications", data)
    if result.get("reason") == "missing_or_unloaded_supabase_table":
        fallback_data = {
            **data,
            "source": data.get("source") or "personal",
            "notificationFallbackTable": "systemLogs",
            "action": data.get("type") or "grantor_notification",
            "actorId": data.get("grantorId") or "",
            "actorType": "grantor",
        }
        fallback_result = supabase_document_insert("systemLogs", fallback_data)
        return {
            **fallback_result,
            "fallback": True,
            "requestedTable": "grantorNotifications",
            "table": "systemLogs",
            "originalError": result,
        }
    return result


def create_admin_notification(payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    if not isinstance(data.get("createdAt"), str):
        data["createdAt"] = utc_now_iso()
    data.setdefault("read", False)
    data.setdefault("archived", False)
    data.update({
        "notificationFallbackTable": "adminNotifications",
        "action": data.get("type") or "admin_notification",
        "actorType": data.get("actorType") or "system",
    })
    return supabase_document_insert("systemLogs", data)


def update_student_notification(notification_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    return supabase_document_update("studentNotifications", notification_id, payload)


def update_grantor_notification(notification_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    return supabase_document_update("grantorNotifications", notification_id, payload)


def update_admin_notification(notification_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    return supabase_document_update("systemLogs", notification_id, payload)


def delete_student_notification(notification_id: str) -> dict[str, Any]:
    return supabase_document_delete("studentNotifications", notification_id)


def delete_grantor_notification(notification_id: str) -> dict[str, Any]:
    return supabase_document_delete("grantorNotifications", notification_id)


def delete_admin_notification(notification_id: str) -> dict[str, Any]:
    return supabase_document_delete("systemLogs", notification_id)
