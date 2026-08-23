import json
import os
import re
import urllib.error
import urllib.request
from typing import Any


SUPPORT_KNOWLEDGE = """
BulsuScholar is the BulSU scholarship management portal for students, grantors, and administrators.
Students can create an account, upload a current COR or Advising Slip and the required previous-semester ROG, review announcements, choose one scholarship, track an application, upload required documents, request materials/SOE, and read inbox decisions.
Only one active non-UNIFAST scholarship is allowed. A rejected application has a 24-hour reapplication cooldown. Archived or frozen records cannot progress.
The COR or Advising Slip must match the current academic cycle. A first-year student in the first semester may submit ROG optionally; otherwise the ROG must be from the immediately previous semester.
Grantors manage only their own roster, scholarships, announcements, applicants, and decisions. Administrators manage system-wide records and review workflows.
Routine status updates are delivered through the portal inbox. Authentication confirmation and password recovery use email.
For identity mismatches, duplicate records, inaccessible accounts, or decisions requiring evidence, contact the Office of the Scholarship or submit a support ticket.
Never request or expose passwords, API keys, private database fields, or another user's records.
""".strip()


FAQ_FALLBACK = [
    (("cor", "registration", "advising"), "Upload a PDF whose title identifies it as a Certificate of Registration or Advising Slip for the current semester."),
    (("rog", "grade", "report"), "ROG means Report of Grades. Except for eligible first-year first-semester students, upload the ROG from the immediately previous semester."),
    (("duplicate", "multiple scholarship"), "BulsuScholar permits only one active non-UNIFAST scholarship. Visit the Office of the Scholarship if your record is frozen or appears under multiple grantors."),
    (("soe", "material"), "Request the SOE from My Scholarships. After approval, download it and bring it to the Office of the Scholarship for signing."),
    (("password", "login"), "Use Forgot Password on the login page. Grantors must first request a password change and wait for administrator approval."),
    (("loa", "leave of absence"), "Submit an LOA request with its reason and supporting PDF from the student Leave and Return page. The administrator reviews the request."),
    (("return", "returning"), "An approved LOA student can submit a return request. Once approved, the account is reactivated and the previous scholarship is recommended again."),
    (("unifast",), "UNIFAST is tracked separately from the one-scholarship rule and is available for up to five study years, subject to administrator records."),
]


def fallback_support_answer(message: str) -> dict[str, Any]:
    normalized = re.sub(r"\s+", " ", str(message or "").strip().lower())
    for keywords, answer in FAQ_FALLBACK:
        if any(keyword in normalized for keyword in keywords):
            return {"answer": answer, "source": "knowledge_base", "confidence": "medium", "needsSupport": False}
    return {
        "answer": "I could not find a reliable answer in the BulsuScholar knowledge base. Review the FAQ or contact the Office of the Scholarship through the support form.",
        "source": "fallback",
        "confidence": "low",
        "needsSupport": True,
    }


def ask_support_assistant(payload: dict[str, Any]) -> dict[str, Any]:
    message = str(payload.get("message") or "").strip()
    if not message:
        return {"ok": False, "reason": "message_required"}
    if len(message) > 1200:
        return {"ok": False, "reason": "message_too_long"}

    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    model = os.getenv("OPENAI_HELP_MODEL", "gpt-5-mini").strip()
    if not api_key:
        return {"ok": True, **fallback_support_answer(message), "aiAvailable": False}

    request_payload = {
        "model": model,
        "store": False,
        "max_output_tokens": 350,
        "instructions": (
            "You are the BulsuScholar help assistant. Answer only from the supplied controlled knowledge base. "
            "Use concise, practical instructions. Do not invent policy, inspect systems, request passwords, or expose private data. "
            "When the knowledge base does not establish the answer, explicitly direct the user to the FAQ or Office of the Scholarship."
        ),
        "input": f"CONTROLLED KNOWLEDGE BASE:\n{SUPPORT_KNOWLEDGE}\n\nUSER QUESTION:\n{message}",
    }
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(request_payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8") or "{}")
        answer = str(data.get("output_text") or "").strip()
        if not answer:
            for item in data.get("output", []):
                for content in item.get("content", []):
                    if content.get("type") == "output_text":
                        answer += str(content.get("text") or "")
        if not answer.strip():
            return {"ok": True, **fallback_support_answer(message), "aiAvailable": True}
        return {"ok": True, "answer": answer.strip(), "source": "openai", "confidence": "controlled", "needsSupport": False, "aiAvailable": True}
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return {"ok": True, **fallback_support_answer(message), "aiAvailable": False}
