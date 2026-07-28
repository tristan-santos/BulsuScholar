from datetime import datetime
import re
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
    scholarships = payload.get("scholarships") or payload.get("grantors") or payload.get("announcements") or []
    student_gwa = _to_float(student.get("gwa") or student.get("currentGwa") or student.get("generalWeightedAverage"))
    max_roster = max([_to_int(item.get("rosterCount")) for item in scholarships] or [0])
    is_high_grade_student = student_gwa is not None and student_gwa <= 1.75
    recommendations = []

    for item in scholarships:
        if item.get("applicationsBlocked") is True:
            continue
        if item.get("applicationEnabled") is False and item.get("applyOpen") is not True:
            continue

        minimum_gwa = _to_float(item.get("minimumGwa") or item.get("minGwa") or item.get("minimumGrade"))
        provider = item.get("providerLabel") or item.get("grantorName") or item.get("title") or item.get("name") or ""
        if minimum_gwa is None:
            minimum_gwa = _to_float(get_scholarship_policy(provider)["minGwa"]) or 2.25
        if student_gwa is None or student_gwa > minimum_gwa:
            continue

        reasons = []
        grade_margin = max(0.0, minimum_gwa - student_gwa)
        grade_score = min(40.0, 24.0 + (grade_margin * 12.0))
        if grade_margin >= 0.5:
            reasons.append("Strong GWA match")
        else:
            reasons.append("Meets minimum GWA")

        roster_count = _to_int(item.get("rosterCount"))
        popularity_weight = 30.0 if is_high_grade_student else 22.0
        popularity_score = (roster_count / max_roster * popularity_weight) if max_roster > 0 else 0.0
        if roster_count > 0:
            reasons.append(f"{roster_count} scholar roster")

        location_score = _location_score(student, item)
        if location_score >= 22:
            reasons.append("Nearest location match")
        elif location_score >= 12:
            reasons.append("Same province area")
        elif _normalize_text(student.get("province")) == "pampanga" and _normalize_text(item.get("province")) == "bulacan":
            reasons.append("Bulacan grantor, lower location priority")

        completeness_score = 8.0
        if item.get("profileImageUrl") or item.get("authorImageUrl") or item.get("imageUrl"):
            completeness_score += 2.0

        score = grade_score + popularity_score + location_score + completeness_score
        label = _recommendation_label(score, reasons)
        recommendations.append(
            {
                "item": item,
                "score": round(score, 4),
                "label": label,
                "reasons": reasons[:4],
                "criteria": {
                    "gwa": student_gwa,
                    "minimumGwa": minimum_gwa,
                    "rosterCount": roster_count,
                    "gradeScore": round(grade_score, 2),
                    "popularityScore": round(popularity_score, 2),
                    "locationScore": round(location_score, 2),
                },
            }
        )

    recommendations.sort(key=lambda row: row["score"], reverse=True)
    return {
        "ok": True,
        "algorithm": "Weighted Recommendation Scoring",
        "weights": {
            "hardFilters": ["applications must be open", "student GWA must meet minimum GWA"],
            "gwaFit": "up to 40 points",
            "rosterPopularity": "up to 22 points, raised to 30 for high-grade students",
            "locationFit": "up to 25 points with a Pampanga-to-Bulacan priority reduction",
            "profileCompleteness": "up to 10 points",
        },
        "recommendations": recommendations,
    }


def _to_float(value: Any) -> float | None:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _normalize_text(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def _location_score(student: dict[str, Any], grantor: dict[str, Any]) -> float:
    student_province = _normalize_text(student.get("province"))
    student_city = _normalize_text(student.get("city"))
    student_barangay = _normalize_text(student.get("barangay"))
    grantor_province = _normalize_text(grantor.get("province"))
    grantor_city = _normalize_text(grantor.get("city"))
    grantor_barangay = _normalize_text(grantor.get("barangay"))

    if not any([student_province, student_city, student_barangay, grantor_province, grantor_city, grantor_barangay]):
        return 8.0

    score = 0.0
    if student_province and grantor_province and student_province == grantor_province:
        score += 10.0
    elif student_province == "pampanga" and grantor_province == "bulacan":
        score += 4.0
    elif grantor_province:
        score += 2.0

    if student_city and grantor_city and student_city == grantor_city:
        score += 10.0
    if student_barangay and grantor_barangay and student_barangay == grantor_barangay:
        score += 5.0
    return min(score, 25.0)


def _recommendation_label(score: float, reasons: list[str]) -> str:
    if score >= 78:
        return "Best Scholarship Match For You"
    if any("Nearest" in reason for reason in reasons):
        return "Recommended Near Your Location"
    if any("roster" in reason for reason in reasons):
        return "Popular Grantor Match"
    if any("Strong GWA" in reason for reason in reasons):
        return "Strong GWA Match"
    return "Available Scholarship Match"
