import os
import re
from typing import Any

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - dependency is installed from requirements.txt
    load_dotenv = None

from fastapi import BackgroundTasks, Body, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

if load_dotenv:
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(backend_dir)
    load_dotenv(os.path.join(project_root, ".env"))
    load_dotenv(os.path.join(backend_dir, ".env"), override=True)

try:
    from .document_scanner import extract_image_text, get_scanner_dependency_status, parse_document, parse_pdf_document
    from .access_control import enforce_material_update_scope, enforce_portal_scope, normalize_role
    from .scholarship_choice_service import mutate_scholarship_choice, update_scholarship_documents
    from .email_service import send_email_notification
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
    from .signup_service import finalize_student_signup, validate_student_signup
    from .support_service import ask_support_assistant
    from .priority_one_service import save_support_feedback
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
        request_grantor_password_change,
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
    from access_control import enforce_material_update_scope, enforce_portal_scope, normalize_role
    from scholarship_choice_service import mutate_scholarship_choice, update_scholarship_documents
    from email_service import send_email_notification
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
    from signup_service import finalize_student_signup, validate_student_signup
    from support_service import ask_support_assistant
    from priority_one_service import save_support_feedback
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
        request_grantor_password_change,
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
        "https://bulsu-scholar.vercel.app",
        os.getenv("FRONTEND_URL", "").strip(),
        os.getenv("VITE_APP_URL", "").strip(),
        os.getenv("VITE_PUBLIC_SITE_URL", "").strip(),
    ]
    return sorted({origin.rstrip("/") for origin in [*default_origins, *configured_origins] if origin})


allowed_origins = build_allowed_origins()
allowed_origin_regex = os.getenv("DOCUMENT_SCAN_ALLOWED_ORIGIN_REGEX", r"https://.*\.vercel\.app")


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
        or request.url.path in {"/", "/health", "/deployment/health", "/scan-document/health", "/email/health", "/config/public", "/support/chat", "/support/feedback", "/openapi.json", "/docs"}
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
    "soe_requests",
    "soe_downloads",
    "student_warnings",
    "studentNotifications",
    "grantorNotifications",
    "student_document_usage",
    "systemLogs",
]


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "name": "BulsuScholar Backend Services",
        "status": "running",
        "frontend": os.getenv("FRONTEND_URL", "https://bulsu-scholar.vercel.app"),
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
        "scannerDependencies": get_scanner_dependency_status(),
    }


@app.get("/deployment/health")
def deployment_health() -> dict[str, Any]:
    supabase_url = os.getenv("SUPABASE_URL", "")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    resend_api_key = os.getenv("RESEND_API_KEY", "")
    resend_from_email = os.getenv("RESEND_FROM_EMAIL", "")
    table_results = [supabase_table_status(table) for table in REQUIRED_SUPABASE_TABLES]
    missing_tables = [
        item["table"]
        for item in table_results
        if not item.get("ok") and item.get("reason") == "missing_or_unloaded_supabase_table"
    ]
    failed_tables = [item for item in table_results if not item.get("ok")]

    return {
        "status": "ok" if not failed_tables and supabase_url and service_role_key else "needs_attention",
        "frontendUrl": os.getenv("FRONTEND_URL", "https://bulsu-scholar.vercel.app"),
        "cors": {
            "allowedOrigins": allowed_origins,
            "allowedOriginRegex": allowed_origin_regex,
        },
        "environment": {
            "hasSupabaseUrl": bool(supabase_url),
            "hasSupabaseServiceRoleKey": bool(service_role_key),
            "hasResendApiKey": bool(resend_api_key),
            "hasResendFromEmail": bool(resend_from_email),
        },
        "scannerDependencies": get_scanner_dependency_status(),
        "tables": table_results,
        "missingTables": missing_tables,
        "failedTables": failed_tables,
        "nextStep": "Run supabase/security-hardening.sql if tables are missing. Redeploy the backend using the repository Dockerfile if scannerDependencies.tesseractInstalled is false.",
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
    api_key = os.getenv("RESEND_API_KEY", "")
    from_email = os.getenv("RESEND_FROM_EMAIL", "")
    return {
        "configured": bool(api_key and from_email),
        "hasResendApiKey": bool(api_key),
        "hasFromEmail": bool(from_email),
        "fromEmail": from_email,
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


@app.post("/email/send")
def send_email_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    result = send_email_notification(payload)
    if not result.get("sent"):
        raise HTTPException(status_code=502, detail=result)
    return result


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


@app.post("/notifications/student/broadcast")
def broadcast_student_notification_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"admin"})
    return broadcast_student_notification(payload)


@app.post("/notifications/student/update")
def update_student_notification_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"student", "admin"})
    return update_student_notification(payload.get("id") or "", payload.get("data") or {})


@app.post("/notifications/student/update-many")
def update_student_notifications_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"student", "admin"})
    student_id = str(payload.get("actorId") or "") if payload.get("actorType") == "student" else ""
    result = update_student_notifications(payload.get("ids") or [], payload.get("data") or {}, student_id)
    if not result.get("ok") and not result.get("partial"):
        raise HTTPException(status_code=400, detail=result)
    return result


@app.post("/notifications/student/delete")
def delete_student_notification_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"student", "admin"})
    return delete_student_notification(payload.get("id") or "")


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


@app.post("/notifications/grantor/update")
def update_grantor_notification_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"grantor", "admin"})
    return update_grantor_notification(payload.get("id") or "", payload.get("data") or {})


@app.post("/notifications/grantor/update-many")
def update_grantor_notifications_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"grantor", "admin"})
    grantor_id = str(payload.get("actorId") or "") if payload.get("actorType") == "grantor" else ""
    result = update_grantor_notifications(payload.get("ids") or [], payload.get("data") or {}, grantor_id)
    if not result.get("ok") and not result.get("partial"):
        raise HTTPException(status_code=400, detail=result)
    return result


@app.post("/notifications/grantor/delete")
def delete_grantor_notification_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"grantor", "admin"})
    return delete_grantor_notification(payload.get("id") or "")


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
def recommend_scholarships_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return recommend_scholarships(payload)


@app.post("/workflows/student/signup/validate")
def validate_student_signup_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    if public_config().get("portal", {}).get("allowStudentSignup") is False:
        raise HTTPException(status_code=403, detail="student_signup_disabled")
    return validate_student_signup(payload)


@app.post("/workflows/student/signup/finalize")
def finalize_student_signup_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    if public_config().get("portal", {}).get("allowStudentSignup") is False:
        raise HTTPException(status_code=403, detail="student_signup_disabled")
    return finalize_student_signup(payload)


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
        background_tasks.add_task(
            deliver_grantor_announcement_notifications,
            result["id"],
            announcement_data,
            str(payload.get("grantorId") or ""),
            result.get("duplicate") is True,
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


@app.post("/workflows/grantor/password/request")
def request_grantor_password_change_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"grantor"}, owner_key="grantorId")
    return request_grantor_password_change(payload)


@app.post("/workflows/grantor/profile/update")
def update_grantor_profile_endpoint(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    enforce_portal_scope(request, payload, {"grantor"}, owner_key="grantorId")
    return update_grantor_profile(payload)


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
            "frontend": os.getenv("FRONTEND_URL", "https://bulsu-scholar.vercel.app"),
            "availableHealthRoutes": ["/", "/health", "/deployment/health", "/email/health"],
        },
    )
