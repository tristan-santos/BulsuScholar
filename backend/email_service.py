import json
import os
import urllib.error
import urllib.request
from typing import Any


DEFAULT_RESEND_FROM_EMAIL = "BulsuScholar <onboarding@resend.dev>"


def send_email_notification(payload: dict[str, Any]) -> dict[str, Any]:
    api_key = os.getenv("RESEND_API_KEY", "")
    if not api_key:
        return {"sent": False, "reason": "missing_resend_api_key"}

    recipient = payload.get("to") or payload.get("toEmail")
    subject = payload.get("subject")
    html = payload.get("html")
    to_name = payload.get("toName")
    if not recipient or not subject or not html:
        return {"sent": False, "reason": "missing_to_subject_or_html"}

    should_prepend_greeting = to_name and "data-bulsuscholar-email" not in str(html)
    from_email = os.getenv("RESEND_FROM_EMAIL", DEFAULT_RESEND_FROM_EMAIL).strip() or DEFAULT_RESEND_FROM_EMAIL
    body = {
        "from": from_email,
        "to": [recipient] if isinstance(recipient, str) else recipient,
        "subject": subject,
        "html": f"<p>Hello {to_name},</p>{html}" if should_prepend_greeting else html,
    }
    request = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "BulsuScholar-FastAPI/1.0",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8") or "{}")
            return {"sent": True, "response": data}
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8")
        domain_hint = ""
        if error.code == 403 and ("domain is not verified" in detail.lower() or "verify a domain" in detail.lower()):
            domain_hint = (
                " The configured RESEND_FROM_EMAIL sender is not verified in Resend. "
                "Verify that domain in Resend, or temporarily set RESEND_FROM_EMAIL to "
                "'BulsuScholar <onboarding@resend.dev>' for testing."
            )
        return {
            "sent": False,
            "reason": "resend_http_error",
            "status": error.code,
            "detail": detail,
            "fromEmail": from_email,
            "hint": (
                "Resend rejected the request before sending. Check RESEND_FROM_EMAIL, "
                "sender/domain verification, and account restrictions."
                f"{domain_hint}"
            ),
        }
    except urllib.error.URLError as error:
        return {
            "sent": False,
            "reason": "resend_network_error",
            "detail": str(error.reason),
        }
