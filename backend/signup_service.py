import re
from typing import Any
from uuid import uuid4

try:
    from .supabase_ops import (
        build_student_notification_payload,
        create_admin_notification,
        create_log,
        create_student_notification,
        supabase_document_get,
        supabase_document_insert,
        supabase_document_upsert,
        supabase_select,
        utc_now_iso,
    )
except ImportError:  # pragma: no cover
    from supabase_ops import (
        build_student_notification_payload,
        create_admin_notification,
        create_log,
        create_student_notification,
        supabase_document_get,
        supabase_document_insert,
        supabase_document_upsert,
        supabase_select,
        utc_now_iso,
    )


def normalize_email(value: Any = "") -> str:
    return str(value or "").strip().lower()


def normalize_cp(value: Any = "") -> str:
    return re.sub(r"\D+", "", str(value or ""))


def normalize_student_id(value: Any = "") -> str:
    return re.sub(r"\D+", "", str(value or ""))


def first_existing_record(checks: list[tuple[str, dict[str, Any]]]) -> dict[str, Any] | None:
    for table, filters in checks:
        result = supabase_select(table, filters, limit=1)
        if not result.get("ok"):
            return {"table": table, "error": result}
        rows = result.get("rows") or []
        if rows:
            return {"table": table, "row": rows[0]}
    return None


def validate_student_signup(payload: dict[str, Any]) -> dict[str, Any]:
    student_id = normalize_student_id(payload.get("studentId"))
    student = payload.get("student") or {}
    auth = payload.get("auth") or {}
    cor = payload.get("cor") or {}

    email = normalize_email(student.get("email"))
    cp_number = normalize_cp(student.get("cpNumber"))
    auth_email = normalize_email(auth.get("email"))
    cor_student_id = normalize_student_id(cor.get("studentId") or student.get("documentScan", {}).get("cor", {}).get("studentId"))

    if not student_id:
        return {"ok": False, "reason": "missing_student_id"}
    if not email:
        return {"ok": False, "reason": "missing_email"}
    if not re.fullmatch(r"09\d{9}", cp_number):
        return {"ok": False, "reason": "invalid_cp_number"}
    if auth_email and auth_email != email:
        return {"ok": False, "reason": "auth_email_mismatch", "authEmail": auth_email, "studentEmail": email}
    if cor_student_id and cor_student_id != student_id:
        return {"ok": False, "reason": "cor_student_id_mismatch", "corStudentId": cor_student_id, "studentId": student_id}
    if not cor_student_id:
        return {"ok": False, "reason": "missing_cor_student_id"}

    for table in ["students", "pending_students", "providers", "admins"]:
        existing = supabase_document_get(table, student_id)
        if not existing.get("ok"):
            return {"ok": False, "reason": "student_id_check_failed", "table": table, "result": existing}
        if existing.get("row"):
            return {"ok": False, "reason": "student_id_exists", "table": table}

    email_owner = first_existing_record([
        ("students", {"email": email}),
        ("pending_students", {"email": email}),
    ])
    if email_owner:
        if email_owner.get("error"):
            return {"ok": False, "reason": "email_check_failed", "result": email_owner}
        return {"ok": False, "reason": "email_exists", "table": email_owner["table"]}

    cp_owner = first_existing_record([
        ("students", {"contact_number": cp_number}),
        ("pending_students", {"contact_number": cp_number}),
    ])
    if cp_owner:
        if cp_owner.get("error"):
            return {"ok": False, "reason": "cp_check_failed", "result": cp_owner}
        return {"ok": False, "reason": "cp_exists", "table": cp_owner["table"]}

    cor_hash = str(cor.get("hash") or "").strip()
    academic_year = str(cor.get("academicYear") or student.get("documentScan", {}).get("cor", {}).get("academicYear") or "").strip()
    semester = str(cor.get("semester") or student.get("documentScan", {}).get("cor", {}).get("semester") or "").strip()

    if cor_hash:
        cor_hash_owner = first_existing_record([("student_document_usage", {"cor_hash": cor_hash})])
        if cor_hash_owner:
            if cor_hash_owner.get("error"):
                return {"ok": False, "reason": "cor_hash_check_failed", "result": cor_hash_owner}
            return {"ok": False, "reason": "cor_file_already_used"}

    if academic_year and semester:
        cycle_owner = first_existing_record([
            ("student_document_usage", {
                "student_id": student_id,
                "academic_year": academic_year,
                "semester": semester,
            })
        ])
        if cycle_owner:
            if cycle_owner.get("error"):
                return {"ok": False, "reason": "cor_cycle_check_failed", "result": cycle_owner}
            return {"ok": False, "reason": "cor_identity_cycle_already_used"}

    return {
        "ok": True,
        "studentId": student_id,
        "email": email,
        "cpNumber": cp_number,
        "cor": {
            "studentId": cor_student_id,
            "hash": cor_hash,
            "academicYear": academic_year,
            "semester": semester,
        },
    }


def finalize_student_signup(payload: dict[str, Any]) -> dict[str, Any]:
    validation = validate_student_signup(payload)
    if not validation.get("ok"):
        return validation

    student_id = validation["studentId"]
    student = dict(payload.get("student") or {})
    auth = payload.get("auth") or {}
    is_auto_verified = payload.get("isAutoVerified", True)

    student["email"] = validation["email"]
    student["cpNumber"] = validation["cpNumber"]
    student["studentnumber"] = student_id
    student["userType"] = "student"
    student["authUserId"] = auth.get("userId") or student.get("authUserId") or ""
    student["isValidated"] = bool(is_auto_verified)
    student["isPending"] = not bool(is_auto_verified)
    student["validatedAt"] = utc_now_iso() if is_auto_verified else None
    student.setdefault("createdAt", utc_now_iso())
    student["updatedAt"] = utc_now_iso()

    target_table = "students" if is_auto_verified else "pending_students"
    student_result = supabase_document_upsert(target_table, student_id, student, merge=False)
    if not student_result.get("ok"):
        return {"ok": False, "reason": "student_save_failed", "result": student_result}

    cor = validation.get("cor") or {}
    usage_payload = {
        "id": f"{student_id}_{cor.get('academicYear') or 'unknown'}_{cor.get('semester') or 'unknown'}",
        "studentId": student_id,
        "student_id": student_id,
        "accountId": student_id,
        "account_id": student_id,
        "academicYear": cor.get("academicYear") or "",
        "academic_year": cor.get("academicYear") or "",
        "semester": cor.get("semester") or "",
        "corHash": cor.get("hash") or "",
        "cor_hash": cor.get("hash") or "",
        "createdAt": utc_now_iso(),
    }
    if cor.get("hash") or (cor.get("academicYear") and cor.get("semester")):
        usage_result = supabase_document_insert("student_document_usage", usage_payload)
        if not usage_result.get("ok"):
            return {"ok": False, "reason": "cor_usage_save_failed", "student": student_result, "result": usage_result}

    notification_result = create_student_notification(
        build_student_notification_payload(
            student_id,
            "Account Created",
            "Your student account was created and your signup documents were recorded.",
            "account",
            {"source": "system", "isSystem": True},
        )
    )
    student_name = student.get("fullName") or " ".join(
        part for part in [student.get("fname"), student.get("mname"), student.get("lname")] if part
    ).strip() or student_id
    admin_notification_result = create_admin_notification({
        "type": "student_account_created",
        "title": "New Student Account",
        "message": f"{student_name} created a student account.",
        "studentId": student_id,
        "route": "/admin/students",
        "actorType": "student",
        "actorId": student_id,
        "read": False,
        "archived": False,
        "createdAt": utc_now_iso(),
    })
    log_result = create_log({
        "action": "student_account_created",
        "actorId": student_id,
        "actorType": "student",
        "target": student_id,
        "details": {"table": target_table, "email": validation["email"]},
        "createdAt": utc_now_iso(),
    })

    return {
        "ok": True,
        "studentId": student_id,
        "table": target_table,
        "student": student_result,
        "notification": notification_result,
        "adminNotification": admin_notification_result,
        "log": log_result,
    }
