"""Server-only entry points for the transactional scholarship-choice rollout.

These endpoints deliberately do not accept application state, review decisions,
slot counts, or notification recipients from the browser.
"""

import os
from typing import Any
from uuid import uuid4
from urllib.parse import unquote, urlparse

try:
    from .supabase_ops import supabase_document_get, supabase_rpc, supabase_select
except ImportError:  # Supports uvicorn main:app from backend/.
    from supabase_ops import supabase_document_get, supabase_rpc, supabase_select


def _normalize(value: Any) -> str:
    return str(value or "").strip().lower()


def _stored_invitation_matches(invitation: dict[str, Any], application: dict[str, Any], invitation_id: str) -> bool:
    if _normalize(invitation.get("status") or "pending") not in {"pending", "invited"}:
        return False
    if invitation_id and _normalize(invitation.get("id")) != _normalize(invitation_id):
        return False
    invitation_grantor = _normalize(invitation.get("grantorId") or invitation.get("providerId"))
    application_grantor = _normalize(application.get("grantorId") or application.get("providerId"))
    if not invitation_grantor or invitation_grantor != application_grantor:
        return False
    invitation_announcement = _normalize(invitation.get("announcementId"))
    application_announcement = _normalize(application.get("announcementId"))
    if invitation_announcement:
        return invitation_announcement == application_announcement if application_announcement else bool(invitation_id)
    invitation_name = _normalize(invitation.get("scholarshipName") or invitation.get("announcementTitle"))
    application_name = _normalize(application.get("scholarshipName") or application.get("scholarshipTitle"))
    return bool(invitation_name and application_name and invitation_name == application_name)


CHOICE_MESSAGES = {
    "scholarship_choice_not_enabled": "Scholarship selection is not available yet.",
    "application_not_found": "This application is no longer available.",
    "application_closed": "This application has already been closed.",
    "scholarship_already_committed": "You have already selected a scholarship.",
    "commitment_requires_resolution": "Please contact the scholarship office to resolve your existing scholarship records.",
    "document_review_required": "Complete document review before choosing this scholarship.",
    "document_versions_changed": "Your documents changed after review. A new review is required.",
    "grantor_archived": "This grantor is not accepting scholarship requests.",
    "student_account_blocked": "Your account cannot perform scholarship actions.",
    "slot_reservation_missing": "This application has no active slot reservation. Please contact the scholarship office.",
    "grantor_application_exists": "You already have an active application with this grantor.",
    "reapply_cooldown_active": "Please wait 24 hours before applying to this grantor again.",
    "scholarship_ineligible": "Your current GWA or required COR, ROG, Student ID, or Student Application Profile no longer meets this scholarship's requirements. Update your Profile documents, then ask the scholarship office to review them again.",
    "archive_choice_required": "Choose whether to keep or change your scholarship before continuing.",
    "invalid_archive_choice": "This archived-grantor scholarship decision is not valid.",
    "original_commitment_missing": "The original scholarship commitment could not be verified.",
    "replacement_not_allowed": "This application is not an authorized replacement scholarship.",
    "replacement_already_committed": "A replacement scholarship has already been selected.",
    "authoritative_roster_locked": "This scholarship was assigned from an official roster and cannot be changed or withdrawn while the roster record is active.",
    "roster_assignment_conflict": "The scholarship office must correct your conflicting roster records before you can apply.",
    "location_out_of_scope": "Your self-declared permanent address is outside this grantor's approved location scope.",
    "waitlist_full": "The system waitlist is currently full. Please check again after another entry is resolved.",
}


def scholarship_choice_enabled() -> bool:
    # This compatibility endpoint remains fail-closed unless explicitly enabled
    # during rollout. The browser no longer exposes a Keep/Change decision.
    return os.getenv("ENABLE_SCHOLARSHIP_CHOICE", "false").strip().lower() in {"1", "true", "yes"}


def reserve_scholarship_application(payload: dict[str, Any]) -> dict[str, Any]:
    application = payload.get("application") or {}
    student_id = str(payload.get("studentId") or "").strip()
    if payload.get("actorType") != "student" or payload.get("actorId") != student_id:
        return {"ok": False, "reason": "portal_record_owner_mismatch"}
    announcement_id = str(application.get("announcementId") or "").strip()
    grantor_id = str(application.get("grantorId") or application.get("providerId") or "").strip()
    invitation_id = str(payload.get("invitationId") or "").strip()
    student_result = supabase_document_get("students", student_id) if student_id else {"ok": False}
    student_data = student_result.get("data") or {}
    if _normalize((student_data.get("rosterAssignmentState") or {}).get("status")) == "conflict":
        return {"ok": False, "reason": "roster_assignment_conflict",
                "message": CHOICE_MESSAGES["roster_assignment_conflict"]}
    stored_invitations = student_data.get("scholarshipInvitations")
    matching_invitation = next((invitation for invitation in stored_invitations or []
        if isinstance(invitation, dict) and _stored_invitation_matches(invitation, application, invitation_id)), None)
    if not announcement_id and matching_invitation:
        announcement_id = str(matching_invitation.get("announcementId") or "").strip()
    if not announcement_id and grantor_id and matching_invitation:
        offering_name = str(application.get("scholarshipName") or application.get("providerLabel") or "").strip().lower()
        offerings = supabase_select("grantor_portal_announcements", {"parent_id": grantor_id}, limit=0)
        candidates = [row for row in offerings.get("rows") or [] if offering_name and
            str((row.get("data") or {}).get("scholarshipTitle") or (row.get("data") or {}).get("title") or "").strip().lower() == offering_name
            and (row.get("data") or {}).get("applicationEnabled") is True
            and (row.get("data") or {}).get("archived") is not True]
        candidates.sort(key=lambda row: str((row.get("data") or {}).get("createdAt") or row.get("created_at") or ""), reverse=True)
        announcement_id = str(candidates[0].get("id") or "") if candidates else ""
    if not student_id or not announcement_id or not grantor_id:
        return {"ok": False, "reason": "missing_application_identity"}
    # Both identifiers are server-generated. Browser retries match the stored
    # student/grantor/offering tuple instead of trusting a caller's record ID.
    application_id = str(uuid4())
    application_number = f"{student_id[-3:]}-{uuid4().hex[:8]}"
    commitment = student_data.get("scholarshipCommitment") if isinstance(student_data.get("scholarshipCommitment"), dict) else {}
    if commitment:
        return {"ok": False, "reason": "scholarship_already_committed",
                "message": CHOICE_MESSAGES["scholarship_already_committed"]}
    result = supabase_rpc("reserve_or_waitlist_scholarship", {
        "p_student_id": student_id, "p_announcement_id": announcement_id,
        "p_grantor_id": grantor_id, "p_application_id": application_id,
        "p_application_number": application_number,
    })
    if not result.get("ok"):
        reason = result.get("reason") or "slot_reservation_failed"
        return {"ok": False, "reason": reason,
                "message": CHOICE_MESSAGES.get(reason, "Unable to submit this application. Please refresh and try again.")}
    return {"ok": True, **(result.get("data") or {})}


def mutate_scholarship_choice(payload: dict[str, Any], *, withdraw: bool = False) -> dict[str, Any]:
    if not scholarship_choice_enabled():
        return {"ok": False, "reason": "scholarship_choice_not_enabled",
                "message": CHOICE_MESSAGES["scholarship_choice_not_enabled"]}
    student_id = str(payload.get("studentId") or "").strip()
    application_id = str(payload.get("applicationId") or "").strip()
    if not student_id or not application_id:
        return {"ok": False, "reason": "missing_application_identity"}
    if payload.get("actorType") != "student" or payload.get("actorId") != student_id:
        return {"ok": False, "reason": "portal_record_owner_mismatch"}
    if payload.get("confirmed") is not True:
        return {"ok": False, "reason": "confirmation_required"}
    student_result = supabase_document_get("students", student_id)
    student_data = student_result.get("data") or {}
    replacement_application = supabase_document_get("scholarship_applications", application_id)
    replacement_data = replacement_application.get("data") or {}
    if (replacement_data.get("source") == "authoritative_roster"
            and replacement_data.get("withdrawalLocked") is True):
        return {"ok": False, "reason": "authoritative_roster_locked",
                "message": CHOICE_MESSAGES["authoritative_roster_locked"]}
    result = supabase_rpc("mutate_scholarship_choice", {
        "p_student_id": student_id,
        "p_application_id": application_id,
        "p_action": "withdraw" if withdraw else "choose",
    })
    if not result.get("ok"):
        reason = result.get("reason") or "scholarship_choice_failed"
        return {"ok": False, "reason": reason,
                "message": CHOICE_MESSAGES.get(reason, "Unable to update your application. Please refresh and try again.")}
    response_data = result.get("data") or {}
    material_request = response_data.get("materialRequest") or {}
    if not withdraw and material_request.get("id"):
        persisted_request = supabase_document_get("soe_requests", str(material_request["id"]))
        if persisted_request.get("ok") and persisted_request.get("data"):
            response_data = {**response_data, "materialRequest": persisted_request["data"]}
    return {"ok": True, **response_data}


def update_scholarship_documents(payload: dict[str, Any]) -> dict[str, Any]:
    if not scholarship_choice_enabled():
        return {"ok": False, "reason": "scholarship_choice_not_enabled"}
    student_id = str(payload.get("studentId") or "").strip()
    if not student_id or payload.get("actorType") != "student" or payload.get("actorId") != student_id:
        return {"ok": False, "reason": "portal_record_owner_mismatch"}
    field = payload.get("field")
    value = payload.get("value")
    if field not in {"applicationFormFile", "otherRequirementUploads"} or not isinstance(value, dict):
        return {"ok": False, "reason": "invalid_application_documents"}
    files = [value] if field == "applicationFormFile" else [
        file for entry in value.values() if isinstance(entry, dict)
        for file in (entry.get("files") if isinstance(entry.get("files"), list) else []) if isinstance(file, dict)
    ]
    storage_host = urlparse(os.getenv("SUPABASE_URL", "")).netloc
    if not files or any(
        urlparse(str(file.get("url") or "")).scheme != "https"
        or urlparse(str(file.get("url") or "")).netloc != storage_host
        or f"/students/{student_id}/" not in unquote(urlparse(str(file.get("url") or "")).path)
        for file in files
    ):
        return {"ok": False, "reason": "invalid_application_documents"}
    result = supabase_rpc("update_scholarship_application_documents", {
        "p_student_id": student_id, "p_application_id": str(payload.get("applicationId") or ""),
        "p_field": field, "p_value": value,
    })
    if not result.get("ok"):
        reason = result.get("reason") or "application_documents_failed"
        return {"ok": False, "reason": reason, "message": CHOICE_MESSAGES.get(reason, "Unable to update application documents.")}
    return {"ok": True, **(result.get("data") or {})}
