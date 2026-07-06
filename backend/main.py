import os
from typing import Any

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - dependency is installed from requirements.txt
    load_dotenv = None

from fastapi import Body, FastAPI, File, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware

if load_dotenv:
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(backend_dir)
    load_dotenv(os.path.join(project_root, ".env"))
    load_dotenv(os.path.join(backend_dir, ".env"), override=True)

try:
    from .document_scanner import extract_image_text, extract_pdf_text, parse_document
    from .email_service import send_email_notification
    from .grantor_algorithms import (
        evaluate_scholar_duplicate,
        find_matching_grantor_scholars,
        find_scholar_duplicate,
        match_admin_grantor_students,
    )
    from .report_service import build_csv_bytes, build_report_pdf_bytes
    from .scholarship_rules import (
        check_scholarship_eligibility,
        is_gwa_eligible,
        recommend_scholarships,
        validate_scholarship_documents,
    )
    from .signup_service import finalize_student_signup, validate_student_signup
    from .supabase_ops import (
        build_grantor_notification_payload,
        build_log_payload,
        build_student_notification_payload,
        create_grantor_notification,
        create_log,
        create_student_notification,
        delete_grantor_notification,
        delete_student_notification,
        update_grantor_notification,
        update_student_notification,
    )
    from .workflow_service import (
        apply_scholarship,
        create_grantor_announcement,
        create_grantor_scholars,
        request_grantor_password_change,
        update_admin_review,
        update_grantor_announcement,
        update_grantor_profile,
        update_grantor_scholar,
        update_grantor_scholars,
        update_material_request,
    )
except ImportError:  # pragma: no cover - supports `uvicorn main:app` from backend/
    from document_scanner import extract_image_text, extract_pdf_text, parse_document
    from email_service import send_email_notification
    from grantor_algorithms import (
        evaluate_scholar_duplicate,
        find_matching_grantor_scholars,
        find_scholar_duplicate,
        match_admin_grantor_students,
    )
    from report_service import build_csv_bytes, build_report_pdf_bytes
    from scholarship_rules import (
        check_scholarship_eligibility,
        is_gwa_eligible,
        recommend_scholarships,
        validate_scholarship_documents,
    )
    from signup_service import finalize_student_signup, validate_student_signup
    from supabase_ops import (
        build_grantor_notification_payload,
        build_log_payload,
        build_student_notification_payload,
        create_grantor_notification,
        create_log,
        create_student_notification,
        delete_grantor_notification,
        delete_student_notification,
        update_grantor_notification,
        update_student_notification,
    )
    from workflow_service import (
        apply_scholarship,
        create_grantor_announcement,
        create_grantor_scholars,
        request_grantor_password_change,
        update_admin_review,
        update_grantor_announcement,
        update_grantor_profile,
        update_grantor_scholar,
        update_grantor_scholars,
        update_material_request,
    )


app = FastAPI(title="BulsuScholar Backend Services")

allowed_origins = [
    item.strip()
    for item in os.getenv("DOCUMENT_SCAN_ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if item.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


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
def create_log_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
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


@app.post("/notifications/student/create")
def create_student_notification_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return create_student_notification(payload)


@app.post("/notifications/student/update")
def update_student_notification_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return update_student_notification(payload.get("id") or "", payload.get("data") or {})


@app.post("/notifications/student/delete")
def delete_student_notification_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
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
def create_grantor_notification_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return create_grantor_notification(payload)


@app.post("/notifications/grantor/update")
def update_grantor_notification_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return update_grantor_notification(payload.get("id") or "", payload.get("data") or {})


@app.post("/notifications/grantor/delete")
def delete_grantor_notification_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
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
    return validate_student_signup(payload)


@app.post("/workflows/student/signup/finalize")
def finalize_student_signup_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return finalize_student_signup(payload)


@app.post("/workflows/scholarship/apply")
def apply_scholarship_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return apply_scholarship(payload)


@app.post("/workflows/admin/review")
def admin_review_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return update_admin_review(payload)


@app.post("/workflows/materials/update")
def material_request_update_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return update_material_request(payload)


@app.post("/workflows/grantor/scholars/create")
def create_grantor_scholars_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return create_grantor_scholars(payload)


@app.post("/workflows/grantor/scholars/update")
def update_grantor_scholar_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return update_grantor_scholar(payload)


@app.post("/workflows/grantor/scholars/update-many")
def update_many_grantor_scholars_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return update_grantor_scholars(payload)


@app.post("/workflows/grantor/announcements/create")
def create_grantor_announcement_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return create_grantor_announcement(payload)


@app.post("/workflows/grantor/announcements/update")
def update_grantor_announcement_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return update_grantor_announcement(payload)


@app.post("/workflows/grantor/password/request")
def request_grantor_password_change_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return request_grantor_password_change(payload)


@app.post("/workflows/grantor/profile/update")
def update_grantor_profile_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return update_grantor_profile(payload)


@app.post("/reports/csv")
def generate_csv_report_endpoint(payload: dict[str, Any] = Body(...)) -> Response:
    csv_bytes = build_csv_bytes(payload.get("headers") or [], payload.get("rows") or [])
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={payload.get('filename') or 'report.csv'}"},
    )


@app.post("/reports/pdf")
def generate_pdf_report_endpoint(payload: dict[str, Any] = Body(...)) -> Response:
    pdf_bytes = build_report_pdf_bytes(payload)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={payload.get('filename') or 'report.pdf'}"},
    )


@app.post("/scan-document")
async def scan_document(
    document_type: str = "cor",
    file: UploadFile = File(...),
) -> dict[str, Any]:
    file_bytes = await file.read()
    content_type = (file.content_type or "").lower()
    filename = (file.filename or "").lower()

    if content_type == "application/pdf" or filename.endswith(".pdf"):
        text = extract_pdf_text(file_bytes)
    else:
        text = extract_image_text(file_bytes)

    return {
        "ok": True,
        "filename": file.filename,
        "contentType": file.content_type,
        "extracted": parse_document(text, document_type),
    }
