import html
import os
from datetime import datetime, timezone
from typing import Any

try:
    from .email_service import send_email_notification
    from .supabase_ops import create_log, supabase_document_update, supabase_document_upsert, supabase_rpc, supabase_select, utc_now_iso
except ImportError:  # pragma: no cover
    from email_service import send_email_notification
    from supabase_ops import create_log, supabase_document_update, supabase_document_upsert, supabase_rpc, supabase_select, utc_now_iso


SIGNUP_DOCUMENT_TYPES = ("cor", "rog", "identity")


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str) and value.strip():
        try:
            parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _document_timestamp(document: dict[str, Any]) -> datetime:
    data = document.get("data") if isinstance(document.get("data"), dict) else document
    for value in (data.get("submittedAt"), data.get("updatedAt"), document.get("updated_at"), document.get("created_at")):
        parsed = _parse_datetime(value)
        if parsed:
            return parsed
    return datetime.min.replace(tzinfo=timezone.utc)


def latest_signup_documents(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for row in rows:
        data = row.get("data") if isinstance(row.get("data"), dict) else row
        document_type = str(data.get("documentType") or "").lower()
        submission_id = str(row.get("id") or data.get("id") or "")
        is_signup = data.get("source") == "student_signup" or bool(data.get("signupBatchId")) or submission_id.startswith("signup_document_")
        if not is_signup or document_type not in SIGNUP_DOCUMENT_TYPES:
            continue
        current = latest.get(document_type)
        if not current or (_document_timestamp(row), submission_id) > (_document_timestamp(current), str(current.get("id") or "")):
            latest[document_type] = row
    return [latest[key] for key in SIGNUP_DOCUMENT_TYPES if key in latest]


def required_signup_document_types(documents: list[dict[str, Any]]) -> list[str]:
    values = [row.get("data") or row for row in documents]
    requirements = next((item.get("requirementsSnapshot") for item in values if isinstance(item.get("requirementsSnapshot"), dict)), {})
    required_types = ["cor", "identity"]
    if requirements.get("rogRequired") is True:
        required_types.insert(1, "rog")
    return required_types


def required_signup_documents(documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_type = {str((row.get("data") or row).get("documentType") or ""): row for row in documents}
    return [by_type[key] for key in required_signup_document_types(documents) if key in by_type]


def signup_documents_ready(documents: list[dict[str, Any]]) -> bool:
    by_type = {str((row.get("data") or row).get("documentType") or ""): row.get("data") or row for row in documents}
    return all(
        str((by_type.get(key) or {}).get("status") or "").lower() == "approved"
        for key in required_signup_document_types(documents)
    )


def load_signup_documents(student_id: str) -> tuple[list[dict[str, Any]], bool]:
    result = supabase_select("student_document_submissions", {"data->>studentId": student_id}, limit=100)
    if not result.get("ok"):
        return [], False
    rows = latest_signup_documents(result.get("rows") or [])
    required_count = len(required_signup_document_types(rows))
    return rows, len(required_signup_documents(rows)) == required_count and signup_documents_ready(rows)


def _student_name(student: dict[str, Any]) -> str:
    return " ".join(str(student.get(key) or "").strip() for key in ("fname", "mname", "lname")).strip()


def build_student_welcome_email(student_id: str, student: dict[str, Any]) -> str:
    name = html.escape(_student_name(student) or "Student")
    safe_student_id = html.escape(str(student_id or ""))
    frontend_url = html.escape(str(os.getenv("FRONTEND_URL") or os.getenv("VITE_APP_URL") or "https://bulsuscholar.com").rstrip("/"), quote=True)
    support_email = html.escape(str(os.getenv("BREVO_REPLY_TO_EMAIL") or "support@bulsuscholar.com").strip())
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Welcome to BulsuScholar</title></head>
<body style="margin:0;padding:0;background:#edf3f0;color:#172b24;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div data-bulsuscholar-email="welcome" style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Your BulsuScholar account is approved and ready to use.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;background:#edf3f0;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;border-collapse:separate;background:#ffffff;border:1px solid #cbdcd4;border-radius:8px;box-shadow:0 10px 30px rgba(22,52,40,.10);overflow:hidden;">
<tr><td style="height:7px;background:#00633c;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:24px 30px;background:#f8fbf9;border-bottom:1px solid #deebe5;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td width="52" valign="middle"><table role="presentation" width="44" height="44" cellspacing="0" cellpadding="0" border="0" style="width:44px;height:44px;background:#00633c;border-radius:50%;"><tr><td align="center" valign="middle" style="color:#ffffff;font-size:20px;font-weight:800;">B</td></tr></table></td>
<td valign="middle"><p style="margin:0;color:#102a20;font-size:19px;font-weight:800;line-height:1.2;">BulsuScholar</p><p style="margin:4px 0 0;color:#63766e;font-size:12px;line-height:1.4;">Scholarship Management Portal</p></td>
<td align="right" valign="middle"><span style="display:inline-block;padding:6px 9px;border:1px solid #b9d8ca;border-radius:4px;background:#edf7f2;color:#00633c;font-size:11px;font-weight:700;">ACCOUNT APPROVED</span></td>
</tr></table></td></tr>
<tr><td style="padding:34px 30px 16px;"><p style="margin:0;color:#007247;font-size:12px;font-weight:800;text-transform:uppercase;">Welcome, {name}</p><h1 style="margin:10px 0 0;color:#102a20;font-size:28px;line-height:1.25;font-weight:800;">Your account is ready</h1><p style="margin:14px 0 0;color:#52665e;font-size:15px;line-height:1.7;">Your student account has been approved. Sign in using your Student ID to complete your profile and access scholarship services.</p></td></tr>
<tr><td style="padding:4px 30px 24px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border:1px solid #d9e7e1;border-radius:6px;background:#f8fbf9;"><tr><td style="padding:15px 18px;color:#63766e;font-size:12px;">STUDENT ID<br><strong style="display:block;margin-top:4px;color:#172b24;font-size:17px;">{safe_student_id}</strong></td><td align="right" style="padding:15px 18px;color:#007247;font-size:12px;font-weight:800;">ACTIVE</td></tr></table></td></tr>
<tr><td align="center" style="padding:0 30px 28px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#00633c" style="border:1px solid #00633c;border-radius:6px;"><a href="{frontend_url}" style="display:inline-block;min-width:220px;padding:15px 24px;color:#ffffff;text-align:center;text-decoration:none;font-size:15px;font-weight:800;line-height:1.2;">Sign In to BulsuScholar&nbsp;&nbsp;&rarr;</a></td></tr></table></td></tr>
<tr><td style="padding:0 30px 28px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border:1px solid #d9e7e1;border-radius:6px;background:#f8fbf9;"><tr><td style="padding:16px 18px 9px;color:#172b24;font-size:13px;font-weight:800;">Get started</td></tr><tr><td style="padding:0 18px 16px;color:#52665e;font-size:12px;line-height:1.8;"><span style="color:#00633c;font-weight:800;">01&nbsp;</span> Complete your Student Application Profile.<br><span style="color:#00633c;font-weight:800;">02&nbsp;</span> Check Inbox and Documents for required actions.<br><span style="color:#00633c;font-weight:800;">03&nbsp;</span> Review scholarships and announcements available to you.</td></tr></table></td></tr>
<tr><td style="padding:0 30px 28px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-left:4px solid #d69e2e;background:#fffaf0;"><tr><td style="padding:14px 16px;color:#6b4f16;font-size:12px;line-height:1.6;"><strong style="display:block;margin-bottom:2px;color:#5b4213;">Keep your account secure</strong>BulsuScholar staff will never ask for your password or email verification codes.</td></tr></table></td></tr>
<tr><td style="padding:20px 30px;background:#102a20;"><p style="margin:0;color:#dce9e3;font-size:12px;line-height:1.6;">Need assistance? <a href="mailto:{support_email}" style="color:#ffffff;text-decoration:underline;">{support_email}</a></p><p style="margin:7px 0 0;color:#8ee0b8;font-size:11px;word-break:break-all;">{frontend_url}</p></td></tr>
</table><p style="margin:18px 0 0;color:#718079;font-size:11px;line-height:1.5;">This is an automated account message from BulsuScholar.</p>
</td></tr></table></body></html>'''


def send_student_welcome_email(student_id: str, student: dict[str, Any], activation_source: str) -> dict[str, Any]:
    name = _student_name(student)
    try:
        delivery = send_email_notification({
            "to": student.get("email"),
            "toName": name,
            "subject": "Welcome to BulsuScholar - your account is ready",
            "html": build_student_welcome_email(student_id, student),
        })
    except Exception:  # Delivery must never roll back an activated account.
        delivery = {
            "sent": False,
            "provider": str(os.getenv("EMAIL_PROVIDER") or "brevo"),
            "reason": "welcome_email_delivery_exception",
        }
    sent_at = utc_now_iso()
    sent = delivery.get("sent") is True
    reason = None if sent else str(delivery.get("reason") or "welcome_email_delivery_failed")
    provider_response = delivery.get("response") if isinstance(delivery.get("response"), dict) else {}
    event = {
        "studentId": student_id,
        "eventType": "student_welcome_email",
        "channel": "email",
        "status": "delivered" if sent else "failed",
        "provider": delivery.get("provider"),
        "providerMessageId": provider_response.get("messageId"),
        "reason": reason,
        "activationSource": activation_source,
        "attempts": 1,
        "createdAt": sent_at,
        "updatedAt": sent_at,
    }
    supabase_document_upsert("notification_delivery_events", f"welcome_email_{student_id}", event, merge=False)
    supabase_document_update("students", student_id, {
        "welcomeEmailStatus": event["status"],
        "welcomeEmailSentAt": sent_at if sent else None,
        "welcomeEmailDeliveryReason": reason,
    })
    create_log({
        "action": "student_welcome_email_sent" if sent else "student_welcome_email_failed",
        "actorId": "system",
        "actorType": "system",
        "target": student_id,
        "details": {"activationSource": activation_source, "provider": delivery.get("provider"), "reason": reason},
        "createdAt": sent_at,
    })
    return {"sent": sent, "reason": reason, "provider": delivery.get("provider")}


def activate_student_account(student_id: str, student: dict[str, Any], actor_id: str, activation_source: str) -> dict[str, Any]:
    result = supabase_rpc("approve_pending_student_account", {
        "p_student_id": student_id,
        "p_auth_user_id": str(student.get("authUserId") or ""),
        "p_email": str(student.get("email") or ""),
        "p_admin_id": actor_id,
    })
    if not result.get("ok"):
        return result
    activation = result.get("data") if isinstance(result.get("data"), dict) else {}
    already_active = activation.get("alreadyActive") is True
    welcome = {"sent": False, "reason": None}
    if not already_active:
        welcome = send_student_welcome_email(student_id, student, activation_source)
    return {
        "ok": True,
        **activation,
        "newlyApproved": not already_active,
        "alreadyActive": already_active,
        "welcomeEmailSent": welcome.get("sent") is True,
        "welcomeEmailDeliveryReason": welcome.get("reason"),
    }
