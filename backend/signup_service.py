import re
from datetime import datetime
from typing import Any
from uuid import uuid4

try:
    from .supabase_ops import (
        build_student_notification_payload,
        create_admin_notification,
        create_log,
        create_student_notification,
        supabase_admin_create_user,
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
        supabase_admin_create_user,
        supabase_document_get,
        supabase_document_insert,
        supabase_document_upsert,
        supabase_select,
        utc_now_iso,
    )


def normalize_email(value: Any = "") -> str:
    return str(value or "").strip().lower()


def normalize_cp(value: Any = "") -> str:
    digits = re.sub(r"\D+", "", str(value or ""))
    if re.fullmatch(r"9\d{9}", digits):
        return f"0{digits}"
    return digits


def normalize_student_id(value: Any = "") -> str:
    return re.sub(r"\D+", "", str(value or ""))


def normalize_semester(value: Any = "") -> str:
    normalized = str(value or "").strip().lower()
    if normalized in ["1", "1st", "first"]:
        return "1ST"
    if normalized in ["2", "2nd", "second"]:
        return "2ND"
    return ""


def get_current_academic_year(now: datetime | None = None) -> str:
    now = now or datetime.now()
    return f"{now.year}-{now.year + 1}" if now.month >= 7 else f"{now.year - 1}-{now.year}"


def get_current_semester_tag(now: datetime | None = None) -> str:
    now = now or datetime.now()
    semester = "1ST" if now.month >= 7 else "2ND"
    return f"{get_current_academic_year(now)}-{semester}"


def previous_semester_tag(current_tag: str) -> str:
    match = re.match(r"^(20\d{2})-(20\d{2})-(1ST|2ND)$", str(current_tag or ""), re.I)
    if not match:
        return ""
    start_year = int(match.group(1))
    end_year = int(match.group(2))
    semester = match.group(3).upper()
    if semester == "2ND":
        return f"{start_year}-{end_year}-1ST"
    return f"{start_year - 1}-{end_year - 1}-2ND"


def build_semester_tag(document_scan: dict[str, Any]) -> str:
    academic_year = str(document_scan.get("academicYear") or "").replace(" ", "").replace("/", "-")
    semester = normalize_semester(document_scan.get("semester"))
    if not academic_year or not semester:
        return ""
    return f"{academic_year}-{semester}"


def compact_document_scan(scan: dict[str, Any] | None, file_payload: dict[str, Any] | None = None, document_type: str = "") -> dict[str, Any] | None:
    if not isinstance(scan, dict):
        return None
    return {
        "documentType": document_type or scan.get("documentType") or "",
        "isValid": True,
        "fileUrl": (file_payload or {}).get("url") or scan.get("fileUrl") or "",
        "fileName": (file_payload or {}).get("name") or scan.get("fileName") or "",
        "filePath": (file_payload or {}).get("path") or scan.get("filePath") or "",
        "studentId": scan.get("studentId") or "",
        "fullName": scan.get("fullName") or "",
        "firstName": scan.get("firstName") or "",
        "lastName": scan.get("lastName") or "",
        "course": scan.get("course") or "",
        "year": scan.get("year") or "",
        "section": scan.get("section") or "",
        "gwa": scan.get("gwa") or "",
        "academicYear": scan.get("academicYear") or "",
        "semester": scan.get("semester") or "",
        "semesterTag": build_semester_tag(scan) or scan.get("semesterTag") or "",
        "hasAcademicConcern": bool(scan.get("hasAcademicConcern")),
        "scannedAt": scan.get("scannedAt") or utc_now_iso(),
    }


def sanitize_student_payload(student: dict[str, Any]) -> dict[str, Any]:
    sanitized = dict(student or {})
    for duplicate_key in [
        "password",
        "first_name",
        "middle_name",
        "last_name",
        "user_type",
        "auth_user_id",
        "contact_number",
        "year_level",
    ]:
        sanitized.pop(duplicate_key, None)

    if sanitized.get("cogFile") and not sanitized.get("rogFile"):
        sanitized["rogFile"] = sanitized.get("cogFile")
    sanitized.pop("cogFile", None)

    document_scan = sanitized.get("documentScan") or {}
    if isinstance(document_scan, dict):
        cor_scan = document_scan.get("cor") or {}
        rog_scan = document_scan.get("rog") or document_scan.get("cog") or {}
        sanitized["documentScan"] = {
            "cor": compact_document_scan(cor_scan, sanitized.get("corFile"), "cor"),
            "rog": compact_document_scan(rog_scan, sanitized.get("rogFile"), "rog"),
        }

    sanitized["cpNumber"] = normalize_cp(sanitized.get("cpNumber"))
    sanitized["studentnumber"] = normalize_student_id(sanitized.get("studentnumber") or sanitized.get("studentId") or sanitized.get("id"))
    sanitized.pop("studentId", None)
    return sanitized


def expected_previous_rog_year_level(cor_year: Any = "", current_tag: str = "") -> str:
    match = re.match(r"^(20\d{2})-(20\d{2})-(1ST|2ND)$", str(current_tag or ""), re.I)
    normalized_cor_year = re.sub(r"\D+", "", str(cor_year or ""))[:1]
    if not match or not normalized_cor_year:
        return ""
    if match.group(3).upper() == "2ND":
        return normalized_cor_year
    return str(max(1, int(normalized_cor_year) - 1))


def first_existing_record(checks: list[tuple[str, dict[str, Any]]]) -> dict[str, Any] | None:
    for table, filters in checks:
        result = supabase_select(table, filters, limit=1)
        if not result.get("ok"):
            return {"table": table, "error": result}
        rows = result.get("rows") or []
        if rows:
            return {"table": table, "row": rows[0]}
    return None


def is_missing_or_unloaded_table(owner: dict[str, Any] | None, table: str = "") -> bool:
    if not owner or not owner.get("error"):
        return False
    error = owner.get("error") or {}
    return error.get("reason") == "missing_or_unloaded_supabase_table" and (not table or owner.get("table") == table)


def signup_security_schema_error(owner: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "ok": False,
        "reason": "signup_security_schema_not_ready",
        "message": "Signup security tables are missing or not loaded in Supabase. Run supabase/security-hardening.sql in the Supabase SQL Editor, then restart/redeploy the backend.",
        "requiredTable": "student_document_usage",
        "sqlFile": "supabase/security-hardening.sql",
        "result": owner,
    }


def validate_student_signup(payload: dict[str, Any]) -> dict[str, Any]:
    student_id = normalize_student_id(payload.get("studentId"))
    student = payload.get("student") or {}
    auth = payload.get("auth") or {}
    cor = payload.get("cor") or {}
    document_scan = student.get("documentScan") or {}
    cor_scan = document_scan.get("cor") or {}
    rog_scan = document_scan.get("rog") or document_scan.get("cog") or {}

    email = normalize_email(student.get("email"))
    cp_number = normalize_cp(student.get("cpNumber"))
    auth_email = normalize_email(auth.get("email"))
    cor_student_id = normalize_student_id(cor.get("studentId") or cor_scan.get("studentId"))
    current_cycle = get_current_semester_tag()
    previous_cycle = previous_semester_tag(current_cycle)
    cor_cycle = build_semester_tag(cor_scan or cor)
    rog_cycle = build_semester_tag(rog_scan)
    student_year = str(student.get("year") or cor_scan.get("year") or "").strip()
    is_first_year_first_cycle = student_year == "1" and current_cycle.endswith("-1ST")

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
    if cor_scan.get("isValidCorDocument") is False:
        return {"ok": False, "reason": "invalid_cor_document_title", "acceptedTitles": cor_scan.get("acceptedCorTitles") or []}
    if not cor_cycle:
        return {"ok": False, "reason": "missing_cor_cycle", "expectedCurrentCycle": current_cycle}
    if cor_cycle != current_cycle:
        return {"ok": False, "reason": "cor_cycle_mismatch", "expectedCurrentCycle": current_cycle, "scannedCycle": cor_cycle}
    if not is_first_year_first_cycle:
        if not rog_scan:
            return {"ok": False, "reason": "missing_rog_scan", "expectedPreviousCycle": previous_cycle}
        if rog_scan.get("isValidCogDocument") is False:
            return {"ok": False, "reason": "invalid_rog_document_title", "acceptedTitles": rog_scan.get("acceptedCogTitles") or []}
        if not rog_cycle:
            return {"ok": False, "reason": "missing_rog_cycle", "expectedPreviousCycle": previous_cycle}
        if rog_cycle != previous_cycle:
            return {"ok": False, "reason": "rog_cycle_mismatch", "expectedPreviousCycle": previous_cycle, "scannedCycle": rog_cycle}
        expected_rog_year = expected_previous_rog_year_level(student_year, current_cycle)
        scanned_rog_year = re.sub(r"\D+", "", str(rog_scan.get("year") or ""))[:1]
        student_year_number = int(re.sub(r"\D+", "", student_year)[:1] or "0")
        scanned_rog_year_number = int(scanned_rog_year or "0")
        current_semester = current_cycle.rsplit("-", 1)[-1].upper()
        has_impossible_year_progression = bool(
            student_year_number
            and scanned_rog_year_number
            and (
                (current_semester == "1ST" and scanned_rog_year_number >= student_year_number)
                or (current_semester == "2ND" and scanned_rog_year_number > student_year_number)
            )
        )
        if expected_rog_year and scanned_rog_year and expected_rog_year != scanned_rog_year and not has_impossible_year_progression:
            return {
                "ok": False,
                "reason": "rog_year_level_mismatch",
                "expectedYearLevel": expected_rog_year,
                "scannedYearLevel": scanned_rog_year,
                "currentCycle": current_cycle,
                "previousCycle": previous_cycle,
            }

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

    cp_lookup_values = [cp_number]
    if cp_number.startswith("0"):
        cp_lookup_values.append(cp_number[1:])
    elif re.fullmatch(r"9\d{9}", cp_number):
        cp_lookup_values.append(f"0{cp_number}")
    cp_owner = None
    for cp_lookup in dict.fromkeys(value for value in cp_lookup_values if value):
        cp_owner = first_existing_record([
            ("students", {"contact_number": cp_lookup}),
            ("pending_students", {"contact_number": cp_lookup}),
        ])
        if cp_owner:
            break
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
            if is_missing_or_unloaded_table(cor_hash_owner, "student_document_usage"):
                return signup_security_schema_error(cor_hash_owner)
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
            if is_missing_or_unloaded_table(cycle_owner, "student_document_usage"):
                return signup_security_schema_error(cycle_owner)
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
    student = sanitize_student_payload(dict(payload.get("student") or {}))
    auth = payload.get("auth") or {}
    is_auto_verified = payload.get("isAutoVerified", True)
    auth_result = None

    if auth.get("createUser") is True:
        auth_result = supabase_admin_create_user(
            validation["email"],
            str(auth.get("password") or ""),
            {
                "user_id": student_id,
                "user_type": "student",
                "full_name": student.get("fullName") or " ".join(
                    part for part in [student.get("fname"), student.get("lname")] if part
                ).strip(),
                "auto_verified_from_roster": bool(auth.get("emailConfirm")),
            },
            email_confirm=bool(auth.get("emailConfirm")),
        )
        if not auth_result.get("ok"):
            return {"ok": False, "reason": auth_result.get("reason") or "auth_create_failed", "auth": auth_result}
        auth["userId"] = (auth_result.get("user") or {}).get("id") or auth.get("userId") or ""

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
        "accountId": student_id,
        "academicYear": cor.get("academicYear") or "",
        "semester": cor.get("semester") or "",
        "corHash": cor.get("hash") or "",
        "createdAt": utc_now_iso(),
    }
    if cor.get("hash") or (cor.get("academicYear") and cor.get("semester")):
        usage_result = supabase_document_insert("student_document_usage", usage_payload)
        if not usage_result.get("ok"):
            if usage_result.get("reason") == "missing_or_unloaded_supabase_table":
                return signup_security_schema_error({"table": "student_document_usage", "error": usage_result})
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
        "auth": auth_result,
        "notification": notification_result,
        "adminNotification": admin_notification_result,
        "log": log_result,
    }
