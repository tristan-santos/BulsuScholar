from typing import Any

try:
    from .supabase_ops import (
        create_grantor_notification,
        create_student_notification,
        supabase_document_insert,
        supabase_document_update,
        supabase_document_upsert,
        utc_now_iso,
    )
except ImportError:  # pragma: no cover
    from supabase_ops import (
        create_grantor_notification,
        create_student_notification,
        supabase_document_insert,
        supabase_document_update,
        supabase_document_upsert,
        utc_now_iso,
    )


def apply_scholarship(payload: dict[str, Any]) -> dict[str, Any]:
    student_id = payload.get("studentId") or payload.get("student", {}).get("id")
    if not student_id:
        return {"ok": False, "reason": "missing_student_id"}

    student_update = payload.get("studentUpdate") or {}
    application = payload.get("application") or {}
    notifications = payload.get("notifications") or {}
    results: dict[str, Any] = {}

    if student_update:
        results["student"] = supabase_document_upsert("students", student_id, student_update, merge=True)
        if not results["student"].get("ok"):
            return {"ok": False, "step": "student_update", "result": results["student"]}

    if application:
        results["application"] = supabase_document_insert("scholarship_applications", application)
        if not results["application"].get("ok"):
            return {"ok": False, "step": "application_insert", "result": results["application"]}

    grantor_notification = notifications.get("grantor")
    if grantor_notification:
        results["grantorNotification"] = create_grantor_notification(grantor_notification)

    student_notification = notifications.get("student")
    if student_notification:
        results["studentNotification"] = create_student_notification(student_notification)

    return {"ok": True, "results": results}


def update_admin_review(payload: dict[str, Any]) -> dict[str, Any]:
    updates = payload.get("updates") or []
    notifications = payload.get("notifications") or []
    results = []
    for update in updates:
        table = update.get("table")
        record_id = update.get("id")
        data = update.get("data") or {}
        if not table or not record_id:
            results.append({"ok": False, "reason": "missing_table_or_id", "update": update})
            continue
        results.append(supabase_document_update(table, record_id, data))

    notification_results = []
    for notification in notifications:
        target = notification.get("target")
        data = notification.get("data") or {}
        if target == "student":
            notification_results.append(create_student_notification(data))
        elif target == "grantor":
            notification_results.append(create_grantor_notification(data))

    return {"ok": all(item.get("ok") for item in results), "results": results, "notifications": notification_results}


def update_material_request(payload: dict[str, Any]) -> dict[str, Any]:
    inserts = payload.get("inserts") or []
    updates = payload.get("updates") or []
    results = []
    for insert in inserts:
        table = insert.get("table")
        data = insert.get("data") or {}
        if not table:
            results.append({"ok": False, "reason": "missing_table", "insert": insert})
            continue
        data.setdefault("createdAt", utc_now_iso())
        data.setdefault("updatedAt", utc_now_iso())
        record_id = insert.get("id") or data.get("id")
        if record_id:
            results.append(supabase_document_upsert(table, record_id, data, merge=True))
        else:
            results.append(supabase_document_insert(table, data))
    for update in updates:
        table = update.get("table")
        record_id = update.get("id")
        data = update.get("data") or {}
        if not table or not record_id:
            results.append({"ok": False, "reason": "missing_table_or_id", "update": update})
            continue
        data.setdefault("updatedAt", utc_now_iso())
        if update.get("upsert"):
            results.append(supabase_document_upsert(table, record_id, data, merge=True))
        else:
            results.append(supabase_document_update(table, record_id, data))
    return {"ok": all(item.get("ok") for item in results), "results": results}


def create_grantor_scholars(payload: dict[str, Any]) -> dict[str, Any]:
    grantor_id = payload.get("grantorId") or ""
    scholars = payload.get("scholars") or []
    if not grantor_id:
        return {"ok": False, "reason": "missing_grantor_id"}
    results = []
    for scholar in scholars:
        data = dict(scholar or {})
        data.setdefault("grantorId", grantor_id)
        data.setdefault("createdAt", utc_now_iso())
        data.setdefault("updatedAt", utc_now_iso())
        results.append(supabase_document_insert("grantor_portal_scholars", data, parent_id=grantor_id))
    return {"ok": all(item.get("ok") for item in results), "results": results}


def update_grantor_scholar(payload: dict[str, Any]) -> dict[str, Any]:
    grantor_id = payload.get("grantorId") or ""
    scholar_id = payload.get("scholarId") or payload.get("id") or ""
    data = payload.get("data") or {}
    if not grantor_id or not scholar_id:
        return {"ok": False, "reason": "missing_grantor_or_scholar_id"}
    data.setdefault("updatedAt", utc_now_iso())
    if payload.get("upsert"):
        return supabase_document_upsert("grantor_portal_scholars", scholar_id, data, merge=True, parent_id=grantor_id)
    return supabase_document_update("grantor_portal_scholars", scholar_id, data, parent_id=grantor_id)


def update_grantor_scholars(payload: dict[str, Any]) -> dict[str, Any]:
    grantor_id = payload.get("grantorId") or ""
    scholar_ids = payload.get("scholarIds") or []
    data = payload.get("data") or {}
    if not grantor_id:
        return {"ok": False, "reason": "missing_grantor_id"}
    results = []
    for scholar_id in scholar_ids:
        if not scholar_id:
            continue
        next_data = dict(data)
        next_data.setdefault("updatedAt", utc_now_iso())
        results.append(supabase_document_update("grantor_portal_scholars", scholar_id, next_data, parent_id=grantor_id))
    return {"ok": all(item.get("ok") for item in results), "results": results}


def create_grantor_announcement(payload: dict[str, Any]) -> dict[str, Any]:
    grantor_id = payload.get("grantorId") or ""
    announcement = payload.get("announcement") or {}
    if not grantor_id:
        return {"ok": False, "reason": "missing_grantor_id"}
    data = dict(announcement)
    data.setdefault("grantorId", grantor_id)
    data.setdefault("createdAt", utc_now_iso())
    data.setdefault("updatedAt", utc_now_iso())
    result = supabase_document_insert("grantor_portal_announcements", data, parent_id=grantor_id)
    if result.get("ok") and result.get("data"):
        inserted = result["data"][0] if isinstance(result["data"], list) and result["data"] else {}
        return {"ok": True, "id": inserted.get("id"), "result": result}
    return result


def update_grantor_announcement(payload: dict[str, Any]) -> dict[str, Any]:
    grantor_id = payload.get("grantorId") or ""
    announcement_id = payload.get("announcementId") or payload.get("id") or ""
    data = payload.get("data") or {}
    if not grantor_id or not announcement_id:
        return {"ok": False, "reason": "missing_grantor_or_announcement_id"}
    data.setdefault("updatedAt", utc_now_iso())
    return supabase_document_update("grantor_portal_announcements", announcement_id, data, parent_id=grantor_id)


def request_grantor_password_change(payload: dict[str, Any]) -> dict[str, Any]:
    grantor_id = payload.get("grantorId") or ""
    provider_update = payload.get("providerUpdate") or {}
    notification = payload.get("notification") or {}
    if not grantor_id:
        return {"ok": False, "reason": "missing_grantor_id"}

    provider_update.setdefault("updatedAt", utc_now_iso())
    provider_result = supabase_document_upsert("providers", grantor_id, provider_update, merge=True)
    if not provider_result.get("ok"):
        return {"ok": False, "step": "provider_update", "result": provider_result}

    notification_result = None
    if notification:
        notification_result = create_grantor_notification(notification)

    return {"ok": True, "provider": provider_result, "notification": notification_result}


def update_grantor_profile(payload: dict[str, Any]) -> dict[str, Any]:
    grantor_id = payload.get("grantorId") or ""
    data = payload.get("data") or {}
    update_portal = payload.get("updatePortal", True)
    if not grantor_id:
        return {"ok": False, "reason": "missing_grantor_id"}

    data.setdefault("updatedAt", utc_now_iso())
    provider_result = supabase_document_upsert("providers", grantor_id, data, merge=True)
    if not provider_result.get("ok"):
        return {"ok": False, "step": "provider_update", "result": provider_result}

    portal_result = None
    if update_portal:
        portal_result = supabase_document_upsert("grantor_portals", grantor_id, data, merge=True)
        if not portal_result.get("ok"):
            return {"ok": False, "step": "portal_update", "result": portal_result}

    return {"ok": True, "provider": provider_result, "portal": portal_result}
