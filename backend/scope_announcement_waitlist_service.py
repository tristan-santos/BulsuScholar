"""Server-owned scope, applicant reporting, announcement targeting, and waitlist workflows."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import re
import secrets
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, Request

try:
    from .access_control import enforce_portal_scope, require_admin_bearer
    from .report_service import build_report_pdf_bytes
    from .supabase_ops import (
        create_student_notification,
        supabase_document_get,
        supabase_document_upsert,
        supabase_rest_insert,
        supabase_rest_upsert_many,
        supabase_rpc,
        supabase_select,
    )
except ImportError:  # pragma: no cover
    from access_control import enforce_portal_scope, require_admin_bearer
    from report_service import build_report_pdf_bytes
    from supabase_ops import (
        create_student_notification,
        supabase_document_get,
        supabase_document_upsert,
        supabase_rest_insert,
        supabase_rest_upsert_many,
        supabase_rpc,
        supabase_select,
    )


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None = None) -> str:
    return (value or _now()).isoformat()


def _text(value: Any) -> str:
    return str(value or "").strip()


def _normalized(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", _text(value).lower()).strip()


def _row_data(row: dict[str, Any]) -> dict[str, Any]:
    data = row.get("data") if isinstance(row.get("data"), dict) else {}
    return {**row, **data, "id": row.get("id"), "parent_id": row.get("parent_id")}


def _all(table: str) -> list[dict[str, Any]]:
    result = supabase_select(table, limit=0)
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail=result.get("reason") or f"{table}_unavailable")
    return [_row_data(row) for row in result.get("rows") or []]


def _actor(request: Request, payload: dict[str, Any], roles: set[str], *, owner_key: str = "") -> tuple[str, str]:
    enforce_portal_scope(request, payload, roles, owner_key=owner_key)
    return _text(payload.get("actorType")), _text(payload.get("actorId"))


def _full_admin(request: Request, payload: dict[str, Any]) -> str:
    actor_type, actor_id = _actor(request, payload, {"admin"})
    _, record = require_admin_bearer(request, actor_id)
    if _text(record.get("role")) != "full_admin":
        raise HTTPException(status_code=403, detail="full_admin_required")
    return actor_id


def _provider_owner(actor_type: str, actor_id: str, requested_grantor_id: str) -> str:
    grantor_id = requested_grantor_id or (actor_id if actor_type == "grantor" else "")
    if actor_type == "grantor" and grantor_id != actor_id:
        raise HTTPException(status_code=403, detail="grantor_scope_mismatch")
    if not grantor_id:
        raise HTTPException(status_code=422, detail="grantor_required")
    return grantor_id


def get_grantor_scope(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    actor_type, actor_id = _actor(request, payload, {"admin", "grantor"})
    grantor_id = _provider_owner(actor_type, actor_id, _text(payload.get("grantorId")))
    provider = supabase_document_get("providers", grantor_id)
    policy = supabase_document_get("grantor_scope_policies", grantor_id)
    return {
        "ok": True,
        "grantorId": grantor_id,
        "classification": (provider.get("data") or {}).get("grantorClassification", "other"),
        "policy": policy.get("data") or {"enabled": False, "name": "", "municipalities": [], "version": 0},
    }


def save_grantor_scope(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    actor_id = _full_admin(request, payload)
    grantor_id = _text(payload.get("grantorId"))
    classification = _text(payload.get("classification")).lower()
    if classification not in {"government", "private", "other"}:
        raise HTTPException(status_code=422, detail="invalid_grantor_classification")
    provider = supabase_document_get("providers", grantor_id)
    if not provider.get("ok") or not provider.get("data"):
        raise HTTPException(status_code=404, detail="grantor_not_found")
    municipalities = list(dict.fromkeys(
        _text(value)[:100] for value in payload.get("municipalities") or [] if _text(value)
    ))
    if payload.get("enabled") is True and not municipalities:
        raise HTTPException(status_code=422, detail="scope_municipalities_required")
    result = supabase_rpc("save_grantor_scope_policy", {
        "p_grantor_id": grantor_id, "p_classification": classification,
        "p_name": _text(payload.get("name"))[:120], "p_enabled": payload.get("enabled") is True,
        "p_municipalities": municipalities, "p_actor_id": actor_id,
    })
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail=result.get("reason") or "grantor_scope_save_failed")
    return {"ok": True, **(result.get("data") or {})}


def _application_matches(row: dict[str, Any], filters: dict[str, str]) -> bool:
    values = {
        "status": row.get("status"),
        "location": (row.get("scopeSnapshot") or {}).get("municipality") or row.get("permanentMunicipality") or row.get("city"),
        "scholarship": row.get("announcementId") or row.get("scholarshipId") or row.get("scholarshipName"),
        "cycle": row.get("academicCycle") or row.get("semesterTag"),
        "documentState": (row.get("documentReview") or {}).get("status") or row.get("documentReviewStatus"),
        "trackingStage": (row.get("tracking") or {}).get("currentStage") or row.get("stageId"),
    }
    for key, expected in filters.items():
        if expected and expected.lower() != "all" and _normalized(expected) not in _normalized(values.get(key)):
            return False
    return True


def list_filtered_applicants(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    actor_type, actor_id = _actor(request, payload, {"admin", "grantor"})
    requested_grantor = _text(payload.get("grantorId"))
    grantor_id = _provider_owner(actor_type, actor_id, requested_grantor) if actor_type == "grantor" else requested_grantor
    page = max(1, int(payload.get("page") or 1))
    page_size = min(100, max(1, int(payload.get("pageSize") or 25)))
    search = _normalized(payload.get("search"))
    filters = {key: _text(payload.get(key)) for key in ("status", "location", "scholarship", "cycle", "documentState", "trackingStage")}
    students = {row["id"]: row for row in _all("students")}
    rows = []
    for application in _all("scholarship_applications"):
        row_grantor = _text(application.get("grantorId") or application.get("providerId"))
        if grantor_id and row_grantor != grantor_id:
            continue
        if not _application_matches(application, filters):
            continue
        student = students.get(_text(application.get("studentId")), {})
        searchable = " ".join(_text(value) for value in (
            application.get("studentId"), application.get("applicationNumber"), application.get("scholarshipName"),
            application.get("grantorName"), student.get("fname"), student.get("mname"), student.get("lname"), student.get("course"),
        ))
        if search and search not in _normalized(searchable):
            continue
        rows.append({
            "applicationId": application.get("id"),
            "applicationNumber": application.get("applicationNumber"),
            "studentId": application.get("studentId"),
            "studentName": " ".join(filter(None, [_text(student.get("fname")), _text(student.get("mname")), _text(student.get("lname"))])),
            "grantorId": row_grantor,
            "grantorName": application.get("grantorName"),
            "scholarship": application.get("scholarshipName") or application.get("scholarshipTitle"),
            "status": application.get("status"),
            "location": (application.get("scopeSnapshot") or {}).get("municipality") or student.get("permanentMunicipality") or (student.get("permanentAddress") or {}).get("city"),
            "academicCycle": application.get("academicCycle") or application.get("semesterTag"),
            "documentState": (application.get("documentReview") or {}).get("status") or application.get("documentReviewStatus"),
            "trackingStage": (application.get("tracking") or {}).get("currentStage") or application.get("stageId"),
        })
    rows.sort(key=lambda row: (_text(row.get("studentName")).lower(), _text(row.get("applicationId"))))
    start = (page - 1) * page_size
    return {"ok": True, "rows": rows[start:start + page_size], "total": len(rows), "page": page, "pageSize": page_size, "filters": filters}


def build_applicant_export(request: Request, payload: dict[str, Any]) -> tuple[bytes, str, str]:
    result = list_filtered_applicants(request, {**payload, "page": 1, "pageSize": 100})
    # Fetch all pages server-side while preserving the authorized filter set.
    rows = result["rows"]
    total = int(result["total"])
    for page in range(2, (total + 99) // 100 + 1):
        rows.extend(list_filtered_applicants(request, {**payload, "page": page, "pageSize": 100})["rows"])
    actor_type = _text(payload.get("actorType"))
    actor_id = _text(payload.get("actorId"))
    export_format = _text(payload.get("format") or "csv").lower()
    audit_id = f"report_{uuid4().hex}"
    supabase_rest_insert("portal_report_audit_events", {"id": audit_id, "data": {
        "actorType": actor_type, "actorId": actor_id, "grantorId": _text(payload.get("grantorId")),
        "filters": result["filters"], "format": export_format, "rowCount": len(rows), "createdAt": _iso(),
    }})
    if export_format == "pdf":
        report_payload = {
            "title": "Grantor Applicant Report",
            "subtitle": "Server-owned filtered applicant records",
            "columns": ["Student ID", "Student", "Scholarship", "Status", "Location", "Cycle", "Document Review", "Tracking Stage"],
            "rows": [[row.get(key) or "" for key in ("studentId", "studentName", "scholarship", "status", "location", "academicCycle", "documentState", "trackingStage")] for row in rows],
        }
        return build_report_pdf_bytes(report_payload), "application/pdf", "grantor-applicants.pdf"
    output = io.StringIO(newline="")
    columns = ["applicationNumber", "studentId", "studentName", "grantorName", "scholarship", "status", "location", "academicCycle", "documentState", "trackingStage"]
    writer = csv.DictWriter(output, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    return ("\ufeff" + output.getvalue()).encode("utf-8"), "text/csv; charset=utf-8", "grantor-applicants.csv"


def correct_student_number(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    actor_id = _full_admin(request, payload)
    old_id = _text(payload.get("oldStudentId"))
    new_id = _text(payload.get("newStudentId"))
    reason = _text(payload.get("reason"))
    if payload.get("confirmed") is not True:
        raise HTTPException(status_code=422, detail="confirmation_required")
    event_id = _text(payload.get("eventId")) or f"student_number_{hashlib.sha256(f'{old_id}:{new_id}'.encode()).hexdigest()[:24]}"
    result = supabase_rpc("correct_student_number", {
        "p_old_student_id": old_id, "p_new_student_id": new_id,
        "p_actor_id": actor_id, "p_reason": reason, "p_event_id": event_id,
    })
    if not result.get("ok"):
        raise HTTPException(status_code=422, detail=result.get("reason") or "student_number_correction_failed")
    data = result.get("data") or {}
    auth_user_id = _text(data.get("authUserId"))
    if auth_user_id:
        url = os.getenv("SUPABASE_URL", "").rstrip("/")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        try:
            user_request = urllib.request.Request(
                f"{url}/auth/v1/admin/users/{urllib.parse.quote(auth_user_id)}",
                headers={"apikey": key, "Authorization": f"Bearer {key}"},
                method="GET",
            )
            with urllib.request.urlopen(user_request, timeout=15) as response:
                auth_user = json.loads(response.read().decode("utf-8") or "{}")
            app_metadata = auth_user.get("app_metadata") if isinstance(auth_user.get("app_metadata"), dict) else {}
            auth_request = urllib.request.Request(
                f"{url}/auth/v1/admin/users/{urllib.parse.quote(auth_user_id)}",
                method="PUT",
                data=json.dumps({"app_metadata": {**app_metadata, "portal_user_id": new_id, "portal_user_type": "student"}}).encode("utf-8"),
                headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            )
            urllib.request.urlopen(auth_request, timeout=15).read()
            logout_request = urllib.request.Request(
                f"{url}/auth/v1/admin/users/{urllib.parse.quote(auth_user_id)}/logout",
                method="POST", data=b"{}",
                headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            )
            urllib.request.urlopen(logout_request, timeout=15).read()
            supabase_document_upsert("student_number_change_events", event_id, {"status": "completed", "completedAt": _iso()})
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as error:
            supabase_document_upsert("student_number_change_events", event_id, {
                "status": "auth_update_pending", "lastError": str(error), "updatedAt": _iso(),
            })
            return {"ok": True, **data, "status": "auth_update_pending"}
    return {"ok": True, **data, "status": "completed"}


def _active_student(row: dict[str, Any]) -> bool:
    return not (row.get("archived") is True or row.get("disabled") is True or row.get("isPending") is True
                or _normalized(row.get("status")) in {"archived", "disabled", "inactive", "pending"})


def preview_announcement_audience(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    actor_type, actor_id = _actor(request, payload, {"admin", "grantor"})
    target = payload.get("target") if isinstance(payload.get("target"), dict) else {}
    target_type = _text(target.get("type") or "all_active")
    students = [row for row in _all("students") if _active_student(row)]
    applications = _all("scholarship_applications")
    grantor_id = actor_id if actor_type == "grantor" else _text(target.get("grantorId"))
    if actor_type == "grantor" and _text(target.get("grantorId")) not in {"", actor_id}:
        raise HTTPException(status_code=403, detail="grantor_scope_mismatch")
    grantor_related_ids = {
        _text(row.get("studentId")) for row in applications
        if grantor_id and _text(row.get("grantorId") or row.get("providerId")) == grantor_id
    }
    if grantor_id:
        grantor_related_ids.update(
            _text(row.get("studentId") or row.get("studentnumber")) for row in _all("grantor_portal_scholars")
            if _text(row.get("parent_id") or row.get("grantorId")) == grantor_id and row.get("archived") is not True
        )
    allowed_ids: set[str]
    if target_type == "specific_students":
        requested = {_text(value) for value in target.get("studentIds") or [] if _text(value)}
        allowed_ids = requested if actor_type == "admin" else requested.intersection(grantor_related_ids)
    elif target_type == "all_active":
        allowed_ids = {row["id"] for row in students}
    else:
        related = [row for row in applications if not grantor_id or _text(row.get("grantorId") or row.get("providerId")) == grantor_id]
        allowed_ids = set()
        for application in related:
            if target.get("announcementId") and _text(application.get("announcementId")) != _text(target.get("announcementId")):
                continue
            if target.get("applicationStatus") and _normalized(target.get("applicationStatus")) != _normalized(application.get("status")):
                continue
            if target.get("documentState") and _normalized(target.get("documentState")) != _normalized((application.get("documentReview") or {}).get("status") or application.get("documentReviewStatus")):
                continue
            if target.get("trackingStage") and _normalized(target.get("trackingStage")) != _normalized((application.get("tracking") or {}).get("currentStage") or application.get("stageId")):
                continue
            if target.get("academicCycle") and _normalized(target.get("academicCycle")) != _normalized(application.get("academicCycle") or application.get("semesterTag")):
                continue
            allowed_ids.add(_text(application.get("studentId")))
        if target_type == "active_scholars":
            roster_ids = {_text(row.get("studentId") or row.get("studentnumber")) for row in _all("grantor_portal_scholars")
                          if (not grantor_id or _text(row.get("grantorId") or row.get("parent_id")) == grantor_id)
                          and row.get("archived") is not True}
            allowed_ids.update(roster_ids)
    recipients = []
    for student in students:
        if student["id"] not in allowed_ids:
            continue
        if target.get("course") and _normalized(target.get("course")) != _normalized(student.get("course")):
            continue
        if target.get("yearLevel") and _normalized(target.get("yearLevel")) != _normalized(student.get("yearLevel") or student.get("year")):
            continue
        recipients.append(student)
    preview_id = f"audience_{uuid4().hex}"
    expires_at = _now() + timedelta(minutes=15)
    preview_data = {
        "actorType": actor_type, "actorId": actor_id, "target": target,
        "recipientCount": len(recipients), "status": "ready", "createdAt": _iso(), "expiresAt": _iso(expires_at),
    }
    supabase_rest_insert("announcement_audience_previews", {"id": preview_id, "data": preview_data, "expires_at": _iso(expires_at)})
    snapshot_rows = [{
        "id": f"{preview_id}_{hashlib.sha256(row['id'].encode()).hexdigest()[:20]}",
        "parent_id": preview_id, "student_id": row["id"],
        "data": {"studentId": row["id"], "course": row.get("course"), "yearLevel": row.get("yearLevel") or row.get("year")},
    } for row in recipients]
    if snapshot_rows:
        supabase_rest_upsert_many("announcement_recipient_snapshots", snapshot_rows)
    return {"ok": True, "previewId": preview_id, "recipientCount": len(recipients),
            "expiresAt": _iso(expires_at), "target": target}


def publish_targeted_announcement(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    actor_type, actor_id = _actor(request, payload, {"admin", "grantor"})
    preview_id = _text(payload.get("previewId"))
    preview = supabase_document_get("announcement_audience_previews", preview_id)
    preview_data = preview.get("data") or {}
    if not preview.get("ok") or not preview_data:
        raise HTTPException(status_code=404, detail="audience_preview_not_found")
    if preview_data.get("actorType") != actor_type or preview_data.get("actorId") != actor_id:
        raise HTTPException(status_code=403, detail="audience_preview_owner_mismatch")
    if preview_data.get("status") != "published" and datetime.fromisoformat(_text(preview_data.get("expiresAt")).replace("Z", "+00:00")) <= _now():
        raise HTTPException(status_code=410, detail="audience_preview_expired")
    title = _text(payload.get("title"))[:160]
    message = _text(payload.get("message"))[:4000]
    if not title or not message:
        raise HTTPException(status_code=422, detail="announcement_content_required")
    announcement_id = _text(payload.get("announcementId")) or f"targeted_{uuid4().hex}"
    publish_result = supabase_rpc("publish_announcement_preview", {
        "p_preview_id": preview_id, "p_actor_type": actor_type, "p_actor_id": actor_id,
        "p_announcement_id": announcement_id, "p_title": title, "p_message": message,
        "p_route": _text(payload.get("route")) or f"/student-dashboard/announcements/{announcement_id}",
    })
    if not publish_result.get("ok"):
        raise HTTPException(status_code=422, detail=publish_result.get("reason") or "announcement_delivery_failed")
    return {"ok": True, **(publish_result.get("data") or {})}


def list_waitlist(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    _, student_id = _actor(request, payload, {"student"}, owner_key="studentId")
    all_entries = _all("scholarship_waitlist_entries")
    student_entries = [entry for entry in all_entries if entry.get("student_id") == student_id]
    for entry in student_entries:
        if entry.get("status") != "queued":
            continue
        queue = sorted(
            (candidate for candidate in all_entries
             if candidate.get("announcement_id") == entry.get("announcement_id") and candidate.get("status") == "queued"),
            key=lambda candidate: (_text(candidate.get("queued_at")), _text(candidate.get("id"))),
        )
        entry["queuePosition"] = next((index for index, candidate in enumerate(queue, 1) if candidate.get("id") == entry.get("id")), None)
    offers = supabase_select("scholarship_waitlist_offers", {"student_id": student_id}, limit=0)
    return {"ok": True, "entries": student_entries, "offers": offers.get("rows") or []}


def resolve_waitlist(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    _, student_id = _actor(request, payload, {"student"}, owner_key="studentId")
    action = _text(payload.get("action"))
    if action not in {"accept", "decline"}:
        raise HTTPException(status_code=422, detail="invalid_waitlist_action")
    result = supabase_rpc("resolve_waitlist_offer", {
        "p_student_id": student_id, "p_offer_id": _text(payload.get("offerId")), "p_action": action,
    })
    if not result.get("ok"):
        raise HTTPException(status_code=422, detail=result.get("reason") or "waitlist_offer_update_failed")
    data = result.get("data") or {}
    if action == "accept" and data.get("status") == "closed" and data.get("reason"):
        raise HTTPException(status_code=409, detail=data["reason"])
    return {"ok": True, **data}


def expire_waitlist(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    expected = os.getenv("CRON_SECRET", "")
    provided = request.headers.get("x-cron-secret", "")
    if not expected or not provided or not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="cron_authentication_required")
    result = supabase_rpc("expire_waitlist_offers", {"p_limit": min(500, max(1, int(payload.get("limit") or 100)))})
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail=result.get("reason") or "waitlist_expiry_failed")
    return {"ok": True, **(result.get("data") or {})}
