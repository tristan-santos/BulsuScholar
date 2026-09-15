from typing import Any

try:
    from .supabase_ops import supabase_document_get, supabase_rpc
except ImportError:  # pragma: no cover
    from supabase_ops import supabase_document_get, supabase_rpc


LIFECYCLE_MESSAGES = {
    "pending_student_not_found": "Your pending student record could not be found.",
    "confirmed_identity_mismatch": "The confirmed account does not match this student record.",
    "roster_decision_required": "Resolve your listed scholarship record before continuing.",
    "roster_match_not_found": "The selected scholarship roster record is no longer available.",
    "scholarship_already_committed": "A scholarship is already committed to this account.",
    "invalid_roster_decision": "Choose Confirm Record or This Is Not My Record.",
    "grantor_confirmation_not_pending": "This administrator decision is no longer awaiting confirmation.",
    "grantor_confirmation_stale": "The application has already moved beyond this decision.",
    "grantor_archived": "Archived grantors cannot confirm application decisions.",
}


def _rpc_response(result: dict[str, Any], fallback: str) -> dict[str, Any]:
    if result.get("ok"):
        return {"ok": True, **(result.get("data") or {})}
    reason = str(result.get("reason") or fallback)
    return {
        "ok": False,
        "reason": reason,
        "message": LIFECYCLE_MESSAGES.get(reason, "Unable to complete this workflow. Please refresh and try again."),
        "details": result.get("detail") or result,
    }


def promote_email_confirmed_student(payload: dict[str, Any], auth_user: dict[str, Any]) -> dict[str, Any]:
    student_id = str(payload.get("studentId") or auth_user.get("user_metadata", {}).get("user_id") or "").strip()
    email = str(auth_user.get("email") or "").strip().lower()
    if not student_id or not email:
        return {"ok": False, "reason": "confirmed_identity_mismatch", "message": LIFECYCLE_MESSAGES["confirmed_identity_mismatch"]}
    return _rpc_response(
        supabase_rpc("promote_email_confirmed_student", {
            "p_student_id": student_id,
            "p_auth_user_id": str(auth_user.get("id") or ""),
            "p_email": email,
        }),
        "email_confirmed_promotion_failed",
    )


def resolve_roster_scholarship(payload: dict[str, Any], auth_user: dict[str, Any]) -> dict[str, Any]:
    student_id = str(payload.get("studentId") or "").strip()
    action = str(payload.get("action") or "").strip().lower()
    if payload.get("actorType") != "student" or payload.get("actorId") != student_id:
        return {"ok": False, "reason": "portal_record_owner_mismatch"}
    if action not in {"confirm", "decline"}:
        return {"ok": False, "reason": "invalid_roster_decision", "message": LIFECYCLE_MESSAGES["invalid_roster_decision"]}
    if payload.get("confirmed") is not True:
        return {"ok": False, "reason": "confirmation_required"}
    student = supabase_document_get("students", student_id)
    if not student.get("ok") or str((student.get("data") or {}).get("authUserId") or "") != str(auth_user.get("id") or ""):
        return {"ok": False, "reason": "confirmed_identity_mismatch", "message": LIFECYCLE_MESSAGES["confirmed_identity_mismatch"]}
    return _rpc_response(
        supabase_rpc("resolve_student_roster_scholarship", {
            "p_student_id": student_id,
            "p_grantor_id": str(payload.get("grantorId") or "").strip(),
            "p_roster_id": str(payload.get("rosterId") or "").strip(),
            "p_action": action,
        }),
        "roster_decision_failed",
    )


def confirm_grantor_admin_decision(payload: dict[str, Any]) -> dict[str, Any]:
    grantor_id = str(payload.get("grantorId") or "").strip()
    application_id = str(payload.get("applicationId") or "").strip()
    if payload.get("actorType") != "grantor" or payload.get("actorId") != grantor_id:
        return {"ok": False, "reason": "portal_record_owner_mismatch"}
    if not grantor_id or not application_id:
        return {"ok": False, "reason": "missing_application_identity"}
    application = supabase_document_get("scholarship_applications", application_id)
    data = application.get("data") or {}
    confirmation = data.get("decisionConfirmation") if isinstance(data.get("decisionConfirmation"), dict) else {}
    if str(data.get("grantorId") or data.get("providerId") or "") != grantor_id:
        return {"ok": False, "reason": "portal_record_owner_mismatch"}
    already_resolved = bool(data.get("grantorConfirmationResolvedAt") and data.get("grantorConfirmationDecision"))
    if confirmation.get("status") != "pending" and not already_resolved:
        return {"ok": False, "reason": "grantor_confirmation_not_pending", "message": LIFECYCLE_MESSAGES["grantor_confirmation_not_pending"]}
    return _rpc_response(
        supabase_rpc("confirm_grantor_admin_decision", {
            "p_grantor_id": grantor_id,
            "p_application_id": application_id,
        }),
        "grantor_confirmation_failed",
    )
