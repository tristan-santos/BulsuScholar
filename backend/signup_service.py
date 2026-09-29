import hashlib
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, UploadFile

try:
    from .supabase_ops import (
        build_student_notification_payload,
        create_admin_notification,
        create_log,
        create_student_notification,
        supabase_document_get,
        supabase_document_insert,
        supabase_document_update,
        supabase_document_upsert,
        supabase_rpc,
        supabase_select,
        utc_now_iso,
    )
    from .document_scanner import parse_pdf_document
    from .student_profile_service import _delete_stored_bytes, _store_bytes
except ImportError:  # pragma: no cover
    from supabase_ops import (
        build_student_notification_payload,
        create_admin_notification,
        create_log,
        create_student_notification,
        supabase_document_get,
        supabase_document_insert,
        supabase_document_update,
        supabase_document_upsert,
        supabase_rpc,
        supabase_select,
        utc_now_iso,
    )
    from document_scanner import parse_pdf_document
    from student_profile_service import _delete_stored_bytes, _store_bytes


SIGNUP_DOCUMENT_TYPES = {"application/pdf", "image/png", "image/jpeg", "image/webp"}
MAX_SIGNUP_DOCUMENT_BYTES = 10 * 1024 * 1024
SIGNUP_BATCH_LIFETIME = timedelta(hours=24)


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
    try:
        from .root_service import configured_semester_tag
    except ImportError:  # pragma: no cover
        from root_service import configured_semester_tag
    configured = configured_semester_tag()
    if configured:
        return configured
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


def _signup_year(value: Any) -> str:
    normalized = re.sub(r"\D+", "", str(value or ""))
    return normalized[:1] if normalized[:1] in {"1", "2", "3", "4", "5"} else ""


def _signup_document_policy() -> dict[str, Any]:
    data = supabase_document_get("system_configuration", "document_policy").get("data") or {}
    mode = str(data.get("corMode") or "cor_only")
    return {
        "corMode": mode if mode in {"cor_only", "advising_only", "either"} else "cor_only",
        "manualReviewEnabled": data.get("manualReviewEnabled") is not False,
    }


def _signup_file_extension(file: UploadFile, content_type: str) -> str:
    extension = os.path.splitext(file.filename or "")[1].lower()
    if extension in {".pdf", ".png", ".jpg", ".jpeg", ".webp"}:
        return extension
    return {
        "application/pdf": ".pdf",
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
    }.get(content_type, "")


async def _read_signup_file(file: UploadFile | None, *, pdf_only: bool, required: bool, label: str) -> tuple[bytes, str]:
    if file is None:
        if required:
            raise HTTPException(status_code=422, detail=f"missing_{label}_document")
        return b"", ""
    body = await file.read()
    content_type = str(file.content_type or "").lower()
    if not body:
        raise HTTPException(status_code=422, detail=f"empty_{label}_document")
    if len(body) > MAX_SIGNUP_DOCUMENT_BYTES:
        raise HTTPException(status_code=413, detail=f"{label}_document_too_large")
    if content_type not in SIGNUP_DOCUMENT_TYPES:
        raise HTTPException(status_code=415, detail=f"invalid_{label}_document_type")
    if pdf_only and content_type != "application/pdf" and not str(file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail=f"{label}_pdf_required")
    return body, content_type


def _signup_document_metadata(file: UploadFile, reference: dict[str, Any], content_type: str, scan: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "name": file.filename or "document",
        "type": content_type,
        "size": reference.get("size") or 0,
        "bucket": reference.get("bucket") or "",
        "path": reference.get("path") or "",
        "scan": scan or {},
    }


async def create_signup_document_batch(
    student_id: str,
    email: str,
    identity_kind: str,
    cor: UploadFile,
    identity: UploadFile,
    rog: UploadFile | None = None,
) -> dict[str, Any]:
    normalized_student_id = normalize_student_id(student_id)
    normalized_email = normalize_email(email)
    if not normalized_student_id or not normalized_email:
        raise HTTPException(status_code=422, detail="signup_document_identity_required")

    cor_body, cor_type = await _read_signup_file(cor, pdf_only=True, required=True, label="cor")
    cor_scan = parse_pdf_document(cor_body, "cor")
    if cor_scan.get("isValidCorDocument") is False:
        raise HTTPException(status_code=422, detail="invalid_cor_document_title")
    scanned_student_id = normalize_student_id(cor_scan.get("studentId"))
    if not scanned_student_id or scanned_student_id != normalized_student_id:
        raise HTTPException(status_code=422, detail="cor_student_id_mismatch")
    year = _signup_year(cor_scan.get("year"))
    if not year:
        raise HTTPException(status_code=422, detail="cor_year_level_not_detected")

    current_cycle = get_current_semester_tag()
    cor_cycle = build_semester_tag(cor_scan)
    if not cor_cycle or cor_cycle != current_cycle:
        raise HTTPException(status_code=422, detail="cor_cycle_mismatch")
    policy = _signup_document_policy()
    detected_title = str(cor_scan.get("documentTitle") or "")
    if ((policy["corMode"] == "cor_only" and detected_title != "Certificate of Registration")
            or (policy["corMode"] == "advising_only" and detected_title != "Advising Slip")):
        raise HTTPException(status_code=422, detail="cor_policy_not_satisfied")

    rog_required = not (year == "1" and current_cycle.endswith("-1ST"))
    rog_body, rog_type = await _read_signup_file(rog, pdf_only=True, required=rog_required, label="rog")
    rog_scan: dict[str, Any] = {}
    if rog_body:
        rog_scan = parse_pdf_document(rog_body, "cog")
        if rog_scan.get("isValidCogDocument") is False:
            raise HTTPException(status_code=422, detail="invalid_rog_document")
        if build_semester_tag(rog_scan) != previous_semester_tag(current_cycle):
            raise HTTPException(status_code=422, detail="rog_cycle_mismatch")
        if rog_scan.get("hasAcademicConcern"):
            raise HTTPException(status_code=422, detail="rog_academic_concern")

    allowed_identity_kinds = {"student_id", "previous_school_id", "government_id"} if year == "1" else {"student_id"}
    if identity_kind not in allowed_identity_kinds:
        raise HTTPException(status_code=422, detail="identity_document_not_allowed")
    identity_body, identity_type = await _read_signup_file(identity, pdf_only=False, required=True, label="identity")

    batch_id = f"signup_batch_{uuid4().hex}"
    secret = secrets.token_urlsafe(32)
    secret_hash = hashlib.sha256(secret.encode("utf-8")).hexdigest()
    base_path = f"pending-signups/{batch_id}"
    stored_references: list[dict[str, Any]] = []
    try:
        cor_ref = _store_bytes(f"{base_path}/cor{_signup_file_extension(cor, cor_type)}", cor_body, cor_type)
        stored_references.append(cor_ref)
        identity_ref = _store_bytes(f"{base_path}/identity{_signup_file_extension(identity, identity_type)}", identity_body, identity_type)
        stored_references.append(identity_ref)
        documents = {
            "cor": _signup_document_metadata(cor, cor_ref, cor_type, cor_scan),
            "identity": _signup_document_metadata(identity, identity_ref, identity_type),
        }
        if rog_body and rog is not None:
            rog_ref = _store_bytes(f"{base_path}/rog{_signup_file_extension(rog, rog_type)}", rog_body, rog_type)
            stored_references.append(rog_ref)
            documents["rog"] = _signup_document_metadata(rog, rog_ref, rog_type, rog_scan)

        now = datetime.now(timezone.utc)
        data = {
            "studentId": normalized_student_id,
            "email": normalized_email,
            "secretHash": secret_hash,
            "status": "prepared",
            "academicCycle": current_cycle,
            "year": year,
            "rogRequired": rog_required,
            "rogExemptionReason": "" if rog_required else "first_year_first_semester",
            "identityKind": identity_kind,
            "documents": documents,
            "manualReviewEnabled": policy["manualReviewEnabled"],
            "createdAt": now.isoformat(),
            "expiresAt": (now + SIGNUP_BATCH_LIFETIME).isoformat(),
            "updatedAt": now.isoformat(),
        }
        if not supabase_document_upsert("signup_document_batches", batch_id, data, merge=False).get("ok"):
            raise HTTPException(status_code=503, detail="signup_document_batch_save_failed")
    except Exception:
        for reference in reversed(stored_references):
            _delete_stored_bytes(reference)
        raise
    return {
        "ok": True,
        "batchId": batch_id,
        "batchSecret": secret,
        "year": year,
        "academicCycle": current_cycle,
        "rogRequired": rog_required,
        "identityKind": identity_kind,
        "expiresAt": data["expiresAt"],
    }


def _load_signup_document_batch(payload: dict[str, Any]) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    reference = payload.get("documentBatch") if isinstance(payload.get("documentBatch"), dict) else {}
    batch_id = str(reference.get("batchId") or "").strip()
    secret = str(reference.get("batchSecret") or "").strip()
    if not batch_id or not secret:
        return None, {"ok": False, "reason": "signup_document_batch_required"}
    result = supabase_document_get("signup_document_batches", batch_id)
    if not result.get("ok") or not result.get("row"):
        return None, {"ok": False, "reason": "signup_document_batch_not_found"}
    data = result.get("data") or {}
    supplied_hash = hashlib.sha256(secret.encode("utf-8")).hexdigest()
    if not secrets.compare_digest(str(data.get("secretHash") or ""), supplied_hash):
        return None, {"ok": False, "reason": "signup_document_batch_invalid"}
    try:
        expires_at = datetime.fromisoformat(str(data.get("expiresAt") or "").replace("Z", "+00:00"))
    except ValueError:
        return None, {"ok": False, "reason": "signup_document_batch_invalid"}
    if expires_at <= datetime.now(timezone.utc):
        return None, {"ok": False, "reason": "signup_document_batch_expired"}
    if str(data.get("status") or "") not in {"prepared", "processing", "consumed"}:
        return None, {"ok": False, "reason": "signup_document_batch_not_available"}
    return {"id": batch_id, **data, "suppliedSecretHash": supplied_hash}, None


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


def normalize_identity_name(value: Any = "") -> str:
    normalized = str(value or "").lower()
    normalized = re.sub(r"[^a-z0-9\s]+", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def levenshtein_similarity(left: Any = "", right: Any = "") -> float:
    a = normalize_identity_name(left)
    b = normalize_identity_name(right)
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0

    distances = list(range(len(b) + 1))
    for left_index, left_char in enumerate(a, start=1):
        diagonal = distances[0]
        distances[0] = left_index
        for right_index, right_char in enumerate(b, start=1):
            above = distances[right_index]
            cost = 0 if left_char == right_char else 1
            distances[right_index] = min(
                distances[right_index] + 1,
                distances[right_index - 1] + 1,
                diagonal + cost,
            )
            diagonal = above
    return max(0.0, 1 - distances[len(b)] / max(len(a), len(b)))


def identity_name_tokens(value: Any = "") -> list[str]:
    return [token for token in normalize_identity_name(value).split(" ") if token]


def token_sorted_name(value: Any = "") -> str:
    return " ".join(sorted(identity_name_tokens(value)))


def token_overlap_similarity(left: Any = "", right: Any = "") -> float:
    left_tokens = set(identity_name_tokens(left))
    right_tokens = set(identity_name_tokens(right))
    token_count = max(len(left_tokens), len(right_tokens))
    if not token_count:
        return 0.0
    return len(left_tokens.intersection(right_tokens)) / token_count


def last_name_token(value: Any = "") -> str:
    tokens = identity_name_tokens(value)
    return tokens[-1] if tokens else ""


def build_person_name(record: dict[str, Any] | None = None) -> str:
    record = record or {}
    return re.sub(
        r"\s+",
        " ",
        str(
            record.get("fullName")
            or " ".join(
                str(record.get(key) or "").strip()
                for key in ["fname", "mname", "lname"]
                if str(record.get(key) or "").strip()
            )
        ),
    ).strip()


def is_similar_roster_name(roster_name: Any = "", submitted_name: Any = "") -> bool:
    expected = normalize_identity_name(roster_name)
    actual = normalize_identity_name(submitted_name)
    if not expected or not actual:
        return True
    if expected == actual:
        return True

    same_last_name = bool(last_name_token(expected) and last_name_token(expected) == last_name_token(actual))
    return bool(
        levenshtein_similarity(expected, actual) >= 0.72
        or levenshtein_similarity(token_sorted_name(expected), token_sorted_name(actual)) >= 0.72
        or (same_last_name and token_overlap_similarity(expected, actual) >= 0.5)
    )


def get_row_data(row: dict[str, Any] | None = None) -> dict[str, Any]:
    row = row or {}
    data = row.get("data")
    return data if isinstance(data, dict) else {}


def is_archived_roster_row(data: dict[str, Any]) -> bool:
    return bool(data.get("archived") is True or str(data.get("status") or "").strip().lower() == "archived")


def find_roster_identity_conflicts(student_id: str, student: dict[str, Any]) -> dict[str, Any]:
    submitted_name = build_person_name(student)
    rows_by_key: dict[str, dict[str, Any]] = {}
    checks = [
        {"data->>studentId": student_id},
        {"data->>studentnumber": student_id},
        {"data->>studentNumber": student_id},
    ]

    for filters in checks:
        result = supabase_select("grantor_portal_scholars", filters, limit=200)
        if not result.get("ok"):
            return {"ok": False, "reason": "roster_identity_check_failed", "result": result}
        for row in result.get("rows") or []:
            rows_by_key[f"{row.get('parent_id') or ''}:{row.get('id') or ''}"] = row

    conflicts = []
    for row in rows_by_key.values():
        data = get_row_data(row)
        if is_archived_roster_row(data):
            continue
        roster_student_id = normalize_student_id(
            data.get("studentId") or data.get("studentnumber") or data.get("studentNumber")
        )
        if roster_student_id != student_id:
            continue
        roster_name = build_person_name(data)
        if roster_name and not is_similar_roster_name(roster_name, submitted_name):
            conflicts.append({
                "studentId": student_id,
                "rosterName": roster_name,
                "submittedName": submitted_name,
                "grantorId": data.get("grantorId") or row.get("parent_id") or "",
                "grantorName": data.get("grantorName") or data.get("provider") or "",
                "scholarshipName": data.get("scholarshipTitle") or data.get("scholarshipName") or "",
            })

    return {"ok": True, "conflicts": conflicts}


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
    batch, batch_error = _load_signup_document_batch(payload)
    if batch_error:
        return batch_error
    document_scan = student.get("documentScan") or {}
    batch_documents = batch.get("documents") if isinstance(batch.get("documents"), dict) else {}
    cor_scan = ((batch_documents.get("cor") or {}).get("scan") or document_scan.get("cor") or {})
    rog_scan = ((batch_documents.get("rog") or {}).get("scan") or document_scan.get("rog") or document_scan.get("cog") or {})

    email = normalize_email(student.get("email"))
    cp_number = normalize_cp(student.get("cpNumber"))
    auth_email = normalize_email(auth.get("email"))
    cor_student_id = normalize_student_id(cor.get("studentId") or cor_scan.get("studentId"))
    current_cycle = get_current_semester_tag()
    previous_cycle = previous_semester_tag(current_cycle)
    cor_cycle = build_semester_tag(cor_scan or cor)
    rog_cycle = build_semester_tag(rog_scan)
    student_year = str(batch.get("year") or student.get("year") or cor_scan.get("year") or "").strip()
    is_first_year_first_cycle = student_year == "1" and current_cycle.endswith("-1ST")

    if not student_id:
        return {"ok": False, "reason": "missing_student_id"}
    if not email:
        return {"ok": False, "reason": "missing_email"}
    if batch.get("studentId") != student_id or normalize_email(batch.get("email")) != email:
        return {"ok": False, "reason": "signup_document_batch_identity_mismatch"}
    if str(student.get("year") or "") and _signup_year(student.get("year")) != str(batch.get("year") or ""):
        return {"ok": False, "reason": "cor_year_level_mismatch", "detectedYearLevel": batch.get("year")}
    if not (batch_documents.get("identity") or {}).get("path"):
        return {"ok": False, "reason": "missing_identity_document"}
    if str(batch.get("identityKind") or "") not in ({"student_id", "previous_school_id", "government_id"} if student_year == "1" else {"student_id"}):
        return {"ok": False, "reason": "identity_document_not_allowed"}
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
    policy_record = supabase_document_get("system_configuration", "document_policy")
    cor_mode = str((policy_record.get("data") or {}).get("corMode") or "cor_only")
    detected_cor_title = str(cor_scan.get("documentTitle") or "")
    if ((cor_mode == "cor_only" and detected_cor_title != "Certificate of Registration")
            or (cor_mode == "advising_only" and detected_cor_title != "Advising Slip")):
        return {
            "ok": False,
            "reason": "cor_policy_not_satisfied",
            "corMode": cor_mode,
            "detectedDocumentTitle": detected_cor_title,
        }
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

    roster_identity = find_roster_identity_conflicts(student_id, student)
    if not roster_identity.get("ok"):
        return {
            "ok": False,
            "reason": "roster_identity_check_failed",
            "result": roster_identity,
        }
    if roster_identity.get("conflicts"):
        return {
            "ok": False,
            "reason": "roster_student_name_mismatch",
            "message": "This student number already exists in a scholarship roster, but the submitted name does not match the roster closely enough. Use the correct roster name, visit the Office of the Scholarship with proof, or submit a Help ticket once available.",
            "studentId": student_id,
            "conflicts": roster_identity.get("conflicts"),
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
        "documentBatch": batch,
        "year": student_year,
        "cor": {
            "studentId": cor_student_id,
            "hash": cor_hash,
            "academicYear": academic_year,
            "semester": semester,
        },
    }


def _signup_submission_records(student_id: str, batch: dict[str, Any]) -> tuple[dict[str, Any], list[tuple[str, dict[str, Any]]]]:
    cycle = str(batch.get("academicCycle") or get_current_semester_tag())
    year = str(batch.get("year") or "")
    manual_review = batch.get("manualReviewEnabled") is not False
    status = "pending" if manual_review else "approved"
    now = utc_now_iso()
    requirements = {
        "academicCycle": cycle,
        "yearLevel": year,
        "semester": cycle.rsplit("-", 1)[-1],
        "rogRequired": bool(batch.get("rogRequired")),
        "rogExemptionReason": str(batch.get("rogExemptionReason") or ""),
        "identityRule": "alternative_photo_id_allowed" if year == "1" else "student_id_required",
        "corMode": _signup_document_policy()["corMode"],
    }
    documents = batch.get("documents") if isinstance(batch.get("documents"), dict) else {}
    records: list[tuple[str, dict[str, Any]]] = []
    compatibility: dict[str, Any] = {}
    verification: dict[str, Any] = {"academicCycle": cycle, "requirements": requirements}
    compatibility_keys = {"cor": "corFile", "rog": "rogFile", "identity": "schoolIdFile"}
    for document_type in ("cor", "rog", "identity"):
        document = documents.get(document_type) if isinstance(documents.get(document_type), dict) else None
        if not document:
            if document_type == "rog" and not requirements["rogRequired"]:
                verification["rog"] = {"status": "exempt", "exemptionReason": "first_year_first_semester"}
            continue
        submission_id = f"signup_document_{batch['id']}_{document_type}"
        submission = {
            "studentId": student_id,
            "academicCycle": cycle,
            "documentType": document_type,
            "documentKind": batch.get("identityKind") if document_type == "identity" else document_type,
            "version": 1,
            "status": status,
            "name": document.get("name") or f"{document_type}.pdf",
            "file": {key: document.get(key) for key in ("bucket", "path", "type", "size")},
            "scan": document.get("scan") or {},
            "source": "student_signup",
            "signupBatchId": batch["id"],
            "requirementsSnapshot": requirements,
            "submittedAt": now,
            "updatedAt": now,
        }
        if status == "approved":
            submission.update({"reviewedBy": "system", "reviewedAt": now, "reviewNotes": "Automatically approved under the active document policy."})
        records.append((submission_id, submission))
        file_summary = {
            "url": f"/student/profile/documents/{submission_id}/content",
            "path": document.get("path") or "",
            "bucket": document.get("bucket") or "",
            "name": submission["name"],
            "type": document.get("type") or "",
            "size": document.get("size") or 0,
            "uploadedAt": now,
            "semesterTag": cycle,
            "submissionId": submission_id,
            "documentKind": submission["documentKind"],
            "reviewStatus": status,
        }
        compatibility[compatibility_keys[document_type]] = file_summary
        verification[document_type] = {"submissionId": submission_id, "version": 1, "status": status, "reason": "", "fieldErrors": {}}
    verification.setdefault("cor", {"status": "missing"})
    verification.setdefault("identity", {"status": "missing"})
    verification.setdefault("profile", {"status": "missing"})
    if requirements["rogRequired"]:
        verification.setdefault("rog", {"status": "missing"})
    return {**compatibility, "documentVerification": verification}, records


def finalize_student_signup(payload: dict[str, Any]) -> dict[str, Any]:
    validation = validate_student_signup(payload)
    if not validation.get("ok"):
        return validation

    student_id = validation["studentId"]
    student = sanitize_student_payload(dict(payload.get("student") or {}))
    auth = payload.get("auth") or {}
    auth_result = None
    if auth.get("createUser") is True or auth.get("emailConfirm") is True:
        return {"ok": False, "reason": "automatic_email_confirmation_disabled"}
    if not str(auth.get("userId") or "").strip():
        return {"ok": False, "reason": "auth_user_id_required"}

    batch = validation.get("documentBatch") or {}
    if not batch.get("id"):
        return {"ok": False, "reason": "signup_document_batch_required"}
    claim = supabase_rpc("claim_signup_document_batch", {
        "p_batch_id": batch["id"],
        "p_secret_hash": batch.get("suppliedSecretHash") or "",
        "p_student_id": student_id,
        "p_email": validation["email"],
        "p_auth_user_id": str(auth.get("userId") or ""),
    })
    if not claim.get("ok"):
        return {"ok": False, "reason": claim.get("reason") or "signup_document_batch_claim_failed", "result": claim}
    claimed_batch = {"id": batch["id"], **(claim.get("data") or {})}
    if claimed_batch.get("status") == "consumed":
        for existing_table in ("pending_students", "students"):
            existing = supabase_document_get(existing_table, student_id)
            existing_data = existing.get("data") or {}
            if existing.get("row") and str(existing_data.get("authUserId") or "") == str(auth.get("userId") or ""):
                return {
                    "ok": True,
                    "idempotent": True,
                    "studentId": student_id,
                    "table": existing_table,
                    "student": existing,
                }
        return {"ok": False, "reason": "signup_document_batch_already_used"}

    student["email"] = validation["email"]
    student["cpNumber"] = validation["cpNumber"]
    student["studentnumber"] = student_id
    student["userType"] = "student"
    student["authUserId"] = auth.get("userId") or student.get("authUserId") or ""
    student["isValidated"] = False
    student["isPending"] = True
    student["validatedAt"] = None
    student["year"] = str(claimed_batch.get("year") or validation.get("year") or student.get("year") or "")
    student.setdefault("createdAt", utc_now_iso())
    student["updatedAt"] = utc_now_iso()

    document_patch, submission_records = _signup_submission_records(student_id, claimed_batch)
    student.update(document_patch)

    target_table = "pending_students"
    student_result = supabase_document_upsert(target_table, student_id, student, merge=False)
    if not student_result.get("ok"):
        return {"ok": False, "reason": "student_save_failed", "result": student_result}

    for submission_id, submission in submission_records:
        submission_result = supabase_document_upsert("student_document_submissions", submission_id, submission, merge=False)
        if not submission_result.get("ok"):
            return {"ok": False, "reason": "signup_document_submission_failed", "submissionId": submission_id, "result": submission_result}
        if submission.get("status") == "approved":
            review_id = f"review_{submission_id}_system"
            supabase_document_upsert("student_document_reviews", review_id, {
                "submissionId": submission_id,
                "studentId": student_id,
                "reviewerId": "system",
                "reviewerRole": "system",
                "decision": "approved",
                "reason": "",
                "notes": "Automatically approved under the active document policy.",
                "createdAt": submission.get("reviewedAt"),
            }, merge=False)
            create_log({
                "action": "student_document_auto_approved",
                "actorId": "system",
                "actorType": "system",
                "target": submission_id,
                "details": {"studentId": student_id, "source": "student_signup"},
                "createdAt": submission.get("reviewedAt"),
            })

    supabase_document_update("signup_document_batches", batch["id"], {
        "status": "consumed",
        "consumedAt": utc_now_iso(),
        "updatedAt": utc_now_iso(),
    })

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
