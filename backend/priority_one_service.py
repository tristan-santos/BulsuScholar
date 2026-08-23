import re
from difflib import SequenceMatcher
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

try:
    from .supabase_ops import (
        build_admin_notification_payload,
        build_grantor_notification_payload,
        build_log_payload,
        build_student_notification_payload,
        create_admin_notification,
        create_grantor_notification,
        create_log,
        create_student_notification,
        supabase_document_insert,
        supabase_document_update,
        supabase_document_upsert,
        supabase_select,
    )
except ImportError:
    from supabase_ops import (
        build_admin_notification_payload,
        build_grantor_notification_payload,
        build_log_payload,
        build_student_notification_payload,
        create_admin_notification,
        create_grantor_notification,
        create_log,
        create_student_notification,
        supabase_document_insert,
        supabase_document_update,
        supabase_document_upsert,
        supabase_select,
    )


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _student_name(data: dict[str, Any]) -> str:
    return str(data.get("fullName") or " ".join(filter(None, [data.get("fname"), data.get("mname"), data.get("lname")]))).strip()


def _normalized_name(value: Any) -> str:
    return re.sub(r"[^a-z0-9 ]", "", re.sub(r"\s+", " ", str(value or "").strip().lower()))


def create_leave_request(payload: dict[str, Any]) -> dict[str, Any]:
    student_id = str(payload.get("studentId") or "").strip()
    request_type = str(payload.get("requestType") or "loa").strip().lower()
    if request_type not in {"loa", "return"}:
        return {"ok": False, "reason": "invalid_request_type"}
    if not student_id or not str(payload.get("reason") or "").strip():
        return {"ok": False, "reason": "student_and_reason_required"}
    existing = supabase_select("leave_requests", {"data->>studentId": student_id, "data->>requestType": request_type}, limit=100)
    for row in existing.get("rows", []) if existing.get("ok") else []:
        if str((row.get("data") or {}).get("status") or "").lower() == "pending":
            return {"ok": False, "reason": "pending_request_exists"}
    request_id = str(uuid4())
    record = {
        "id": request_id,
        "studentId": student_id,
        "studentName": str(payload.get("studentName") or "").strip(),
        "grantorId": str(payload.get("grantorId") or "").strip(),
        "scholarshipName": str(payload.get("scholarshipName") or "").strip(),
        "requestType": request_type,
        "reason": str(payload.get("reason") or "").strip(),
        "notes": str(payload.get("notes") or "").strip(),
        "document": payload.get("document") or None,
        "requiredDocuments": payload.get("requiredDocuments") or [],
        "status": "pending",
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    result = supabase_document_insert("leave_requests", record)
    if not result.get("ok"):
        return result
    label = "Leave of Absence" if request_type == "loa" else "Return to Study"
    create_admin_notification(build_admin_notification_payload(
        f"{label} Request",
        f"{record['studentName'] or student_id} submitted a {label.lower()} request.",
        f"{request_type}_request",
        {"studentId": student_id, "requestId": request_id, "route": "/admin/leave-requests"},
    ))
    if record["grantorId"]:
        create_grantor_notification(build_grantor_notification_payload(
            record["grantorId"], f"{label} Request Submitted",
            f"{record['studentName'] or student_id} submitted a request for administrator review.",
            f"{request_type}_request", {"studentId": student_id, "requestId": request_id},
        ))
    create_log(build_log_payload(f"{request_type}_request_created", student_id, "student", request_id, {"grantorId": record["grantorId"]}))
    return {"ok": True, "request": record}


def review_leave_request(payload: dict[str, Any]) -> dict[str, Any]:
    request_id = str(payload.get("requestId") or "").strip()
    decision = str(payload.get("decision") or "").strip().lower()
    if not request_id or decision not in {"approved", "rejected"}:
        return {"ok": False, "reason": "request_and_valid_decision_required"}
    rows = supabase_select("leave_requests", {"id": request_id}, limit=1)
    if not rows.get("ok") or not rows.get("rows"):
        return {"ok": False, "reason": "leave_request_not_found"}
    record = rows["rows"][0].get("data") or {}
    student_id = str(record.get("studentId") or "")
    request_type = str(record.get("requestType") or "loa")
    reviewed_at = now_iso()
    update = {
        "status": decision,
        "decisionReason": str(payload.get("reason") or "").strip(),
        "decisionNotes": str(payload.get("notes") or "").strip(),
        "reviewedBy": str(payload.get("actorId") or "admin"),
        "reviewedAt": reviewed_at,
        "updatedAt": reviewed_at,
    }
    result = supabase_document_update("leave_requests", request_id, update)
    if not result.get("ok"):
        return result
    if decision == "approved" and student_id:
        if request_type == "loa":
            student_update = {"loaStatus": "approved", "accountStatus": "leave_of_absence", "scholarshipFrozen": True, "loaApprovedAt": reviewed_at}
            applications = supabase_select("scholarship_applications", {"data->>studentId": student_id}, limit=100)
            if applications.get("ok"):
                for application_row in applications.get("rows", []):
                    application_id = str(application_row.get("id") or "").strip()
                    if application_id:
                        supabase_document_update("scholarship_applications", application_id, {
                            "status": "frozen",
                            "applicationStatus": "frozen",
                            "frozenReason": "Approved Leave of Absence",
                            "frozenAt": reviewed_at,
                            "updatedAt": reviewed_at,
                        })
        else:
            student_update = {"loaStatus": "returned", "accountStatus": "active", "scholarshipFrozen": False, "returnedAt": reviewed_at, "recommendedPreviousScholarship": record.get("scholarshipName") or ""}
        supabase_document_update("students", student_id, student_update)
    label = "Leave of Absence" if request_type == "loa" else "Return to Study"
    reason_text = f" Reason: {update['decisionReason']}." if update["decisionReason"] else ""
    create_student_notification(build_student_notification_payload(
        student_id, f"{label} Request {decision.title()}",
        f"Your {label.lower()} request was {decision}.{reason_text}",
        f"{request_type}_{decision}", {"requestId": request_id, "route": "/student-dashboard/leave"},
    ))
    if record.get("grantorId"):
        create_grantor_notification(build_grantor_notification_payload(
            str(record["grantorId"]), f"Student {label} {decision.title()}",
            f"The administrator {decision} {record.get('studentName') or student_id}'s request.",
            f"{request_type}_{decision}", {"studentId": student_id, "requestId": request_id},
        ))
    create_log(build_log_payload(f"{request_type}_request_{decision}", str(payload.get("actorId") or "admin"), "admin", request_id, {"studentId": student_id}))
    return {"ok": True, "status": decision}


def save_support_feedback(payload: dict[str, Any]) -> dict[str, Any]:
    message = str(payload.get("message") or "").strip()
    if not message:
        return {"ok": False, "reason": "feedback_message_required"}
    record = {
        "id": str(uuid4()), "userId": str(payload.get("userId") or "guest"),
        "userType": str(payload.get("userType") or "guest"), "category": str(payload.get("category") or "general"),
        "email": str(payload.get("email") or "").strip(), "message": message[:4000], "status": "open", "createdAt": now_iso(),
    }
    result = supabase_document_insert("support_feedback", record)
    if result.get("ok"):
        create_admin_notification(build_admin_notification_payload("New Help Request", f"A {record['userType']} submitted a {record['category']} support request.", "support_feedback", {"feedbackId": record["id"], "route": "/admin/inbox"}))
    return {"ok": bool(result.get("ok")), "feedback": record, **({} if result.get("ok") else {"reason": result.get("reason") or "feedback_save_failed"})}


def import_unifast_records(payload: dict[str, Any]) -> dict[str, Any]:
    records = payload.get("records") if isinstance(payload.get("records"), list) else []
    students_result = supabase_select("students", limit=10000)
    students = students_result.get("rows", []) if students_result.get("ok") else []
    by_id = {}
    for row in students:
        student_data = row.get("data") or {}
        candidate_ids = {
            row.get("id"),
            student_data.get("studentId"),
            student_data.get("studentnumber"),
            student_data.get("studentNumber"),
        }
        for candidate_id in candidate_ids:
            normalized_id = re.sub(r"\D", "", str(candidate_id or ""))
            if normalized_id:
                by_id[normalized_id] = row
    students_by_name = [(_normalized_name(_student_name(row.get("data") or {})), row) for row in students]
    saved = []
    for source in records[:2000]:
        student_id = re.sub(r"\D", "", str(source.get("studentId") or source.get("studentNumber") or ""))
        if not student_id:
            continue
        source_name = _normalized_name(source.get("studentName") or source.get("fullName"))
        student_row = by_id.get(student_id)
        match_method = "student_id" if student_row else ""
        if not student_row and source_name:
            best_score, best_row = max(
                ((SequenceMatcher(None, source_name, known_name).ratio(), row) for known_name, row in students_by_name if known_name),
                default=(0.0, None),
                key=lambda item: item[0],
            )
            if best_score >= 0.88:
                student_row = best_row
                match_method = "name_similarity"
        student = (student_row or {}).get("data") or {}
        start_year = int(source.get("startYear") or source.get("entryYear") or 0) if str(source.get("startYear") or source.get("entryYear") or "").isdigit() else 0
        current_year = datetime.now(timezone.utc).year
        raw_years_used = str(source.get("yearsUsed") or "").strip()
        years_used = max(0, current_year - start_year + 1) if start_year else (int(raw_years_used) if raw_years_used.isdigit() else 0)
        matched = bool(student_row)
        record = {
            "id": f"unifast_{student_id}", "studentId": student_id,
            "studentName": str(source.get("studentName") or _student_name(student) or "").strip(),
            "course": str(source.get("course") or student.get("course") or "").strip(),
            "yearLevel": str(source.get("yearLevel") or student.get("year") or "").strip(),
            "startYear": start_year or None, "yearsUsed": years_used, "matchedStudent": matched, "matchMethod": match_method or "unmatched",
            "eligible": years_used <= 5 if years_used else True, "status": "with_unifast" if matched else "unmatched",
            "academicCycle": str(payload.get("academicCycle") or source.get("academicCycle") or ""),
            "updatedAt": now_iso(), "createdAt": str(source.get("createdAt") or now_iso()),
        }
        result = supabase_document_upsert("unifast_records", record["id"], record, merge=True)
        if result.get("ok"):
            saved.append(record)
    create_log(build_log_payload("unifast_import", str(payload.get("actorId") or "admin"), "admin", "unifast_records", {"received": len(records), "saved": len(saved)}))
    return {"ok": True, "saved": saved, "savedCount": len(saved), "receivedCount": len(records)}


PRIORITY_ONE_READ_TABLES = {"leave_requests", "support_feedback", "unifast_records"}


def list_priority_records(payload: dict[str, Any]) -> dict[str, Any]:
    table = str(payload.get("table") or "").strip()
    if table not in PRIORITY_ONE_READ_TABLES:
        return {"ok": False, "reason": "unsupported_priority_one_table"}
    raw_filters = payload.get("filters") if isinstance(payload.get("filters"), dict) else {}
    allowed_fields = {
        "leave_requests": {"studentId", "grantorId", "requestType", "status"},
        "support_feedback": {"userId", "userType", "category", "status"},
        "unifast_records": {"studentId", "status", "academicCycle", "eligible"},
    }[table]
    filters = {
        f"data->>{field}": str(value).lower() if isinstance(value, bool) else value
        for field, value in raw_filters.items()
        if field in allowed_fields and value not in (None, "")
    }
    result = supabase_select(table, filters, limit=min(int(payload.get("limit") or 5000), 10000))
    if not result.get("ok"):
        return result
    records = [{"id": row.get("id"), **(row.get("data") or {})} for row in result.get("rows", [])]
    records.sort(key=lambda item: str(item.get("updatedAt") or item.get("createdAt") or ""), reverse=True)
    return {"ok": True, "records": records, "count": len(records)}
