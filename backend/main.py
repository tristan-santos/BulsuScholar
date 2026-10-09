import os
import re
from typing import Any

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - dependency is installed from requirements.txt
    load_dotenv = None

from fastapi import BackgroundTasks, Body, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

if load_dotenv:
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(backend_dir)
    load_dotenv(os.path.join(project_root, ".env"))
    load_dotenv(os.path.join(backend_dir, ".env"), override=True)

try:
    from .document_scanner import extract_image_text, get_scanner_dependency_status, parse_document, parse_pdf_document
    from .access_control import enforce_material_update_scope, enforce_portal_scope, normalize_role, require_supabase_user
    from .auth_service import complete_email_verification, complete_password_recovery, create_grantor_account, get_security_settings, login, request_password_recovery, resend_email_verification, update_security_settings, validate_portal_session
    from .portal_data_service import delete_portal_data, mutate_portal_data, query_portal_data
    from .scholarship_choice_service import mutate_scholarship_choice, update_scholarship_documents
    from .grantor_algorithms import (
        check_student_table_duplicates,
        evaluate_scholar_duplicate,
        find_matching_grantor_scholars,
        find_scholar_duplicate,
        match_admin_grantor_students,
    )
    from .report_service import (
        build_report_pdf_bytes,
        sanitize_report_filename,
        validate_report_payload,
    )
    from .scholarship_rules import (
        check_scholarship_eligibility,
        is_gwa_eligible,
        recommend_scholarships,
        validate_scholarship_documents,
    )
    from .signup_service import check_signup_availability, create_signup_document_batch, finalize_student_signup, validate_student_signup
    from .student_lifecycle_service import confirm_grantor_admin_decision, promote_email_confirmed_student
    from .student_account_review_service import approve_pending_student_account, list_pending_student_accounts
    from .roster_workflow_service import (
        commit_roster_import,
        list_roster_conflicts,
        preview_roster_import,
        preflight_student_materials,
        resolve_roster_conflict,
        request_student_materials,
    )
    from .student_profile_service import (
        create_document_exception,
        document_content,
        get_student_profile_workspace,
        list_document_review_queue,
        preview_student_profile,
        profile_snapshot_content,
        review_document_submission,
        save_student_profile_draft,
        student_profile_photo_content,
        submit_student_profile,
        update_document_policy,
        upload_student_profile_photo,
        upload_student_document,
    )
    from .scope_announcement_waitlist_service import (
        build_applicant_export,
        correct_student_number,
        expire_waitlist,
        get_grantor_scope,
        list_filtered_applicants,
        list_waitlist,
        preview_announcement_audience,
        publish_targeted_announcement,
        resolve_waitlist,
        save_grantor_scope,
    )
    from .security_history_service import (
        add_public_recovery_message, confirm_public_recovery_email, create_public_recovery_ticket,
        get_public_recovery_ticket, list_signed_soe, list_student_history, reopen_signed_soe,
        signed_soe_content, upload_public_recovery_attachment, upload_signed_soe,
    )
    from .support_service import ask_support_assistant
    from .priority_one_service import save_support_feedback
    from .support_ticket_service import add_portal_message, create_portal_ticket, delete_portal_ticket, get_portal_ticket, list_portal_tickets
    from .root_router import router as root_router
    from .root_service import is_maintenance_enabled, metric_finished, metric_started, public_config
    from .supabase_ops import (
        build_grantor_notification_payload,
        build_admin_notification_payload,
        build_log_payload,
        build_student_notification_payload,
        broadcast_student_notification,
        create_grantor_notification,
        create_admin_notification,
        list_admin_notifications,
        list_grantor_notifications,
        list_student_notifications,
        get_student_required_action,
        supabase_document_get,
        supabase_select,
        create_log,
        create_student_notification,
        delete_grantor_notification,
        delete_admin_notification,
        delete_student_notification,
        supabase_table_status,
        update_grantor_notification,
        update_grantor_notifications,
        update_admin_notification,
        update_student_notification,
        update_student_notifications,
    )
    from .workflow_service import (
        apply_scholarship,
        configure_grantor_announcement_slots,
        create_grantor_announcement,
        deliver_grantor_announcement_notifications,
        create_grantor_scholars,
        republish_grantor_announcement,
        update_admin_review,
        update_grantor_announcement,
        update_grantor_archive_state,
        invite_archived_grantor_scholars,
        reject_scholarship_invitation,
        update_grantor_profile,
        update_grantor_scholar,
        update_grantor_scholars,
        update_material_request,
    )
except ImportError:  # pragma: no cover - supports `uvicorn main:app` from backend/
    from document_scanner import extract_image_text, get_scanner_dependency_status, parse_document, parse_pdf_document
    from access_control import enforce_material_update_scope, enforce_portal_scope, normalize_role, require_supabase_user
    from auth_service import complete_email_verification, complete_password_recovery, create_grantor_account, get_security_settings, login, request_password_recovery, resend_email_verification, update_security_settings, validate_portal_session
    from portal_data_service import delete_portal_data, mutate_portal_data, query_portal_data
    from scholarship_choice_service import mutate_scholarship_choice, update_scholarship_documents
    from grantor_algorithms import (
        check_student_table_duplicates,
        evaluate_scholar_duplicate,
        find_matching_grantor_scholars,
        find_scholar_duplicate,
        match_admin_grantor_students,
    )
    from report_service import (
        build_report_pdf_bytes,
        sanitize_report_filename,
        validate_report_payload,
    )
    from scholarship_rules import (
        check_scholarship_eligibility,
        is_gwa_eligible,
        recommend_scholarships,
        validate_scholarship_documents,
    )
    from signup_service import check_signup_availability, create_signup_document_batch, finalize_student_signup, validate_student_signup
    from student_lifecycle_service import confirm_grantor_admin_decision, promote_email_confirmed_student
    from student_account_review_service import approve_pending_student_account, list_pending_student_accounts
    from roster_workflow_service import (
        commit_roster_import,
        list_roster_conflicts,
        preview_roster_import,
        preflight_student_materials,
        resolve_roster_conflict,
        request_student_materials,
    )
    from student_profile_service import (
        create_document_exception,
        document_content,
        get_student_profile_workspace,
        list_document_review_queue,
        preview_student_profile,
        profile_snapshot_content,
        review_document_submission,
        save_student_profile_draft,
        student_profile_photo_content,
        submit_student_profile,
        update_document_policy,
        upload_student_profile_photo,
        upload_student_document,
    )
    from scope_announcement_waitlist_service import (
        build_applicant_export,
        correct_student_number,
        expire_waitlist,
        get_grantor_scope,
        list_filtered_applicants,
        list_waitlist,
        preview_announcement_audience,
        publish_targeted_announcement,
        resolve_waitlist,
        save_grantor_scope,
    )
    from security_history_service import (
        add_public_recovery_message, confirm_public_recovery_email, create_public_recovery_ticket,
        get_public_recovery_ticket, list_signed_soe, list_student_history, reopen_signed_soe,
        signed_soe_content, upload_public_recovery_attachment, upload_signed_soe,
    )
    from support_service import ask_support_assistant
    from priority_one_service import save_support_feedback
    from support_ticket_service import add_portal_message, create_portal_ticket, delete_portal_ticket, get_portal_ticket, list_portal_tickets
    from root_router import router as root_router
    from root_service import is_maintenance_enabled, metric_finished, metric_started, public_config
    from supabase_ops import (
        build_grantor_notification_payload,
        build_admin_notification_payload,
        build_log_payload,
        build_student_notification_payload,
        broadcast_student_notification,
        create_grantor_notification,
        create_admin_notification,
        list_admin_notifications,
        list_grantor_notifications,
        list_student_notifications,
        get_student_required_action,
        supabase_document_get,
        supabase_select,
        create_log,
        create_student_notification,
        delete_grantor_notification,
        delete_admin_notification,
        delete_student_notification,
        supabase_table_status,
        update_grantor_notification,
        update_grantor_notifications,
        update_admin_notification,
        update_student_notification,
        update_student_notifications,
    )
    from workflow_service import (
        apply_scholarship,
        configure_grantor_announcement_slots,
        create_grantor_announcement,
        deliver_grantor_announcement_notifications,
        create_grantor_scholars,
        republish_grantor_announcement,
        update_admin_review,
        update_grantor_announcement,
        update_grantor_archive_state,
        invite_archived_grantor_scholars,
        reject_scholarship_invitation,
        update_grantor_profile,
        update_grantor_scholar,
        update_grantor_scholars,
        update_material_request,
    )


app = FastAPI(title="BulsuScholar Backend Services")
app.include_router(root_router)


def build_allowed_origins() -> list[str]:
    configured_origins = [
        item.strip()
        for item in os.getenv("DOCUMENT_SCAN_ALLOWED_ORIGINS", "").split(",")
        if item.strip()
    ]
    default_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://bulsuscholar.com",
        os.getenv("FRONTEND_URL", "").strip(),
        os.getenv("VITE_APP_URL", "").strip(),
        os.getenv("VITE_PUBLIC_SITE_URL", "").strip(),
    ]
    return sorted({origin.rstrip("/") for origin in [*default_origins, *configured_origins] if origin})


allowed_origins = build_allowed_origins()
allowed_origin_regex = os.getenv("DOCUMENT_SCAN_ALLOWED_ORIGIN_REGEX", "")


def is_allowed_cors_origin(origin: str | None) -> bool:
    if not origin:
        return False
    normalized_origin = origin.rstrip("/")
    if normalized_origin in allowed_origins:
        return True
    if not allowed_origin_regex:
        return False
    try:
        return re.fullmatch(allowed_origin_regex, normalized_origin) is not None
    except re.error:
        return False

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=allowed_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def ensure_deployed_cors_headers(request, call_next):
    metric_start = metric_started()
    origin = request.headers.get("origin")
    cors_origin_allowed = is_allowed_cors_origin(origin)

    maintenance_allowed = (
        request.url.path.startswith("/root/")
        or request.url.path.startswith("/internal/cron/")
        or request.url.path.startswith("/support/recovery/")
        or request.url.path in {"/", "/health", "/deployment/health", "/scan-document/health", "/email/health", "/config/public", "/auth/login", "/auth/email-verification/resend", "/auth/email-verification/complete", "/auth/recovery/request", "/auth/recovery/complete", "/support/chat", "/support/feedback", "/openapi.json", "/docs"}
    )
    if request.method == "OPTIONS" and cors_origin_allowed:
        response = Response(status_code=204)
    elif not maintenance_allowed and is_maintenance_enabled():
        response = JSONResponse(status_code=503, content={"detail": "portal_under_maintenance"})
    else:
        try:
            response = await call_next(request)
        except Exception as error:
            if request.url.path == "/scan-document":
                response = JSONResponse(
                    status_code=500,
                    content={
                        "detail": "document_scan_failed",
                        "message": str(error),
                    },
                )
            else:
                raise

    if cors_origin_allowed and response.headers.get("access-control-allow-origin") is None:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = request.headers.get("access-control-request-headers", "*")
        response.headers["Vary"] = "Origin"

    metric_finished(request.url.path, response.status_code, metric_start)

    return response

REQUIRED_SUPABASE_TABLES = [
    "admins",
    "students",
    "pending_students",
    "providers",
    "grantor_portals",
    "grantor_portal_scholars",
    "grantor_portal_applications",
    "grantor_portal_announcements",
    "scholarship_applications",
    "student_scholarship_state",
    "student_scholarship_invitations",
    "soe_requests",
    "soe_downloads",
    "student_warnings",
    "studentNotifications",
    "grantorNotifications",
    "student_document_usage",
    "systemLogs",
    "support_feedback",
    "support_ticket_messages",
    "login_security_state",
    "student_profile_drafts",
    "student_profile_revisions",
    "student_document_submissions",
    "student_document_reviews",
    "student_document_exceptions",
    "student_profile_application_snapshots",
    "student_next_action_events",
    "roster_import_batches",
    "roster_import_rows",
    "roster_assignment_conflicts",
    "portal_email_challenges",
    "portal_verified_sessions",
    "public_recovery_tickets",
    "public_recovery_messages",
    "public_recovery_attachments",
    "student_history_events",
    "signed_soe_submissions",
    "roster_import_audit_events",
    "grantor_scope_policies",
    "grantor_scope_policy_versions",
    "portal_report_audit_events",
    "student_number_change_events",
    "announcement_audience_previews",
    "announcement_recipient_snapshots",
    "notification_delivery_events",
    "scholarship_waitlist_entries",
    "scholarship_waitlist_offers",
    "scholarship_waitlist_audit_events",
]


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "name": "BulsuScholar Backend Services",
        "status": "running",
        "frontend": os.getenv("FRONTEND_URL", "https://bulsuscholar.com"),
        "health": "/health",
        "deploymentHealth": "/deployment/health",
        "scanner": "/scan-document",
        "message": "Use the frontend site for the app. This backend only exposes API endpoints.",
    }


@app.get("/health")
def health() -> dict[str, Any]:
    supabase_url = os.getenv("SUPABASE_URL", "")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    return {
        "status": "ok",
        "supabaseServerConfigured": bool(supabase_url and service_role_key),
        "hasSupabaseUrl": bool(supabase_url),
        "hasSupabaseServiceRoleKey": bool(service_role_key),
        "rootSessionSecretConfigured": len(os.getenv("ROOT_SESSION_SECRET", "").strip()) >= 32,
        "scannerDependencies": get_scanner_dependency_status(),
    }


@app.get("/deployment/health")
def deployment_health() -> dict[str, Any]:
    supabase_url = os.getenv("SUPABASE_URL", "")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    email_provider = os.getenv("EMAIL_PROVIDER", "brevo").strip().lower()
    brevo_api_key = os.getenv("BREVO_API_KEY", "")
    brevo_sender_email = os.getenv("BREVO_SENDER_EMAIL", "")
    table_results = [supabase_table_status(table) for table in REQUIRED_SUPABASE_TABLES]
    missing_tables = [
        item["table"]
        for item in table_results
        if not item.get("ok") and item.get("reason") == "missing_or_unloaded_supabase_table"
    ]
    failed_tables = [item for item in table_results if not item.get("ok")]

    return {
        "status": "ok" if not failed_tables and supabase_url and service_role_key else "needs_attention",
        "frontendUrl": os.getenv("FRONTEND_URL", "https://bulsuscholar.com"),
        "cors": {
            "allowedOrigins": allowed_origins,
            "allowedOriginRegex": allowed_origin_regex,
        },
        "environment": {
            "hasSupabaseUrl": bool(supabase_url),
            "hasSupabaseServiceRoleKey": bool(service_role_key),
            "emailProvider": email_provider,
            "hasBrevoApiKey": bool(brevo_api_key),
            "hasBrevoSenderEmail": bool(brevo_sender_email),
            "hasRootSessionSecret": len(os.getenv("ROOT_SESSION_SECRET", "").strip()) >= 32,
            "hasRootDatabaseUrl": bool(os.getenv("ROOT_DATABASE_URL") or os.getenv("SUPABASE_DB_URL")),
            "hasCronSecret": len(os.getenv("CRON_SECRET", "").strip()) >= 32,
        },
        "scannerDependencies": get_scanner_dependency_status(),
        "tables": table_results,
        "missingTables": missing_tables,
        "failedTables": failed_tables,
        "nextStep": "Apply only the missing versioned migrations in order. Do not run the legacy permissive security-hardening.sql. Redeploy with the repository Dockerfile if scannerDependencies.tesseractInstalled is false.",
    }


@app.get("/scan-document/health")
def scan_document_health() -> dict[str, Any]:
    dependencies = get_scanner_dependency_status()
    return {
        "status": "ok" if dependencies["tesseractInstalled"] else "needs_attention",
        "dependencies": dependencies,
        "nextStep": "Use the repository Dockerfile so tesseract-ocr and poppler-utils are installed.",
    }


@app.get("/email/health")
def email_health() -> dict[str, Any]:
    provider = os.getenv("EMAIL_PROVIDER", "brevo").strip().lower()
    api_key = os.getenv("BREVO_API_KEY", "")
    from_email = os.getenv("BREVO_SENDER_EMAIL", "")
    reply_to_email = os.getenv("BREVO_REPLY_TO_EMAIL", "")
    return {
        "provider": provider,
        "configured": provider == "brevo" and bool(api_key and from_email),
        "hasBrevoApiKey": bool(api_key),
        "hasFromEmail": bool(from_email),
        "fromEmail": from_email,
        "hasReplyToEmail": bool(reply_to_email),
    }


@app.post("/grantor/evaluate-scholar-duplicate")
def evaluate_scholar_duplicate_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return evaluate_scholar_duplicate(
        payload.get("candidate") or {},
        payload.get("existing") or {},
    )


@app.post("/grantor/find-scholar-duplicate")
def find_scholar_duplicate_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    duplicate = find_scholar_duplicate(
        payload.get("candidate") or {},
        payload.get("existingRecords") or [],
        payload.get("options") or {},
    )
    return {"duplicate": duplicate}


@app.post("/grantor/find-matching-scholars")
def find_matching_grantor_scholars_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return {
        "matches": find_matching_grantor_scholars(
            payload.get("student") or {},
            payload.get("scholars") or [],
        ),
        "algorithm": "Name-part and address matching",
    }


@app.post("/admin/match-grantor-students")
def admin_match_grantor_students_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return match_admin_grantor_students(
        payload.get("students") or [],
        payload.get("grantorScholars") or [],
    )


@app.post("/admin/check-student-duplicates")
def admin_check_student_duplicates_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return check_student_table_duplicates(
        payload.get("records") or payload.get("students") or [],
        payload.get("options") or {},
    )


@app.post("/logs/build")
def build_log_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return build_log_payload(
        payload.get("action") or "",
        payload.get("actorId") or "",
        payload.get("actorType") or "",
        payload.get("target") or "",
        payload.get("details") or {},
    )


@app.post("/logs/create")
def create_log_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"student", "grantor", "admin"})
    return create_log(payload)


@app.post("/notifications/student/build")
def build_student_notification_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return build_student_notification_payload(
        payload.get("studentId") or "",
        payload.get("title") or "",
        payload.get("message") or "",
        payload.get("type") or "notification",
        payload.get("extra") or {},
    )


@app.post("/notifications/admin/build")
def build_admin_notification_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return build_admin_notification_payload(
        payload.get("title") or "",
        payload.get("message") or "",
        payload.get("type") or "notification",
        payload.get("extra") or {},
    )


@app.post("/notifications/admin/create")
def create_admin_notification_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"student", "grantor", "admin"})
    return create_admin_notification(payload)


@app.post("/notifications/admin/list")
def list_admin_notifications_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"admin"})
    result = list_admin_notifications()
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail="admin_notifications_unavailable")
    return result


@app.post("/notifications/admin/update")
def update_admin_notification_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"admin"})
    return update_admin_notification(payload.get("id") or "", payload.get("data") or {})


@app.post("/notifications/admin/delete")
def delete_admin_notification_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"admin"})
    return delete_admin_notification(payload.get("id") or "")


@app.post("/notifications/student/create")
def create_student_notification_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"student", "grantor", "admin"})
    if payload.get("actorType") == "student" and str(payload.get("studentId") or "").strip() != str(payload.get("actorId") or "").strip():
        raise HTTPException(status_code=403, detail="student_notification_owner_mismatch")
    return create_student_notification(payload)


@app.post("/notifications/student/list")
def list_student_notifications_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"student", "admin"})
    student_id = str(payload.get("studentId") or payload.get("actorId") or "").strip()
    if payload.get("actorType") == "student" and student_id != str(payload.get("actorId") or "").strip():
        raise HTTPException(status_code=403, detail="student_notification_owner_mismatch")
    result = list_student_notifications(student_id)
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail=result.get("reason") or "student_notifications_unavailable")
    return {**result, "requiredAction": get_student_required_action(student_id)}


@app.post("/notifications/student/broadcast")
def broadcast_student_notification_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"admin"})
    return broadcast_student_notification(payload)


@app.post("/notifications/student/update")
def update_student_notification_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"student", "admin"})
    student_id = str(payload.get("actorId") or "") if payload.get("actorType") == "student" else ""
    return update_student_notification(
        payload.get("id") or "",
        payload.get("data") or {},
        student_id,
        payload.get("sourceTable") or "studentNotifications",
    )


@app.post("/notifications/student/update-many")
def update_student_notifications_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"student", "admin"})
    student_id = str(payload.get("actorId") or "") if payload.get("actorType") == "student" else ""
    result = update_student_notifications(
        payload.get("ids") or [],
        payload.get("data") or {},
        student_id,
        payload.get("sourceTable") or "studentNotifications",
    )
    if not result.get("ok") and not result.get("partial"):
        raise HTTPException(status_code=400, detail=result)
    return result


@app.post("/notifications/student/delete")
def delete_student_notification_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"student", "admin"})
    student_id = str(payload.get("actorId") or "") if payload.get("actorType") == "student" else ""
    return delete_student_notification(
        payload.get("id") or "",
        student_id,
        payload.get("sourceTable") or "studentNotifications",
    )


@app.post("/notifications/grantor/build")
def build_grantor_notification_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return build_grantor_notification_payload(
        payload.get("grantorId") or "",
        payload.get("title") or "",
        payload.get("message") or "",
        payload.get("type") or "notification",
        payload.get("extra") or {},
    )


@app.post("/notifications/grantor/create")
def create_grantor_notification_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"grantor", "admin"})
    return create_grantor_notification(payload)


@app.post("/notifications/grantor/list")
def list_grantor_notifications_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"grantor", "admin"})
    grantor_id = str(payload.get("grantorId") or payload.get("actorId") or "").strip()
    if payload.get("actorType") == "grantor" and grantor_id != str(payload.get("actorId") or "").strip():
        raise HTTPException(status_code=403, detail="grantor_notification_owner_mismatch")
    result = list_grantor_notifications(grantor_id)
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail=result.get("reason") or "grantor_notifications_unavailable")
    return result


@app.post("/notifications/grantor/update")
def update_grantor_notification_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"grantor", "admin"})
    grantor_id = str(payload.get("actorId") or "") if payload.get("actorType") == "grantor" else ""
    return update_grantor_notification(
        payload.get("id") or "",
        payload.get("data") or {},
        grantor_id,
        payload.get("sourceTable") or "grantorNotifications",
    )


@app.post("/notifications/grantor/update-many")
def update_grantor_notifications_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"grantor", "admin"})
    grantor_id = str(payload.get("actorId") or "") if payload.get("actorType") == "grantor" else ""
    result = update_grantor_notifications(
        payload.get("ids") or [],
        payload.get("data") or {},
        grantor_id,
        payload.get("sourceTable") or "grantorNotifications",
    )
    if not result.get("ok") and not result.get("partial"):
        raise HTTPException(status_code=400, detail=result)
    return result


@app.post("/notifications/grantor/delete")
def delete_grantor_notification_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"grantor", "admin"})
    grantor_id = str(payload.get("actorId") or "") if payload.get("actorType") == "grantor" else ""
    return delete_grantor_notification(
        payload.get("id") or "",
        grantor_id,
        payload.get("sourceTable") or "grantorNotifications",
    )


@app.post("/scholarships/validate-documents")
def validate_scholarship_documents_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return validate_scholarship_documents(payload.get("student") or {}, payload.get("provider") or "")


@app.post("/scholarships/check-gwa")
def check_gwa_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return is_gwa_eligible(payload.get("gwa"), payload.get("provider") or "")


@app.post("/scholarships/check-eligibility")
def check_eligibility_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return check_scholarship_eligibility(payload)


@app.post("/scholarships/recommend")
def recommend_scholarships_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"student"})
    actor_id = str(payload.get("actorId") or "").strip()
    student = supabase_document_get("students", actor_id)
    student_data = student.get("data") or {}
    payload["student"] = {"id": actor_id, **student_data}
    return recommend_scholarships(payload)


@app.post("/auth/login")
def portal_login_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return login(payload)


@app.get("/auth/session")
def portal_session_endpoint(request: Request) -> dict[str, Any]:
    return validate_portal_session(request)


@app.post("/portal/data/query")
def portal_data_query_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return query_portal_data(request, payload)


@app.post("/portal/data/mutate")
def portal_data_mutate_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return mutate_portal_data(request, payload)


@app.post("/portal/data/delete")
def portal_data_delete_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return delete_portal_data(request, payload)


@app.post("/auth/email-verification/resend")
def email_verification_resend_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return resend_email_verification(payload)


@app.post("/auth/email-verification/complete")
def email_verification_complete_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return complete_email_verification(payload)


@app.post("/auth/recovery/request")
def password_recovery_request_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return request_password_recovery(payload)


@app.post("/auth/recovery/complete")
def password_recovery_complete_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return complete_password_recovery(request, payload)


@app.get("/admin/security/settings")
def admin_security_settings_endpoint(request: Request) -> dict[str, Any]:
    return get_security_settings(request)


@app.post("/admin/security/settings")
def admin_update_security_settings_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return update_security_settings(request, payload)


@app.post("/admin/grantors/create-account")
def admin_create_grantor_account_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return create_grantor_account(request, payload)


@app.post("/workflows/student/signup/validate")
def validate_student_signup_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    if public_config().get("portal", {}).get("allowStudentSignup") is False:
        raise HTTPException(status_code=403, detail="student_signup_disabled")
    return validate_student_signup(payload)


@app.post("/workflows/student/signup/availability")
def student_signup_availability_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    if public_config().get("portal", {}).get("allowStudentSignup") is False:
        raise HTTPException(status_code=403, detail="student_signup_disabled")
    forwarded_for = str(request.headers.get("x-forwarded-for") or "").split(",", 1)[0].strip()
    requester_key = forwarded_for or (request.client.host if request.client else "unknown")
    return check_signup_availability(payload, requester_key)


@app.post("/workflows/student/signup/document-batches")
async def create_student_signup_document_batch_endpoint(
    student_id: str = Form(...),
    email: str = Form(...),
    identity_kind: str = Form(...),
    cor: UploadFile = File(...),
    identity: UploadFile = File(...),
    rog: UploadFile | None = File(None),
    declared_year: str = Form(""),
) -> dict[str, Any]:
    if public_config().get("portal", {}).get("allowStudentSignup") is False:
        raise HTTPException(status_code=403, detail="student_signup_disabled")
    return await create_signup_document_batch(student_id, email, identity_kind, cor, identity, rog, declared_year)


@app.post("/workflows/student/signup/finalize")
def finalize_student_signup_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    if public_config().get("portal", {}).get("allowStudentSignup") is False:
        raise HTTPException(status_code=403, detail="student_signup_disabled")
    return finalize_student_signup(payload)


@app.post("/workflows/student/email-confirmed")
def student_email_confirmed_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    # The confirmation callback has a valid Supabase session, but it cannot
    # have a portal-verified session until the pending account is activated.
    return promote_email_confirmed_student(payload, require_supabase_user(request, require_verified=False))


@app.get("/admin/students/pending")
def pending_student_accounts_endpoint(request: Request) -> dict[str, Any]:
    return list_pending_student_accounts(request)


@app.post("/admin/students/pending/{student_id}/approve")
def approve_pending_student_account_endpoint(request: Request, student_id: str) -> dict[str, Any]:
    return approve_pending_student_account(request, student_id)


@app.get("/student/profile/workspace")
def student_profile_workspace_endpoint(request: Request) -> dict[str, Any]:
    return get_student_profile_workspace(request)


@app.put("/student/profile/draft")
def save_student_profile_draft_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return save_student_profile_draft(request, payload)


@app.post("/student/profile/photo")
async def upload_student_profile_photo_endpoint(request: Request, file: UploadFile = File(...)) -> dict[str, Any]:
    return await upload_student_profile_photo(request, file)


@app.get("/student/profile/photo/content")
def student_profile_photo_content_endpoint(request: Request) -> Response:
    return student_profile_photo_content(request)


@app.post("/student/profile/preview")
def preview_student_profile_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> Response:
    return preview_student_profile(request, payload)


@app.post("/student/profile/submit")
def submit_student_profile_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return submit_student_profile(request, payload)


@app.post("/student/profile/documents/{document_type}")
async def upload_student_profile_document_endpoint(
    request: Request,
    document_type: str,
    file: UploadFile = File(...),
    document_kind: str = "",
) -> dict[str, Any]:
    return await upload_student_document(request, document_type, file, document_kind)


@app.get("/student/profile/documents/{submission_id}/content")
def student_profile_document_content_endpoint(request: Request, submission_id: str) -> Response:
    return document_content(request, submission_id)


@app.get("/student/profile/snapshots/{snapshot_id}/content")
def student_profile_snapshot_content_endpoint(request: Request, snapshot_id: str) -> Response:
    return profile_snapshot_content(request, snapshot_id)


@app.get("/admin/document-reviews")
def document_review_queue_endpoint(
    request: Request,
    status: str = "",
    document_type: str = "",
    academic_cycle: str = "",
) -> dict[str, Any]:
    return list_document_review_queue(request, status, document_type, academic_cycle)


@app.post("/admin/document-reviews/{submission_id}")
def review_document_submission_endpoint(request: Request, submission_id: str, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return review_document_submission(request, submission_id, payload)


@app.post("/admin/document-policy")
def update_document_policy_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return update_document_policy(request, payload)


@app.post("/admin/document-exceptions")
def create_document_exception_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return create_document_exception(request, payload)


@app.post("/workflows/scholarship/apply")
def apply_scholarship_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"student", "admin"}, owner_key="studentId")
    return apply_scholarship(payload)


@app.post("/workflows/admin/review")
def admin_review_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"admin", "grantor"}, owner_key="grantorId")
    return update_admin_review(payload)


@app.post("/workflows/scholarship/choose")
def choose_scholarship_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"student"}, owner_key="studentId")
    return mutate_scholarship_choice(payload)


@app.post("/workflows/scholarship/withdraw")
def withdraw_scholarship_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"student"}, owner_key="studentId")
    return mutate_scholarship_choice(payload, withdraw=True)


@app.post("/workflows/grantor/applications/confirm-admin-decision")
def grantor_confirm_admin_decision_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"grantor"}, owner_key="grantorId")
    return confirm_grantor_admin_decision(payload)


@app.post("/workflows/scholarship/documents")
def scholarship_documents_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"student"}, owner_key="studentId")
    return update_scholarship_documents(payload)


@app.post("/workflows/admin/grantors/archive-state")
def update_grantor_archive_state_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"admin"})
    return update_grantor_archive_state(payload)


@app.post("/workflows/grantor/scholars/invite-back")
def invite_archived_grantor_scholars_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"grantor"}, owner_key="grantorId")
    return invite_archived_grantor_scholars(payload)


@app.post("/workflows/scholarship/invitation/reject")
def reject_scholarship_invitation_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"student"}, owner_key="studentId")
    return reject_scholarship_invitation(payload)


@app.post("/workflows/materials/update")
def material_request_update_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"student", "admin", "grantor"})
    enforce_material_update_scope(payload)
    return update_material_request(payload)


@app.post("/workflows/scholarship/materials/request")
def request_student_materials_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return request_student_materials(request, payload)


@app.post("/workflows/scholarship/materials/preflight")
def preflight_student_materials_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return preflight_student_materials(request, payload)


@app.post("/workflows/grantor/scholars/import/preview")
def preview_roster_import_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return preview_roster_import(request, payload)


@app.post("/workflows/grantor/scholars/import/commit")
def commit_roster_import_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return commit_roster_import(request, payload)


@app.post("/workflows/admin/roster-conflicts")
def list_roster_conflicts_endpoint(request: Request, payload: dict[str, Any] = Body(default={})) -> dict[str, Any]:
    return list_roster_conflicts(request, payload)


@app.post("/workflows/admin/roster-conflicts/resolve")
def resolve_roster_conflict_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return resolve_roster_conflict(request, payload)


@app.post("/workflows/grantor/scholars/create")
def create_grantor_scholars_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"admin", "grantor"}, owner_key="grantorId")
    return create_grantor_scholars(payload)


@app.post("/workflows/grantor/scholars/update")
def update_grantor_scholar_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"admin", "grantor"}, owner_key="grantorId")
    return update_grantor_scholar(payload)


@app.post("/workflows/grantor/scholars/update-many")
def update_many_grantor_scholars_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"admin", "grantor"}, owner_key="grantorId")
    return update_grantor_scholars(payload)


@app.post("/workflows/grantor/announcements/create")
def create_grantor_announcement_endpoint(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    if public_config().get("portal", {}).get("allowGrantorAnnouncements") is False:
        raise HTTPException(status_code=403, detail="grantor_announcements_disabled")
    enforce_portal_scope(request, payload, {"grantor"}, owner_key="grantorId")
    result = create_grantor_announcement(payload, defer_notifications=True)
    announcement_data = result.pop("_announcementData", None)
    if result.get("ok") and result.get("id") and isinstance(announcement_data, dict):
        if payload.get("audiencePreviewId"):
            targeted = publish_targeted_announcement(request, {
                **payload,
                "previewId": payload["audiencePreviewId"],
                "announcementId": result["id"],
                "title": announcement_data.get("title") or "Scholarship announcement",
                "message": announcement_data.get("description") or announcement_data.get("content") or "A new scholarship notice is available.",
                "route": f"/student-dashboard/announcements/{result['id']}?source=grantor",
            })
            result["targetedDelivery"] = targeted
        else:
            background_tasks.add_task(
                deliver_grantor_announcement_notifications,
                result["id"],
                announcement_data,
                str(payload.get("grantorId") or ""),
                result.get("duplicate") is True,
            )
    return result


@app.post("/workflows/grantor/announcements/republish")
def republish_grantor_announcement_endpoint(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    if public_config().get("portal", {}).get("allowGrantorAnnouncements") is False:
        raise HTTPException(status_code=403, detail="grantor_announcements_disabled")
    enforce_portal_scope(request, payload, {"grantor"}, owner_key="grantorId")
    result = republish_grantor_announcement(payload, defer_notifications=True)
    announcement_data = result.pop("_announcementData", None)
    if result.get("ok") and result.get("id") and isinstance(announcement_data, dict):
        if payload.get("audiencePreviewId"):
            result["targetedDelivery"] = publish_targeted_announcement(request, {
                **payload, "previewId": payload["audiencePreviewId"], "announcementId": result["id"],
                "title": announcement_data.get("title") or "Scholarship announcement",
                "message": announcement_data.get("description") or announcement_data.get("content") or "A scholarship notice was updated.",
                "route": f"/student-dashboard/announcements/{result['id']}?source=grantor",
            })
        else:
            background_tasks.add_task(
                deliver_grantor_announcement_notifications,
                result["id"], announcement_data, str(payload.get("grantorId") or ""), result.get("duplicate") is True,
            )
    return result


@app.post("/workflows/grantor/announcements/update")
def update_grantor_announcement_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    if public_config().get("portal", {}).get("allowGrantorAnnouncements") is False:
        raise HTTPException(status_code=403, detail="grantor_announcements_disabled")
    enforce_portal_scope(request, payload, {"grantor"}, owner_key="grantorId")
    return update_grantor_announcement(payload)


@app.post("/workflows/grantor/announcements/slots")
def configure_grantor_announcement_slots_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    if public_config().get("portal", {}).get("allowGrantorAnnouncements") is False:
        raise HTTPException(status_code=403, detail="grantor_announcements_disabled")
    enforce_portal_scope(request, payload, {"grantor"}, owner_key="grantorId")
    return configure_grantor_announcement_slots(payload)


@app.post("/workflows/grantor/profile/update")
def update_grantor_profile_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"grantor"}, owner_key="grantorId")
    return update_grantor_profile(payload)


@app.post("/workflows/grantor-scope/get")
def get_grantor_scope_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return get_grantor_scope(request, payload)


@app.post("/workflows/admin/grantor-scope/save")
def save_grantor_scope_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return save_grantor_scope(request, payload)


@app.post("/workflows/applicants/list")
def list_filtered_applicants_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return list_filtered_applicants(request, payload)


@app.post("/workflows/applicants/export")
def export_filtered_applicants_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> Response:
    content, content_type, filename = build_applicant_export(request, payload)
    return Response(content=content, media_type=content_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@app.post("/workflows/admin/student-number/correct")
def correct_student_number_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return correct_student_number(request, payload)


@app.post("/workflows/announcements/audience/preview")
def preview_announcement_audience_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return preview_announcement_audience(request, payload)


@app.post("/workflows/announcements/publish")
def publish_targeted_announcement_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return publish_targeted_announcement(request, payload)


@app.post("/workflows/waitlist/status")
def waitlist_status_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return list_waitlist(request, payload)


@app.post("/workflows/waitlist/offer")
def waitlist_offer_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return resolve_waitlist(request, payload)


@app.post("/internal/cron/waitlist/expire")
def waitlist_expiry_endpoint(request: Request, payload: dict[str, Any] = Body(default={})) -> dict[str, Any]:
    return expire_waitlist(request, payload)


@app.post("/support/chat")
def support_chat_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return ask_support_assistant(payload)


@app.post("/support/feedback")
def support_feedback_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    actor_id = str(request.headers.get("x-portal-actor-id") or "").strip()
    actor_type = normalize_role(request.headers.get("x-portal-actor-type"))
    if actor_id and actor_type in {"student", "grantor", "admin"}:
        enforce_portal_scope(request, payload, {"student", "grantor", "admin"})
        payload["userId"] = actor_id
        payload["userType"] = actor_type
    else:
        payload["userId"] = "guest"
        payload["userType"] = "guest"
    payload["_clientIp"] = request.client.host if request.client else "unknown"
    return save_support_feedback(payload)


@app.post("/support/tickets")
def create_support_ticket_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"student", "grantor", "admin"})
    return create_portal_ticket(payload)


@app.get("/support/tickets")
def list_support_tickets_endpoint(request: Request) -> dict[str, Any]:
    identity: dict[str, Any] = {}
    enforce_portal_scope(request, identity, {"student", "grantor", "admin"})
    return {"ok": True, "tickets": list_portal_tickets(str(identity.get("actorId") or ""), str(identity.get("actorType") or ""))}


@app.get("/support/tickets/{ticket_id}")
def get_support_ticket_endpoint(ticket_id: str, request: Request) -> dict[str, Any]:
    identity: dict[str, Any] = {}
    enforce_portal_scope(request, identity, {"student", "grantor", "admin"})
    return {"ok": True, "ticket": get_portal_ticket(ticket_id, str(identity.get("actorId") or ""), str(identity.get("actorType") or ""))}


@app.post("/support/tickets/{ticket_id}/messages")
def add_support_ticket_message_endpoint(ticket_id: str, request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"student", "grantor", "admin"})
    return add_portal_message(ticket_id, str(payload.get("actorId") or ""), str(payload.get("actorType") or ""), str(payload.get("message") or ""))
    

@app.delete("/support/tickets/{ticket_id}")
def delete_support_ticket_endpoint(ticket_id: str, request: Request) -> dict[str, Any]:
    identity: dict[str, Any] = {}
    enforce_portal_scope(request, identity, {"student", "grantor", "admin"})
    return delete_portal_ticket(ticket_id, str(identity.get("actorId") or ""), str(identity.get("actorType") or ""))


@app.post("/support/recovery/tickets")
def create_recovery_ticket_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return create_public_recovery_ticket(payload)


@app.get("/support/recovery/tickets/{ticket_id}")
def get_recovery_ticket_endpoint(ticket_id: str, secret: str) -> dict[str, Any]:
    return get_public_recovery_ticket(ticket_id, secret)


@app.post("/support/recovery/tickets/{ticket_id}/messages")
def add_recovery_ticket_message_endpoint(ticket_id: str, secret: str, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return add_public_recovery_message(ticket_id, secret, str(payload.get("message") or ""))


@app.post("/support/recovery/tickets/{ticket_id}/attachments")
async def upload_recovery_ticket_attachment_endpoint(ticket_id: str, secret: str, file: UploadFile = File(...)) -> dict[str, Any]:
    return await upload_public_recovery_attachment(ticket_id, secret, file)


@app.post("/support/recovery/tickets/{ticket_id}/confirm-email")
def confirm_recovery_email_endpoint(ticket_id: str, secret: str, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return confirm_public_recovery_email(ticket_id, secret, str(payload.get("code") or ""))


@app.get("/student/history")
def student_history_endpoint(request: Request, page: int = 1, page_size: int = 20, cycle: str = "", event_type: str = "") -> dict[str, Any]:
    return list_student_history(request, max(1, page), max(1, min(100, page_size)), cycle, event_type)


@app.post("/student/applications/{application_id}/signed-soe")
async def signed_soe_upload_endpoint(application_id: str, request: Request, file: UploadFile = File(...)) -> dict[str, Any]:
    return await upload_signed_soe(request, application_id, file)


@app.get("/student/applications/{application_id}/signed-soe")
def signed_soe_list_endpoint(application_id: str, request: Request) -> dict[str, Any]:
    return list_signed_soe(request, application_id)


@app.get("/signed-soe/{submission_id}/content")
def signed_soe_content_endpoint(submission_id: str, request: Request) -> Response:
    return signed_soe_content(request, submission_id)


@app.post("/admin/signed-soe/{submission_id}/reopen")
def signed_soe_reopen_endpoint(submission_id: str, request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return reopen_signed_soe(request, submission_id, str(payload.get("reason") or ""))


@app.post("/reports/pdf")
def generate_pdf_report_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> Response:
    enforce_portal_scope(request, payload, {"admin"})
    if public_config().get("portal", {}).get("reportExportEnabled") is False:
        raise HTTPException(status_code=403, detail="report_exports_disabled")
    try:
        validate_report_payload(payload)
        pdf_bytes = build_report_pdf_bytes(payload)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    filename = sanitize_report_filename(payload.get("filename"))
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/reports/top-students/preview")
def preview_top_students_report_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"admin"})
    students = [item for item in payload.get("students") or [] if isinstance(item, dict)]
    offerings = [item for item in payload.get("offerings") or [] if isinstance(item, dict)]
    if len(students) > 10_000 or len(offerings) > 1_000:
        raise HTTPException(status_code=422, detail="top_students_input_limit_exceeded")

    groups: dict[str, dict[str, Any]] = {}
    for offering in offerings:
        offering_id = str(offering.get("id") or offering.get("announcementId") or "").strip()
        if not offering_id:
            continue
        groups[offering_id] = {
            "offering": offering,
            "rows": [],
        }

    for student in students:
        ineligible_offering_ids = {
            str(value).strip()
            for value in student.get("ineligibleOfferingIds") or []
            if str(value).strip()
        }
        eligible_offerings = [
            offering
            for offering in offerings
            if str(offering.get("id") or offering.get("announcementId") or "").strip()
            not in ineligible_offering_ids
        ]
        ranked = recommend_scholarships({"student": student, "scholarships": eligible_offerings})
        for recommendation in ranked.get("recommendations") or []:
            offering = recommendation.get("item") or {}
            offering_id = str(offering.get("id") or offering.get("announcementId") or "").strip()
            if offering_id not in groups:
                continue
            groups[offering_id]["rows"].append({
                "studentId": student.get("studentId") or student.get("studentnumber") or student.get("id") or "-",
                "fullName": student.get("fullName") or " ".join(filter(None, [student.get("fname"), student.get("mname"), student.get("lname")])) or "-",
                "course": student.get("course") or "-",
                "yearLevel": student.get("year") or student.get("yearLevel") or "-",
                "gwa": student.get("gwa") or student.get("currentGwa") or student.get("currentGWA") or "-",
                "score": recommendation.get("score") or 0,
                "reasons": ", ".join(recommendation.get("reasons") or []) or "Eligible",
            })

    result_groups = []
    for group in groups.values():
        offering = group["offering"]
        rows = sorted(
            group["rows"],
            key=lambda row: (-float(row.get("score") or 0), str(row.get("fullName") or "").lower()),
        )[:10]
        for index, row in enumerate(rows):
            row["rank"] = index + 1
        result_groups.append({
            "announcementId": offering.get("id") or offering.get("announcementId"),
            "scholarship": offering.get("scholarshipTitle") or offering.get("title") or "Scholarship",
            "grantor": offering.get("grantorName") or offering.get("providerLabel") or "Grantor",
            "rows": rows,
        })
    result_groups.sort(key=lambda group: (str(group["grantor"]).lower(), str(group["scholarship"]).lower()))
    return {"ok": True, "algorithm": "Weighted Recommendation Scoring", "groups": result_groups}


@app.post("/scan-document")
async def scan_document(
    document_type: str = "cor",
    file: UploadFile = File(...),
) -> dict[str, Any]:
    file_bytes = await file.read()
    content_type = (file.content_type or "").lower()
    filename = (file.filename or "").lower()
    max_scan_bytes = 10 * 1024 * 1024
    if not file_bytes:
        raise HTTPException(status_code=400, detail={"error": "empty_file", "message": "The uploaded document is empty."})
    if len(file_bytes) > max_scan_bytes:
        raise HTTPException(status_code=413, detail={"error": "file_too_large", "message": "Document scans are limited to 10 MB."})

    normalized_document_type = str(document_type or "cor").strip().lower()
    if normalized_document_type in {"cor", "cog", "rog"} and content_type != "application/pdf" and not filename.endswith(".pdf"):
        raise HTTPException(
            status_code=415,
            detail={"error": "pdf_required", "message": "COR and ROG document scans accept PDF files only."},
        )
    allowed_content_types = {"application/pdf", "image/png", "image/jpeg", "image/webp"}
    if content_type and content_type not in allowed_content_types:
        raise HTTPException(
            status_code=415,
            detail={"error": "unsupported_file_type", "message": f"Unsupported document type: {content_type}."},
        )

    try:
        if content_type == "application/pdf" or filename.endswith(".pdf"):
            extracted = parse_pdf_document(file_bytes, document_type)
        else:
            text = extract_image_text(file_bytes)
            extracted = parse_document(text, document_type)
    except RuntimeError as error:
        message = str(error)
        status_code = 503 if "tesseract_not_installed" in message else 500
        raise HTTPException(
            status_code=status_code,
            detail={
                "error": "ocr_dependency_missing" if status_code == 503 else "document_scan_failed",
                "message": message,
                "scannerDependencies": get_scanner_dependency_status(),
                "nextStep": "Redeploy the backend using the repository Dockerfile so tesseract-ocr and poppler-utils are installed.",
            },
        ) from error

    return {
        "ok": True,
        "filename": file.filename,
        "contentType": file.content_type,
        "extracted": extracted,
    }


@app.get("/{full_path:path}")
def api_not_found(full_path: str) -> dict[str, Any]:
    raise HTTPException(
        status_code=404,
        detail={
            "error": "api_route_not_found",
            "path": f"/{full_path}",
            "message": "This backend route does not exist. Open the frontend site for pages, or call a listed API endpoint.",
            "frontend": os.getenv("FRONTEND_URL", "https://bulsuscholar.com"),
            "availableHealthRoutes": ["/", "/health", "/deployment/health", "/email/health"],
        },
    )
