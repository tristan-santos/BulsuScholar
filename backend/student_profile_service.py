import base64
import hashlib
import io
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, Request, UploadFile
from fastapi.responses import Response
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from PIL import Image

try:
    from .access_control import enforce_portal_scope, require_admin_bearer
    from .document_scanner import parse_document, parse_pdf_document
    from .supabase_ops import (
        create_log,
        create_student_notification,
        supabase_document_get,
        supabase_document_insert,
        supabase_document_update,
        supabase_document_upsert,
        supabase_select,
    )
except ImportError:  # pragma: no cover
    from access_control import enforce_portal_scope, require_admin_bearer
    from document_scanner import parse_document, parse_pdf_document
    from supabase_ops import (
        create_log,
        create_student_notification,
        supabase_document_get,
        supabase_document_insert,
        supabase_document_update,
        supabase_document_upsert,
        supabase_select,
    )


PROFILE_FIELDS = {
    "fname", "mname", "lname", "extension", "email", "cpNumber", "birthDate",
    "guardianName", "guardianContact", "college", "course", "major", "year", "section",
    "profileImageUrl", "permanentAddress", "currentAddress",
}
DOCUMENT_TYPES = {"cor", "rog", "identity"}
ALLOWED_DOCUMENT_TYPES = {"application/pdf", "image/png", "image/jpeg", "image/webp"}
MAX_DOCUMENT_BYTES = 10 * 1024 * 1024


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _student_id(request: Request) -> str:
    payload: dict[str, Any] = {}
    enforce_portal_scope(request, payload, {"student"})
    return str(payload["actorId"])


def _reviewer(request: Request, *, full_admin: bool = False) -> tuple[str, dict[str, Any]]:
    admin_id = str(request.headers.get("x-portal-actor-id") or "").strip()
    _, record = require_admin_bearer(request, admin_id)
    role = str(record.get("role") or "")
    if full_admin and role != "full_admin":
        raise HTTPException(status_code=403, detail="full_admin_required")
    if not full_admin and role not in {"full_admin", "student_reviewer"}:
        raise HTTPException(status_code=403, detail="document_review_permission_required")
    return admin_id, record


def _cycle() -> tuple[str, str]:
    record = supabase_document_get("system_configuration", "academic_cycle")
    data = record.get("data") or {}
    semester = str(data.get("semester") or "").strip()
    tag = str(data.get("semesterTag") or "").strip()
    if not tag and data.get("academicYear") and semester:
        tag = f"{data['academicYear']}-{semester}"
    return tag or "unconfigured-cycle", semester


def _is_first_year(value: Any) -> bool:
    normalized = re.sub(r"[^a-z0-9]", "", str(value or "").lower())
    return normalized in {"1", "1st", "first", "firstyear", "year1"}


def _is_first_semester(value: Any, cycle: str = "") -> bool:
    normalized = re.sub(r"[^a-z0-9]", "", str(value or "").lower())
    cycle_normalized = re.sub(r"[^a-z0-9]", "", cycle.lower())
    return normalized in {"1", "1st", "first", "firstsemester", "semester1"} or cycle_normalized.endswith(("1st", "first", "semester1"))


def _require_student(student_id: str) -> dict[str, Any]:
    result = supabase_document_get("students", student_id)
    if not result.get("ok") or not result.get("row"):
        raise HTTPException(status_code=404, detail="student_not_found")
    return result.get("data") or {}


def _select(table: str, filters: dict[str, Any], limit: int = 500) -> list[dict[str, Any]]:
    result = supabase_select(table, filters, limit=limit)
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail=f"{table}_unavailable")
    return result.get("rows") or []


def _data_rows(table: str, filters: dict[str, Any], limit: int = 500) -> list[dict[str, Any]]:
    return [{"id": row.get("id"), **(row.get("data") or {})} for row in _select(table, filters, limit)]


def _policy() -> dict[str, Any]:
    data = (supabase_document_get("system_configuration", "document_policy").get("data") or {})
    mode = str(data.get("corMode") or "cor_only")
    return {**data, "corMode": mode if mode in {"cor_only", "advising_only", "either"} else "cor_only"}


def _requirements(student: dict[str, Any], cycle: str, semester: str) -> dict[str, Any]:
    rog_exempt = _is_first_year(student.get("year")) and _is_first_semester(semester, cycle)
    return {
        "academicCycle": cycle,
        "yearLevel": str(student.get("year") or ""),
        "semester": semester,
        "rogRequired": not rog_exempt,
        "rogExemptionReason": "first_year_first_semester" if rog_exempt else "",
        "identityRule": "alternative_photo_id_allowed" if _is_first_year(student.get("year")) else "student_id_required",
        "corMode": _policy()["corMode"],
    }


def _latest_by_type(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    output: dict[str, dict[str, Any]] = {}
    for row in sorted(rows, key=lambda item: (int(item.get("version") or 0), str(item.get("submittedAt") or "")), reverse=True):
        output.setdefault(str(row.get("documentType") or ""), row)
    return output


def _storage_config() -> tuple[str, str, str]:
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    bucket = os.getenv("SUPABASE_STORAGE_BUCKET", "bulsuscholar")
    if not url or not key:
        raise HTTPException(status_code=503, detail="storage_unavailable")
    return url, key, bucket


def _store_bytes(path: str, body: bytes, content_type: str) -> dict[str, Any]:
    url, key, bucket = _storage_config()
    request = urllib.request.Request(
        f"{url}/storage/v1/object/{urllib.parse.quote(bucket)}/{urllib.parse.quote(path, safe='/')}",
        data=body,
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": content_type, "x-upsert": "false"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30):
            return {"bucket": bucket, "path": path, "type": content_type, "size": len(body)}
    except urllib.error.HTTPError as error:
        raise HTTPException(status_code=503, detail="document_storage_failed") from error


def _read_storage(reference: dict[str, Any]) -> bytes:
    url, key, default_bucket = _storage_config()
    bucket = str(reference.get("bucket") or default_bucket)
    path = str(reference.get("path") or "")
    if not path:
        raise HTTPException(status_code=404, detail="document_file_not_found")
    request = urllib.request.Request(
        f"{url}/storage/v1/object/{urllib.parse.quote(bucket)}/{urllib.parse.quote(path, safe='/')}",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        raise HTTPException(status_code=404, detail="document_file_not_found") from error


def _decode_signature(value: str) -> bytes:
    match = re.fullmatch(r"data:image/(png|jpeg);base64,([A-Za-z0-9+/=\r\n]+)", str(value or ""))
    if not match:
        raise HTTPException(status_code=422, detail="signature_required")
    try:
        body = base64.b64decode(match.group(2), validate=True)
    except ValueError as error:
        raise HTTPException(status_code=422, detail="invalid_signature") from error
    if not body or len(body) > 2 * 1024 * 1024:
        raise HTTPException(status_code=422, detail="invalid_signature")
    try:
        source = Image.open(io.BytesIO(body))
        source.verify()
        source = Image.open(io.BytesIO(body)).convert("RGBA")
        output = io.BytesIO()
        source.save(output, format="PNG", optimize=True)
        normalized = output.getvalue()
    except Exception as error:
        raise HTTPException(status_code=422, detail="invalid_signature_image") from error
    if not normalized or len(normalized) > 2 * 1024 * 1024:
        raise HTTPException(status_code=422, detail="invalid_signature")
    return normalized


def _address_text(address: dict[str, Any]) -> str:
    return ", ".join(str(address.get(key) or "").strip() for key in ("street", "barangay", "city", "province", "postalCode") if str(address.get(key) or "").strip())


def _profile_photo_bytes(profile: dict[str, Any]) -> bytes | None:
    raw_url = str(profile.get("profileImageUrl") or "").strip()
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not raw_url or not supabase_url or not service_key:
        return None
    source = urllib.parse.urlparse(raw_url)
    expected = urllib.parse.urlparse(supabase_url)
    if source.scheme != "https" or source.netloc != expected.netloc:
        return None
    marker = "/storage/v1/object/public/"
    if marker not in source.path:
        return None
    object_reference = source.path.split(marker, 1)[1]
    if "/" not in object_reference:
        return None
    bucket, path = object_reference.split("/", 1)
    try:
        request = urllib.request.Request(
            f"{supabase_url}/storage/v1/object/{urllib.parse.quote(bucket)}/{urllib.parse.quote(path, safe='/')}",
            headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"},
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            body = response.read(5 * 1024 * 1024 + 1)
        return body if 0 < len(body) <= 5 * 1024 * 1024 else None
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError):
        return None


def _validate_profile(profile: dict[str, Any]) -> None:
    required = ("fname", "lname", "email", "cpNumber", "birthDate", "guardianName", "guardianContact", "course", "year", "section")
    missing = [key for key in required if not str(profile.get(key) or "").strip()]
    address = profile.get("permanentAddress") if isinstance(profile.get("permanentAddress"), dict) else {}
    missing.extend(f"permanentAddress.{key}" for key in ("street", "barangay", "city", "province", "postalCode") if not str(address.get(key) or "").strip())
    if missing:
        raise HTTPException(status_code=422, detail={"code": "profile_incomplete", "fields": missing})


def _profile_pdf(
    profile: dict[str, Any],
    signature: bytes,
    scholarship: dict[str, Any] | None = None,
    *,
    preview: bool = False,
) -> bytes:
    output = io.BytesIO()
    pdf = canvas.Canvas(output, pagesize=letter)
    width, height = letter
    pdf.setFillColorRGB(0, 0.31, 0.19)
    pdf.rect(0, height - 18, width, 18, fill=1, stroke=0)
    pdf.setFillColorRGB(0, 0, 0)
    if preview:
        pdf.saveState()
        pdf.setFillColorRGB(0.82, 0.86, 0.84)
        pdf.setFont("Helvetica-Bold", 42)
        pdf.translate(width / 2, height / 2)
        pdf.rotate(35)
        pdf.drawCentredString(0, 0, "DRAFT PREVIEW")
        pdf.restoreState()
    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawCentredString(width / 2, height - 44, "SCHOLARSHIP AND FINANCIAL ASSISTANCE")
    pdf.drawCentredString(width / 2, height - 62, "APPLICANT'S PROFILE")
    photo = _profile_photo_bytes(profile)
    if photo:
        try:
            pdf.drawImage(ImageReader(io.BytesIO(photo)), width - 112, height - 145, width=64, height=64, preserveAspectRatio=True, mask="auto")
        except Exception:
            photo = None
    if not photo:
        pdf.rect(width - 112, height - 145, 64, 64, fill=0, stroke=1)
        pdf.setFont("Helvetica", 7)
        pdf.drawCentredString(width - 80, height - 116, "STUDENT PHOTO")
    y = height - 165
    fields = [
        ("NAME", " ".join(str(profile.get(k) or "").strip() for k in ("lname", "fname", "mname", "extension") if str(profile.get(k) or "").strip())),
        ("CONTACT NO.", profile.get("cpNumber")), ("EMAIL ADDRESS", profile.get("email")),
        ("PERMANENT ADDRESS", _address_text(profile.get("permanentAddress") or {})),
        ("CURRENT ADDRESS", _address_text(profile.get("currentAddress") or {}) or "Not provided"),
        ("DATE OF BIRTH", profile.get("birthDate")), ("LEGAL GUARDIAN", profile.get("guardianName")),
        ("GUARDIAN CONTACT", profile.get("guardianContact")),
        ("COLLEGE / PROGRAM", " / ".join(filter(None, [str(profile.get("college") or ""), str(profile.get("course") or ""), str(profile.get("major") or "")]))),
        ("SECTION AND YEAR", " / ".join(filter(None, [str(profile.get("section") or ""), str(profile.get("year") or "")]))),
    ]
    if scholarship:
        fields.extend([
            ("SCHOLARSHIP-GRANTING ENTITY", scholarship.get("grantorName") or ""),
            ("SCHOLARSHIP / ASSISTANCE", scholarship.get("scholarshipName") or ""),
            ("GRANTOR OFFICE", scholarship.get("officeAddress") or ""),
            ("GRANTOR CONTACT", scholarship.get("contactNumber") or ""),
            ("ASSISTANCE TYPE", scholarship.get("assistanceType") or ""),
        ])
    for label, value in fields:
        pdf.setFont("Helvetica-Bold", 8)
        pdf.drawString(48, y, label)
        pdf.setFont("Helvetica", 9)
        pdf.drawString(170, y, str(value or "")[:75])
        pdf.line(168, y - 3, width - 48, y - 3)
        y -= 28
    pdf.setFont("Helvetica", 8)
    attestation = "I attest that the information supplied in this profile is true and complete."
    pdf.drawString(48, y - 8, attestation)
    try:
        pdf.drawImage(ImageReader(io.BytesIO(signature)), 48, y - 65, width=150, height=48, preserveAspectRatio=True, mask="auto")
    except Exception as error:
        raise HTTPException(status_code=422, detail="invalid_signature_image") from error
    pdf.line(48, y - 68, 220, y - 68)
    pdf.setFont("Helvetica", 7)
    pdf.drawString(48, y - 78, "APPLICANT'S SIGNATURE")
    pdf.drawRightString(width - 48, y - 78, f"Submitted: {_now()}")
    pdf.setFillColorRGB(0.3, 0.35, 0.4)
    pdf.drawString(48, 24, "BulsuScholar official application profile export")
    pdf.save()
    return output.getvalue()


def _notify_once(student_id: str, cycle: str, event_key: str, title: str, message: str, route: str) -> None:
    stable = hashlib.sha256(f"{student_id}:{cycle}:{event_key}".encode("utf-8")).hexdigest()[:32]
    record_id = f"next_action_{stable}"
    if supabase_document_get("student_next_action_events", record_id).get("row"):
        return
    event = {"studentId": student_id, "academicCycle": cycle, "eventKey": event_key, "createdAt": _now()}
    inserted = supabase_document_upsert("student_next_action_events", record_id, event, merge=False)
    if inserted.get("ok"):
        create_student_notification({
            "studentId": student_id, "source": "personal", "type": "document_next_action",
            "title": title, "message": message, "route": route, "read": False, "createdAt": _now(),
        })


def _verification_summary(student_id: str, cycle: str, requirements: dict[str, Any]) -> dict[str, Any]:
    rows = _data_rows("student_document_submissions", {"data->>studentId": student_id, "data->>academicCycle": cycle})
    latest = _latest_by_type(rows)
    summary: dict[str, Any] = {"academicCycle": cycle, "requirements": requirements}
    for document_type in ("cor", "rog", "identity", "profile"):
        row = latest.get(document_type) or {}
        summary[document_type] = {
            "submissionId": row.get("id") or "", "version": row.get("version") or 0,
            "status": row.get("status") or "missing", "reason": row.get("rejectionReason") or "",
            "fieldErrors": row.get("fieldErrors") if isinstance(row.get("fieldErrors"), dict) else {},
        }
    if not requirements["rogRequired"]:
        summary["rog"] = {"status": "exempt", "exemptionReason": "first_year_first_semester"}
    return summary


def _sync_verification(student_id: str, student: dict[str, Any], cycle: str, semester: str) -> dict[str, Any]:
    requirements = _requirements(student, cycle, semester)
    summary = _verification_summary(student_id, cycle, requirements)
    result = supabase_document_update("students", student_id, {"documentVerification": summary, "updatedAt": _now()})
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail="document_verification_sync_failed")
    return summary


def _notify_next_requirement(student_id: str, cycle: str, summary: dict[str, Any]) -> None:
    labels = {"cor": "Certificate of Registration", "rog": "Report of Grades", "identity": "identity document", "profile": "Student Application Profile"}
    for key in ("cor", "rog", "identity", "profile"):
        state = summary.get(key) or {}
        if state.get("status") not in {"approved", "exempt"}:
            action = "correct and resubmit" if state.get("status") == "rejected" else "submit" if state.get("status") == "missing" else "wait for review of"
            _notify_once(
                student_id, cycle,
                f"next:{key}:{state.get('submissionId') or state.get('status')}",
                f"Next: {labels[key]}",
                f"Please {action} your {labels[key]}.",
                f"/student-dashboard/profile#{key}",
            )
            return
    _notify_once(
        student_id, cycle, "next:tracking:documents-approved",
        "Documents approved",
        "All required documents are approved. Continue from your scholarship tracking page.",
        "/student-dashboard/scholarships",
    )


def _seed_profile(student: dict[str, Any]) -> dict[str, Any]:
    permanent = student.get("permanentAddress") if isinstance(student.get("permanentAddress"), dict) else {
        "street": student.get("street") or "", "barangay": student.get("barangay") or "",
        "city": student.get("city") or "", "province": student.get("province") or "",
        "postalCode": student.get("postalCode") or "",
    }
    return {key: student.get(key, "") for key in PROFILE_FIELDS if key not in {"permanentAddress", "currentAddress"}} | {
        "permanentAddress": permanent, "currentAddress": student.get("currentAddress") or {},
    }


def _derive_college(course: str) -> str:
    value = str(course or "").lower()
    if "information technology" in value:
        return "CICS"
    if "business" in value or "entrepreneurship" in value:
        return "CBA"
    if "engineering" in value:
        return "COE"
    if "education" in value:
        return "COED"
    if "industrial technology" in value:
        return "CIT"
    return ""


def get_student_profile_workspace(request: Request) -> dict[str, Any]:
    student_id = _student_id(request)
    student = _require_student(student_id)
    cycle, semester = _cycle()
    draft_record = supabase_document_get("student_profile_drafts", student_id)
    draft = draft_record.get("data") if draft_record.get("row") else _seed_profile(student)
    submissions = _data_rows("student_document_submissions", {"data->>studentId": student_id, "data->>academicCycle": cycle})
    revisions = _data_rows("student_profile_revisions", {"data->>studentId": student_id}, limit=100)
    summary = _sync_verification(student_id, student, cycle, semester)
    return {
        "ok": True, "student": student, "draft": draft, "academicCycle": cycle,
        "requirements": summary["requirements"], "verification": summary,
        "submissions": sorted(submissions, key=lambda item: str(item.get("submittedAt") or ""), reverse=True),
        "revisions": sorted(revisions, key=lambda item: int(item.get("version") or 0), reverse=True),
        "policy": _policy(),
    }


def save_student_profile_draft(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    student_id = _student_id(request)
    student = _require_student(student_id)
    supplied = payload.get("profile") if isinstance(payload.get("profile"), dict) else {}
    profile = {**_seed_profile(student), **{key: supplied.get(key) for key in PROFILE_FIELDS if key in supplied}}
    profile["college"] = str(profile.get("college") or _derive_college(str(profile.get("course") or "")))
    profile["studentId"] = student_id
    profile["status"] = "draft"
    profile["updatedAt"] = _now()
    result = supabase_document_upsert("student_profile_drafts", student_id, profile, merge=False)
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail="profile_draft_save_failed")
    compatibility = {key: profile.get(key) for key in PROFILE_FIELDS if key not in {"currentAddress", "permanentAddress"}}
    permanent = profile.get("permanentAddress") or {}
    compatibility.update({
        "permanentAddress": permanent, "currentAddress": profile.get("currentAddress") or {},
        "street": permanent.get("street") or "", "barangay": permanent.get("barangay") or "",
        "city": permanent.get("city") or "", "province": permanent.get("province") or "",
        "postalCode": permanent.get("postalCode") or "", "updatedAt": _now(),
    })
    supabase_document_update("students", student_id, compatibility)
    return {"ok": True, "draft": profile}


def preview_student_profile(request: Request, payload: dict[str, Any]) -> Response:
    student_id = _student_id(request)
    student = _require_student(student_id)
    supplied = payload.get("profile") if isinstance(payload.get("profile"), dict) else {}
    profile = {**_seed_profile(student), **{key: supplied.get(key) for key in PROFILE_FIELDS if key in supplied}}
    profile["college"] = str(profile.get("college") or _derive_college(str(profile.get("course") or "")))
    transparent_signature = io.BytesIO()
    Image.new("RGBA", (2, 2), (255, 255, 255, 0)).save(transparent_signature, format="PNG")
    pdf = _profile_pdf(profile, transparent_signature.getvalue(), preview=True)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="Student_Application_Profile_Draft.pdf"'},
    )


def submit_student_profile(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    student_id = _student_id(request)
    student = _require_student(student_id)
    cycle, semester = _cycle()
    draft = supabase_document_get("student_profile_drafts", student_id).get("data") or _seed_profile(student)
    _validate_profile(draft)
    signature = _decode_signature(str(payload.get("signatureDataUrl") or ""))
    existing = _data_rows("student_profile_revisions", {"data->>studentId": student_id, "data->>academicCycle": cycle})
    version = max([int(item.get("version") or 0) for item in existing] or [0]) + 1
    revision_id = f"profile_{student_id}_{cycle}_{version}_{uuid4().hex[:8]}"
    signature_ref = _store_bytes(f"students/{student_id}/profile-revisions/{revision_id}-signature.png", signature, "image/png")
    pdf_bytes = _profile_pdf(draft, signature)
    pdf_ref = _store_bytes(f"students/{student_id}/profile-revisions/{revision_id}.pdf", pdf_bytes, "application/pdf")
    revision = {
        "studentId": student_id, "academicCycle": cycle, "version": version, "status": "pending",
        "profile": draft, "signature": signature_ref, "pdf": pdf_ref,
        "requirementsSnapshot": _requirements(student, cycle, semester), "submittedAt": _now(), "updatedAt": _now(),
    }
    if not supabase_document_upsert("student_profile_revisions", revision_id, revision, merge=False).get("ok"):
        raise HTTPException(status_code=503, detail="profile_submission_failed")
    submission_id = f"document_{revision_id}"
    submission = {
        "studentId": student_id, "academicCycle": cycle, "documentType": "profile", "version": version,
        "status": "pending", "name": f"Student_Application_Profile_v{version}.pdf", "file": pdf_ref,
        "profileRevisionId": revision_id, "requirementsSnapshot": revision["requirementsSnapshot"],
        "submittedAt": _now(), "updatedAt": _now(),
    }
    supabase_document_upsert("student_document_submissions", submission_id, submission, merge=False)
    profile_file = {
        "url": f"/student/profile/documents/{submission_id}/content", **pdf_ref,
        "name": submission["name"], "uploadedAt": submission["submittedAt"],
        "semesterTag": cycle, "submissionId": submission_id, "reviewStatus": "pending",
        "profileRevisionId": revision_id,
    }
    supabase_document_update("students", student_id, {
        "scholarshipApplicationFile": profile_file,
        "applicationFormFile": profile_file,
        "updatedAt": _now(),
    })
    supabase_document_update("student_profile_drafts", student_id, {"status": "submitted", "submittedRevisionId": revision_id})
    _sync_verification(student_id, student, cycle, semester)
    _notify_once(student_id, cycle, f"profile:{submission_id}:pending", "Profile submitted", "Your Student Application Profile is waiting for document review.", "/student-dashboard/profile#application-profile")
    return {"ok": True, "revision": {"id": revision_id, **revision}, "submission": {"id": submission_id, **submission}}


async def upload_student_document(request: Request, document_type: str, file: UploadFile, document_kind: str = "") -> dict[str, Any]:
    student_id = _student_id(request)
    student = _require_student(student_id)
    if document_type not in DOCUMENT_TYPES:
        raise HTTPException(status_code=422, detail="invalid_document_type")
    body = await file.read()
    content_type = str(file.content_type or "").lower()
    if not body or len(body) > MAX_DOCUMENT_BYTES or content_type not in ALLOWED_DOCUMENT_TYPES:
        raise HTTPException(status_code=422, detail="invalid_document_file")
    cycle, semester = _cycle()
    requirements = _requirements(student, cycle, semester)
    scan: dict[str, Any] = {}
    if document_type in {"cor", "rog"}:
        if content_type != "application/pdf":
            raise HTTPException(status_code=415, detail="pdf_required")
        scan = parse_pdf_document(body, "cor" if document_type == "cor" else "cog")
        if document_type == "cor":
            detected = str(scan.get("documentTitle") or "")
            kind = "advising_slip" if detected == "Advising Slip" else "cor"
            mode = requirements["corMode"]
            if not scan.get("isValidCorDocument") or (mode == "cor_only" and kind != "cor") or (mode == "advising_only" and kind != "advising_slip"):
                exception = _data_rows("student_document_exceptions", {
                    "data->>studentId": student_id, "data->>academicCycle": cycle,
                    "data->>exceptionType": "advising_slip", "data->>status": "active",
                }, limit=1)
                if not (kind == "advising_slip" and exception):
                    raise HTTPException(status_code=422, detail="cor_policy_not_satisfied")
            document_kind = kind
        elif not scan.get("isValidCogDocument"):
            raise HTTPException(status_code=422, detail="invalid_rog_document")
    if document_type == "identity":
        permitted = {"student_id", "previous_school_id", "government_id"} if _is_first_year(student.get("year")) else {"student_id"}
        if document_kind not in permitted:
            exception = _data_rows("student_document_exceptions", {
                "data->>studentId": student_id, "data->>academicCycle": cycle,
                "data->>exceptionType": "lost_student_id", "data->>status": "active",
            }, limit=1)
            if not exception:
                raise HTTPException(status_code=422, detail="identity_document_not_allowed")
    existing = _data_rows("student_document_submissions", {
        "data->>studentId": student_id, "data->>academicCycle": cycle, "data->>documentType": document_type,
    })
    version = max([int(item.get("version") or 0) for item in existing] or [0]) + 1
    submission_id = f"document_{student_id}_{cycle}_{document_type}_{version}_{uuid4().hex[:8]}"
    extension = os.path.splitext(file.filename or "document")[1].lower() or (".pdf" if content_type == "application/pdf" else ".png")
    reference = _store_bytes(f"students/{student_id}/verified-documents/{cycle}/{submission_id}{extension}", body, content_type)
    submission = {
        "studentId": student_id, "academicCycle": cycle, "documentType": document_type,
        "documentKind": document_kind or document_type, "version": version, "status": "pending",
        "name": file.filename or f"{document_type}{extension}", "file": reference, "scan": scan,
        "requirementsSnapshot": requirements, "submittedAt": _now(), "updatedAt": _now(),
    }
    supabase_document_upsert("student_document_submissions", submission_id, submission, merge=False)
    compatibility_key = {"cor": "corFile", "rog": "cogFile", "identity": "schoolIdFile"}[document_type]
    compatibility = {
        "url": f"/student/profile/documents/{submission_id}/content", "path": reference["path"], "bucket": reference["bucket"],
        "name": submission["name"], "type": content_type, "size": len(body), "uploadedAt": submission["submittedAt"],
        "semesterTag": cycle, "submissionId": submission_id, "reviewStatus": "pending",
    }
    supabase_document_update("students", student_id, {compatibility_key: compatibility, "updatedAt": _now()})
    _sync_verification(student_id, student, cycle, semester)
    _notify_once(student_id, cycle, f"{document_type}:{submission_id}:pending", f"{document_type.upper()} submitted", "Your document is waiting for review.", f"/student-dashboard/profile#{document_type}")
    return {"ok": True, "submission": {"id": submission_id, **submission}}


def list_document_review_queue(request: Request, status: str = "", document_type: str = "", academic_cycle: str = "") -> dict[str, Any]:
    _reviewer(request)
    filters: dict[str, Any] = {}
    if status: filters["data->>status"] = status
    if document_type: filters["data->>documentType"] = document_type
    if academic_cycle: filters["data->>academicCycle"] = academic_cycle
    submissions = _data_rows("student_document_submissions", filters, limit=1000)
    students: dict[str, dict[str, Any]] = {}
    for item in submissions:
        student_id = str(item.get("studentId") or "")
        if student_id not in students:
            students[student_id] = supabase_document_get("students", student_id).get("data") or {}
        student = students[student_id]
        item["studentName"] = " ".join(str(student.get(key) or "").strip() for key in ("fname", "mname", "lname") if str(student.get(key) or "").strip())
        item["yearLevel"] = student.get("year")
        item["course"] = student.get("course")
    submissions.sort(key=lambda item: str(item.get("submittedAt") or ""))
    return {"ok": True, "submissions": submissions, "policy": _policy()}


def review_document_submission(request: Request, submission_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    reviewer_id, reviewer = _reviewer(request)
    decision = str(payload.get("decision") or "").lower()
    reason = str(payload.get("reason") or "").strip()
    if decision not in {"approved", "rejected"} or (decision == "rejected" and not reason):
        raise HTTPException(status_code=422, detail="review_decision_and_reason_required")
    current = supabase_document_get("student_document_submissions", submission_id)
    if not current.get("row"):
        raise HTTPException(status_code=404, detail="document_submission_not_found")
    submission = current.get("data") or {}
    submission["id"] = submission_id
    if submission.get("status") != "pending":
        raise HTTPException(status_code=409, detail="document_already_reviewed")
    reviewed_at = _now()
    update = {
        "status": decision, "rejectionReason": reason if decision == "rejected" else "",
        "reviewNotes": str(payload.get("notes") or "").strip(),
        "fieldErrors": payload.get("fieldErrors") if isinstance(payload.get("fieldErrors"), dict) else {},
        "reviewedBy": reviewer_id, "reviewedAt": reviewed_at, "updatedAt": reviewed_at,
    }
    if not supabase_document_update("student_document_submissions", submission_id, update).get("ok"):
        raise HTTPException(status_code=503, detail="document_review_save_failed")
    review_id = f"review_{submission_id}_{uuid4().hex[:8]}"
    supabase_document_upsert("student_document_reviews", review_id, {
        "submissionId": submission_id, "studentId": submission.get("studentId"), "reviewerId": reviewer_id,
        "reviewerRole": reviewer.get("role"), "decision": decision, "reason": reason,
        "notes": update["reviewNotes"], "fieldErrors": update["fieldErrors"], "createdAt": reviewed_at,
    }, merge=False)
    if submission.get("profileRevisionId"):
        supabase_document_update("student_profile_revisions", str(submission["profileRevisionId"]), update)
    student_id = str(submission.get("studentId") or "")
    student = _require_student(student_id)
    cycle, semester = _cycle()
    summary = _sync_verification(student_id, student, cycle, semester)
    compatibility_key = {"cor": "corFile", "rog": "cogFile", "identity": "schoolIdFile"}.get(str(submission.get("documentType")))
    if compatibility_key:
        old_file = student.get(compatibility_key) if isinstance(student.get(compatibility_key), dict) else {}
        if old_file.get("submissionId") == submission_id:
            supabase_document_update("students", student_id, {compatibility_key: {**old_file, "reviewStatus": decision, "rejectionReason": reason}})
    if submission.get("documentType") == "profile" and decision == "approved":
        _create_application_snapshots(student_id, submission, str(submission.get("profileRevisionId") or ""))
    title = "Document approved" if decision == "approved" else "Document needs correction"
    message = f"Your {str(submission.get('documentType') or 'document').replace('_', ' ')} was approved." if decision == "approved" else f"Your document was rejected: {reason}. Upload a corrected copy."
    _notify_once(student_id, str(submission.get("academicCycle") or cycle), f"{submission_id}:{decision}", title, message, f"/student-dashboard/profile#{submission.get('documentType')}")
    _notify_next_requirement(student_id, str(submission.get("academicCycle") or cycle), summary)
    create_log({"action": "student_document_reviewed", "actorId": reviewer_id, "actorType": "admin", "target": submission_id, "details": {"decision": decision, "studentId": student_id}, "createdAt": reviewed_at})
    return {"ok": True, "submission": {"id": submission_id, **submission, **update}, "verification": summary}


def _create_application_snapshots(student_id: str, submission: dict[str, Any], revision_id: str) -> None:
    applications = _data_rows("scholarship_applications", {"data->>studentId": student_id}, limit=500)
    revision = supabase_document_get("student_profile_revisions", revision_id).get("data") or {}
    signature = _read_storage(revision.get("signature") or {})
    for application in applications:
        status = str(application.get("status") or "").lower()
        if status in {"rejected", "denied", "cancelled", "withdrawn", "expired", "resolved"}:
            continue
        _snapshot_revision_for_application(student_id, application, revision_id, revision, signature)


def _snapshot_revision_for_application(
    student_id: str,
    application: dict[str, Any],
    revision_id: str,
    revision: dict[str, Any],
    signature: bytes,
) -> None:
    application_id = str(application.get("id") or "")
    if not application_id:
        return
    snapshot_id = f"profile_snapshot_{application_id}_{revision_id}"
    scholarship = {
        "grantorId": application.get("grantorId"),
        "grantorName": application.get("grantorName") or application.get("providerLabel") or "",
        "scholarshipName": application.get("scholarshipTitle") or application.get("scholarshipName") or "",
        "officeAddress": application.get("grantorOfficeAddress") or application.get("officeAddress") or "",
        "contactNumber": application.get("grantorContactNumber") or application.get("contactNumber") or "",
        "assistanceType": application.get("grantorClassification") or application.get("providerType") or "",
    }
    snapshot_pdf = _profile_pdf(revision.get("profile") or {}, signature, scholarship)
    snapshot_pdf_ref = _store_bytes(
        f"students/{student_id}/application-profile-snapshots/{snapshot_id}.pdf",
        snapshot_pdf,
        "application/pdf",
    )
    snapshot = {
        "studentId": student_id, "applicationId": application_id, "profileRevisionId": revision_id,
        "academicCycle": revision.get("academicCycle"), "profile": revision.get("profile") or {},
        "scholarship": scholarship,
        "pdf": snapshot_pdf_ref, "createdAt": _now(),
    }
    supabase_document_upsert("student_profile_application_snapshots", snapshot_id, snapshot, merge=False)
    pdf_ref = snapshot_pdf_ref
    supabase_document_update("scholarship_applications", application_id, {
        "applicationFormFile": {"url": f"/student/profile/snapshots/{snapshot_id}/content", **pdf_ref, "semesterTag": revision.get("academicCycle"), "profileRevisionId": revision_id},
        "profileRevisionId": revision_id,
    })


def attach_approved_profile_to_application(student_id: str, application_id: str) -> bool:
    cycle, _ = _cycle()
    revisions = _data_rows("student_profile_revisions", {
        "data->>studentId": student_id,
        "data->>academicCycle": cycle,
        "data->>status": "approved",
    }, limit=100)
    if not revisions:
        return False
    revision = sorted(revisions, key=lambda item: int(item.get("version") or 0), reverse=True)[0]
    application_record = supabase_document_get("scholarship_applications", application_id)
    if not application_record.get("row"):
        return False
    application = {"id": application_id, **(application_record.get("data") or {})}
    signature = _read_storage(revision.get("signature") or {})
    _snapshot_revision_for_application(student_id, application, str(revision["id"]), revision, signature)
    return True


def profile_snapshot_content(request: Request, snapshot_id: str) -> Response:
    actor_id = str(request.headers.get("x-portal-actor-id") or "").strip()
    actor_type = str(request.headers.get("x-portal-actor-type") or "").strip().lower()
    record = supabase_document_get("student_profile_application_snapshots", snapshot_id)
    if not record.get("row"):
        raise HTTPException(status_code=404, detail="profile_snapshot_not_found")
    snapshot = record.get("data") or {}
    if actor_type == "student":
        _student_id(request)
        if actor_id != str(snapshot.get("studentId") or ""):
            raise HTTPException(status_code=403, detail="document_owner_mismatch")
    elif actor_type == "admin":
        _reviewer(request)
    elif actor_type in {"grantor", "provider"}:
        identity: dict[str, Any] = {}
        enforce_portal_scope(request, identity, {"grantor"})
        if actor_id != str((snapshot.get("scholarship") or {}).get("grantorId") or ""):
            raise HTTPException(status_code=403, detail="document_access_denied")
    else:
        raise HTTPException(status_code=403, detail="document_access_denied")
    body = _read_storage(snapshot.get("pdf") or {})
    return Response(content=body, media_type="application/pdf", headers={"Content-Disposition": "inline; filename=\"Student_Application_Profile.pdf\""})


def document_content(request: Request, submission_id: str) -> Response:
    actor_id = str(request.headers.get("x-portal-actor-id") or "").strip()
    actor_type = str(request.headers.get("x-portal-actor-type") or "").strip().lower()
    record = supabase_document_get("student_document_submissions", submission_id)
    if not record.get("row"):
        raise HTTPException(status_code=404, detail="document_submission_not_found")
    submission = record.get("data") or {}
    if actor_type == "student":
        _student_id(request)
        if actor_id != str(submission.get("studentId") or ""):
            raise HTTPException(status_code=403, detail="document_owner_mismatch")
    elif actor_type == "admin":
        _reviewer(request)
    elif actor_type in {"grantor", "provider"}:
        identity: dict[str, Any] = {}
        enforce_portal_scope(request, identity, {"grantor"})
        if submission.get("status") != "approved":
            raise HTTPException(status_code=403, detail="document_not_approved")
        applications = _data_rows("scholarship_applications", {
            "data->>studentId": str(submission.get("studentId") or ""),
            "data->>grantorId": actor_id,
        }, limit=1)
        if not applications:
            raise HTTPException(status_code=403, detail="document_access_denied")
    else:
        raise HTTPException(status_code=403, detail="document_access_denied")
    body = _read_storage(submission.get("file") or {})
    return Response(content=body, media_type=str((submission.get("file") or {}).get("type") or "application/octet-stream"), headers={"Content-Disposition": f"inline; filename=\"{submission.get('name') or 'document'}\""})


def update_document_policy(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    reviewer_id, _ = _reviewer(request, full_admin=True)
    mode = str(payload.get("corMode") or "")
    if mode not in {"cor_only", "advising_only", "either"}:
        raise HTTPException(status_code=422, detail="invalid_cor_mode")
    data = {**_policy(), "corMode": mode, "updatedBy": reviewer_id, "updatedAt": _now()}
    supabase_document_upsert("system_configuration", "document_policy", data, merge=False)
    create_log({"action": "document_policy_updated", "actorId": reviewer_id, "actorType": "admin", "target": "document_policy", "details": {"corMode": mode}, "createdAt": _now()})
    return {"ok": True, "policy": data}


def create_document_exception(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    reviewer_id, _ = _reviewer(request, full_admin=True)
    student_id = str(payload.get("studentId") or "").strip()
    exception_type = str(payload.get("exceptionType") or "")
    reason = str(payload.get("reason") or "").strip()
    if not student_id or exception_type not in {"advising_slip", "lost_student_id"} or not reason:
        raise HTTPException(status_code=422, detail="invalid_document_exception")
    _require_student(student_id)
    cycle, _ = _cycle()
    record_id = f"exception_{student_id}_{cycle}_{exception_type}_{uuid4().hex[:8]}"
    data = {"studentId": student_id, "academicCycle": cycle, "exceptionType": exception_type, "status": "active", "reason": reason, "reviewerId": reviewer_id, "createdAt": _now()}
    supabase_document_upsert("student_document_exceptions", record_id, data, merge=False)
    create_log({"action": "student_document_exception_created", "actorId": reviewer_id, "actorType": "admin", "target": student_id, "details": {"exceptionType": exception_type, "reason": reason}, "createdAt": _now()})
    return {"ok": True, "exception": {"id": record_id, **data}}
