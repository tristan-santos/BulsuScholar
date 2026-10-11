import re
from typing import Any

from fastapi import HTTPException, Request

try:
    from .access_control import require_admin_bearer
    from .supabase_ops import create_log, supabase_document_get, supabase_rpc
except ImportError:  # pragma: no cover
    from access_control import require_admin_bearer
    from supabase_ops import create_log, supabase_document_get, supabase_rpc


def _cycle_data() -> dict[str, Any]:
    result = supabase_document_get("system_configuration", "academic_cycle")
    if not result.get("ok") or not result.get("row"):
        raise HTTPException(status_code=503, detail="academic_cycle_unavailable")
    data = result.get("data") or {}
    tag = str(data.get("semesterTag") or "").strip()
    if not tag and data.get("academicYear") and data.get("semester"):
        tag = f"{data['academicYear']}-{data['semester']}"
    return {**data, "semesterTag": tag}


def _full_admin(request: Request) -> tuple[str, dict[str, Any]]:
    actor_id = str(request.headers.get("x-portal-actor-id") or "").strip()
    actor_type = str(request.headers.get("x-portal-actor-type") or "").strip().lower()
    if not actor_id or actor_type != "admin":
        raise HTTPException(status_code=401, detail="admin_authentication_required")
    _, record = require_admin_bearer(request, actor_id)
    if record.get("role") != "full_admin":
        raise HTTPException(status_code=403, detail="full_admin_required")
    return actor_id, record


def get_admin_academic_cycle(request: Request) -> dict[str, Any]:
    _full_admin(request)
    return {"ok": True, "academicCycle": _cycle_data()}


def activate_academic_cycle(
    payload: dict[str, Any],
    *,
    actor_id: str,
    actor_type: str,
) -> dict[str, Any]:
    academic_year = str(payload.get("academicYear") or "").strip()
    semester = str(payload.get("semester") or "").strip().upper()
    expected_cycle = str(payload.get("expectedCurrentCycle") or "").strip()
    match = re.fullmatch(r"(\d{4})-(\d{4})", academic_year)
    if not match or int(match.group(2)) != int(match.group(1)) + 1 or semester not in {"1ST", "2ND"}:
        raise HTTPException(status_code=422, detail="invalid_academic_cycle")
    if not expected_cycle:
        raise HTTPException(status_code=422, detail="expected_current_cycle_required")

    result = supabase_rpc("activate_academic_cycle", {
        "p_academic_year": academic_year,
        "p_semester": semester,
        "p_expected_current_cycle": expected_cycle,
        "p_actor_id": actor_id,
        "p_actor_type": actor_type,
    })
    if not result.get("ok"):
        reason = str(result.get("reason") or "academic_cycle_update_failed")
        if reason == "academic_cycle_changed":
            raise HTTPException(status_code=409, detail=reason)
        if reason in {"invalid_academic_cycle", "academic_cycle_actor_required"}:
            raise HTTPException(status_code=422, detail=reason)
        raise HTTPException(status_code=503, detail=reason)

    data = result.get("data") or {}
    if isinstance(data, list):
        data = data[0] if data else {}
    if not isinstance(data, dict):
        raise HTTPException(status_code=503, detail="academic_cycle_update_failed")

    try:
        from .root_service import PUBLIC_CONFIG_CACHE
    except ImportError:  # pragma: no cover
        from root_service import PUBLIC_CONFIG_CACHE
    PUBLIC_CONFIG_CACHE.update({"value": None, "expires": 0.0})

    create_log({
        "action": "academic_cycle_changed",
        "actorId": actor_id,
        "actorType": actor_type,
        "target": str(data.get("academicCycle") or f"{academic_year}-{semester}"),
        "details": {
            "previousCycle": data.get("previousCycle"),
            "direction": data.get("direction"),
            "affectedApplicationCount": data.get("affectedApplicationCount", 0),
            "exactRestorationCount": data.get("exactRestorationCount", 0),
            "reconstructedCount": data.get("reconstructedCount", 0),
            "restorationMethod": data.get("restorationMethod"),
        },
    })
    return {"ok": True, "academicCycle": data, "data": data}


def activate_admin_academic_cycle(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    actor_id, _ = _full_admin(request)
    return activate_academic_cycle(payload, actor_id=actor_id, actor_type="admin")
