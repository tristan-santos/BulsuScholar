from datetime import datetime, timedelta, timezone
from typing import Any

try:
    from .supabase_ops import (
        create_admin_notification,
        create_log,
        create_grantor_notification,
        create_student_notification,
        supabase_document_get,
        supabase_document_insert,
        supabase_document_update,
        supabase_document_upsert,
        supabase_select,
        utc_now_iso,
    )
except ImportError:  # pragma: no cover
    from supabase_ops import (
        create_admin_notification,
        create_log,
        create_grantor_notification,
        create_student_notification,
        supabase_document_get,
        supabase_document_insert,
        supabase_document_update,
        supabase_document_upsert,
        supabase_select,
        utc_now_iso,
    )


REJECTION_REAPPLY_COOLDOWN = timedelta(hours=24)

TERMINAL_SCHOLARSHIP_STATUSES = {
    "archived", "cancelled", "declined", "denied", "frozen",
    "rejected", "resolved", "withdrawn",
}


def _normalize_student_id(value: Any) -> str:
    normalized = str(value or "").strip()
    while normalized.lower().startswith("roster_"):
        normalized = normalized[7:]
    return "".join(character for character in normalized if character.isalnum()).lower()


def _normalized_status(record: dict[str, Any]) -> str:
    return str(record.get("status") or record.get("applicationStatus") or record.get("reviewStatus") or "").strip().lower()


def _is_active_scholarship_record(record: dict[str, Any]) -> bool:
    if not isinstance(record, dict):
        return False
    if record.get("archived") is True or record.get("rejected") is True or record.get("frozen") is True:
        return False
    status = _normalized_status(record)
    return not any(value in status for value in TERMINAL_SCHOLARSHIP_STATUSES)


def _record_student_id(record: dict[str, Any]) -> str:
    return _normalize_student_id(
        record.get("studentId") or record.get("studentID") or record.get("studentNumber")
        or record.get("studentnumber") or record.get("id")
    )


def _record_grantor_id(record: dict[str, Any], fallback: str = "") -> str:
    return str(record.get("grantorId") or record.get("grantor_id") or record.get("providerId") or fallback or "").strip()


def _record_scholarship_identity(record: dict[str, Any]) -> tuple[str, str]:
    scholarship_id = str(record.get("scholarshipId") or record.get("announcementId") or record.get("id") or "").strip().lower()
    scholarship_name = str(
        record.get("scholarshipName") or record.get("name") or record.get("title")
        or record.get("providerLabel") or ""
    ).strip().lower()
    return scholarship_id, scholarship_name


def _same_scholarship(left: dict[str, Any], right: dict[str, Any]) -> bool:
    left_id, left_name = _record_scholarship_identity(left)
    right_id, right_name = _record_scholarship_identity(right)
    left_grantor = _record_grantor_id(left).lower()
    right_grantor = _record_grantor_id(right).lower()
    same_grantor = bool(left_grantor and right_grantor and left_grantor == right_grantor)
    return same_grantor and bool(
        (left_id and right_id and left_id == right_id)
        or (left_name and right_name and left_name == right_name)
    )


def _active_student_commitments(student_id: str, student_data: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    normalized_student_id = _normalize_student_id(student_id)
    commitments: list[dict[str, Any]] = []
    for entry in (student_data or {}).get("scholarships") or []:
        if isinstance(entry, dict) and _is_active_scholarship_record(entry):
            commitments.append({**entry, "source": "student"})

    applications_result = supabase_select("scholarship_applications", {"data->>studentId": student_id}, limit=0)
    if applications_result.get("ok"):
        for row in applications_result.get("rows") or []:
            data = row.get("data") if isinstance(row.get("data"), dict) else {}
            if _record_student_id(data) == normalized_student_id and _is_active_scholarship_record(data):
                commitments.append({**data, "source": "application", "recordId": row.get("id")})
    return commitments


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(text)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _is_rejected_scholarship(entry: dict[str, Any]) -> bool:
    status = str(entry.get("status") or entry.get("reviewStatus") or "").lower()
    return entry.get("rejected") is True or any(
        keyword in status for keyword in ("rejected", "denied", "declined")
    )


def _rejection_cooldown(entry: dict[str, Any]) -> dict[str, Any]:
    rejected_at = _parse_datetime(
        entry.get("rejectedAt")
        or entry.get("archivedAt")
        or entry.get("updatedAt")
        or entry.get("applicationDate")
        or entry.get("appliedAt")
        or entry.get("createdAt")
    )
    if not rejected_at:
        return {"active": False, "readyAt": None, "remainingSeconds": 0}
    ready_at = rejected_at + REJECTION_REAPPLY_COOLDOWN
    now = datetime.now(timezone.utc)
    remaining = max(0, int((ready_at - now).total_seconds()))
    return {
        "active": now < ready_at,
        "readyAt": ready_at.isoformat(),
        "remainingSeconds": remaining,
    }


def _latest_active_rejection_cooldown(student_data: dict[str, Any]) -> dict[str, Any] | None:
    scholarships = student_data.get("scholarships")
    if not isinstance(scholarships, list):
        return None
    rejected_entries = [
        entry for entry in scholarships
        if isinstance(entry, dict) and _is_rejected_scholarship(entry)
    ]
    cooldowns = [
        {**_rejection_cooldown(entry), "entry": entry}
        for entry in rejected_entries
    ]
    active = [item for item in cooldowns if item.get("active")]
    if not active:
        return None
    return sorted(active, key=lambda item: item.get("remainingSeconds", 0), reverse=True)[0]


def _entry_matches_archived_grantor(entry: dict[str, Any], grantor_id: str = "", provider_type: str = "") -> bool:
    status = str(entry.get("status") or "").lower()
    if not (
        entry.get("archived") is True
        or entry.get("frozen") is True
        or "archived" in status
        or "frozen" in status
        or "previous" in status
    ):
        return False
    entry_grantor = str(
        entry.get("blockedGrantorId")
        or entry.get("archivedBy")
        or entry.get("grantorId")
        or entry.get("providerId")
        or ""
    ).strip().lower()
    entry_provider = str(entry.get("providerType") or "").strip().lower()
    expected_grantor = str(grantor_id or "").strip().lower()
    expected_provider = str(provider_type or "").strip().lower()
    return bool(
        (expected_grantor and entry_grantor and expected_grantor == entry_grantor)
        or (expected_provider and entry_provider and expected_provider == entry_provider)
    )


def _archived_grantor_block(student_data: dict[str, Any], grantor_id: str = "", provider_type: str = "") -> dict[str, Any] | None:
    entries: list[Any] = []
    if isinstance(student_data.get("scholarships"), list):
        entries.extend(student_data.get("scholarships") or [])
    if isinstance(student_data.get("previousScholars"), list):
        entries.extend(student_data.get("previousScholars") or [])
    for entry in entries:
        if isinstance(entry, dict) and _entry_matches_archived_grantor(entry, grantor_id, provider_type):
            return entry
    return None


def _is_archived_grantor_record(record: dict[str, Any]) -> bool:
    status = str(record.get("status") or record.get("accountStatus") or "").strip().lower()
    return record.get("archived") is True or status in {"archived", "inactive", "disabled"}


def _archived_grantor_account(grantor_id: str) -> dict[str, Any] | None:
    if not grantor_id:
        return None
    for table in ("providers", "grantor_portals"):
        result = supabase_document_get(table, grantor_id)
        record = result.get("data") or {}
        if result.get("ok") and _is_archived_grantor_record(record):
            return {"table": table, "record": record}
    return None


def apply_scholarship(payload: dict[str, Any]) -> dict[str, Any]:
    student_id = payload.get("studentId") or payload.get("student", {}).get("id")
    if not student_id:
        return {"ok": False, "reason": "missing_student_id"}

    student_update = payload.get("studentUpdate") or {}
    application = payload.get("application") or {}
    notifications = payload.get("notifications") or {}
    results: dict[str, Any] = {}

    grantor_id = str(
        application.get("grantorId")
        or application.get("grantor_id")
        or application.get("providerId")
        or ""
    ).strip()
    archived_grantor = _archived_grantor_account(grantor_id)
    if archived_grantor:
        return {
            "ok": False,
            "reason": "grantor_archived",
            "message": "This grantor is archived and is not accepting scholarship applications.",
            "grantorId": grantor_id,
        }

    current_student = supabase_document_get("students", student_id)
    current_student_data: dict[str, Any] = {}
    if current_student.get("ok"):
        current_student_data = current_student.get("data") or {}
        active_cooldown = _latest_active_rejection_cooldown(current_student_data)
        if active_cooldown:
            return {
                "ok": False,
                "reason": "reapply_cooldown_active",
                "message": "Student cannot apply yet. The previous rejection is still under the 24-hour cooldown.",
                "readyAt": active_cooldown.get("readyAt"),
                "remainingSeconds": active_cooldown.get("remainingSeconds"),
            }
        if not payload.get("allowArchivedGrantorReapply"):
            archived_block = _archived_grantor_block(
                current_student_data,
                application.get("grantorId") or application.get("providerId") or "",
                application.get("providerType") or "",
            )
            if archived_block:
                return {
                    "ok": False,
                    "reason": "archived_grantor_block",
                    "message": "Student was archived by this grantor and cannot apply again unless invited back.",
                    "entry": archived_block,
                }

    active_commitments = _active_student_commitments(student_id, current_student_data)
    conflicting_commitments = [
        commitment for commitment in active_commitments
        if not _same_scholarship(commitment, application)
    ]
    if conflicting_commitments:
        conflict = conflicting_commitments[0]
        return {
            "ok": False,
            "reason": "student_already_has_active_scholarship",
            "message": "This student already has an active scholarship application and cannot apply to another scholarship.",
            "studentId": student_id,
            "existingGrantorId": _record_grantor_id(conflict),
            "existingScholarship": _record_scholarship_identity(conflict)[1],
        }

    if active_commitments and any(_same_scholarship(item, application) for item in active_commitments):
        return {
            "ok": True,
            "idempotent": True,
            "message": "The student is already attached to this scholarship.",
            "results": {},
        }

    if student_update:
        results["student"] = supabase_document_upsert("students", student_id, student_update, merge=True)
        if not results["student"].get("ok"):
            return {"ok": False, "step": "student_update", "result": results["student"]}

    if application:
        results["application"] = supabase_document_insert("scholarship_applications", application)
        if not results["application"].get("ok"):
            return {"ok": False, "step": "application_insert", "result": results["application"]}

    grantor_notification = notifications.get("grantor")
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
    actor_type = str(payload.get("actorType") or "admin").strip().lower()
    actor_id = str(payload.get("actorId") or "").strip()
    results = []

    if actor_type == "grantor":
        for update in updates:
            table = str(update.get("table") or "").strip()
            record_id = str(update.get("id") or "").strip()
            if table not in {"scholarship_applications", "scholarshipApplications"} or not record_id:
                continue

            current = supabase_document_get(table, record_id)
            if not current.get("ok"):
                return {
                    "ok": False,
                    "reason": "application_ownership_check_failed",
                    "detail": current,
                }

            current_data = current.get("data") or {}
            application_grantor_id = str(current_data.get("grantorId") or current_data.get("grantor_id") or "").strip()
            if not actor_id or not application_grantor_id or application_grantor_id != actor_id:
                return {
                    "ok": False,
                    "reason": "cross_grantor_application_update_blocked",
                    "currentGrantorId": actor_id,
                    "applicationGrantorId": application_grantor_id,
                    "applicationId": record_id,
                }

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
    actor_type = str(payload.get("actorType") or "student").strip().lower()
    actor_id = str(payload.get("actorId") or "").strip()
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
        if actor_type == "grantor" and table in {"soe_requests", "soeRequests"}:
            current = supabase_document_get(table, record_id)
            if not current.get("ok"):
                return {
                    "ok": False,
                    "reason": "material_request_ownership_check_failed",
                    "detail": current,
                }
            current_data = current.get("data") or {}
            request_grantor_id = str(
                current_data.get("grantorId")
                or current_data.get("matchedGrantorId")
                or ""
            ).strip()
            if not actor_id or not request_grantor_id or actor_id != request_grantor_id:
                return {
                    "ok": False,
                    "reason": "cross_grantor_material_request_update_blocked",
                    "currentGrantorId": actor_id,
                    "requestGrantorId": request_grantor_id,
                    "requestId": record_id,
                }
        data.setdefault("updatedAt", utc_now_iso())
        if update.get("upsert"):
            results.append(supabase_document_upsert(table, record_id, data, merge=True))
        else:
            results.append(supabase_document_update(table, record_id, data))
    notification = None
    grantor_notification = None
    student_notification = None
    request_change = next(
        (
            item
            for item in [*inserts, *updates]
            if item.get("table") in {"soe_requests", "soeRequests"}
        ),
        None,
    )
    request_insert = request_change.get("data") if request_change else None
    if request_insert:
        student_name = request_insert.get("fullName") or request_insert.get("studentName") or request_insert.get("studentId") or "A student"
        material_label = request_insert.get("materialLabel") or request_insert.get("requestType") or "scholarship material"
        request_number = request_insert.get("requestNumber") or request_insert.get("applicationNumber") or ""
        scholarship_name = request_insert.get("scholarshipName") or request_insert.get("providerType") or "a scholarship"
        grantor_id = request_insert.get("grantorId") or request_insert.get("matchedGrantorId") or ""
        grantor_name = request_insert.get("grantorName") or request_insert.get("matchedGrantorName") or ""
        request_status = str(
            request_insert.get("reviewState")
            or request_insert.get("status")
            or request_insert.get("approvalStatus")
            or ""
        ).strip().lower()
        is_staff_decision = actor_type in {"admin", "grantor"} and request_status not in {
            "", "pending", "requested", "incoming", "under review", "under_review"
        }
        if is_staff_decision and request_insert.get("studentId"):
            if any(value in request_status for value in ("reject", "declin", "non-compliant", "non_compliant")):
                decision_label = "Rejected"
                decision_title = "Material Request Rejected"
            elif any(value in request_status for value in ("sign", "complete")):
                decision_label = "Completed"
                decision_title = "Material Request Completed"
            else:
                decision_label = "Approved"
                decision_title = "Material Request Approved"
            reason = str(
                request_insert.get("rejectionReason")
                or request_insert.get("reviewReason")
                or request_insert.get("reason")
                or ""
            ).strip()
            decision_message = f"Your {material_label} request for {scholarship_name} was {decision_label.lower()}."
            if reason:
                decision_message += f" Reason: {reason}"
            student_notification = create_student_notification({
                "studentId": request_insert.get("studentId") or "",
                "source": "personal",
                "type": "material_request_decision",
                "title": decision_title,
                "message": decision_message,
                "requestNumber": request_number,
                "applicationNumber": request_insert.get("applicationNumber") or request_number,
                "scholarshipName": scholarship_name,
                "grantorId": grantor_id,
                "grantorName": grantor_name,
                "materialLabel": material_label,
                "decision": decision_label,
                "reason": reason,
                "route": "/student/scholarships",
                "actorType": actor_type,
                "actorId": payload.get("actorId") or "",
                "read": False,
                "archived": False,
                "createdAt": utc_now_iso(),
            })
        if not is_staff_decision:
            notification = create_admin_notification({
                "type": "material_request",
                "title": "New Material Request",
                "message": f"{student_name} requested {material_label} for {scholarship_name}.",
                "studentId": request_insert.get("studentId") or "",
                "studentName": student_name,
                "requestNumber": request_number,
                "applicationNumber": request_insert.get("applicationNumber") or request_number,
                "scholarshipName": scholarship_name,
                "grantorId": grantor_id,
                "grantorName": grantor_name,
                "materialLabel": material_label,
                "route": "/admin/requirements",
                "actorType": "student",
                "actorId": request_insert.get("studentId") or "",
                "read": False,
                "archived": False,
                "createdAt": utc_now_iso(),
            })
        if grantor_id and not is_staff_decision:
            grantor_notification = create_grantor_notification({
                "grantorId": grantor_id,
                "type": "material_request",
                "title": "New Material Request",
                "message": f"{student_name} requested {material_label} for {scholarship_name}.",
                "studentId": request_insert.get("studentId") or "",
                "studentName": student_name,
                "requestNumber": request_number,
                "applicationNumber": request_insert.get("applicationNumber") or request_number,
                "scholarshipId": request_insert.get("scholarshipId") or "",
                "scholarshipName": scholarship_name,
                "materialLabel": material_label,
                "route": "/provider-dashboard/applications",
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
    return {
        "ok": all(item.get("ok") for item in results),
        "results": results,
        "adminNotification": notification,
        "grantorNotification": grantor_notification,
        "studentNotification": student_notification,
        "log": log_result,
    }


def create_grantor_scholars(payload: dict[str, Any]) -> dict[str, Any]:
    grantor_id = payload.get("grantorId") or ""
    actor_type = str(payload.get("actorType") or "admin").strip().lower()
    actor_id = str(payload.get("actorId") or "").strip()
    scholars = payload.get("scholars") or []
    if not grantor_id:
        return {"ok": False, "reason": "missing_grantor_id"}
    if actor_type == "grantor" and (not actor_id or actor_id != grantor_id):
        return {
            "ok": False,
            "reason": "cross_grantor_roster_create_blocked",
            "grantorId": grantor_id,
            "actorId": actor_id,
        }
    roster_result = supabase_select("grantor_portal_scholars", limit=0)
    roster_rows = roster_result.get("rows") or [] if roster_result.get("ok") else []
    results = []
    blocked = []
    skipped = []
    for scholar in scholars:
        data = dict(scholar or {})
        student_id = _record_student_id(data)
        if not student_id:
            blocked.append({"student": data, "reason": "missing_student_id"})
            continue

        matches = []
        for row in roster_rows:
            row_data = row.get("data") if isinstance(row.get("data"), dict) else {}
            if _record_student_id(row_data) != student_id or not _is_active_scholarship_record(row_data):
                continue
            matches.append({
                **row_data,
                "recordId": row.get("id"),
                "grantorId": row.get("parent_id") or _record_grantor_id(row_data),
            })

        cross_grantor = next((
            match for match in matches
            if _record_grantor_id(match).lower() != str(grantor_id).strip().lower()
        ), None)
        if cross_grantor:
            blocked.append({
                "student": data,
                "reason": "student_already_in_another_grantor_roster",
                "existingGrantorId": _record_grantor_id(cross_grantor),
            })
            continue

        same_grantor = next((
            match for match in matches
            if _record_grantor_id(match).lower() == str(grantor_id).strip().lower()
        ), None)
        if same_grantor:
            skipped.append({
                "student": data,
                "reason": "student_already_in_selected_grantor_roster",
                "recordId": same_grantor.get("recordId"),
            })
            continue

        data.setdefault("grantorId", grantor_id)
        data.setdefault("createdAt", utc_now_iso())
        data.setdefault("updatedAt", utc_now_iso())
        results.append(supabase_document_insert("grantor_portal_scholars", data, parent_id=grantor_id))
    if blocked:
        create_admin_notification({
            "type": "duplicate_scholarship_prevented",
            "title": "Duplicate Scholarship Prevented",
            "message": f"{len(blocked)} student record(s) were blocked because they already belong to another active grantor roster.",
            "grantorId": grantor_id,
            "blockedStudentIds": [_record_student_id(item.get("student") or {}) for item in blocked],
            "route": "/admin/scholarships",
            "read": False,
            "archived": False,
            "createdAt": utc_now_iso(),
        })
    create_log({
        "action": "grantor_scholar_import_checked",
        "actorId": payload.get("actorId") or grantor_id,
        "actorType": payload.get("actorType") or "grantor",
        "target": grantor_id,
        "details": {"created": len(results), "blocked": len(blocked), "skipped": len(skipped)},
        "createdAt": utc_now_iso(),
    })
    return {
        "ok": all(item.get("ok") for item in results),
        "results": results,
        "blocked": blocked,
        "skipped": skipped,
        "createdCount": len(results),
    }


def update_grantor_scholar(payload: dict[str, Any]) -> dict[str, Any]:
    grantor_id = payload.get("grantorId") or ""
    actor_type = str(payload.get("actorType") or "admin").strip().lower()
    actor_id = str(payload.get("actorId") or "").strip()
    scholar_id = payload.get("scholarId") or payload.get("id") or ""
    data = payload.get("data") or {}
    if not grantor_id or not scholar_id:
        return {"ok": False, "reason": "missing_grantor_or_scholar_id"}
    if actor_type == "grantor" and (not actor_id or actor_id != grantor_id):
        return {"ok": False, "reason": "cross_grantor_roster_update_blocked"}
    data.setdefault("updatedAt", utc_now_iso())
    if payload.get("upsert"):
        return supabase_document_upsert("grantor_portal_scholars", scholar_id, data, merge=True, parent_id=grantor_id)
    return supabase_document_update("grantor_portal_scholars", scholar_id, data, parent_id=grantor_id)


def update_grantor_scholars(payload: dict[str, Any]) -> dict[str, Any]:
    grantor_id = payload.get("grantorId") or ""
    actor_type = str(payload.get("actorType") or "admin").strip().lower()
    actor_id = str(payload.get("actorId") or "").strip()
    scholar_ids = payload.get("scholarIds") or []
    data = payload.get("data") or {}
    if not grantor_id:
        return {"ok": False, "reason": "missing_grantor_id"}
    if actor_type == "grantor" and (not actor_id or actor_id != grantor_id):
        return {"ok": False, "reason": "cross_grantor_roster_update_blocked"}
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
    actor_type = str(payload.get("actorType") or "grantor").strip().lower()
    actor_id = str(payload.get("actorId") or grantor_id).strip()
    announcement = payload.get("announcement") or {}
    if not grantor_id:
        return {"ok": False, "reason": "missing_grantor_id"}
    if actor_type == "grantor" and actor_id != grantor_id:
        return {"ok": False, "reason": "cross_grantor_announcement_create_blocked"}
    if _archived_grantor_account(grantor_id):
        return {
            "ok": False,
            "reason": "grantor_archived",
            "message": "This grantor account is archived and cannot publish announcements.",
            "grantorId": grantor_id,
        }
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
    actor_type = str(payload.get("actorType") or "grantor").strip().lower()
    actor_id = str(payload.get("actorId") or grantor_id).strip()
    announcement_id = payload.get("announcementId") or payload.get("id") or ""
    data = payload.get("data") or {}
    if not grantor_id or not announcement_id:
        return {"ok": False, "reason": "missing_grantor_or_announcement_id"}
    if actor_type == "grantor" and actor_id != grantor_id:
        return {"ok": False, "reason": "cross_grantor_announcement_update_blocked"}
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
    admin_notification = None
    if not suppress_notification and changed_fields:
        grantor_name = data.get("providerName") or data.get("name") or data.get("grantorName") or grantor_id
        notification = create_grantor_notification({
            "grantorId": grantor_id,
            "type": "profile_updated",
            "title": "Profile Updated",
            "message": change_summary,
            "changedFields": changed_fields,
            "changeSummary": change_summary,
            "notificationReason": notification_reason,
            "authorName": grantor_name,
            "authorImageUrl": data.get("profileImageUrl") or "",
            "read": False,
            "createdAt": utc_now_iso(),
        })
        admin_notification = create_admin_notification({
            "type": "grantor_profile_updated",
            "title": "Grantor Profile Updated",
            "message": f"{grantor_name} updated their grantor profile. {change_summary}",
            "grantorId": grantor_id,
            "grantorName": grantor_name,
            "changedFields": changed_fields,
            "changeSummary": change_summary,
            "notificationReason": notification_reason,
            "route": "/admin/grantors",
            "actorType": "grantor",
            "actorId": grantor_id,
            "read": False,
            "archived": False,
            "createdAt": utc_now_iso(),
        })

    return {"ok": True, "provider": provider_result, "portal": portal_result, "notification": notification, "adminNotification": admin_notification}
