from datetime import datetime
from typing import Any


SCHOLARSHIP_CATALOG = [
    {"name": "Cong. Tina Pancho", "providerType": "tina_pancho", "minGwa": 2, "requiresFullDocs": False, "isFastTrack": True},
    {"name": "Morisson", "providerType": "morisson", "minGwa": 2.25, "requiresFullDocs": False, "isFastTrack": True},
    {"name": "Kuya Win Scholarship Program", "providerType": "kuya_win", "minGwa": 1.75, "requiresFullDocs": True, "isFastTrack": False},
    {"name": "Other", "providerType": "other", "minGwa": 2.25, "requiresFullDocs": True, "isFastTrack": False},
]


def to_provider_type(provider: str = "") -> str:
    normalized = str(provider or "").lower().strip()
    if "kuya win" in normalized:
        return "kuya_win"
    if "tina pancho" in normalized:
        return "tina_pancho"
    if "morisson" in normalized or "morrison" in normalized:
        return "morisson"
    return "other"


def get_scholarship_policy(provider: str = "") -> dict[str, Any]:
    provider_type = to_provider_type(provider)
    return next((item for item in SCHOLARSHIP_CATALOG if item["providerType"] == provider_type), SCHOLARSHIP_CATALOG[-1])


def get_current_academic_year(now: datetime | None = None) -> str:
    now = now or datetime.now()
    return f"{now.year}-{now.year + 1}" if now.month >= 7 else f"{now.year - 1}-{now.year}"


def get_current_semester_tag(now: datetime | None = None) -> str:
    now = now or datetime.now()
    semester = "1ST" if now.month >= 7 else "2ND"
    return f"{get_current_academic_year(now)}-{semester}"


def get_document_urls_for_student(student: dict[str, Any] | None = None) -> dict[str, str]:
    student = student or {}

    def first_url(keys: list[str]) -> str:
        for key in keys:
            value = student.get(key)
            if isinstance(value, dict) and value.get("url"):
                return value["url"]
        return ""

    return {
        "cor": first_url(["corFile", "corDocument", "cor"]),
        "cog": first_url(["cogFile", "cogDocument", "cog"]),
        "schoolId": first_url(["schoolIdFile", "studentIdFile", "validIdFile", "idFile"]),
        "applicationForm": first_url(["scholarshipApplicationFile", "applicationFormFile", "scholarshipFormFile"]),
    }


def validate_scholarship_documents(student: dict[str, Any] | None = None, provider: str = "") -> dict[str, Any]:
    student = student or {}
    semester_tag = get_current_semester_tag()
    missing: list[str] = []
    expired: list[str] = []
    cor = student.get("corFile") or student.get("corDocument") or student.get("cor") or {}
    cog = student.get("cogFile") or student.get("cogDocument") or student.get("cog") or {}

    if not isinstance(cor, dict) or not cor.get("url"):
        missing.append("COR")
    elif cor.get("semesterTag") and cor.get("semesterTag") != semester_tag:
        expired.append("COR")

    if not isinstance(cog, dict) or not cog.get("url"):
        missing.append("COG")
    elif cog.get("semesterTag") and cog.get("semesterTag") != semester_tag:
        expired.append("COG")

    return {
        "ok": len(missing) == 0 and len(expired) == 0,
        "missing": missing,
        "expired": expired,
        "semesterTag": semester_tag,
        "documentUrls": get_document_urls_for_student(student),
    }


def is_gwa_eligible(gwa_value: Any, provider: str = "") -> dict[str, Any]:
    min_gwa = get_scholarship_policy(provider)["minGwa"]
    try:
        gwa = float(gwa_value)
    except (TypeError, ValueError):
        return {"eligible": False, "minGwa": min_gwa}
    return {"eligible": gwa <= min_gwa, "minGwa": min_gwa}


def check_scholarship_eligibility(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = payload or {}
    student = payload.get("student") or {}
    announcement = payload.get("announcement") or {}
    provider = announcement.get("providerLabel") or announcement.get("grantorName") or announcement.get("title") or payload.get("provider") or ""
    document_check = validate_scholarship_documents(student, provider)
    grade_check = is_gwa_eligible(student.get("gwa") or student.get("currentGwa"), provider)
    reasons = []
    if not document_check["ok"]:
        reasons.extend([f"Missing {item}" for item in document_check["missing"]])
        reasons.extend([f"Expired {item}" for item in document_check["expired"]])
    if not grade_check["eligible"]:
        reasons.append(f"GWA does not meet minimum requirement {grade_check['minGwa']}")
    return {
        "eligible": len(reasons) == 0,
        "reasons": reasons,
        "documentCheck": document_check,
        "gradeCheck": grade_check,
    }


def recommend_scholarships(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = payload or {}
    student = payload.get("student") or {}
    scholarships = payload.get("scholarships") or payload.get("announcements") or []
    recommendations = []
    for item in scholarships:
        provider = item.get("providerLabel") or item.get("grantorName") or item.get("title") or item.get("name") or ""
        grade_check = is_gwa_eligible(student.get("gwa") or student.get("currentGwa"), provider)
        score = 0.5
        reasons = []
        if grade_check["eligible"]:
            score += 0.25
            reasons.append("GWA eligible")
        if student.get("course") and str(student.get("course")).lower() in str(item).lower():
            score += 0.15
            reasons.append("Course match")
        if student.get("city") and str(student.get("city")).lower() in str(item).lower():
            score += 0.10
            reasons.append("Location match")
        recommendations.append({"item": item, "score": round(score, 4), "reasons": reasons})
    recommendations.sort(key=lambda row: row["score"], reverse=True)
    return {"recommendations": recommendations}
