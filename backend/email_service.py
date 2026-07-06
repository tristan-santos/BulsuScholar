import json
import os
import urllib.error
import urllib.request
from typing import Any


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

    body = {
        "from": os.getenv("RESEND_FROM_EMAIL", "BulsuScholar <noreply@bulsuscholar.com>"),
        "to": [recipient] if isinstance(recipient, str) else recipient,
        "subject": subject,
        "html": f"<p>Hello {to_name},</p>{html}" if to_name else html,
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
        return {
            "sent": False,
            "reason": "resend_http_error",
            "status": error.code,
            "detail": detail,
            "hint": (
                "Resend rejected the request before sending. If this is status 403 with error code 1010, "
                "restart the backend after this header fix. If it persists, check the Resend API key, "
                "sender/domain verification, and account restrictions."
            ),
        }
    except urllib.error.URLError as error:
        return {
            "sent": False,
            "reason": "resend_network_error",
            "detail": str(error.reason),
        }
