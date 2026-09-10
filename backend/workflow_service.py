from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import NAMESPACE_URL, uuid4, uuid5

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
        supabase_rest_upsert_many,
        supabase_rpc,
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
        supabase_rest_upsert_many,
        supabase_rpc,
        supabase_select,
        utc_now_iso,
    )


REJECTION_REAPPLY_COOLDOWN = timedelta(hours=24)

TERMINAL_SCHOLARSHIP_STATUSES = {
    "archived", "cancelled", "declined", "denied", "frozen",
    "rejected", "resolved", "withdrawn",
}

SLOT_RELEASE_STATUSES = {
    "archived", "cancelled", "canceled", "declined", "denied", "rejected", "withdrawn",
}


def _to_positive_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    if str(value).strip() not in {str(parsed), f"{parsed}.0"}:
        return None
    return parsed if 1 <= parsed <= 1000 else None


def _document_url(student: dict[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = student.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, dict) and str(value.get("url") or "").strip():
            return str(value.get("url")).strip()
    return ""


def _eligible_low_slot_students(announcement: dict[str, Any], exclude_student_id: str = "") -> list[str]:
    import os
    choice_enabled = os.getenv("ENABLE_SCHOLARSHIP_CHOICE", "true").strip().lower() != "false"
    students_result = supabase_select("students", limit=0)
    applications_result = supabase_select("scholarship_applications", limit=0)
    if not students_result.get("ok") or not applications_result.get("ok"):
        return []

    active_applicants = {
        _normalize_student_id((row.get("data") or {}).get("studentId"))
        for row in applications_result.get("rows") or []
        if isinstance(row.get("data"), dict) and _is_active_scholarship_record(row.get("data") or {})
        and (not choice_enabled or _record_grantor_id(row.get("data") or {}) == _record_grantor_id(announcement))
    }
    required = announcement.get("requiredDocuments") or {}
    minimum_grade = announcement.get("minimumGrade") or announcement.get("minGwa")
    try:
        minimum_grade_number = float(minimum_grade) if minimum_grade not in (None, "") else None
    except (TypeError, ValueError):
        minimum_grade_number = None

    recipients: list[str] = []
    excluded = _normalize_student_id(exclude_student_id)
    for row in students_result.get("rows") or []:
        student = row.get("data") if isinstance(row.get("data"), dict) else {}
        student_id = str(student.get("studentnumber") or student.get("studentId") or row.get("id") or "").strip()
        normalized_id = _normalize_student_id(student_id)
        status = str(student.get("status") or student.get("accountStatus") or "").strip().lower()
        if not normalized_id or normalized_id == excluded or row.get("id", "").lower().startswith("roster_"):
            continue
        if student.get("archived") is True or status in {"archived", "inactive", "disabled", "frozen"}:
            continue
        if normalized_id in active_applicants:
            continue
        if student.get("scholarshipCommitment") or any(
            _is_active_scholarship_record(item) and (not choice_enabled or item.get("isLocked") is True
                or item.get("requestedSoeAt") or _normalized_status(item) in {"awarded", "accepted", "finalized"})
            for item in student.get("scholarships") or [] if isinstance(item, dict)):
            continue
        if _archived_grantor_block(student, announcement.get("grantorId") or "", announcement.get("providerType") or ""):
            continue
        if minimum_grade_number is not None:
            try:
                if float(student.get("gwa") or student.get("currentGwa") or student.get("generalWeightedAverage")) > minimum_grade_number:
                    continue
            except (TypeError, ValueError):
                continue
        if required.get("cog") is True and not _document_url(student, ("rogFile", "cogFile", "rogDocument", "cogDocument", "rog", "cog")):
            continue
        if required.get("cor") is True and not _document_url(student, ("corFile", "corDocument", "cor")):
            continue
        recipients.append(student_id)
    return list(dict.fromkeys(recipients))


def _bulk_student_notifications(rows: list[dict[str, Any]]) -> dict[str, Any]:
    result = supabase_rest_upsert_many("studentNotifications", rows)
    if result.get("reason") != "missing_or_unloaded_supabase_table":
        return result
    fallback_rows = [
        {
            **row,
            "data": {
                **(row.get("data") or {}),
                "notificationFallbackTable": "student_warnings",
            },
        }
        for row in rows
    ]
    fallback = supabase_rest_upsert_many("student_warnings", fallback_rows)
    return {**fallback, "fallback": True, "table": "student_warnings"}


def _send_announcement_publication_notifications(
    announcement_id: str,
    announcement: dict[str, Any],
    recipients: list[str] | None = None,
) -> dict[str, Any]:
    recipients = recipients if recipients is not None else _eligible_low_slot_students(announcement)
    grantor_name = str(announcement.get("grantorName") or announcement.get("providerLabel") or "Grantor").strip()
    rows = []
    for student_id in recipients:
        notification_id = f"grantor_announcement_{uuid5(NAMESPACE_URL, f'{announcement_id}:{_normalize_student_id(student_id)}').hex}"
        rows.append({
            "id": notification_id,
            "data": {
                "studentId": student_id,
                "source": "personal",
                "type": "announcement",
                "title": f"New announcement from {grantor_name}",
                "message": str(announcement.get("description") or announcement.get("content") or "A grantor posted a new scholarship announcement.").strip()[:180],
                "announcementId": announcement_id,
                "announcementSource": "grantor",
                "route": f"/student-dashboard/announcements/grantor/{announcement_id}",
                "grantorId": announcement.get("grantorId") or "",
                "grantorName": grantor_name,
                "authorName": grantor_name,
                "authorImageUrl": announcement.get("authorImageUrl") or "",
                "read": False,
                "createdAt": utc_now_iso(),
            },
            "updated_at": utc_now_iso(),
        })
    result = _bulk_student_notifications(rows)
    return {
        **result,
        "recipients": len(recipients),
        "delivered": len(result.get("data") or []) if result.get("ok") else 0,
    }


def _send_low_slot_notifications(
    announcement_id: str,
    announcement: dict[str, Any],
    exclude_student_id: str = "",
    recipients: list[str] | None = None,
) -> dict[str, Any]:
    remaining = _to_positive_int(announcement.get("remainingSlots"))
    if remaining is None or remaining >= 10 or announcement.get("lowSlotNotificationSentAt"):
        return {"ok": True, "skipped": True}

    scholarship_name = str(announcement.get("scholarshipTitle") or announcement.get("title") or "Scholarship").strip()
    grantor_name = str(announcement.get("grantorName") or announcement.get("providerLabel") or "Grantor").strip()
    recipient_ids = recipients if recipients is not None else _eligible_low_slot_students(announcement, exclude_student_id)
    rows = []
    for student_id in recipient_ids:
        notification_id = f"low_slots_{announcement_id}_{_normalize_student_id(student_id)}"
        rows.append({
            "id": notification_id,
            "data": {
                "studentId": student_id,
                "source": "personal",
                "type": "scholarship_low_slots",
                "title": "Scholarship Slots Almost Full",
                "message": f"Only {remaining} slots remain for {scholarship_name}. Apply soon if you are interested.",
                "announcementId": announcement_id,
                "announcementSource": "grantor",
                "route": f"/student-dashboard/announcements/grantor/{announcement_id}",
                "grantorId": announcement.get("grantorId") or "",
                "grantorName": grantor_name,
                "scholarshipName": scholarship_name,
                "remainingSlots": remaining,
                "read": False,
                "createdAt": utc_now_iso(),
            },
            "updated_at": utc_now_iso(),
        })

    notification_result = _bulk_student_notifications(rows)
    if not notification_result.get("ok"):
        return {**notification_result, "recipients": len(recipient_ids), "delivered": 0}
    sent_at = utc_now_iso()
    marked = supabase_document_update(
        "grantor_portal_announcements",
        announcement_id,
        {"lowSlotNotificationSentAt": sent_at},
        parent_id=str(announcement.get("grantorId") or ""),
    )
    return {
        "ok": marked.get("ok", False),
        "recipients": len(recipient_ids),
        "delivered": len(notification_result.get("data") or rows),
        "marked": marked,
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
    closure_reason = str(entry.get("closureReason") or "").lower()
    return entry.get("rejected") is True or bool(entry.get("rejectedAt")) or any(
        keyword in f"{status} {closure_reason}" for keyword in ("rejected", "denied", "declined")
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


def _normalize_identity(value: Any) -> str:
    return str(value or "").strip().lower()


def _same_grantor_identity(left: dict[str, Any], right: dict[str, Any]) -> bool:
    left_id = _normalize_identity(left.get("blockedGrantorId") or left.get("grantorId") or left.get("providerId"))
    right_id = _normalize_identity(right.get("blockedGrantorId") or right.get("grantorId") or right.get("providerId"))
    if left_id or right_id:
        return bool(left_id and right_id and left_id == right_id)
    left_type = _normalize_identity(left.get("providerType"))
    right_type = _normalize_identity(right.get("providerType"))
    if left_type and right_type:
        return left_type == right_type
    left_name = _normalize_identity(left.get("blockedGrantorName") or left.get("grantorName") or left.get("providerLabel") or left.get("provider"))
    right_name = _normalize_identity(right.get("blockedGrantorName") or right.get("grantorName") or right.get("providerLabel") or right.get("provider"))
    return bool(left_name and right_name and left_name == right_name)


def _latest_active_rejection_cooldown(student_data: dict[str, Any], target: dict[str, Any]) -> dict[str, Any] | None:
    scholarships: list[Any] = []
    for key in ("scholarships", "scholarshipApplicationHistory"):
        if isinstance(student_data.get(key), list):
            scholarships.extend(student_data.get(key) or [])
    rejected_entries = [
        entry for entry in scholarships
        if isinstance(entry, dict) and _is_rejected_scholarship(entry) and _same_grantor_identity(entry, target)
    ]
    cooldowns = [
        {**_rejection_cooldown(entry), "entry": entry}
        for entry in rejected_entries
    ]
    active = [item for item in cooldowns if item.get("active")]
    if not active:
        return None
    return sorted(active, key=lambda item: item.get("remainingSeconds", 0), reverse=True)[0]


def _entry_matches_archived_grantor(
    entry: dict[str, Any], grantor_id: str = "", provider_type: str = "", grantor_name: str = ""
) -> bool:
    closure_reason = _normalize_identity(entry.get("closureReason"))
    status = _normalize_identity(entry.get("status"))
    if closure_reason in {
        "selected_another_scholarship", "student_withdrawal", "withdrawn",
        "rejected", "denied", "declined",
    } or any(keyword in status for keyword in ("withdrawn", "cancelled", "canceled")):
        return False
    if _is_rejected_scholarship(entry):
        return False
    if not (
        entry.get("archived") is True
        or entry.get("frozen") is True
        or "archived" in status
        or "frozen" in status
    ):
        return False
    return _same_grantor_identity(entry, {
        "grantorId": grantor_id, "providerType": provider_type, "grantorName": grantor_name,
    })


def _find_pending_scholarship_invitation(
    student_data: dict[str, Any], application: dict[str, Any], invitation_id: str = ""
) -> dict[str, Any] | None:
    invitations = student_data.get("scholarshipInvitations")
    if not isinstance(invitations, list):
        return None
    requested_id = _normalize_identity(invitation_id)
    announcement_id = _normalize_identity(application.get("announcementId"))
    scholarship_name = _normalize_identity(
        application.get("scholarshipName") or application.get("scholarshipTitle")
        or application.get("announcementTitle") or application.get("providerLabel")
    )
    for invitation in invitations:
        if not isinstance(invitation, dict):
            continue
        if _normalize_identity(invitation.get("status") or "pending") not in {"pending", "invited"}:
            continue
        if requested_id and _normalize_identity(invitation.get("id")) != requested_id:
            continue
        if not _same_grantor_identity(invitation, application):
            continue
        invitation_announcement_id = _normalize_identity(invitation.get("announcementId"))
        if invitation_announcement_id:
            if announcement_id and invitation_announcement_id == announcement_id:
                return invitation
            continue
        invitation_name = _normalize_identity(
            invitation.get("scholarshipName") or invitation.get("announcementTitle") or invitation.get("providerLabel")
        )
        if invitation_name and scholarship_name and invitation_name == scholarship_name:
            return invitation
    return None


def _archived_grantor_block(
    student_data: dict[str, Any], grantor_id: str = "", provider_type: str = "", grantor_name: str = ""
) -> dict[str, Any] | None:
    entries: list[Any] = []
    if isinstance(student_data.get("scholarships"), list):
        entries.extend(student_data.get("scholarships") or [])
    if isinstance(student_data.get("previousScholars"), list):
        entries.extend(student_data.get("previousScholars") or [])
    for entry in entries:
        if isinstance(entry, dict) and _entry_matches_archived_grantor(entry, grantor_id, provider_type, grantor_name):
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
    try:
        from .scholarship_choice_service import reserve_scholarship_application, scholarship_choice_enabled
    except ImportError:
        from scholarship_choice_service import reserve_scholarship_application, scholarship_choice_enabled
    if scholarship_choice_enabled() and payload.get("actorType") == "student":
        result = reserve_scholarship_application(payload)
        if result.get("ok") and not result.get("idempotent"):
            application = payload.get("application") or {}
            announcement_id = str(application.get("announcementId") or "")
            grantor_id = str(application.get("grantorId") or application.get("providerId") or "")
            announcement = supabase_document_get("grantor_portal_announcements", announcement_id, parent_id=grantor_id)
            if announcement.get("ok"):
                result["lowSlotNotifications"] = _send_low_slot_notifications(announcement_id,
                    {**(announcement.get("data") or {}), "grantorId": grantor_id}, str(payload.get("studentId") or ""))
        return result
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
        matching_invitation = _find_pending_scholarship_invitation(
            current_student_data, application, str(payload.get("invitationId") or "")
        )
        active_cooldown = _latest_active_rejection_cooldown(current_student_data, application)
        if active_cooldown:
            return {
                "ok": False,
                "reason": "reapply_cooldown_active",
                "message": "Student cannot apply yet. The previous rejection is still under the 24-hour cooldown.",
                "readyAt": active_cooldown.get("readyAt"),
                "remainingSeconds": active_cooldown.get("remainingSeconds"),
            }
        if not matching_invitation:
            archived_block = _archived_grantor_block(
                current_student_data,
                application.get("grantorId") or application.get("providerId") or "",
                application.get("providerType") or "",
                application.get("grantorName") or application.get("providerLabel") or "",
            )
            if archived_block:
                return {
                    "ok": False,
                    "reason": "archived_grantor_block",
                    "message": "Student was archived by this grantor and cannot apply again unless invited back.",
                    "entry": archived_block,
                }
        authoritative_invitations = current_student_data.get("scholarshipInvitations")
        if isinstance(authoritative_invitations, list):
            student_update["scholarshipInvitations"] = [
                {
                    **invitation,
                    **({"status": "Accepted", "acceptedAt": utc_now_iso(), "updatedAt": utc_now_iso()}
                       if matching_invitation and invitation.get("id") == matching_invitation.get("id") else {}),
                }
                if isinstance(invitation, dict) else invitation
                for invitation in authoritative_invitations
            ]

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

    announcement_id = str(application.get("announcementId") or "").strip()
    slot_managed = bool(announcement_id and grantor_id)
    if slot_managed:
        application_id = str(application.get("id") or uuid4())
        application = {**application, "id": application_id}
        slot_result = supabase_rpc("apply_scholarship_with_slot", {
            "p_announcement_id": announcement_id,
            "p_grantor_id": grantor_id,
            "p_student_id": student_id,
            "p_application_id": application_id,
            "p_application_data": application,
            "p_student_update": student_update,
        })
        if not slot_result.get("ok"):
            return {
                "ok": False,
                "reason": slot_result.get("reason") or "slot_reservation_failed",
                "message": {
                    "slots_not_configured": "This scholarship is not accepting applications until the grantor configures its slots.",
                    "scholarship_full": "This scholarship has no remaining slots.",
                    "announcement_not_open_for_applications": "This scholarship is no longer open for applications.",
                    "student_already_has_active_scholarship": "This student already has an active scholarship application.",
                }.get(slot_result.get("reason"), "Unable to reserve a scholarship slot."),
                "result": slot_result,
            }
        results["slotReservation"] = slot_result
        results["application"] = {"ok": True, "id": application_id, "data": slot_result.get("data")}
        slot_data = slot_result.get("data") if isinstance(slot_result.get("data"), dict) else {}
        if slot_data.get("idempotent"):
            return {
                "ok": True,
                "idempotent": True,
                "message": "The student is already attached to this scholarship.",
                "remainingSlots": slot_data.get("remainingSlots"),
                "results": results,
            }

    if student_update and not slot_managed:
        results["student"] = supabase_document_upsert("students", student_id, student_update, merge=True)
        if not results["student"].get("ok"):
            return {"ok": False, "step": "student_update", "result": results["student"]}

    if application and not slot_managed:
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

    remaining_slots = None
    if slot_managed:
        slot_data = (results.get("slotReservation") or {}).get("data") or {}
        remaining_slots = slot_data.get("remainingSlots")
        announcement_result = supabase_document_get("grantor_portal_announcements", announcement_id, parent_id=grantor_id)
        if announcement_result.get("ok"):
            announcement_data = announcement_result.get("data") or {}
            low_slot_result = _send_low_slot_notifications(announcement_id, announcement_data, exclude_student_id=student_id)
            results["lowSlotNotification"] = low_slot_result
            if not low_slot_result.get("ok"):
                create_log({
                    "action": "low_slot_notification_failed",
                    "actorId": student_id,
                    "actorType": "student",
                    "target": announcement_id,
                    "details": {"remainingSlots": remaining_slots, "result": low_slot_result},
                    "createdAt": utc_now_iso(),
                })

    return {"ok": True, "remainingSlots": remaining_slots, "results": results}


def update_admin_review(payload: dict[str, Any]) -> dict[str, Any]:
    updates = payload.get("updates") or []
    notifications = payload.get("notifications") or []
    actor_type = str(payload.get("actorType") or "admin").strip().lower()
    actor_id = str(payload.get("actorId") or "").strip()
    results = []

    # Preflight every application before any side effects in the legacy batch.
    for update in updates:
        if update.get("table") not in {"scholarship_applications", "scholarshipApplications"}:
            continue
        current = supabase_document_get("scholarship_applications", str(update.get("id") or ""))
        if not current.get("ok"):
            return {"ok": False, "reason": "application_not_found"}
        current_data = current.get("data") or {}
        if current_data.get("closureReason") in {"selected_another_scholarship", "student_withdrawal"}:
            return {"ok": False, "reason": "application_closed", "message": "This application is archived and read-only."}
        if current_data.get("lifecycleVersion") == 2:
            for key in ("studentId", "grantorId", "announcementId", "applicationNumber"):
                if key in (update.get("data") or {}) and update["data"][key] != current_data.get(key):
                    return {"ok": False, "reason": "application_identity_immutable"}
            # Reviews cannot rewrite reservations, uploaded files, or commitment metadata.
            protected_keys = {
                "id", "studentId", "grantorId", "announcementId", "applicationNumber", "scholarshipId",
                "lifecycleVersion", "slotReserved", "slotReservedAt", "slotReleasedAt",
                "closureReason", "closedAt", "readOnly", "cooldownUntil", "committedAt", "isLocked",
                "applicationFormFile", "otherRequirementUploads", "reviewedDocumentVersions",
                "reviewedApplicationFormVersion", "reviewedOtherRequirementVersions", "documentUrls",
            }
            update["data"] = {key: value for key, value in (update.get("data") or {}).items()
                              if key not in protected_keys}

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
        normalized_status = str(data.get("status") or data.get("applicationStatus") or "").strip().lower()
        releases_slot = table in {"scholarship_applications", "scholarshipApplications"} and (
            normalized_status in SLOT_RELEASE_STATUSES
            or data.get("rejected") is True
            or (data.get("archived") is True and normalized_status != "approved")
        )
        if releases_slot:
            current_application = supabase_document_get("scholarship_applications", record_id)
            current_data = current_application.get("data") or {}
            if current_application.get("ok") and current_data.get("slotReserved") is True:
                results.append(supabase_rpc("release_scholarship_slot_for_application", {
                    "p_application_id": record_id,
                    "p_application_patch": data,
                }))
            else:
                results.append(supabase_document_update(table, record_id, data))
        else:
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
    if actor_type == "student":
        current_student = supabase_document_get("students", actor_id)
        if (current_student.get("data") or {}).get("scholarshipLifecycleVersion") == 2:
            student = current_student.get("data") or {}
            commitment = student.get("scholarshipCommitment") or {}
            for change in [*inserts, *updates]:
                table = change.get("table")
                if table not in {"students", "soe_requests", "soe_downloads"}:
                    return {"ok": False, "reason": "application_workflow_required"}
                if table == "students":
                    if change.get("id") != actor_id:
                        return {"ok": False, "reason": "portal_record_owner_mismatch"}
                    continue
                if not commitment.get("applicationId"):
                    return {"ok": False, "reason": "scholarship_choice_required"}
                if table == "soe_requests":
                    current = supabase_document_get(table, str(change.get("id") or ""))
                    request_data = current.get("data") or {}
                    if not current.get("ok") or request_data.get("studentId") != actor_id:
                        return {"ok": False, "reason": "scholarship_choice_required"}
                    if request_data.get("applicationNumber") != commitment.get("applicationNumber"):
                        return {"ok": False, "reason": "application_closed"}
                    material_updates = change.get("data") or {}
                    materials = request_data.get("materials") or {}
                    if any(key in material_updates for key in {"materials.soe.downloadedAt", "downloadStatus", "downloadedAt"}):
                        if str((materials.get("soe") or {}).get("status") or request_data.get("status") or "").lower() != "approved":
                            return {"ok": False, "reason": "material_approval_required"}
                    if "materials.application_form.downloadedAt" in material_updates:
                        if str((materials.get("application_form") or {}).get("status") or "").lower() != "approved":
                            return {"ok": False, "reason": "material_approval_required"}
                    allowed = {
                        "materials.soe.downloadedAt", "materials.application_form.downloadedAt",
                        "downloadStatus", "downloadedAt", "updatedAt",
                    }
                    change["data"] = {key: value for key, value in material_updates.items() if key in allowed}
                else:
                    data = change.get("data") or {}
                    if data.get("applicationNumber") != commitment.get("applicationNumber"):
                        return {"ok": False, "reason": "application_closed"}
                    data.update({"studentId": actor_id, "grantorId": commitment.get("grantorId"),
                                 "applicationId": commitment.get("applicationId"), "status": "Pending", "reviewState": "incoming"})
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


def deliver_grantor_announcement_notifications(
    announcement_id: str,
    data: dict[str, Any],
    grantor_id: str,
    duplicate: bool = False,
) -> dict[str, Any]:
    notification = {"ok": True, "skipped": True, "idempotent": True} if duplicate else create_grantor_notification({
        "grantorId": grantor_id,
        "type": "announcement_published",
        "title": "Announcement Published",
        "message": f'You published "{data.get("title") or "an announcement"}".',
        "announcementId": announcement_id,
        "read": False,
        "createdAt": utc_now_iso(),
    })
    admin_notification = {"ok": True, "skipped": True, "idempotent": True} if duplicate else create_admin_notification({
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
    log_result = {"ok": True, "skipped": True, "idempotent": True} if duplicate else create_log({
        "action": "grantor_announcement_created",
        "actorId": grantor_id,
        "actorType": "grantor",
        "target": announcement_id,
        "details": {"title": data.get("title") or "Announcement"},
        "createdAt": utc_now_iso(),
    })
    notification_announcement = {**data, "grantorId": grantor_id}
    eligible_recipients = _eligible_low_slot_students(notification_announcement)
    student_notification = _send_announcement_publication_notifications(
        announcement_id,
        notification_announcement,
        eligible_recipients,
    )
    low_slot_notification = _send_low_slot_notifications(
        announcement_id,
        notification_announcement,
        recipients=eligible_recipients,
    )
    delivery_failed = any(
        item.get("ok") is False
        for item in (notification, admin_notification, student_notification, log_result, low_slot_notification)
        if isinstance(item, dict)
    )
    supabase_document_update(
        "grantor_portal_announcements",
        announcement_id,
        {
            "notificationDeliveryStatus": "failed" if delivery_failed else "complete",
            "notificationDeliveryUpdatedAt": utc_now_iso(),
        },
        parent_id=grantor_id,
    )
    if delivery_failed:
        create_grantor_notification({
            "grantorId": grantor_id,
            "type": "announcement_notification_warning",
            "title": "Announcement Published With Delivery Issues",
            "message": "Your announcement is published, but some inbox notifications could not be delivered.",
            "announcementId": announcement_id,
            "read": False,
            "createdAt": utc_now_iso(),
        })
    return {
        "notification": notification,
        "adminNotification": admin_notification,
        "studentNotification": student_notification,
        "log": log_result,
        "lowSlotNotification": low_slot_notification,
    }


def create_grantor_announcement(payload: dict[str, Any], defer_notifications: bool = False) -> dict[str, Any]:
    grantor_id = payload.get("grantorId") or ""
    actor_type = str(payload.get("actorType") or "grantor").strip().lower()
    actor_id = str(payload.get("actorId") or grantor_id).strip()
    client_request_id = str(payload.get("clientRequestId") or "").strip()
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
    if data.get("applicationEnabled") is True:
        total_slots = _to_positive_int(data.get("totalSlots"))
        if total_slots is None:
            return {
                "ok": False,
                "reason": "invalid_slot_capacity",
                "message": "Slots must be a whole number from 1 to 1000.",
            }
        data["slotsConfigured"] = True
        data["totalSlots"] = total_slots
        data["remainingSlots"] = total_slots
        data["lowSlotNotificationSentAt"] = None
    else:
        data["slotsConfigured"] = False
        data["totalSlots"] = None
        data["remainingSlots"] = None
    data.setdefault("grantorId", grantor_id)
    data.setdefault("archived", False)
    data.setdefault("grantorAccountArchived", False)
    data.setdefault("hiddenFromStudents", False)
    data.setdefault("createdAt", utc_now_iso())
    data.setdefault("updatedAt", utc_now_iso())
    if client_request_id:
        announcement_id = f"grantor_announcement_{uuid5(NAMESPACE_URL, f'{grantor_id}:{client_request_id}').hex}"
        data["clientRequestId"] = client_request_id
        data["id"] = announcement_id
        existing = supabase_document_get("grantor_portal_announcements", announcement_id, parent_id=grantor_id)
        existing_data = existing.get("data") if existing.get("row") else None
    else:
        announcement_id = ""
        existing_data = None

    duplicate = isinstance(existing_data, dict) and bool(existing_data)
    if duplicate:
        data = existing_data
        result = {"ok": True, "data": [existing.get("row")], "idempotent": True}
    else:
        result = supabase_document_insert("grantor_portal_announcements", data, parent_id=grantor_id)
    if result.get("ok") and result.get("data"):
        inserted = result["data"][0] if isinstance(result["data"], list) and result["data"] else {}
        announcement_id = inserted.get("id") or announcement_id
        delivery = {
            "notification": {"ok": True, "queued": True},
            "adminNotification": {"ok": True, "queued": True},
            "studentNotification": {"ok": True, "queued": True},
            "log": {"ok": True, "queued": True},
            "lowSlotNotification": {"ok": True, "queued": True},
        } if defer_notifications else deliver_grantor_announcement_notifications(
            announcement_id,
            data,
            grantor_id,
            duplicate,
        )
        return {
            "ok": True,
            "id": announcement_id,
            "duplicate": duplicate,
            "result": result,
            **delivery,
            **({"_announcementData": data} if defer_notifications else {}),
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
    if _archived_grantor_account(grantor_id):
        return {
            "ok": False,
            "reason": "grantor_archived",
            "message": "This grantor account is archived and cannot modify announcements.",
            "grantorId": grantor_id,
        }
    current_result = supabase_document_get("grantor_portal_announcements", announcement_id, parent_id=grantor_id)
    current_announcement = current_result.get("data") or {}
    current_status = str(current_announcement.get("status") or "").strip().lower()
    if current_announcement.get("archived") is True or current_status == "archived":
        return {
            "ok": False,
            "reason": "announcement_permanently_archived",
            "message": "Archived announcements cannot be restored or modified. Create a new announcement instead.",
        }
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


def configure_grantor_announcement_slots(payload: dict[str, Any]) -> dict[str, Any]:
    grantor_id = str(payload.get("grantorId") or "").strip()
    actor_type = str(payload.get("actorType") or "grantor").strip().lower()
    actor_id = str(payload.get("actorId") or grantor_id).strip()
    announcement_id = str(payload.get("announcementId") or "").strip()
    total_slots = _to_positive_int(payload.get("totalSlots"))
    if not grantor_id or not announcement_id:
        return {"ok": False, "reason": "missing_grantor_or_announcement_id"}
    if actor_type == "grantor" and actor_id != grantor_id:
        return {"ok": False, "reason": "cross_grantor_announcement_update_blocked"}
    if _archived_grantor_account(grantor_id):
        return {
            "ok": False,
            "reason": "grantor_archived",
            "message": "This grantor account is archived and cannot modify scholarship slots.",
            "grantorId": grantor_id,
        }
    if total_slots is None:
        return {"ok": False, "reason": "invalid_slot_capacity", "message": "Slots must be a whole number from 1 to 1000."}

    announcement_result = supabase_document_get("grantor_portal_announcements", announcement_id, parent_id=grantor_id)
    announcement = announcement_result.get("data") or {}
    if announcement.get("archived") is True or str(announcement.get("status") or "").strip().lower() == "archived":
        return {
            "ok": False,
            "reason": "announcement_permanently_archived",
            "message": "Archived announcements cannot be modified. Create a new announcement instead.",
        }

    result = supabase_rpc("configure_scholarship_slots", {
        "p_announcement_id": announcement_id,
        "p_grantor_id": grantor_id,
        "p_total_slots": total_slots,
    })
    if not result.get("ok"):
        message = "Unable to update scholarship slots."
        if result.get("reason") == "capacity_below_occupied":
            message = "Total slots cannot be lower than the number of current applications."
        return {"ok": False, "reason": result.get("reason"), "message": message, "result": result}

    announcement_result = supabase_document_get("grantor_portal_announcements", announcement_id, parent_id=grantor_id)
    low_slot_notification = {"ok": True, "skipped": True}
    if announcement_result.get("ok"):
        low_slot_notification = _send_low_slot_notifications(announcement_id, announcement_result.get("data") or {})
    return {
        "ok": True,
        "capacity": result.get("data"),
        "lowSlotNotification": low_slot_notification,
    }


def republish_grantor_announcement(payload: dict[str, Any], defer_notifications: bool = False) -> dict[str, Any]:
    grantor_id = str(payload.get("grantorId") or "").strip()
    actor_type = str(payload.get("actorType") or "grantor").strip().lower()
    actor_id = str(payload.get("actorId") or grantor_id).strip()
    announcement_id = str(payload.get("announcementId") or "").strip()
    client_request_id = str(payload.get("clientRequestId") or "").strip()
    announcement_patch = payload.get("announcement") if isinstance(payload.get("announcement"), dict) else {}
    try:
        expected_total = int(payload.get("expectedTotalSlots"))
        expected_remaining = int(payload.get("expectedRemainingSlots"))
        additional_slots = int(payload.get("additionalSlots") or 0)
    except (TypeError, ValueError):
        return {"ok": False, "reason": "invalid_slot_capacity", "message": "The scholarship slot values are invalid."}

    if not grantor_id or not announcement_id or not client_request_id:
        return {"ok": False, "reason": "missing_republish_identity", "message": "The scholarship republish request is incomplete."}
    if actor_type == "grantor" and actor_id != grantor_id:
        return {"ok": False, "reason": "cross_grantor_announcement_update_blocked"}
    if expected_total < 1 or expected_remaining < 0 or additional_slots < 0 or expected_total + additional_slots > 1000:
        return {"ok": False, "reason": "invalid_slot_capacity", "message": "Total slots must remain between 1 and 1000."}
    if _archived_grantor_account(grantor_id):
        return {
            "ok": False,
            "reason": "grantor_archived",
            "message": "This grantor account is archived and cannot republish scholarships.",
        }

    result = supabase_rpc("republish_grantor_scholarship", {
        "p_announcement_id": announcement_id,
        "p_grantor_id": grantor_id,
        "p_expected_total_slots": expected_total,
        "p_expected_remaining_slots": expected_remaining,
        "p_additional_slots": additional_slots,
        "p_announcement_patch": announcement_patch,
        "p_client_request_id": client_request_id,
    })
    if not result.get("ok"):
        reason = result.get("reason") or "scholarship_republish_failed"
        message = {
            "stale_slot_capacity": "Scholarship availability changed. Review the latest slot count and confirm again.",
            "scholarship_not_active": "Only an active scholarship announcement can be republished.",
            "grantor_archived": "This grantor account is archived and cannot republish scholarships.",
            "grantor_not_found": "The grantor account could not be found.",
            "invalid_slot_capacity": "Total slots must remain between 1 and 1000.",
        }.get(reason, "Unable to republish this scholarship.")
        return {"ok": False, "reason": reason, "message": message, "result": result}

    capacity = result.get("data") if isinstance(result.get("data"), dict) else {}
    announcement_data = capacity.get("announcement") if isinstance(capacity.get("announcement"), dict) else {}
    duplicate = capacity.get("idempotent") is True
    delivery = {
        "notification": {"ok": True, "queued": True},
        "adminNotification": {"ok": True, "queued": True},
        "studentNotification": {"ok": True, "queued": True},
        "log": {"ok": True, "queued": True},
        "lowSlotNotification": {"ok": True, "queued": True},
    } if defer_notifications else deliver_grantor_announcement_notifications(
        announcement_id,
        announcement_data,
        grantor_id,
        duplicate,
    )
    return {
        "ok": True,
        "id": announcement_id,
        "duplicate": duplicate,
        "capacity": capacity,
        **delivery,
        **({"_announcementData": announcement_data} if defer_notifications else {}),
    }


def update_grantor_archive_state(payload: dict[str, Any]) -> dict[str, Any]:
    grantor_ids = [str(item or "").strip() for item in payload.get("grantorIds") or []]
    grantor_ids = list(dict.fromkeys(item for item in grantor_ids if item))
    archived = payload.get("archived") is True
    restore_data = payload.get("restoreData") if isinstance(payload.get("restoreData"), dict) else {}
    actor_id = str(payload.get("actorId") or "admin").strip() or "admin"
    if not grantor_ids:
        return {"ok": False, "reason": "missing_grantor_ids", "message": "Select at least one grantor."}

    now = utc_now_iso()
    results = []
    failures = []
    announcement_count = 0
    invitation_count = 0
    notification_count = 0

    for grantor_id in grantor_ids:
        if archived:
            account_data = {
                "archived": True,
                "archivedAt": now,
                "status": "Archived",
                "updatedAt": now,
            }
            portal_data = account_data
        else:
            account_data = {
                **restore_data,
                "archived": False,
                "archivedAt": None,
                "status": "Active",
                "updatedAt": now,
            }
            portal_data = {
                "archived": False,
                "archivedAt": None,
                "status": "Active",
                "updatedAt": now,
            }

        provider_result = supabase_document_upsert("providers", grantor_id, account_data, merge=True)
        portal_result = supabase_document_upsert("grantor_portals", grantor_id, portal_data, merge=True)
        grantor_failures = []
        if not provider_result.get("ok"):
            grantor_failures.append({"step": "provider", "detail": provider_result})
        if not portal_result.get("ok"):
            grantor_failures.append({"step": "portal", "detail": portal_result})

        archived_announcements = 0
        cancelled_invitations = 0
        sent_notifications = 0
        if archived:
            announcement_rows = supabase_select(
                "grantor_portal_announcements",
                {"parent_id": grantor_id},
                limit=0,
            )
            if not announcement_rows.get("ok"):
                grantor_failures.append({"step": "announcement_lookup", "detail": announcement_rows})
            else:
                for row in announcement_rows.get("rows") or []:
                    announcement_id = str(row.get("id") or "").strip()
                    if not announcement_id:
                        continue
                    existing_announcement = row.get("data") if isinstance(row.get("data"), dict) else {}
                    already_archived = (
                        existing_announcement.get("archived") is True
                        or str(existing_announcement.get("status") or "").strip().lower() == "archived"
                    )
                    archive_data = {
                        "archived": True,
                        "status": "Archived",
                        "grantorAccountArchived": True,
                        "hiddenFromStudents": True,
                        "updatedAt": now,
                    }
                    if not already_archived:
                        archive_data.update({
                            "archivedAt": now,
                            "archivedBy": actor_id,
                            "archiveSource": "grantor_account",
                            "archivedByAccountAction": True,
                        })
                    archive_result = supabase_document_update(
                        "grantor_portal_announcements",
                        announcement_id,
                        archive_data,
                        parent_id=grantor_id,
                    )
                    if archive_result.get("ok"):
                        archived_announcements += 1
                        announcement_count += 1
                    else:
                        grantor_failures.append({
                            "step": "announcement_archive",
                            "announcementId": announcement_id,
                            "detail": archive_result,
                        })

            students_result = supabase_select("students", limit=0)
            if not students_result.get("ok"):
                grantor_failures.append({"step": "invitation_lookup", "detail": students_result})
            else:
                for student_row in students_result.get("rows") or []:
                    student_id = str(student_row.get("id") or "").strip()
                    student_data = student_row.get("data") if isinstance(student_row.get("data"), dict) else {}
                    invitations = student_data.get("scholarshipInvitations")
                    if not student_id or not isinstance(invitations, list):
                        continue
                    cancelled_ids = []
                    next_invitations = []
                    for invitation in invitations:
                        if not isinstance(invitation, dict):
                            next_invitations.append(invitation)
                            continue
                        same_grantor = _same_grantor_identity(invitation, {"grantorId": grantor_id})
                        pending = _normalize_identity(invitation.get("status") or "pending") in {"pending", "invited"}
                        if same_grantor and pending:
                            invitation_id = str(invitation.get("id") or "").strip()
                            cancelled_ids.append(invitation_id or str(uuid4()))
                            next_invitations.append({
                                **invitation,
                                "status": "Cancelled",
                                "cancelledAt": now,
                                "cancellationReason": "grantor_account_archived",
                                "cancelledBy": actor_id,
                                "updatedAt": now,
                            })
                        else:
                            next_invitations.append(invitation)
                    if not cancelled_ids:
                        continue
                    student_update = supabase_document_upsert("students", student_id, {
                        "scholarshipInvitations": next_invitations,
                        "updatedAt": now,
                    }, merge=True)
                    if not student_update.get("ok"):
                        grantor_failures.append({
                            "step": "invitation_cancel",
                            "studentId": student_id,
                            "detail": student_update,
                        })
                        continue
                    cancelled_invitations += len(cancelled_ids)
                    invitation_count += len(cancelled_ids)
                    notification_id = str(uuid5(
                        NAMESPACE_URL,
                        f"bulsuscholar:grantor-archive:{grantor_id}:{student_id}:{','.join(sorted(cancelled_ids))}",
                    ))
                    notification_result = supabase_document_upsert("studentNotifications", notification_id, {
                        "studentId": student_id,
                        "source": "personal",
                        "type": "scholarship_invitation_cancelled",
                        "title": "Scholarship Invitation Cancelled",
                        "message": "A scholarship invitation was cancelled because the grantor account was archived. Restoring the account will not restore this invitation.",
                        "grantorId": grantor_id,
                        "reason": "grantor_account_archived",
                        "route": "/student-dashboard/scholarships",
                        "read": False,
                        "createdAt": now,
                        "updatedAt": now,
                    }, merge=True)
                    if notification_result.get("ok"):
                        sent_notifications += 1
                        notification_count += 1
                    else:
                        grantor_failures.append({
                            "step": "invitation_cancel_notification",
                            "studentId": student_id,
                            "detail": notification_result,
                        })

            scholar_rows = supabase_select("grantor_portal_scholars", {"parent_id": grantor_id}, limit=0)
            if not scholar_rows.get("ok"):
                grantor_failures.append({"step": "invitation_roster_lookup", "detail": scholar_rows})
            else:
                for scholar_row in scholar_rows.get("rows") or []:
                    scholar_data = scholar_row.get("data") if isinstance(scholar_row.get("data"), dict) else {}
                    if scholar_data.get("unarchiveInvitationPending") is not True:
                        continue
                    scholar_result = supabase_document_update(
                        "grantor_portal_scholars",
                        str(scholar_row.get("id") or ""),
                        {
                            "archived": True,
                            "status": "Archived",
                            "unarchiveInvitationPending": False,
                            "invitationStatus": "Cancelled",
                            "invitationCancelledAt": now,
                            "invitationCancellationReason": "grantor_account_archived",
                            "updatedAt": now,
                        },
                        parent_id=grantor_id,
                    )
                    if not scholar_result.get("ok"):
                        grantor_failures.append({
                            "step": "invitation_roster_cancel",
                            "scholarId": scholar_row.get("id"),
                            "detail": scholar_result,
                        })

        result = {
            "grantorId": grantor_id,
            "archived": archived,
            "announcementCount": archived_announcements,
            "invitationCount": cancelled_invitations,
            "notificationCount": sent_notifications,
            "ok": len(grantor_failures) == 0,
            "failures": grantor_failures,
        }
        results.append(result)
        if grantor_failures:
            failures.extend({"grantorId": grantor_id, **failure} for failure in grantor_failures)

    create_log({
        "action": "grantors_archived" if archived else "grantors_unarchived",
        "actorId": actor_id,
        "actorType": "admin",
        "target": ",".join(grantor_ids),
        "details": {
            "grantorCount": len(grantor_ids),
            "announcementCount": announcement_count,
            "invitationCount": invitation_count,
            "notificationCount": notification_count,
            "failureCount": len(failures),
        },
        "createdAt": now,
    })
    return {
        "ok": True,
        "partial": len(failures) > 0,
        "grantorCount": len(grantor_ids),
        "announcementCount": announcement_count,
        "invitationCount": invitation_count,
        "notificationCount": notification_count,
        "results": results,
        "failures": failures,
    }


def invite_archived_grantor_scholars(payload: dict[str, Any]) -> dict[str, Any]:
    grantor_id = str(payload.get("grantorId") or "").strip()
    announcement_id = str(payload.get("announcementId") or "").strip()
    scholar_ids = list(dict.fromkeys(str(item or "").strip() for item in payload.get("scholarIds") or [] if str(item or "").strip()))
    if not grantor_id or not announcement_id or not scholar_ids:
        return {"ok": False, "reason": "missing_invitation_identity", "message": "Select archived scholars and a scholarship announcement."}
    if _archived_grantor_account(grantor_id):
        return {"ok": False, "reason": "grantor_archived", "message": "Archived grantors cannot send scholarship invitations."}

    announcement_result = supabase_document_get("grantor_portal_announcements", announcement_id, parent_id=grantor_id)
    if not announcement_result.get("ok") or not announcement_result.get("row"):
        return {"ok": False, "reason": "announcement_not_found", "message": "The selected scholarship announcement no longer exists."}
    announcement = announcement_result.get("data") or {}
    now = datetime.now(timezone.utc)
    starts_at = _parse_datetime(announcement.get("startDate"))
    ends_at = _parse_datetime(announcement.get("endDate"))
    status = _normalize_identity(announcement.get("status"))
    if (announcement.get("applicationEnabled") is not True or announcement.get("archived") is True
            or announcement.get("hiddenFromStudents") is True or status in {"archived", "closed", "ended", "draft"}
            or (starts_at and starts_at > now) or (ends_at and ends_at < now)):
        return {"ok": False, "reason": "announcement_not_open_for_applications", "message": "The selected scholarship announcement is no longer open."}
    if announcement.get("slotsConfigured") is not True:
        return {"ok": False, "reason": "slots_not_configured", "message": "Configure scholarship slots before sending invitations."}
    try:
        remaining_slots = max(0, int(announcement.get("remainingSlots") or 0))
        total_slots = max(0, int(announcement.get("totalSlots") or 0))
    except (TypeError, ValueError):
        return {"ok": False, "reason": "slots_not_configured", "message": "The scholarship slot configuration is invalid."}
    if remaining_slots < 1:
        return {"ok": False, "reason": "scholarship_full", "message": "This scholarship has no remaining slots."}

    scholarship_name = str(announcement.get("scholarshipTitle") or announcement.get("scholarshipName") or announcement.get("title") or "Scholarship").strip()
    grantor_result = supabase_document_get("grantor_portals", grantor_id)
    grantor_data = grantor_result.get("data") or {}
    grantor_name = str(grantor_data.get("name") or grantor_data.get("grantorName") or grantor_data.get("organizationName") or announcement.get("grantorName") or "Grantor").strip()
    minimum_grade = announcement.get("minimumGrade") or announcement.get("minimumGwa") or announcement.get("minGwa")
    try:
        minimum_grade_value = float(minimum_grade) if minimum_grade not in (None, "") else None
    except (TypeError, ValueError):
        minimum_grade_value = None

    results = []
    failures = []
    for scholar_id in scholar_ids:
        scholar_result = supabase_document_get("grantor_portal_scholars", scholar_id, parent_id=grantor_id)
        scholar = scholar_result.get("data") or {}
        if not scholar_result.get("ok") or not scholar_result.get("row") or scholar.get("archived") is not True:
            failure = {"scholarId": scholar_id, "reason": "archived_scholar_not_found", "message": "The selected archived scholar record is unavailable."}
            results.append({"ok": False, **failure})
            failures.append(failure)
            continue
        student_id = str(scholar.get("studentId") or scholar.get("studentNumber") or scholar.get("studentnumber") or "").strip()
        student_result = supabase_document_get("students", student_id) if student_id else {"ok": False}
        student = student_result.get("data") or {}
        if not student_result.get("ok") or not student_result.get("row"):
            failure = {"scholarId": scholar_id, "studentId": student_id, "reason": "student_not_found", "message": "The student account could not be found."}
            results.append({"ok": False, **failure})
            failures.append(failure)
            continue
        if student.get("archived") is True or student.get("disabled") is True or student.get("adminBlocked") is True:
            failure = {"scholarId": scholar_id, "studentId": student_id, "reason": "student_account_blocked", "message": "The student account is inactive or blocked."}
            results.append({"ok": False, **failure})
            failures.append(failure)
            continue
        committed = bool(student.get("scholarshipCommitment", {}).get("applicationId")) or any(
            isinstance(entry, dict) and _is_active_scholarship_record(entry) and (
                entry.get("isLocked") is True or entry.get("committedAt") or entry.get("requestedSoeAt")
                or _normalized_status(entry) in {"awarded", "accepted", "finalized", "active"}
            ) for entry in student.get("scholarships") or []
        )
        if committed:
            failure = {"scholarId": scholar_id, "studentId": student_id, "reason": "student_already_has_active_scholarship", "message": "The student already has an active scholarship."}
            results.append({"ok": False, **failure})
            failures.append(failure)
            continue
        try:
            student_grade = float(student.get("gwa") or student.get("currentGwa"))
        except (TypeError, ValueError):
            student_grade = None
        if minimum_grade_value is not None and (student_grade is None or student_grade < 1 or student_grade > minimum_grade_value):
            failure = {"scholarId": scholar_id, "studentId": student_id, "reason": "scholarship_ineligible", "message": "The student does not meet the scholarship GWA requirement."}
            results.append({"ok": False, **failure})
            failures.append(failure)
            continue

        invitation_id = f"invite_{grantor_id}_{announcement_id}_{scholar_id}"
        current_invitations = student.get("scholarshipInvitations") if isinstance(student.get("scholarshipInvitations"), list) else []
        invitation = {
            "id": invitation_id,
            "type": "grantor_unarchive_invitation",
            "status": "Pending",
            "grantorId": grantor_id,
            "grantorName": grantor_name,
            "scholarId": scholar_id,
            "announcementId": announcement_id,
            "scholarshipName": scholarship_name,
            "providerType": announcement.get("providerType") or "",
            "minimumGwa": minimum_grade,
            "requiredDocuments": announcement.get("requiredDocuments") or {},
            "otherRequirements": announcement.get("otherRequirements") or [],
            "startDate": announcement.get("startDate"),
            "endDate": announcement.get("endDate"),
            "totalSlots": total_slots,
            "remainingSlots": remaining_slots,
            "archiveReason": scholar.get("archiveReason") or "",
            "archiveNotes": scholar.get("archiveNotes") or "",
            "createdAt": utc_now_iso(),
            "updatedAt": utc_now_iso(),
        }
        next_invitations = [item for item in current_invitations if not isinstance(item, dict) or item.get("id") != invitation_id] + [invitation]
        student_update = supabase_document_upsert("students", student_id, {"scholarshipInvitations": next_invitations, "updatedAt": utc_now_iso()}, merge=True)
        if not student_update.get("ok"):
            failure = {"scholarId": scholar_id, "studentId": student_id, "reason": "invitation_save_failed", "detail": student_update}
            results.append({"ok": False, **failure})
            failures.append(failure)
            continue
        roster_update = supabase_document_update("grantor_portal_scholars", scholar_id, {
            "archived": True,
            "status": "Archived",
            "unarchiveInvitationPending": True,
            "unarchiveInvitationAt": utc_now_iso(),
            "unarchiveInvitationId": invitation_id,
            "unarchiveInvitationAnnouncementId": announcement_id,
            "unarchiveInvitationScholarshipTitle": scholarship_name,
            "updatedAt": utc_now_iso(),
        }, parent_id=grantor_id)
        notification = supabase_document_upsert("studentNotifications", invitation_id, {
            "studentId": student_id,
            "source": "personal",
            "type": "scholarship_invitation",
            "title": "Scholarship Invitation",
            "message": f"{grantor_name} invited you to apply again for {scholarship_name}.",
            "grantorId": grantor_id,
            "grantorName": grantor_name,
            "scholarId": scholar_id,
            "invitationId": invitation_id,
            "announcementId": announcement_id,
            "scholarshipName": scholarship_name,
            "startDate": announcement.get("startDate"),
            "endDate": announcement.get("endDate"),
            "totalSlots": total_slots,
            "remainingSlots": remaining_slots,
            "route": "/student-dashboard/scholarships",
            "read": False,
            "createdAt": utc_now_iso(),
            "updatedAt": utc_now_iso(),
        }, merge=True)
        row_result = {"ok": roster_update.get("ok") and notification.get("ok"), "scholarId": scholar_id, "studentId": student_id, "invitationId": invitation_id}
        if not row_result["ok"]:
            row_result.update({"reason": "invitation_delivery_failed", "detail": {"roster": roster_update, "notification": notification}})
            failures.append(row_result)
        results.append(row_result)

    return {
        "ok": any(item.get("ok") for item in results),
        "partial": bool(failures),
        "invitationCount": sum(1 for item in results if item.get("ok")),
        "results": results,
        "failures": failures,
    }


def reject_scholarship_invitation(payload: dict[str, Any]) -> dict[str, Any]:
    student_id = str(payload.get("studentId") or "").strip()
    invitation_id = str(payload.get("invitationId") or "").strip()
    reason = str(payload.get("reason") or "Not interested").strip()
    notes = str(payload.get("notes") or "").strip()
    if not student_id or not invitation_id:
        return {"ok": False, "reason": "missing_invitation_identity"}
    student_result = supabase_document_get("students", student_id)
    student = student_result.get("data") or {}
    invitations = student.get("scholarshipInvitations") if isinstance(student.get("scholarshipInvitations"), list) else []
    matching = next((item for item in invitations if isinstance(item, dict) and str(item.get("id") or "") == invitation_id
                     and _normalize_identity(item.get("status") or "pending") in {"pending", "invited"}), None)
    if not matching:
        return {"ok": False, "reason": "invitation_not_pending", "message": "This invitation is no longer pending."}
    now = utc_now_iso()
    next_invitations = [{**item, "status": "Rejected", "rejectedAt": now, "rejectionReason": reason,
                         "rejectionNotes": notes, "updatedAt": now} if item is matching else item for item in invitations]
    update_result = supabase_document_upsert("students", student_id, {"scholarshipInvitations": next_invitations, "updatedAt": now}, merge=True)
    if not update_result.get("ok"):
        return {"ok": False, "reason": "invitation_reject_failed", "detail": update_result}
    grantor_id = str(matching.get("grantorId") or "").strip()
    scholar_id = str(matching.get("scholarId") or "").strip()
    if grantor_id and scholar_id:
        supabase_document_update("grantor_portal_scholars", scholar_id, {
            "archived": True, "status": "Archived", "unarchiveInvitationPending": False,
            "invitationStatus": "Rejected", "invitationRejectedAt": now,
            "invitationRejectionReason": reason, "invitationRejectionNotes": notes, "updatedAt": now,
        }, parent_id=grantor_id)
    create_student_notification({
        "studentId": student_id, "source": "personal", "type": "scholarship_invitation_rejected",
        "title": "Scholarship Invitation Rejected",
        "message": f"You rejected the invitation from {matching.get('grantorName') or 'the grantor'} for {matching.get('scholarshipName') or 'their scholarship'}. Reason: {reason}",
        "grantorId": grantor_id, "read": False, "createdAt": now,
    })
    return {"ok": True, "invitation": next(item for item in next_invitations if isinstance(item, dict) and item.get("id") == invitation_id)}


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
