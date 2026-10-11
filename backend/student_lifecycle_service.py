from typing import Any

try:
    from .student_activation_service import activate_student_account, load_signup_documents
    from .supabase_ops import supabase_document_get, supabase_rpc
except ImportError:  # pragma: no cover
    from student_activation_service import activate_student_account, load_signup_documents
    from supabase_ops import supabase_document_get, supabase_rpc


LIFECYCLE_MESSAGES = {
    "pending_student_not_found": "Your pending student record could not be found.",
    "confirmed_identity_mismatch": "The confirmed account does not match this student record.",
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
    metadata = auth_user.get("user_metadata") if isinstance(auth_user.get("user_metadata"), dict) else {}
    student_id = str(metadata.get("user_id") or metadata.get("studentId") or "").strip()
    email = str(auth_user.get("email") or "").strip().lower()
    if not student_id or not email or not auth_user.get("email_confirmed_at"):
        return {"ok": False, "reason": "confirmed_identity_mismatch", "message": LIFECYCLE_MESSAGES["confirmed_identity_mismatch"]}
    confirmation = _rpc_response(
        supabase_rpc("promote_email_confirmed_student", {
            "p_student_id": student_id,
            "p_auth_user_id": str(auth_user.get("id") or ""),
            "p_email": email,
        }),
        "email_confirmed_promotion_failed",
    )
    if not confirmation.get("ok"):
        return confirmation
    if confirmation.get("alreadyActive") is True:
        return {
            **confirmation,
            "accountActivated": True,
            "pendingApproval": False,
            "welcomeEmailSent": False,
            "welcomeEmailDeliveryReason": None,
        }

    policy = supabase_document_get("system_configuration", "document_policy")
    policy_data = policy.get("data") if isinstance(policy.get("data"), dict) else {}
    if policy_data.get("manualReviewEnabled") is not False:
        return {
            **confirmation,
            "accountActivated": False,
            "pendingApproval": True,
            "welcomeEmailSent": False,
            "welcomeEmailDeliveryReason": None,
        }

    pending = supabase_document_get("pending_students", student_id)
    pending_data = pending.get("data") if isinstance(pending.get("data"), dict) else {}
    _documents, documents_ready = load_signup_documents(student_id)
    if not pending.get("row") or not documents_ready:
        return {
            **confirmation,
            "accountActivated": False,
            "pendingApproval": True,
            "automaticActivationBlocked": "signup_documents_not_approved",
            "welcomeEmailSent": False,
            "welcomeEmailDeliveryReason": None,
        }

    activation = activate_student_account(
        student_id,
        pending_data,
        "system:auto_document_review",
        "automatic_document_review",
    )
    if not activation.get("ok"):
        return _rpc_response(activation, "automatic_account_activation_failed")
    return {
        **confirmation,
        "approved": activation.get("approved") is True,
        "newlyApproved": activation.get("newlyApproved") is True,
        "alreadyActive": activation.get("alreadyActive") is True,
        "accountActivated": True,
        "pendingApproval": False,
        "welcomeEmailSent": activation.get("welcomeEmailSent") is True,
        "welcomeEmailDeliveryReason": activation.get("welcomeEmailDeliveryReason"),
        "rosterAssigned": activation.get("rosterAssigned") is True,
        "rosterConflict": activation.get("rosterConflict") is True,
    }


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
