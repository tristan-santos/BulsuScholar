from typing import Any

try:
    from .supabase_ops import (
        create_admin_notification,
        create_log,
        create_grantor_notification,
        create_student_notification,
        supabase_document_insert,
        supabase_document_update,
        supabase_document_upsert,
        utc_now_iso,
    )
except ImportError:  # pragma: no cover
    from supabase_ops import (
        create_admin_notification,
        create_log,
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
    grantor_id = application.get("grantorId") or application.get("grantor_id")
    if not grantor_notification and grantor_id:
        student_name = (
            application.get("fullName")
            or " ".join(
                part
                for part in [
                    application.get("fname"),
                    application.get("mname"),
                    application.get("lname"),
                ]
                if part
            ).strip()
            or "A student"
        )
        scholarship_name = (
            application.get("scholarshipName")
            or application.get("providerLabel")
            or "your scholarship announcement"
        )
        grantor_notification = {
            "grantorId": grantor_id,
            "type": "application_submitted",
            "title": "New Student Application",
            "message": f"{student_name} applied for {scholarship_name}.",
            "studentId": student_id,
            "studentName": student_name,
            "announcementId": application.get("announcementId") or "",
            "applicationNumber": (
                application.get("applicationNumber")
                or application.get("requestNumber")
                or ""
            ),
            "authorName": student_name,
            "authorImageUrl": application.get("studentProfileImageUrl") or "",
            "read": False,
            "createdAt": utc_now_iso(),
        }
    if grantor_notification:
        results["grantorNotification"] = create_grantor_notification(grantor_notification)

    student_notification = notifications.get("student")
    if student_notification:
        results["studentNotification"] = create_student_notification(student_notification)

    if application:
        student_name = application.get("fullName") or application.get("studentName") or student_id
        scholarship_name = application.get("scholarshipName") or application.get("providerLabel") or "a scholarship"
        results["adminNotification"] = create_admin_notification({
            "type": "student_application",
            "title": "New Scholarship Application",
            "message": f"{student_name} submitted an application for {scholarship_name}.",
            "studentId": student_id,
            "grantorId": grantor_id or "",
            "applicationNumber": application.get("applicationNumber") or application.get("requestNumber") or "",
            "route": "/admin/scholarships",
            "actorType": "student",
            "actorId": student_id,
            "read": False,
            "archived": False,
            "createdAt": utc_now_iso(),
        })
        results["log"] = create_log({
            "action": "scholarship_application_created",
            "actorId": student_id,
            "actorType": "student",
            "target": application.get("applicationNumber") or application.get("requestNumber") or scholarship_name,
            "details": {"grantorId": grantor_id or "", "scholarship": scholarship_name},
            "createdAt": utc_now_iso(),
        })

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

    stage_completion = payload.get("stageCompletion") or {}
    student_id = stage_completion.get("studentId") or ""
    if student_id:
        step_id = str(stage_completion.get("stepId") or "").strip()
        step_label = str(stage_completion.get("stepLabel") or "Current Stage").strip()
        actor_name = str(stage_completion.get("actorName") or "BulsuScholar").strip()
        scholarship_name = str(stage_completion.get("scholarshipName") or "your scholarship application").strip()
        is_document_review = step_id == "document_review" or step_label.lower() == "document review"
        title = "Document Review Passed" if is_document_review else f"{step_label} Completed"
        message = (
            f"{actor_name} reviewed your submitted documents and marked them as passed for {scholarship_name}."
            if is_document_review
            else f"{actor_name} completed the {step_label.lower()} stage for {scholarship_name}."
        )
        notification_results.append(create_student_notification({
            "studentId": student_id,
            "source": "personal",
            "type": "scholarship_progress",
            "title": title,
            "message": message,
            "grantorId": stage_completion.get("grantorId") or "",
            "grantorName": stage_completion.get("grantorName") or "",
            "applicationNumber": stage_completion.get("applicationNumber") or "",
            "scholarshipId": stage_completion.get("scholarshipId") or "",
            "scholarshipName": scholarship_name,
            "stageId": step_id,
            "stageLabel": step_label,
            "authorName": actor_name,
            "authorImageUrl": stage_completion.get("authorImageUrl") or "",
            "read": False,
            "createdAt": utc_now_iso(),
        }))

    log_result = create_log({
        "action": "admin_review_updated",
        "actorId": payload.get("actorId") or "admin",
        "actorType": "admin",
        "target": stage_completion.get("applicationNumber") or stage_completion.get("studentId") or "admin_review",
        "details": {"updates": len(updates), "notifications": len(notification_results)},
        "createdAt": utc_now_iso(),
    })
    return {"ok": all(item.get("ok") for item in results), "results": results, "notifications": notification_results, "log": log_result}


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
    notification = None
    request_insert = next((item.get("data") or {} for item in inserts if item.get("table") in {"soe_requests", "soeRequests"}), None)
    if request_insert:
        student_name = request_insert.get("fullName") or request_insert.get("studentName") or request_insert.get("studentId") or "A student"
        material_label = request_insert.get("materialLabel") or request_insert.get("requestType") or "scholarship material"
        notification = create_admin_notification({
            "type": "material_request",
            "title": "New Material Request",
            "message": f"{student_name} requested {material_label}.",
            "studentId": request_insert.get("studentId") or "",
            "requestNumber": request_insert.get("requestNumber") or "",
            "route": "/admin/requirements",
            "actorType": "student",
            "actorId": request_insert.get("studentId") or "",
            "read": False,
            "archived": False,
            "createdAt": utc_now_iso(),
        })
    log_result = create_log({
        "action": "material_request_updated",
        "actorId": (request_insert or {}).get("studentId") or payload.get("actorId") or "",
        "actorType": payload.get("actorType") or ("student" if request_insert else "system"),
        "target": (request_insert or {}).get("requestNumber") or "materials",
        "details": {"inserts": len(inserts), "updates": len(updates)},
        "createdAt": utc_now_iso(),
    })
    return {"ok": all(item.get("ok") for item in results), "results": results, "adminNotification": notification, "log": log_result}


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
        announcement_id = inserted.get("id") or ""
        notification = create_grantor_notification({
            "grantorId": grantor_id,
            "type": "announcement_published",
            "title": "Announcement Published",
            "message": f'You published "{data.get("title") or "an announcement"}".',
            "announcementId": announcement_id,
            "read": False,
            "createdAt": utc_now_iso(),
        })
        admin_notification = create_admin_notification({
            "type": "grantor_announcement",
            "title": "Grantor Published an Announcement",
            "message": f'{data.get("authorName") or data.get("grantorName") or grantor_id} published "{data.get("title") or "an announcement"}".',
            "grantorId": grantor_id,
            "announcementId": announcement_id,
            "route": "/admin/announcements",
            "actorType": "grantor",
            "actorId": grantor_id,
            "read": False,
            "archived": False,
            "createdAt": utc_now_iso(),
        })
        log_result = create_log({
            "action": "grantor_announcement_created",
            "actorId": grantor_id,
            "actorType": "grantor",
            "target": announcement_id,
            "details": {"title": data.get("title") or "Announcement"},
            "createdAt": utc_now_iso(),
        })
        return {
            "ok": True,
            "id": announcement_id,
            "result": result,
            "notification": notification,
            "adminNotification": admin_notification,
            "log": log_result,
        }
    return result


def update_grantor_announcement(payload: dict[str, Any]) -> dict[str, Any]:
    grantor_id = payload.get("grantorId") or ""
    announcement_id = payload.get("announcementId") or payload.get("id") or ""
    data = payload.get("data") or {}
    if not grantor_id or not announcement_id:
        return {"ok": False, "reason": "missing_grantor_or_announcement_id"}
    data.setdefault("updatedAt", utc_now_iso())
    result = supabase_document_update("grantor_portal_announcements", announcement_id, data, parent_id=grantor_id)
    if not result.get("ok"):
        return result

    notification = None
    if data.get("archived") is True or str(data.get("status") or "").lower() == "archived":
        notification = create_grantor_notification({
            "grantorId": grantor_id,
            "type": "announcement_archived",
            "title": "Announcement Archived",
            "message": "Your announcement was moved to the archive.",
            "announcementId": announcement_id,
            "read": False,
            "createdAt": utc_now_iso(),
        })
    return {"ok": True, "result": result, "notification": notification}


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

    admin_notification = create_admin_notification({
        "type": "password_change_request",
        "title": "Password Change Requested",
        "message": f"{notification.get('authorName') or grantor_id} requested permission to change their password.",
        "grantorId": grantor_id,
        "route": "/admin/grantors",
        "actorType": "grantor",
        "actorId": grantor_id,
        "read": False,
        "archived": False,
        "createdAt": utc_now_iso(),
    })
    log_result = create_log({
        "action": "grantor_password_change_requested",
        "actorId": grantor_id,
        "actorType": "grantor",
        "target": grantor_id,
        "details": {},
        "createdAt": utc_now_iso(),
    })

    return {"ok": True, "provider": provider_result, "notification": notification_result, "adminNotification": admin_notification, "log": log_result}


def update_grantor_profile(payload: dict[str, Any]) -> dict[str, Any]:
    grantor_id = payload.get("grantorId") or ""
    data = payload.get("data") or {}
    update_portal = payload.get("updatePortal", True)
    suppress_notification = payload.get("suppressNotification") is True
    notification_reason = payload.get("notificationReason") or "manual_profile_update"
    changed_fields = payload.get("changedFields") or []
    change_summary = payload.get("changeSummary") or "Your grantor profile changes were saved."
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

    notification = None
    if not suppress_notification:
        notification = create_grantor_notification({
            "grantorId": grantor_id,
            "type": "profile_updated",
            "title": "Profile Updated",
            "message": change_summary,
            "changedFields": changed_fields,
            "changeSummary": change_summary,
            "notificationReason": notification_reason,
            "authorName": data.get("providerName") or data.get("name") or "Grantor",
            "authorImageUrl": data.get("profileImageUrl") or "",
            "read": False,
            "createdAt": utc_now_iso(),
        })

    return {"ok": True, "provider": provider_result, "portal": portal_result, "notification": notification}
