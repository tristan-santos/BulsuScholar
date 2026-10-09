import json
import hashlib
import os
import urllib.parse
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


STUDENT_SCHOLARSHIP_STATE_KEYS = {
    "scholarshipCommitment", "rosterAssignmentState", "rosterDecisionPending",
    "rosterMatchCount", "rosterMatchNotice", "rosterScholarshipChoice",
    "scholarshipConflictMessage", "scholarshipConflictWarning",
    "scholarshipRestrictionReason", "scholarshipLifecycleVersion",
}
STUDENT_SCHOLARSHIP_ARRAY_KEYS = {
    "scholarships", "scholarshipApplicationHistory", "previousScholars",
}
STUDENT_PROFILE_FILE_KEYS = {"scholarshipApplicationFile", "applicationFormFile"}
TERMINAL_SCHOLARSHIP_STATUSES = {
    "rejected", "denied", "declined", "cancelled", "canceled", "withdrawn",
    "archived", "resolved", "expired",
}


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
    if table == "scholarship_applications":
        return {
            "student_id": data.get("studentId") or data.get("studentNumber") or data.get("studentnumber"),
            "grantor_id": data.get("grantorId") or data.get("providerId"),
            "scholarship_id": data.get("scholarshipId") or data.get("announcementId"),
            "academic_cycle": data.get("academicCycle") or data.get("semesterTag"),
            "status": data.get("status") or "Unknown",
        }
    if table == "student_scholarship_invitations":
        return {
            "student_id": data.get("studentId"),
            "grantor_id": data.get("grantorId") or data.get("providerId") or "unknown",
            "scholarship_id": data.get("scholarshipId") or data.get("announcementId"),
            "status": data.get("status") or "Pending",
        }
    if table == "student_scholarship_state":
        return {"student_id": data.get("studentId") or data.get("student_id")}
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
                "grade_not_eligible",
                "application_requirement_pending",
                "authoritative_roster_managed",
                "roster_assignment_conflict",
                "roster_import_batch_not_found",
                "roster_import_batch_owner_mismatch",
                "roster_import_batch_not_ready",
                "roster_import_has_blocking_errors",
                "roster_scholarship_not_recognized",
                "roster_conflict_not_found",
                "selected_roster_required",
                "selected_roster_not_found",
                "invalid_roster_conflict_resolution",
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


def supabase_admin_create_user(email: str, password: str, user_metadata: dict[str, Any] | None = None, email_confirm: bool = False, app_metadata: dict[str, Any] | None = None) -> dict[str, Any]:
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
        "app_metadata": app_metadata or {},
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


def _raw_select(table: str, filters: dict[str, Any] | None = None, limit: int = 1) -> dict[str, Any]:
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
        headers={"apikey": service_key, "Authorization": f"Bearer {service_key}", "Accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return {"ok": True, "rows": json.loads(response.read().decode("utf-8") or "[]")}
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8")
        reason = "missing_or_unloaded_supabase_table" if error.code == 404 and "PGRST205" in detail else "supabase_http_error"
        return {"ok": False, "status": error.code, "reason": reason, "table": table, "detail": detail}


def _scholarship_application_open(data: dict[str, Any]) -> bool:
    status = str(data.get("status") or "").strip().lower()
    return not (
        data.get("archived") is True or data.get("frozen") is True or data.get("rejected") is True
        or any(marker in status for marker in TERMINAL_SCHOLARSHIP_STATUSES)
    )


def _profile_file_from_submission(submission_id: str, data: dict[str, Any]) -> dict[str, Any]:
    file_data = data.get("file") if isinstance(data.get("file"), dict) else {}
    return {
        "url": f"/student/profile/documents/{submission_id}/content",
        **file_data,
        "name": data.get("name") or file_data.get("name") or "Student Application Profile.pdf",
        "uploadedAt": data.get("submittedAt") or data.get("updatedAt"),
        "semesterTag": data.get("academicCycle"),
        "submissionId": submission_id,
        "reviewStatus": data.get("status") or "pending",
        "profileRevisionId": data.get("profileRevisionId"),
    }


def _hydrate_student_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not rows:
        return rows
    student_ids = {str(row.get("id") or "").strip() for row in rows if row.get("id")}
    applications_by_student: dict[str, list[dict[str, Any]]] = {student_id: [] for student_id in student_ids}
    invitations_by_student: dict[str, list[dict[str, Any]]] = {student_id: [] for student_id in student_ids}
    states: dict[str, dict[str, Any]] = {}
    profile_files: dict[str, tuple[str, dict[str, Any]]] = {}

    for row in (_raw_select("scholarship_applications", limit=0).get("rows") or []):
        data = row.get("data") if isinstance(row.get("data"), dict) else {}
        student_id = str(row.get("student_id") or data.get("studentId") or data.get("studentNumber") or "").strip()
        if student_id in student_ids:
            applications_by_student[student_id].append({"id": row.get("id"), **data})
    for row in (_raw_select("student_scholarship_invitations", limit=0).get("rows") or []):
        data = row.get("data") if isinstance(row.get("data"), dict) else {}
        student_id = str(row.get("student_id") or data.get("studentId") or "").strip()
        if student_id in student_ids:
            invitations_by_student[student_id].append({"id": row.get("id"), **data})
    for row in (_raw_select("student_scholarship_state", limit=0).get("rows") or []):
        student_id = str(row.get("student_id") or "").strip()
        if student_id in student_ids and isinstance(row.get("data"), dict):
            states[student_id] = row["data"]
    for row in (_raw_select("student_document_submissions", {"data->>documentType": "profile"}, limit=0).get("rows") or []):
        data = row.get("data") if isinstance(row.get("data"), dict) else {}
        student_id = str(data.get("studentId") or "").strip()
        if student_id not in student_ids:
            continue
        sort_key = str(data.get("submittedAt") or data.get("updatedAt") or row.get("updated_at") or "")
        if student_id not in profile_files or sort_key > profile_files[student_id][0]:
            profile_files[student_id] = (sort_key, _profile_file_from_submission(str(row.get("id") or ""), data))

    hydrated = []
    for row in rows:
        student_id = str(row.get("id") or "").strip()
        base = row.get("data") if isinstance(row.get("data"), dict) else {}
        applications = applications_by_student.get(student_id, [])
        applications.sort(key=lambda item: str(item.get("updatedAt") or item.get("createdAt") or ""), reverse=True)
        active = [item for item in applications if _scholarship_application_open(item)]
        history = [item for item in applications if not _scholarship_application_open(item)]
        data = {
            **base,
            **states.get(student_id, {}),
            "scholarships": active,
            "scholarshipApplicationHistory": history,
            "scholarshipInvitations": invitations_by_student.get(student_id, []),
        }
        if student_id in profile_files:
            data["scholarshipApplicationFile"] = profile_files[student_id][1]
            data["applicationFormFile"] = profile_files[student_id][1]
        hydrated.append({**row, "data": data})
    return hydrated


def _persist_student_workflow_fields(student_id: str, payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any] | None]:
    clean = dict(payload)
    workflow_present = any(key in clean for key in STUDENT_SCHOLARSHIP_ARRAY_KEYS | STUDENT_SCHOLARSHIP_STATE_KEYS | STUDENT_PROFILE_FILE_KEYS | {"scholarshipInvitations"})
    if not workflow_present:
        return clean, None

    workflow_payload = {
        key: clean[key]
        for key in STUDENT_SCHOLARSHIP_ARRAY_KEYS | STUDENT_SCHOLARSHIP_STATE_KEYS | {"scholarshipInvitations"}
        if key in clean
    }
    if workflow_payload:
        result = supabase_rpc("persist_student_scholarship_compatibility", {
            "p_student_id": student_id,
            "p_payload": workflow_payload,
        })
        if not result.get("ok"):
            return clean, result

    for key in STUDENT_SCHOLARSHIP_ARRAY_KEYS | STUDENT_SCHOLARSHIP_STATE_KEYS | {"scholarshipInvitations"}:
        clean.pop(key, None)

    for key in STUDENT_PROFILE_FILE_KEYS:
        clean.pop(key, None)
    return clean, None


def supabase_document_insert(table: str, payload: dict[str, Any], parent_id: str | None = None) -> dict[str, Any]:
    if table == "students":
        student_id = str(payload.get("id") or payload.get("studentId") or payload.get("studentnumber") or "").strip()
        payload, workflow_error = _persist_student_workflow_fields(student_id, expand_dotted_keys(payload))
        if workflow_error:
            return workflow_error
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
    if table == "students":
        payload, workflow_error = _persist_student_workflow_fields(record_id, payload)
        if workflow_error:
            return workflow_error
    if merge:
        current = _raw_select(table, {"id": record_id, **({"parent_id": parent_id} if parent_id else {})}, limit=1)
        current_row = (current.get("rows") or [None])[0]
        existing_data = current_row.get("data", {}) if isinstance(current_row, dict) else {}
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
    result = _raw_select(table, {"id": record_id, **({"parent_id": parent_id} if parent_id else {})}, limit=1)
    if not result.get("ok"):
        return result
    rows = result.get("rows") or []
    if table == "students":
        rows = _hydrate_student_rows(rows)
    row = rows[0] if rows else None
    return {"ok": True, "row": row, "data": row.get("data", {}) if row else {}}


def supabase_select(table: str, filters: dict[str, Any] | None = None, limit: int = 1) -> dict[str, Any]:
    result = _raw_select(table, filters, limit)
    if result.get("ok") and table == "students":
        result["rows"] = _hydrate_student_rows(result.get("rows") or [])
    return result


def supabase_table_status(table: str) -> dict[str, Any]:
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        return {"ok": False, "reason": "missing_supabase_server_config", "table": table}

    request = urllib.request.Request(
        f"{supabase_url}/rest/v1/{table}?select=*&limit=1",
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

    payload = expand_dotted_keys(payload)
    if table == "students":
        payload, workflow_error = _persist_student_workflow_fields(record_id, payload)
        if workflow_error:
            return workflow_error

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
    merged_data = deep_merge(existing_data, payload)
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


def get_student_required_action(student_id: str) -> dict[str, Any] | None:
    """Return one replaceable next step without creating another notification."""
    student_id = str(student_id or "").strip()
    student_record = supabase_document_get("students", student_id)
    if not student_record.get("row"):
        return None
    student = student_record.get("data") or {}

    offers = supabase_select(
        "scholarship_waitlist_offers",
        {"student_id": student_id, "status": "active"},
        limit=20,
    )
    active_offers = (offers.get("rows") or []) if offers.get("ok") else []
    if active_offers:
        offer = sorted(active_offers, key=lambda row: str(row.get("expires_at") or ""))[0]
        return {
            "key": f"waitlist-offer:{offer.get('id')}",
            "status": "Action required",
            "title": "Respond to your scholarship slot offer",
            "message": "A reserved slot is waiting for your decision before the offer expires.",
            "actionLabel": "Review Offer",
            "route": f"/student-dashboard/scholarships?waitlistOffer={offer.get('id')}",
            "updatedAt": offer.get("updated_at") or offer.get("offered_at"),
        }

    verification = student.get("documentVerification") if isinstance(student.get("documentVerification"), dict) else {}
    labels = {
        "cor": "Certificate of Registration",
        "rog": "Report of Grades",
        "identity": "identity document",
        "profile": "Student Application Profile",
    }
    for key in (("cor", "rog", "identity", "profile") if verification else ()):
        state = verification.get(key) if isinstance(verification.get(key), dict) else {}
        status = str(state.get("status") or "missing").lower()
        if status in {"approved", "exempt", "superseded"}:
            continue
        if status == "rejected":
            message = f"Your {labels[key]} was rejected. Correct it and submit a replacement."
            action_label = "Replace Document" if key != "profile" else "Complete Profile"
        elif status == "pending":
            message = f"Your {labels[key]} is waiting for document review."
            action_label = "Wait for Review"
        else:
            message = f"Submit your {labels[key]} to continue your scholarship workflow."
            action_label = "Complete Profile" if key == "profile" else "Upload Document"
        return {
            "key": f"document:{key}:{state.get('submissionId') or status}",
            "status": status.title(),
            "title": f"Next: {labels[key]}",
            "message": message,
            "actionLabel": action_label,
            "route": "/student-dashboard/profile/form" if key == "profile" else f"/student-dashboard/profile#{key}",
            "updatedAt": student.get("updatedAt"),
        }

    applications_result = supabase_select(
        "scholarship_applications",
        {"data->>studentId": student_id},
        limit=1000,
    )
    applications = []
    for row in ((applications_result.get("rows") or []) if applications_result.get("ok") else []):
        data = row.get("data") if isinstance(row.get("data"), dict) else {}
        status = str(data.get("status") or "").lower()
        if data.get("archived") is not True and status not in {"archived", "rejected", "withdrawn", "finished", "completed"}:
            applications.append({"id": row.get("id"), **data})
    applications.sort(key=lambda row: str(row.get("updatedAt") or row.get("createdAt") or ""), reverse=True)
    if applications:
        application = applications[0]
        scholarship = application.get("scholarshipTitle") or application.get("scholarshipName") or "your scholarship"
        if application.get("source") == "authoritative_roster":
            return {
                "key": f"roster:{application.get('id')}",
                "status": "Assigned",
                "title": "Official scholarship assigned",
                "message": f"You are assigned to {scholarship}. The scholarship will finish automatically after all required documents are approved.",
                "actionLabel": "View Scholarship",
                "route": "/student-dashboard/scholarships",
                "updatedAt": application.get("updatedAt"),
            }

        application_id = str(application.get("id") or "")
        request_result = supabase_select("soe_requests", {"data->>applicationId": application_id}, limit=20)
        requests = (request_result.get("rows") or []) if request_result.get("ok") else []
        requests.sort(key=lambda row: str((row.get("data") or {}).get("updatedAt") or row.get("updated_at") or ""), reverse=True)
        if not requests:
            return {
                "key": f"materials:{application_id}:request",
                "status": "Ready",
                "title": "Request scholarship materials",
                "message": f"Review {scholarship} and request its SOE and application form when all readiness checks pass.",
                "actionLabel": "Request Materials",
                "route": "/student-dashboard/scholarships",
                "updatedAt": application.get("updatedAt"),
            }
        request_data = requests[0].get("data") or {}
        request_status = str(request_data.get("reviewState") or request_data.get("status") or "pending").lower()
        if request_status in {"approved", "signed"}:
            return {
                "key": f"materials:{application_id}:download",
                "status": "Approved",
                "title": "Download and complete your scholarship materials",
                "message": "Your SOE and application form are available. Complete the required signed submission.",
                "actionLabel": "View Materials",
                "route": "/student-dashboard/scholarships",
                "updatedAt": request_data.get("updatedAt"),
            }
        return {
            "key": f"materials:{application_id}:{request_status}",
            "status": request_status.title(),
            "title": "Materials request is under review",
            "message": "The Scholarship Office is reviewing your SOE and application-form request.",
            "actionLabel": "View Application",
            "route": "/student-dashboard/scholarships",
            "updatedAt": request_data.get("updatedAt"),
        }

    waitlist = supabase_select(
        "scholarship_waitlist_entries",
        {"student_id": student_id, "status": "queued"},
        limit=20,
    )
    if waitlist.get("ok") and waitlist.get("rows"):
        row = waitlist["rows"][0]
        return {
            "key": f"waitlist:{row.get('id')}",
            "status": "Queued",
            "title": "Wait for an available scholarship slot",
            "message": "You will be notified when a slot becomes available. Keep your documents current.",
            "actionLabel": "View Scholarships",
            "route": "/student-dashboard/scholarships",
            "updatedAt": row.get("updated_at") or row.get("queued_at"),
        }
    return None


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
