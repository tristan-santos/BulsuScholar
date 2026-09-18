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
}


def scholarship_choice_enabled() -> bool:
    return os.getenv("ENABLE_SCHOLARSHIP_CHOICE", "true").strip().lower() != "false"


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
    if student_data.get("rosterDecisionPending") is True:
        return {"ok": False, "reason": "roster_decision_required",
                "message": "Resolve your listed scholarship record before applying."}
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
    archive_choice = student_data.get("grantorArchiveChoice") if isinstance(student_data.get("grantorArchiveChoice"), dict) else {}
    commitment = student_data.get("scholarshipCommitment") if isinstance(student_data.get("scholarshipCommitment"), dict) else {}
    choice_decision = _normalize(archive_choice.get("decision"))
    is_replacement = (
        choice_decision == "change"
        and _normalize(archive_choice.get("applicationId")) == _normalize(commitment.get("applicationId"))
        and _normalize(grantor_id) != _normalize(archive_choice.get("grantorId"))
    )
    if commitment and not is_replacement:
        return {"ok": False, "reason": "scholarship_already_committed",
                "message": CHOICE_MESSAGES["scholarship_already_committed"]}
    if choice_decision == "pending":
        return {"ok": False, "reason": "archive_choice_required", "message": CHOICE_MESSAGES["archive_choice_required"]}
    if choice_decision == "change" and not is_replacement:
        return {"ok": False, "reason": "replacement_not_allowed", "message": CHOICE_MESSAGES["replacement_not_allowed"]}
    rpc_name = "reserve_archived_grantor_replacement_application" if is_replacement else "reserve_scholarship_application"
    result = supabase_rpc(rpc_name, {
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
    if student_data.get("rosterDecisionPending") is True:
        return {"ok": False, "reason": "roster_decision_required",
                "message": "Resolve your listed scholarship record before continuing."}
    archive_choice = student_data.get("grantorArchiveChoice") if isinstance(student_data.get("grantorArchiveChoice"), dict) else {}
    choice_decision = _normalize(archive_choice.get("decision"))
    original_application_id = str(archive_choice.get("applicationId") or "").strip()
    if original_application_id and application_id == original_application_id and choice_decision in {"pending", "change"}:
        return {"ok": False, "reason": "archive_choice_required", "message": CHOICE_MESSAGES["archive_choice_required"]}
    replacement_application = supabase_document_get("scholarship_applications", application_id)
    replacement_data = replacement_application.get("data") or {}
    is_replacement = (
        choice_decision == "change"
        and original_application_id
        and application_id != original_application_id
        and str(replacement_data.get("replacementForApplicationId") or "") == original_application_id
    )
    if choice_decision == "change" and application_id != original_application_id and not is_replacement:
        return {"ok": False, "reason": "replacement_not_allowed", "message": CHOICE_MESSAGES["replacement_not_allowed"]}
    if is_replacement:
        rpc_name = "withdraw_archived_grantor_replacement" if withdraw else "commit_archived_grantor_replacement"
        rpc_payload = {"p_student_id": student_id, "p_application_id": application_id}
    else:
        rpc_name = "mutate_scholarship_choice"
        rpc_payload = {
            "p_student_id": student_id,
            "p_application_id": application_id,
            "p_action": "withdraw" if withdraw else "choose",
        }
    result = supabase_rpc(rpc_name, rpc_payload)
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


def resolve_archived_grantor_scholar_choice(payload: dict[str, Any]) -> dict[str, Any]:
    student_id = str(payload.get("studentId") or "").strip()
    application_id = str(payload.get("applicationId") or "").strip()
    action = _normalize(payload.get("action"))
    if payload.get("actorType") != "student" or payload.get("actorId") != student_id:
        return {"ok": False, "reason": "portal_record_owner_mismatch"}
    if not student_id or not application_id:
        return {"ok": False, "reason": "original_commitment_missing", "message": CHOICE_MESSAGES["original_commitment_missing"]}
    if payload.get("confirmed") is not True:
        return {"ok": False, "reason": "confirmation_required"}
    if action not in {"keep", "change"}:
        return {"ok": False, "reason": "invalid_archive_choice", "message": CHOICE_MESSAGES["invalid_archive_choice"]}
    result = supabase_rpc("resolve_archived_grantor_scholar_choice", {
        "p_student_id": student_id,
        "p_application_id": application_id,
        "p_action": action,
    })
    if not result.get("ok"):
        reason = result.get("reason") or "invalid_archive_choice"
        return {"ok": False, "reason": reason,
                "message": CHOICE_MESSAGES.get(reason, "Unable to save this scholarship decision.")}
    return {"ok": True, **(result.get("data") or {})}


def update_scholarship_documents(payload: dict[str, Any]) -> dict[str, Any]:
    if not scholarship_choice_enabled():
        return {"ok": False, "reason": "scholarship_choice_not_enabled"}
    student_id = str(payload.get("studentId") or "").strip()
    if not student_id or payload.get("actorType") != "student" or payload.get("actorId") != student_id:
        return {"ok": False, "reason": "portal_record_owner_mismatch"}
    student_result = supabase_document_get("students", student_id)
    if (student_result.get("data") or {}).get("rosterDecisionPending") is True:
        return {"ok": False, "reason": "roster_decision_required",
                "message": "Resolve your listed scholarship record before updating application documents."}
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
