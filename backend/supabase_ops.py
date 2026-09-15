import json
import hashlib
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


def supabase_rest_upsert_many(table: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {"ok": True, "data": []}

    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        return {"ok": False, "reason": "missing_supabase_server_config", "table": table}

    request = urllib.request.Request(
        f"{supabase_url}/rest/v1/{table}?on_conflict=id",
        data=json.dumps(rows).encode("utf-8"),
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=representation",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8") or "[]")
            return {"ok": True, "data": data}
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8")
        reason = "supabase_http_error"
        if error.code == 404 and "PGRST205" in detail:
            reason = "missing_or_unloaded_supabase_table"
        return {"ok": False, "status": error.code, "reason": reason, "table": table, "detail": detail}


def supabase_rpc(function_name: str, payload: dict[str, Any]) -> dict[str, Any]:
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        return {"ok": False, "reason": "missing_supabase_server_config"}

    request = urllib.request.Request(
        f"{supabase_url}/rest/v1/rpc/{urllib.parse.quote(function_name)}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8") or "null")
            return {"ok": True, "data": data}
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8")
        reason = "supabase_rpc_error"
        try:
            parsed = json.loads(detail)
            message = str(parsed.get("message") or parsed.get("details") or "")
            known_reasons = {
                "announcement_not_found",
                "announcement_not_open_for_applications",
                "invalid_slot_capacity",
                "slots_not_configured",
                "scholarship_full",
                "capacity_below_occupied",
                "stale_slot_capacity",
                "scholarship_not_active",
                "student_not_found",
                "student_already_has_active_scholarship",
                "application_not_found",
                "application_closed",
                "scholarship_already_committed",
                "commitment_requires_resolution",
                "document_review_required",
                "document_versions_changed",
                "grantor_archived",
                "grantor_not_found",
                "student_account_blocked",
                "slot_reservation_missing",
                "grantor_application_exists",
                "reapply_cooldown_active",
                "scholarship_ineligible",
                "archived_grantor_block",
                "application_workflow_required",
                "application_history_required",
                "scholarship_choice_required",
                "invalid_application_documents",
                "material_approval_required",
            }
            if message in known_reasons:
                reason = message
        except (TypeError, ValueError):
            pass
        return {"ok": False, "status": error.code, "reason": reason, "detail": detail}


def supabase_admin_create_user(email: str, password: str, user_metadata: dict[str, Any] | None = None, email_confirm: bool = False) -> dict[str, Any]:
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        return {"ok": False, "reason": "missing_supabase_server_config"}
    if not email or not password:
        return {"ok": False, "reason": "missing_auth_credentials"}

    payload = {
        "email": email,
        "password": password,
        "email_confirm": bool(email_confirm),
        "user_metadata": user_metadata or {},
    }
    request = urllib.request.Request(
        f"{supabase_url}/auth/v1/admin/users",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8") or "{}")
            return {"ok": True, "user": data}
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8")
        if error.code == 422 and ("already" in detail.lower() or "registered" in detail.lower()):
            return {"ok": False, "reason": "auth_email_already_exists", "status": error.code, "detail": detail}
        return {"ok": False, "reason": "supabase_auth_admin_error", "status": error.code, "detail": detail}


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
        detail = error.read().decode("utf-8")
        reason = "supabase_http_error"
        if error.code == 404 and "PGRST205" in detail:
            reason = "missing_or_unloaded_supabase_table"
        return {"ok": False, "status": error.code, "reason": reason, "table": table, "detail": detail}


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


def broadcast_student_notification(payload: dict[str, Any]) -> dict[str, Any]:
    announcement_id = str(payload.get("announcementId") or "").strip()
    if not announcement_id:
        return {"ok": False, "reason": "missing_announcement_id"}

    students_result = supabase_select("students", limit=0)
    if not students_result.get("ok"):
        return {
            "ok": False,
            "reason": students_result.get("reason") or "student_list_failed",
            "detail": students_result.get("detail"),
        }

    recipients: list[str] = []
    for row in students_result.get("rows") or []:
        row_id = str(row.get("id") or "").strip()
        data = row.get("data") if isinstance(row.get("data"), dict) else {}
        student_id = str(data.get("studentnumber") or data.get("studentId") or row_id).strip()
        if not student_id or row_id.lower().startswith("roster_"):
            continue
        if data.get("archived") is True or str(data.get("status") or "").strip().lower() == "archived":
            continue
        recipients.append(student_id)

    recipients = list(dict.fromkeys(recipients))
    created_at = payload.get("createdAt") if isinstance(payload.get("createdAt"), str) else utc_now_iso()
    base_payload = {
        **payload,
        "source": payload.get("source") or "personal",
        "type": payload.get("type") or "admin_announcement",
        "announcementSource": "admin",
        "read": False,
        "createdAt": created_at,
    }
    base_payload.pop("studentId", None)
    base_payload.pop("id", None)

    rows = []
    for student_id in recipients:
        notification = {**base_payload, "studentId": student_id}
        notification_key = hashlib.sha256(f"{announcement_id}:{student_id}".encode("utf-8")).hexdigest()[:32]
        rows.append({
            "id": f"admin_announcement_{notification_key}",
            "data": notification,
            "updated_at": utc_now_iso(),
        })

    result = supabase_rest_upsert_many("studentNotifications", rows)
    table = "studentNotifications"
    fallback = False
    if result.get("reason") == "missing_or_unloaded_supabase_table":
        fallback = True
        table = "student_warnings"
        fallback_rows = [
            {
                **row,
                "data": {
                    **row["data"],
                    "notificationFallbackTable": "student_warnings",
                },
            }
            for row in rows
        ]
        result = supabase_rest_upsert_many(table, fallback_rows)

    if not result.get("ok"):
        return {
            **result,
            "recipients": len(recipients),
            "delivered": 0,
            "fallback": fallback,
        }
    return {
        "ok": True,
        "recipients": len(recipients),
        "delivered": len(result.get("data") or rows),
        "table": table,
        "fallback": fallback,
    }


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


def _notification_rows(result: dict[str, Any], source_table: str) -> list[dict[str, Any]]:
    if not result.get("ok"):
        return []
    rows = []
    for row in result.get("rows") or []:
        data = row.get("data") if isinstance(row.get("data"), dict) else {}
        rows.append({
            **data,
            "id": row.get("id"),
            "sourceTable": source_table,
            "created_at": row.get("created_at"),
            "updated_at": row.get("updated_at"),
        })
    return rows


def _sorted_notification_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        rows,
        key=lambda row: str(
            row.get("createdAt")
            or row.get("created_at")
            or row.get("updatedAt")
            or row.get("updated_at")
            or ""
        ),
        reverse=True,
    )


def list_admin_notifications() -> dict[str, Any]:
    result = supabase_select(
        "systemLogs",
        {"data->>notificationFallbackTable": "adminNotifications"},
        limit=1000,
    )
    if not result.get("ok"):
        return {**result, "notifications": []}
    return {
        "ok": True,
        "notifications": _sorted_notification_rows(
            _notification_rows(result, "systemLogs")
        ),
    }


def list_student_notifications(student_id: str) -> dict[str, Any]:
    student_id = str(student_id or "").strip()
    if not student_id:
        return {"ok": False, "reason": "missing_student_id", "notifications": []}
    primary = supabase_select(
        "studentNotifications",
        {"data->>studentId": student_id},
        limit=1000,
    )
    fallback = supabase_select(
        "student_warnings",
        {
            "data->>studentId": student_id,
            "data->>notificationFallbackTable": "student_warnings",
        },
        limit=1000,
    )
    if not primary.get("ok"):
        return {**primary, "notifications": []}
    rows = _notification_rows(primary, "studentNotifications")
    if fallback.get("ok"):
        rows.extend(_notification_rows(fallback, "student_warnings"))
    return {"ok": True, "notifications": _sorted_notification_rows(rows)}


def list_grantor_notifications(grantor_id: str) -> dict[str, Any]:
    grantor_id = str(grantor_id or "").strip()
    if not grantor_id:
        return {"ok": False, "reason": "missing_grantor_id", "notifications": []}
    primary = supabase_select(
        "grantorNotifications",
        {"data->>grantorId": grantor_id},
        limit=1000,
    )
    fallback = supabase_select(
        "systemLogs",
        {
            "data->>grantorId": grantor_id,
            "data->>notificationFallbackTable": "systemLogs",
        },
        limit=1000,
    )
    if not primary.get("ok"):
        return {**primary, "notifications": []}
    rows = _notification_rows(primary, "grantorNotifications")
    if fallback.get("ok"):
        rows.extend(_notification_rows(fallback, "systemLogs"))
    return {"ok": True, "notifications": _sorted_notification_rows(rows)}


def _owned_notification(
    table: str,
    notification_id: str,
    owner_key: str,
    owner_id: str,
    fallback_marker: str = "",
) -> dict[str, Any]:
    existing = supabase_select(table, {"id": notification_id}, limit=1)
    rows = existing.get("rows") or []
    stored = rows[0].get("data") if rows and isinstance(rows[0].get("data"), dict) else {}
    if not existing.get("ok") or not rows:
        return {"ok": False, "reason": existing.get("reason") or "notification_not_found"}
    if owner_id and str(stored.get(owner_key) or "").strip() != owner_id:
        owner_label = "student" if owner_key == "studentId" else "grantor"
        return {"ok": False, "reason": f"{owner_label}_notification_owner_mismatch"}
    if fallback_marker and str(stored.get("notificationFallbackTable") or "") != fallback_marker:
        return {"ok": False, "reason": "invalid_notification_source"}
    return {"ok": True, "data": stored}


def update_student_notification(
    notification_id: str,
    payload: dict[str, Any],
    student_id: str = "",
    source_table: str = "studentNotifications",
) -> dict[str, Any]:
    table = "student_warnings" if source_table in {"studentWarning", "student_warnings"} else "studentNotifications"
    marker = "student_warnings" if table == "student_warnings" else ""
    ownership = _owned_notification(table, notification_id, "studentId", student_id, marker)
    if not ownership.get("ok"):
        return ownership
    return supabase_document_update(table, notification_id, payload)


def update_student_notifications(
    notification_ids: list[str],
    payload: dict[str, Any],
    student_id: str = "",
    source_table: str = "studentNotifications",
) -> dict[str, Any]:
    unique_ids = list(dict.fromkeys(str(item or "").strip() for item in notification_ids if str(item or "").strip()))
    if not unique_ids:
        return {"ok": True, "updated": 0, "results": []}
    if len(unique_ids) > 250:
        return {"ok": False, "reason": "too_many_notification_ids"}

    results = []
    failures = []
    for notification_id in unique_ids:
        result = update_student_notification(
            notification_id,
            payload,
            student_id,
            source_table,
        )
        if result.get("ok"):
            results.append({"id": notification_id})
        else:
            failures.append({"id": notification_id, "reason": result.get("reason") or "notification_update_failed"})

    return {
        "ok": len(failures) == 0,
        "partial": bool(results) and bool(failures),
        "updated": len(results),
        "results": results,
        "failures": failures,
    }


def update_grantor_notification(
    notification_id: str,
    payload: dict[str, Any],
    grantor_id: str = "",
    source_table: str = "grantorNotifications",
) -> dict[str, Any]:
    table = "systemLogs" if source_table == "systemLogs" else "grantorNotifications"
    marker = "systemLogs" if table == "systemLogs" else ""
    ownership = _owned_notification(table, notification_id, "grantorId", grantor_id, marker)
    if not ownership.get("ok"):
        return ownership
    return supabase_document_update(table, notification_id, payload)


def update_grantor_notifications(
    notification_ids: list[str],
    payload: dict[str, Any],
    grantor_id: str = "",
    source_table: str = "grantorNotifications",
) -> dict[str, Any]:
    unique_ids = list(dict.fromkeys(str(item or "").strip() for item in notification_ids if str(item or "").strip()))
    if not unique_ids:
        return {"ok": True, "updated": 0, "results": []}
    if len(unique_ids) > 250:
        return {"ok": False, "reason": "too_many_notification_ids"}

    results = []
    failures = []
    for notification_id in unique_ids:
        result = update_grantor_notification(
            notification_id,
            payload,
            grantor_id,
            source_table,
        )
        if result.get("ok"):
            results.append({"id": notification_id})
        else:
            failures.append({"id": notification_id, "reason": result.get("reason") or "notification_update_failed"})

    return {
        "ok": len(failures) == 0,
        "partial": bool(results) and bool(failures),
        "updated": len(results),
        "results": results,
        "failures": failures,
    }


def update_admin_notification(notification_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    return supabase_document_update("systemLogs", notification_id, payload)


def delete_student_notification(
    notification_id: str,
    student_id: str = "",
    source_table: str = "studentNotifications",
) -> dict[str, Any]:
    table = "student_warnings" if source_table in {"studentWarning", "student_warnings"} else "studentNotifications"
    marker = "student_warnings" if table == "student_warnings" else ""
    ownership = _owned_notification(table, notification_id, "studentId", student_id, marker)
    if not ownership.get("ok"):
        return ownership
    return supabase_document_delete(table, notification_id)


def delete_grantor_notification(
    notification_id: str,
    grantor_id: str = "",
    source_table: str = "grantorNotifications",
) -> dict[str, Any]:
    table = "systemLogs" if source_table == "systemLogs" else "grantorNotifications"
    marker = "systemLogs" if table == "systemLogs" else ""
    ownership = _owned_notification(table, notification_id, "grantorId", grantor_id, marker)
    if not ownership.get("ok"):
        return ownership
    return supabase_document_delete(table, notification_id)


def delete_admin_notification(notification_id: str) -> dict[str, Any]:
    return supabase_document_delete("systemLogs", notification_id)
