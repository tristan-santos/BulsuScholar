"""Authoritative roster import and material-request workflows.

Spreadsheet parsing remains a presentation concern. Every consequential match,
conflict, and transition is recomputed here and committed by service-role RPCs.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter, defaultdict
from typing import Any

from fastapi import HTTPException, Request

try:
    from .access_control import enforce_portal_scope, require_admin_bearer
    from .supabase_ops import (
        supabase_document_get,
        supabase_document_upsert,
        supabase_rpc,
        supabase_select,
        utc_now_iso,
    )
except ImportError:  # pragma: no cover
    from access_control import enforce_portal_scope, require_admin_bearer
    from supabase_ops import (
        supabase_document_get,
        supabase_document_upsert,
        supabase_rpc,
        supabase_select,
        utc_now_iso,
    )


OPEN_APPLICATION_TERMS = {
    "", "active", "applied", "application submitted", "awaiting documents",
    "pending", "pending approval", "under review", "accepted", "approved",
    "finalized", "protected", "paused",
}
BLOCKING_DISPOSITIONS = {
    "invalid_data", "scholarship_not_recognized", "identity_mismatch",
    "scholarship_ambiguous", "duplicate_import_row", "conflicting_active_roster",
    "existing_commitment_conflict",
}


def _text(value: Any) -> str:
    return str(value or "").strip()


def _key(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", _text(value).lower()).strip()


def _student_id(data: dict[str, Any]) -> str:
    return _text(data.get("studentId") or data.get("studentnumber") or data.get("studentNumber"))


def _full_name(data: dict[str, Any]) -> str:
    return _text(data.get("fullName") or " ".join(
        _text(data.get(field)) for field in ("fname", "mname", "lname") if _text(data.get(field))
    ))


def _row_data_rows(table: str, filters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    result = supabase_select(table, filters, limit=0)
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail=f"{table}_unavailable")
    output = []
    for row in result.get("rows") or []:
        data = row.get("data") if isinstance(row.get("data"), dict) else {}
        output.append({"id": row.get("id"), "parentId": row.get("parent_id"), **data})
    return output


def _is_active_roster(data: dict[str, Any]) -> bool:
    return data.get("archived") is not True and _key(data.get("status") or "active") not in {
        "archived", "rejected", "declined", "withdrawn", "inactive",
    }


def _is_open_application(data: dict[str, Any]) -> bool:
    if data.get("archived") is True or data.get("rejected") is True:
        return False
    status = _key(data.get("status"))
    return status in OPEN_APPLICATION_TERMS or not any(
        term in status for term in ("reject", "denied", "declined", "cancel", "withdraw", "archived", "resolved", "expired")
    )


def _application_matches(application: dict[str, Any], grantor_id: str, scholarship_id: str, title: str) -> bool:
    if _text(application.get("grantorId") or application.get("providerId")) != grantor_id:
        return False
    application_scholarship_id = _text(application.get("scholarshipId") or application.get("announcementId"))
    if scholarship_id and application_scholarship_id:
        return application_scholarship_id == scholarship_id
    return _key(application.get("scholarshipName") or application.get("scholarshipTitle") or application.get("name")) == _key(title)


def _recognized_programs(grantor_id: str, cache: dict[str, dict[str, dict[str, Any]]]) -> dict[str, dict[str, Any]]:
    if grantor_id in cache:
        return cache[grantor_id]
    announcements = _row_data_rows("grantor_portal_announcements", {"parent_id": grantor_id})
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for announcement in announcements:
        title = _text(announcement.get("scholarshipTitle") or announcement.get("scholarshipName") or announcement.get("title"))
        if not title:
            continue
        if announcement.get("applicationEnabled") is not True and not any(
            announcement.get(field) not in (None, "", [], {})
            for field in ("scholarshipTitle", "scholarshipName", "minimumGrade", "requiredDocuments")
        ):
            continue
        grouped[_key(title)].append(announcement)
    programs: dict[str, dict[str, Any]] = {}
    for title_key, records in grouped.items():
        records.sort(key=lambda row: _text(row.get("createdAt") or row.get("updatedAt")), reverse=True)
        active_records = [row for row in records if row.get("archived") is not True and _key(row.get("status")) not in {
            "archived", "closed", "expired", "inactive",
        }]
        candidates = active_records or records
        stable_ids = {
            _text(row.get("programId") or row.get("scholarshipId") or row.get("id"))
            for row in candidates
        }
        if len(stable_ids) > 1:
            programs[title_key] = {"ambiguous": True}
            continue
        latest = candidates[0]
        programs[title_key] = {
            "id": _text(latest.get("id")),
            "title": _text(latest.get("scholarshipTitle") or latest.get("scholarshipName") or latest.get("title")),
            "providerType": _text(latest.get("providerType")),
        }
    cache[grantor_id] = programs
    return programs


def _preview_response(batch_id: str) -> dict[str, Any] | None:
    batch = supabase_document_get("roster_import_batches", batch_id)
    if not batch.get("row"):
        return None
    rows = _row_data_rows("roster_import_rows", {"parent_id": batch_id})
    rows.sort(key=lambda row: int(row.get("rowNumber") or 0))
    data = batch.get("data") or {}
    return {"ok": True, "batchId": batch_id, "status": data.get("status"), "counts": data.get("counts") or {}, "rows": rows}


def preview_roster_import(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"admin", "grantor"}, owner_key="grantorId")
    actor_type = _text(payload.get("actorType")).lower()
    actor_id = _text(payload.get("actorId"))
    input_rows = payload.get("rows") if isinstance(payload.get("rows"), list) else []
    if not input_rows or len(input_rows) > 2000:
        raise HTTPException(status_code=422, detail="roster_import_rows_required")

    canonical_rows = []
    for index, source in enumerate(input_rows):
        row = dict(source) if isinstance(source, dict) else {}
        grantor_id = _text(row.get("grantorId") or payload.get("grantorId"))
        if actor_type == "grantor":
            grantor_id = actor_id
        canonical_rows.append({
            **row,
            "rowNumber": int(row.get("rowNumber") or index + 1),
            "studentId": _student_id(row),
            "fullName": _full_name(row),
            "grantorId": grantor_id,
            "scholarshipTitle": _text(row.get("scholarshipTitle") or row.get("scholarshipName")),
        })
    fingerprint_source = json.dumps({"actorType": actor_type, "actorId": actor_id, "rows": canonical_rows}, sort_keys=True, separators=(",", ":"))
    fingerprint = hashlib.sha256(fingerprint_source.encode("utf-8")).hexdigest()
    batch_id = f"roster_preview_{fingerprint[:32]}"
    existing = _preview_response(batch_id)
    if existing and existing.get("status") in {"ready", "blocked", "committed"}:
        return {**existing, "idempotent": True}

    students = {str(row.get("id")): row for row in _row_data_rows("students")}
    rosters = [row for row in _row_data_rows("grantor_portal_scholars") if _is_active_roster(row)]
    applications = [row for row in _row_data_rows("scholarship_applications") if _is_open_application(row)]
    providers = {
        str(row.get("id")): row for row in [*_row_data_rows("providers"), *_row_data_rows("grantor_portals")]
    }
    program_cache: dict[str, dict[str, dict[str, Any]]] = {}
    tuple_counts = Counter((_text(row.get("grantorId")), _text(row.get("studentId")), _key(row.get("scholarshipTitle"))) for row in canonical_rows)
    student_targets: dict[str, set[tuple[str, str]]] = defaultdict(set)
    for row in canonical_rows:
        if row["studentId"]:
            student_targets[row["studentId"]].add((row["grantorId"], _key(row["scholarshipTitle"])))

    preview_rows: list[dict[str, Any]] = []
    counts: Counter[str] = Counter()
    for index, row in enumerate(canonical_rows):
        grantor_id = row["grantorId"]
        student_id = row["studentId"]
        title_key = _key(row["scholarshipTitle"])
        disposition = "invalid_data"
        reason = "Student ID, full name, grantor, and scholarship are required."
        program: dict[str, Any] = {}
        student = students.get(student_id)
        matching_application: dict[str, Any] | None = None
        matching_roster: dict[str, Any] | None = None

        if not grantor_id or grantor_id not in providers or providers[grantor_id].get("archived") is True:
            reason = "Grantor not found or inactive."
        elif not student_id or not row["fullName"] or not title_key:
            reason = "Student ID, full name, and scholarship are required."
        else:
            program = _recognized_programs(grantor_id, program_cache).get(title_key) or {}
            if program.get("ambiguous"):
                disposition = "scholarship_ambiguous"
                reason = "Scholarship title matches more than one recognized program. Select a unique program title before importing."
            elif not program:
                disposition = "scholarship_not_recognized"
                reason = "Scholarship does not exactly match a recognized program for this grantor."
            elif tuple_counts[(grantor_id, student_id, title_key)] > 1:
                disposition = "duplicate_import_row"
                reason = "The same student and scholarship appears more than once in this import."
            elif len(student_targets[student_id]) > 1:
                disposition = "conflicting_active_roster"
                reason = "This import assigns the student to more than one active scholarship."
            elif student and _key(_full_name(student)) != _key(row["fullName"]):
                disposition = "identity_mismatch"
                reason = "Student ID exists, but the roster name does not match the account name."
            else:
                active_student_rosters = [existing_roster for existing_roster in rosters if _student_id(existing_roster) == student_id]
                matching_roster = next((existing_roster for existing_roster in active_student_rosters
                    if _text(existing_roster.get("grantorId") or existing_roster.get("parentId")) == grantor_id
                    and (_text(existing_roster.get("scholarshipId")) == program["id"]
                         or _key(existing_roster.get("scholarshipTitle") or existing_roster.get("scholarshipName")) == title_key)), None)
                conflicting_roster = next((existing_roster for existing_roster in active_student_rosters if existing_roster is not matching_roster), None)
                student_apps = [application for application in applications if _text(application.get("studentId")) == student_id]
                matching_application = next((application for application in student_apps
                    if _application_matches(application, grantor_id, program["id"], program["title"])), None)
                commitment = student.get("scholarshipCommitment") if student and isinstance(student.get("scholarshipCommitment"), dict) else {}
                commitment_id = _text(commitment.get("applicationId"))
                if conflicting_roster:
                    disposition = "conflicting_active_roster"
                    reason = "Student already has a different active authoritative roster record."
                elif commitment_id and (not matching_application or _text(matching_application.get("id")) != commitment_id):
                    disposition = "existing_commitment_conflict"
                    reason = "Student is already committed to a different scholarship."
                elif matching_roster:
                    disposition = "already_imported"
                    reason = "This authoritative roster row already exists."
                elif not student:
                    disposition = "ready_for_future_account"
                    reason = "Roster row is valid. The student will be assigned after account approval."
                elif matching_application:
                    disposition = "convert_existing"
                    reason = "The matching current application will be converted without changing its ID or history."
                else:
                    disposition = "new_assignment"
                    reason = "The student account will receive this authoritative roster scholarship."

        blocking = disposition in BLOCKING_DISPOSITIONS
        preview = {
            "rowNumber": row["rowNumber"], "rowId": f"{batch_id}_row_{index + 1}",
            "studentId": student_id, "fullName": row["fullName"], "grantorId": grantor_id,
            "scholarshipId": program.get("id") or "", "scholarshipTitle": program.get("title") or row["scholarshipTitle"],
            "providerType": program.get("providerType") or _text(providers.get(grantor_id, {}).get("providerType")),
            "disposition": disposition, "reason": reason, "blocking": blocking,
            "matchedAccount": bool(student), "existingApplicationId": _text((matching_application or {}).get("id")),
            "existingRosterId": _text((matching_roster or {}).get("id")),
            "rosterData": {**row, "scholarshipId": program.get("id") or "", "scholarshipTitle": program.get("title") or row["scholarshipTitle"]},
        }
        preview_rows.append(preview)
        counts[disposition] += 1

    status = "blocked" if any(row["blocking"] for row in preview_rows) else "ready"
    now = utc_now_iso()
    batch_data = {
        "actorType": actor_type, "actorId": actor_id, "fingerprint": fingerprint,
        "sourceFileName": _text(payload.get("sourceFileName")), "status": status,
        "rowCount": len(preview_rows), "counts": dict(counts), "createdAt": now, "updatedAt": now,
    }
    saved = supabase_document_upsert("roster_import_batches", batch_id, batch_data, merge=False)
    if not saved.get("ok"):
        raise HTTPException(status_code=503, detail="roster_import_preview_save_failed")
    for preview in preview_rows:
        result = supabase_document_upsert("roster_import_rows", preview["rowId"], preview, merge=False, parent_id=batch_id)
        if not result.get("ok"):
            raise HTTPException(status_code=503, detail="roster_import_preview_rows_save_failed")
    conflict_rows = [row for row in preview_rows if row["disposition"] in {
        "identity_mismatch", "conflicting_active_roster", "existing_commitment_conflict",
    }]
    for conflict in conflict_rows:
        conflict_id = f"roster_conflict_{hashlib.sha256((conflict['studentId'] + conflict['rowId']).encode('utf-8')).hexdigest()[:32]}"
        supabase_document_upsert("roster_assignment_conflicts", conflict_id, {
            "status": "open", "batchId": batch_id, "rowId": conflict["rowId"],
            "studentId": conflict["studentId"], "fullName": conflict["fullName"],
            "reason": conflict["reason"], "disposition": conflict["disposition"],
            "candidate": conflict, "createdAt": now, "updatedAt": now,
        }, merge=False)
    return {"ok": True, "idempotent": False, "batchId": batch_id, "status": status, "counts": dict(counts), "rows": preview_rows}


def commit_roster_import(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"admin", "grantor"})
    batch_id = _text(payload.get("batchId"))
    if not batch_id:
        raise HTTPException(status_code=422, detail="roster_import_batch_required")
    result = supabase_rpc("commit_roster_import_batch", {
        "p_batch_id": batch_id,
        "p_actor_type": _text(payload.get("actorType")).lower(),
        "p_actor_id": _text(payload.get("actorId")),
    })
    if not result.get("ok"):
        return {"ok": False, "reason": result.get("reason") or "roster_import_commit_failed", "detail": result.get("detail")}
    return {"ok": True, **(result.get("data") or {})}


def list_roster_conflicts(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"admin"})
    actor_id = _text(payload.get("actorId"))
    _, record = require_admin_bearer(request, actor_id)
    if _text(record.get("role")) != "full_admin":
        raise HTTPException(status_code=403, detail="full_admin_required")
    conflicts = _row_data_rows("roster_assignment_conflicts")
    active_rosters = [row for row in _row_data_rows("grantor_portal_scholars") if _is_active_roster(row)]
    for conflict in conflicts:
        conflict["activeRosterOptions"] = [
            {
                "rosterId": roster.get("id"),
                "grantorId": roster.get("grantorId") or roster.get("parentId"),
                "grantorName": roster.get("grantorName") or roster.get("provider") or "Grantor",
                "scholarshipTitle": roster.get("scholarshipTitle") or roster.get("scholarshipName") or "Scholarship",
            }
            for roster in active_rosters if _student_id(roster) == _text(conflict.get("studentId"))
        ]
    conflicts.sort(key=lambda row: _text(row.get("createdAt")), reverse=True)
    return {"ok": True, "conflicts": conflicts}


def resolve_roster_conflict(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"admin"})
    actor_id = _text(payload.get("actorId"))
    _, record = require_admin_bearer(request, actor_id)
    if _text(record.get("role")) != "full_admin":
        raise HTTPException(status_code=403, detail="full_admin_required")
    conflict_id = _text(payload.get("conflictId"))
    resolution = _text(payload.get("resolution")).lower()
    if not conflict_id or resolution not in {"candidate", "existing"}:
        raise HTTPException(status_code=422, detail="invalid_roster_conflict_resolution")
    result = supabase_rpc("resolve_roster_assignment_conflict", {
        "p_conflict_id": conflict_id,
        "p_resolution": resolution,
        "p_selected_roster_id": _text(payload.get("selectedRosterId")),
        "p_actor_id": actor_id,
    })
    if not result.get("ok"):
        return {"ok": False, "reason": result.get("reason") or "roster_conflict_resolution_failed", "detail": result.get("detail")}
    return {"ok": True, **(result.get("data") or {})}


def request_student_materials(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"student"})
    student_id = _text(payload.get("actorId"))
    application_id = _text(payload.get("applicationId"))
    if not application_id:
        raise HTTPException(status_code=422, detail="application_id_required")
    result = supabase_rpc("request_scholarship_materials", {
        "p_student_id": student_id,
        "p_application_id": application_id,
    })
    if not result.get("ok"):
        return {"ok": False, "reason": result.get("reason") or "material_request_failed", "detail": result.get("detail")}
    response = result.get("data") or {}
    material = response.get("materialRequest") if isinstance(response, dict) else None
    if isinstance(material, dict) and material.get("id"):
        persisted = supabase_document_get("soe_requests", _text(material.get("id")))
        if persisted.get("row"):
            response = {**response, "materialRequest": {"id": material.get("id"), **(persisted.get("data") or {})}}
    return {"ok": True, **response}
