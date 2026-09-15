import json
import os
import urllib.error
import urllib.request
from typing import Any


BREVO_EMAIL_API_URL = "https://api.brevo.com/v3/smtp/email"
DEFAULT_SENDER_NAME = "BulsuScholar"


def _recipient_list(recipient: Any) -> list[dict[str, str]]:
    values = recipient if isinstance(recipient, list) else [recipient]
    return [
        {"email": str(value).strip()}
        for value in values
        if str(value or "").strip()
    ]


def send_email_notification(payload: dict[str, Any]) -> dict[str, Any]:
    provider = os.getenv("EMAIL_PROVIDER", "brevo").strip().lower()
    if provider != "brevo":
        return {"sent": False, "reason": "unsupported_email_provider", "provider": provider}

    api_key = os.getenv("BREVO_API_KEY", "").strip()
    if not api_key:
        return {"sent": False, "reason": "missing_brevo_api_key", "provider": provider}

    sender_email = os.getenv("BREVO_SENDER_EMAIL", "").strip()
    sender_name = os.getenv("BREVO_SENDER_NAME", DEFAULT_SENDER_NAME).strip() or DEFAULT_SENDER_NAME
    reply_to_email = os.getenv("BREVO_REPLY_TO_EMAIL", "").strip()
    if not sender_email:
        return {"sent": False, "reason": "missing_brevo_sender_email", "provider": provider}

    recipients = _recipient_list(payload.get("to") or payload.get("toEmail"))
    subject = str(payload.get("subject") or "").strip()
    html = payload.get("html")
    to_name = str(payload.get("toName") or "").strip()
    if not recipients or not subject or not html:
        return {"sent": False, "reason": "missing_to_subject_or_html", "provider": provider}
    if len(recipients) == 1 and to_name:
        recipients[0]["name"] = to_name

    should_prepend_greeting = to_name and "data-bulsuscholar-email" not in str(html)
    body: dict[str, Any] = {
        "sender": {"name": sender_name, "email": sender_email},
        "to": recipients,
        "subject": subject,
        "htmlContent": f"<p>Hello {to_name},</p>{html}" if should_prepend_greeting else str(html),
    }
    if reply_to_email:
        body["replyTo"] = {"name": "BulsuScholar Support", "email": reply_to_email}

    request = urllib.request.Request(
        BREVO_EMAIL_API_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "BulsuScholar-FastAPI/1.0",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8") or "{}")
            return {"sent": True, "provider": provider, "response": data}
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8")
        return {
            "sent": False,
            "provider": provider,
            "reason": "brevo_http_error",
            "status": error.code,
            "detail": detail,
            "fromEmail": sender_email,
            "hint": (
                "Brevo rejected the request. Check the API key, verified sender/domain, "
                "account limits, and transactional-email status."
            ),
        }
    except urllib.error.URLError as error:
        return {
            "sent": False,
            "provider": provider,
            "reason": "brevo_network_error",
            "detail": str(error.reason),
        }
    except TimeoutError:
        return {
            "sent": False,
            "provider": provider,
            "reason": "brevo_timeout",
            "detail": "Brevo did not respond within 20 seconds.",
        }
