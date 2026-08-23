import os
from typing import Any

from fastapi import HTTPException, Request


def normalize_role(value: Any) -> str:
    role = str(value or "").strip().lower()
    return "grantor" if role in {"provider", "grantor"} else role


def enforce_portal_scope(
    request: Request,
    payload: dict[str, Any],
    allowed_roles: set[str],
    *,
    owner_key: str = "",
) -> None:
    """Reject cross-role and cross-owner workflow calls.

    Supabase Auth-backed users also send their bearer token. Legacy grantor/admin
    accounts use the portal identity headers until their Auth migration is complete.
    """

    actor_id = str(request.headers.get("x-portal-actor-id") or "").strip()
    actor_role = normalize_role(request.headers.get("x-portal-actor-type"))
    require_headers = os.getenv("ENFORCE_PORTAL_ACTOR_HEADERS", "true").lower() not in {
        "0",
        "false",
        "no",
    }

    if require_headers and (not actor_id or not actor_role):
        raise HTTPException(status_code=401, detail="portal_identity_required")
    if not actor_id and not actor_role:
        return
    if actor_role not in allowed_roles:
        raise HTTPException(status_code=403, detail="portal_role_not_allowed")

    payload_role = normalize_role(payload.get("actorType"))
    payload_actor_id = str(payload.get("actorId") or "").strip()
    if payload_role and payload_role != actor_role:
        raise HTTPException(status_code=403, detail="portal_actor_role_mismatch")
    if payload_actor_id and payload_actor_id != actor_id:
        raise HTTPException(status_code=403, detail="portal_actor_id_mismatch")

    payload.setdefault("actorType", actor_role)
    payload.setdefault("actorId", actor_id)

    if owner_key and actor_role != "admin":
        owner_id = str(payload.get(owner_key) or "").strip()
        if owner_id and owner_id != actor_id:
            raise HTTPException(status_code=403, detail="portal_record_owner_mismatch")


def enforce_material_update_scope(payload: dict[str, Any]) -> None:
    if normalize_role(payload.get("actorType")) != "student":
        return
    actor_id = str(payload.get("actorId") or "").strip()
    for update in payload.get("updates") or []:
        if not isinstance(update, dict):
            continue
        table = str(update.get("table") or "").strip()
        record_id = str(update.get("id") or "").strip()
        data = update.get("data") if isinstance(update.get("data"), dict) else {}
        target_student = str(data.get("studentId") or data.get("studentnumber") or "").strip()
        if table == "students" and record_id != actor_id:
            raise HTTPException(status_code=403, detail="student_record_owner_mismatch")
        if table in {"soe_requests", "soe_downloads"} and target_student and target_student != actor_id:
            raise HTTPException(status_code=403, detail="student_material_owner_mismatch")
