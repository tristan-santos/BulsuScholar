from typing import Any

from fastapi import APIRouter, Body, File, HTTPException, Query, Request, Response, UploadFile

try:
    from .access_control import require_admin_bearer
except ImportError:  # pragma: no cover
    from access_control import require_admin_bearer

try:
    from .report_service import build_report_pdf_bytes, sanitize_report_filename, validate_report_payload
    from .root_service import (
        SQL_MAINTENANCE_ACTIONS,
        SQL_PRESETS,
        audit,
        build_root_report,
        change_admin_temporary_password,
        change_root_password,
        collect_file_inventory,
        dependency_health,
        fetch_root_file,
        integration_action,
        integration_status,
        historical_metrics,
        list_admins,
        list_branding_versions,
        list_devices,
        list_logs,
        list_rows,
        list_sessions,
        list_support,
        login_root,
        logout_root,
        metrics_snapshot,
        overview,
        public_config,
        publish_branding_version,
        request_root_otp,
        reauthenticate_root,
        regenerate_recovery_codes,
        require_root,
        revoke_device,
        revoke_session,
        run_sql_maintenance,
        sql_query,
        save_branding_draft,
        update_admin,
        update_admin_contact,
        update_authenticated_root_password,
        update_config,
        update_support,
        upload_branding_asset,
        verify_root_otp,
    )
except ImportError:  # pragma: no cover
    from report_service import build_report_pdf_bytes, sanitize_report_filename, validate_report_payload
    from root_service import (
        SQL_MAINTENANCE_ACTIONS, SQL_PRESETS, audit, build_root_report, change_admin_temporary_password, change_root_password, collect_file_inventory, dependency_health, fetch_root_file,
        historical_metrics, integration_action, integration_status, list_admins, list_branding_versions, list_devices,
        list_logs, list_rows, list_support, login_root, logout_root,
        list_sessions, metrics_snapshot, overview, public_config,
        publish_branding_version, reauthenticate_root, regenerate_recovery_codes, request_root_otp, require_root,
        revoke_device, revoke_session, run_sql_maintenance, save_branding_draft, sql_query, update_admin,
        update_admin_contact,
        update_authenticated_root_password, update_config, update_support, upload_branding_asset,
        verify_root_otp,
    )


router = APIRouter()


@router.get("/config/public")
def get_public_configuration() -> dict[str, Any]:
    return public_config()


@router.post("/admin/account/change-temporary-password")
def admin_change_temporary_password(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    actor_id = str(request.headers.get("x-portal-actor-id") or "").strip()
    if not actor_id or str(request.headers.get("x-portal-actor-type") or "").lower() != "admin":
        raise HTTPException(status_code=401, detail="admin_authentication_required")
    _, record = require_admin_bearer(request, actor_id)
    return change_admin_temporary_password(actor_id, record, str(payload.get("newPassword") or ""))


@router.post("/admin/account/contact")
def admin_update_contact(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    actor_id = str(request.headers.get("x-portal-actor-id") or "").strip()
    if not actor_id or str(request.headers.get("x-portal-actor-type") or "").lower() != "admin":
        raise HTTPException(status_code=401, detail="admin_authentication_required")
    _, record = require_admin_bearer(request, actor_id)
    return update_admin_contact(actor_id, record, str(payload.get("contactNumber") or ""))


@router.post("/root/auth/login")
def root_login(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return login_root(request, payload)


@router.post("/root/auth/change-password")
def root_change_password(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return change_root_password(request, payload)


@router.post("/root/auth/verify")
def root_verify(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return verify_root_otp(request, payload)


@router.post("/root/auth/resend")
def root_resend(request: Request) -> dict[str, Any]:
    return request_root_otp(request)


@router.post("/root/auth/logout")
def root_logout(request: Request) -> dict[str, Any]:
    identity = require_root(request)
    return logout_root(request, identity)


@router.post("/root/auth/reauthenticate")
def root_reauthenticate(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return reauthenticate_root(request, require_root(request), str(payload.get("password") or ""))


@router.post("/root/security/password")
def root_security_password(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return update_authenticated_root_password(request, require_root(request), payload)


@router.post("/root/security/recovery-codes")
def root_security_recovery_codes(request: Request) -> dict[str, Any]:
    return regenerate_recovery_codes(request, require_root(request, require_recent=True))


@router.get("/root/security/devices")
def root_devices(request: Request) -> dict[str, Any]:
    identity = require_root(request)
    return {"ok": True, "devices": list_devices(identity)}


@router.get("/root/security/sessions")
def root_sessions(request: Request) -> dict[str, Any]:
    identity = require_root(request)
    return {"ok": True, "sessions": list_sessions(identity), "currentSessionId": identity["session"]["id"]}


@router.delete("/root/security/sessions/{session_id}")
def root_revoke_session(session_id: str, request: Request) -> dict[str, Any]:
    return revoke_session(request, require_root(request), session_id)


@router.delete("/root/security/devices/{device_id}")
def root_revoke_device(device_id: str, request: Request) -> dict[str, Any]:
    identity = require_root(request)
    return revoke_device(request, identity, device_id)


@router.get("/root/overview")
def root_overview(request: Request) -> dict[str, Any]:
    require_root(request)
    return overview()


@router.get("/root/metrics")
def root_metrics(request: Request) -> dict[str, Any]:
    require_root(request)
    return {"ok": True, "metrics": metrics_snapshot(), "dependencies": dependency_health(), "history": historical_metrics(), "retentionDays": 90}


@router.get("/root/data/{dataset}")
def root_data(
    dataset: str,
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: str = Query("", max_length=200),
) -> dict[str, Any]:
    identity = require_root(request)
    result = list_rows(dataset, page, page_size, search)
    audit(request, identity["root"]["id"], "root_data_viewed", dataset, {"page": page, "search": bool(search)})
    return result


@router.get("/root/sql/presets")
def root_sql_presets(request: Request) -> dict[str, Any]:
    require_root(request)
    return {"ok": True, "presets": SQL_PRESETS, "maintenanceActions": SQL_MAINTENANCE_ACTIONS}


@router.post("/root/sql/query")
def root_sql_query(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    identity = require_root(request, require_recent=True)
    return sql_query(request, identity, str(payload.get("sql") or ""))


@router.post("/root/sql/maintenance")
def root_sql_maintenance(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return run_sql_maintenance(request, require_root(request, require_recent=True), str(payload.get("action") or ""))


@router.get("/root/admins")
def root_admins(request: Request) -> dict[str, Any]:
    require_root(request)
    return {"ok": True, "admins": list_admins()}


@router.post("/root/admins/save")
def root_save_admin(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    identity = require_root(request, require_recent=True)
    return update_admin(request, identity, payload)


@router.get("/root/support")
def root_support(request: Request) -> dict[str, Any]:
    require_root(request)
    return {"ok": True, "tickets": list_support()}


@router.post("/root/support/update")
def root_support_update(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    identity = require_root(request)
    return update_support(request, identity, payload)


@router.get("/root/logs")
def root_logs(request: Request) -> dict[str, Any]:
    require_root(request)
    return list_logs()


@router.post("/root/settings/{setting_id}")
def root_update_settings(setting_id: str, request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    identity = require_root(request, require_recent=setting_id in {"portal", "academic_cycle"})
    return update_config(request, identity, setting_id, payload)


@router.get("/root/branding/versions")
def root_branding_versions(request: Request) -> dict[str, Any]:
    require_root(request)
    return {"ok": True, "versions": list_branding_versions()}


@router.post("/root/branding/drafts")
def root_branding_draft(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return save_branding_draft(request, require_root(request), payload)


@router.post("/root/branding/{version_id}/publish")
def root_branding_publish(version_id: str, request: Request) -> dict[str, Any]:
    return publish_branding_version(request, require_root(request, require_recent=True), version_id)


@router.post("/root/branding/assets")
async def root_branding_asset(request: Request, file: UploadFile = File(...)) -> dict[str, Any]:
    content = await file.read(3 * 1024 * 1024 + 1)
    return upload_branding_asset(request, require_root(request), file.filename or "branding-asset", file.content_type or "", content)


@router.get("/root/files")
def root_files(request: Request, limit: int = Query(250, ge=1, le=1000)) -> dict[str, Any]:
    identity = require_root(request)
    result = collect_file_inventory(limit)
    audit(request, identity["root"]["id"], "student_file_inventory_viewed", details={"count": result["count"]})
    return result


@router.get("/root/reports/data/{report_type}")
def root_report_data(report_type: str, request: Request) -> dict[str, Any]:
    identity = require_root(request)
    result = build_root_report(report_type)
    audit(request, identity["root"]["id"], "root_report_previewed", report_type, {"rows": result["rowCount"]})
    return result


@router.post("/root/files/download")
def root_file_download(request: Request, payload: dict[str, Any] = Body(...)) -> Response:
    identity = require_root(request)
    content, content_type, filename = fetch_root_file(request, identity, payload)
    return Response(content=content, media_type=content_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/root/integrations")
def root_integrations(request: Request) -> dict[str, Any]:
    require_root(request)
    return integration_status()


@router.post("/root/integrations/action")
def root_integration_action(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    identity = require_root(request, require_recent=True)
    return integration_action(request, identity, payload)


@router.post("/root/reports/pdf")
def root_pdf_report(request: Request, payload: dict[str, Any] = Body(...)) -> Response:
    identity = require_root(request)
    try:
        validate_report_payload(payload)
        pdf_bytes = build_report_pdf_bytes(payload)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    filename = sanitize_report_filename(payload.get("filename"))
    audit(request, identity["root"]["id"], "root_report_downloaded", str(payload.get("title") or "report"), {"rows": len(payload.get("rows") or [])})
    return Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{filename}"'})
