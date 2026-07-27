import re
from typing import Any

try:
    from .backend_utils import normalize_space
except ImportError:  # pragma: no cover - supports `uvicorn main:app` from backend/
    from backend_utils import normalize_space


def normalize_match_value(value: Any = "") -> str:
    normalized = normalize_space(str(value or "")).lower()
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return normalize_space(normalized)


def normalize_identifier(value: Any = "") -> str:
    return re.sub(r"\s+", "", normalize_match_value(value))


def scholar_full_name(raw: dict[str, Any] | None = None) -> str:
    raw = raw or {}
    return normalize_space(
        raw.get("fullName")
        or " ".join(str(raw.get(key) or "") for key in ["fname", "mname", "lname"])
    )


def token_sorted_value(value: Any = "") -> str:
    return " ".join(sorted(token for token in normalize_match_value(value).split() if token))


def levenshtein_similarity(left_value: Any = "", right_value: Any = "") -> float:
    left = normalize_match_value(left_value)
    right = normalize_match_value(right_value)
    if not left and not right:
        return 1.0
    if not left or not right:
        return 0.0
    if left == right:
        return 1.0

    distances = list(range(len(right) + 1))
    for left_index, left_char in enumerate(left, start=1):
        diagonal = distances[0]
        distances[0] = left_index
        for right_index, right_char in enumerate(right, start=1):
            above = distances[right_index]
            substitution_cost = 0 if left_char == right_char else 1
            distances[right_index] = min(
                distances[right_index] + 1,
                distances[right_index - 1] + 1,
                diagonal + substitution_cost,
            )
            diagonal = above

    return 1 - distances[len(right)] / max(len(left), len(right))


def comparable_similarity(left: Any, right: Any, identifier: bool = False) -> float | None:
    normalizer = normalize_identifier if identifier else normalize_match_value
    normalized_left = normalizer(left)
    normalized_right = normalizer(right)
    if not normalized_left or not normalized_right:
        return None
    return levenshtein_similarity(normalized_left, normalized_right)


def evaluate_scholar_duplicate(candidate: dict[str, Any] | None = None, existing: dict[str, Any] | None = None) -> dict[str, Any]:
    candidate = candidate or {}
    existing = existing or {}
    candidate_name = scholar_full_name(candidate)
    existing_name = scholar_full_name(existing)
    direct_name_similarity = comparable_similarity(candidate_name, existing_name) or 0
    sorted_name_similarity = comparable_similarity(
        token_sorted_value(candidate_name),
        token_sorted_value(existing_name),
    ) or 0
    name_similarity = max(direct_name_similarity, sorted_name_similarity)
    candidate_student_id = normalize_identifier(
        candidate.get("studentId") or candidate.get("studentnumber") or candidate.get("studentNumber")
    )
    existing_student_id = normalize_identifier(
        existing.get("studentId") or existing.get("studentnumber") or existing.get("studentNumber")
    )
    candidate_email = normalize_identifier(candidate.get("email"))
    existing_email = normalize_identifier(existing.get("email"))
    candidate_phone = re.sub(r"\D", "", str(candidate.get("cpNumber") or candidate.get("contactNumber") or ""))
    existing_phone = re.sub(r"\D", "", str(existing.get("cpNumber") or existing.get("contactNumber") or ""))
    exact_student_id = bool(candidate_student_id and candidate_student_id == existing_student_id)
    exact_email = bool(candidate_email and candidate_email == existing_email)
    exact_phone = bool(candidate_phone and candidate_phone == existing_phone)
    fields = [
        {"label": "student ID", "weight": 0.32, "value": comparable_similarity(candidate_student_id, existing_student_id, True)},
        {"label": "name", "weight": 0.30, "value": name_similarity or None},
        {"label": "email", "weight": 0.10, "value": comparable_similarity(candidate_email, existing_email, True)},
        {"label": "contact number", "weight": 0.08, "value": comparable_similarity(candidate_phone, existing_phone, True)},
        {"label": "course", "weight": 0.08, "value": comparable_similarity(candidate.get("course"), existing.get("course"))},
        {"label": "year level", "weight": 0.04, "value": comparable_similarity(candidate.get("yearLevel") or candidate.get("year"), existing.get("yearLevel") or existing.get("year"))},
        {"label": "city", "weight": 0.04, "value": comparable_similarity(candidate.get("city"), existing.get("city"))},
        {"label": "province", "weight": 0.04, "value": comparable_similarity(candidate.get("province"), existing.get("province"))},
    ]
    compared_fields = [field for field in fields if field["value"] is not None]
    compared_weight = sum(field["weight"] for field in compared_fields)
    weighted_score = (
        sum(float(field["value"]) * field["weight"] for field in compared_fields) / compared_weight
        if compared_weight > 0
        else 0
    )
    strong_identifier_match = exact_student_id or ((exact_email or exact_phone) and name_similarity >= 0.72)
    is_duplicate = strong_identifier_match or (name_similarity >= 0.82 and weighted_score >= 0.84)
    reasons = [field["label"] for field in compared_fields if float(field["value"]) >= 0.9]

    return {
        "isDuplicate": is_duplicate,
        "score": weighted_score,
        "nameSimilarity": name_similarity,
        "reasons": reasons,
        "exactStudentId": exact_student_id,
        "exactEmail": exact_email,
        "exactPhone": exact_phone,
        "algorithm": "Weighted Record Linkage with Levenshtein Similarity",
        "fields": compared_fields,
    }


def find_scholar_duplicate(candidate: dict[str, Any] | None = None, existing_records: list[dict[str, Any]] | None = None, options: dict[str, Any] | None = None) -> dict[str, Any] | None:
    candidate = candidate or {}
    existing_records = existing_records or []
    options = options or {}
    exclude_id = str(options.get("excludeId") or "")
    exclude_grantor_id = str(options.get("excludeGrantorId") or "")
    best_match: dict[str, Any] | None = None

    for existing in existing_records:
        if (
            exclude_id
            and str(existing.get("id") or "") == exclude_id
            and (not exclude_grantor_id or str(existing.get("grantorId") or "") == exclude_grantor_id)
        ):
            continue

        evaluation = evaluate_scholar_duplicate(candidate, existing)
        if not evaluation["isDuplicate"]:
            continue
        if not best_match or evaluation["score"] > best_match["score"]:
            best_match = {**evaluation, "record": existing}

    return best_match


def get_record_identifier(record: dict[str, Any] | None = None) -> str:
    record = record or {}
    return str(
        record.get("id")
        or record.get("studentId")
        or record.get("studentnumber")
        or record.get("studentNumber")
        or ""
    )


def is_real_student_account(record: dict[str, Any] | None = None) -> bool:
    record = record or {}
    source = str(record.get("sourceCollection") or "").lower()
    record_id = str(record.get("id") or "")
    return source == "students" or (record_id and not record_id.startswith("roster_"))


def record_completeness_score(record: dict[str, Any] | None = None) -> int:
    record = record or {}
    fields = [
        "studentId",
        "studentnumber",
        "studentNumber",
        "id",
        "fullName",
        "fname",
        "lname",
        "email",
        "cpNumber",
        "contactNumber",
        "course",
        "year",
        "yearLevel",
        "street",
        "barangay",
        "city",
        "province",
        "postalCode",
    ]
    return sum(1 for field in fields if record.get(field))


def choose_canonical_student_record(records: list[dict[str, Any]]) -> dict[str, Any]:
    return sorted(
        records,
        key=lambda record: (
            1 if is_real_student_account(record) else 0,
            0 if record.get("archived") else 1,
            record_completeness_score(record),
        ),
        reverse=True,
    )[0]


def check_student_table_duplicates(records: list[dict[str, Any]] | None = None, options: dict[str, Any] | None = None) -> dict[str, Any]:
    records = records or []
    options = options or {}
    threshold = float(options.get("threshold") or 0.84)
    groups: list[list[int]] = []

    for index, candidate in enumerate(records):
        matched_group = None
        for group in groups:
            if any(evaluate_scholar_duplicate(candidate, records[member])["isDuplicate"] or evaluate_scholar_duplicate(candidate, records[member])["score"] >= threshold for member in group):
                matched_group = group
                break
        if matched_group is None:
            groups.append([index])
        else:
            matched_group.append(index)

    duplicate_groups = []
    duplicate_ids: list[str] = []
    canonical_ids: list[str] = []

    for group in groups:
        if len(group) < 2:
            continue
        group_records = [records[index] for index in group]
        canonical = choose_canonical_student_record(group_records)
        canonical_id = get_record_identifier(canonical)
        canonical_ids.append(canonical_id)
        duplicates = []

        for record in group_records:
            record_id = get_record_identifier(record)
            if record is canonical or record_id == canonical_id:
                continue
            evaluation = evaluate_scholar_duplicate(canonical, record)
            duplicate_ids.append(record_id)
            duplicates.append({
                "id": record_id,
                "record": record,
                "score": evaluation["score"],
                "nameSimilarity": evaluation["nameSimilarity"],
                "reasons": evaluation["reasons"],
            })

        duplicate_groups.append({
            "canonicalId": canonical_id,
            "canonicalRecord": canonical,
            "duplicates": duplicates,
        })

    return {
        "duplicateIds": duplicate_ids,
        "canonicalIds": canonical_ids,
        "groups": duplicate_groups,
        "algorithm": "Weighted Record Linkage with Levenshtein Similarity",
        "threshold": threshold,
    }


def normalize_middle_initial(value: Any = "") -> str:
    normalized = normalize_match_value(value)
    return normalized[0] if normalized else ""


def build_normalized_full_name(raw: dict[str, Any] | None = None) -> str:
    return normalize_match_value(scholar_full_name(raw or {}))


def match_name_parts(student: dict[str, Any] | None = None, scholar: dict[str, Any] | None = None) -> bool:
    student = student or {}
    scholar = scholar or {}
    student_first = normalize_match_value(student.get("fname"))
    student_last = normalize_match_value(student.get("lname"))
    scholar_first = normalize_match_value(scholar.get("fname"))
    scholar_last = normalize_match_value(scholar.get("lname"))
    student_middle = normalize_middle_initial(student.get("mname"))
    scholar_middle = normalize_middle_initial(scholar.get("mname"))
    student_full_name = build_normalized_full_name(student)
    scholar_full_name_value = build_normalized_full_name(scholar)

    if student_full_name and scholar_full_name_value and student_full_name == scholar_full_name_value:
        return True
    if not student_first or not student_last or not scholar_first or not scholar_last:
        return False
    if student_first != scholar_first or student_last != scholar_last:
        return False
    if not student_middle or not scholar_middle:
        return True
    return student_middle == scholar_middle


def match_address(student: dict[str, Any] | None = None, scholar: dict[str, Any] | None = None) -> bool:
    student = student or {}
    scholar = scholar or {}
    comparable_field_pairs = [
        ("street", "street"),
        ("barangay", "barangay"),
        ("city", "city"),
        ("province", "province"),
        ("postalCode", "postalCode"),
    ]
    shared_field_count = 0

    for student_key, scholar_key in comparable_field_pairs:
        student_value = normalize_match_value(student.get(student_key))
        scholar_value = normalize_match_value(scholar.get(scholar_key))
        if not student_value or not scholar_value:
            continue
        shared_field_count += 1
        if student_value != scholar_value:
            return False

    if shared_field_count > 0:
        return True

    student_address = normalize_match_value(" ".join(str(student.get(key) or "") for key in ["street", "barangay", "city", "province", "postalCode"]))
    scholar_address = normalize_match_value(" ".join(str(scholar.get(key) or "") for key in ["street", "barangay", "city", "province", "postalCode"]))
    return bool(student_address and scholar_address and student_address == scholar_address)


def matches_grantor_scholar_to_student(student: dict[str, Any] | None = None, scholar: dict[str, Any] | None = None) -> bool:
    student = student or {}
    scholar = scholar or {}
    student_id = normalize_lookup_value(student.get("studentnumber") or student.get("studentId") or student.get("id"))
    scholar_id = normalize_lookup_value(scholar.get("studentId") or scholar.get("studentnumber") or scholar.get("studentNumber") or scholar.get("id"))
    if student_id and scholar_id and student_id == scholar_id:
        return True
    return match_name_parts(student, scholar) and match_address(student, scholar)


def get_grantor_scholar_match_reason(student: dict[str, Any] | None = None, scholar: dict[str, Any] | None = None) -> str:
    student = student or {}
    scholar = scholar or {}
    student_id = normalize_lookup_value(student.get("studentnumber") or student.get("studentId") or student.get("id"))
    scholar_id = normalize_lookup_value(scholar.get("studentId") or scholar.get("studentnumber") or scholar.get("studentNumber") or scholar.get("id"))
    if student_id and scholar_id and student_id == scholar_id:
        return "student_id"
    if match_name_parts(student, scholar) and match_address(student, scholar):
        return "name_address"
    return ""


def find_matching_grantor_scholars(student: dict[str, Any] | None = None, scholars: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    student = student or {}
    scholars = scholars or []
    matches = []
    for scholar in scholars:
        if scholar.get("archived"):
            continue
        match_reason = get_grantor_scholar_match_reason(student, scholar)
        if match_reason:
            matches.append({**scholar, "matchReason": match_reason})
    matches.sort(key=lambda item: str(item.get("grantorName") or item.get("scholarshipName") or "").lower())
    return matches


def normalize_lookup_value(value: Any = "") -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def match_admin_grantor_students(students: list[dict[str, Any]] | None = None, scholars: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    students = students or []
    scholars = scholars or []
    student_ids = {
        normalize_lookup_value(student.get("id") or student.get("studentnumber") or student.get("studentId")): student.get("id") or student.get("studentnumber") or student.get("studentId")
        for student in students
        if normalize_lookup_value(student.get("id") or student.get("studentnumber") or student.get("studentId"))
    }
    lookup: dict[str, str] = {}
    details = []
    for scholar in scholars:
        lookup_key = f"{scholar.get('grantorId') or scholar.get('providerType') or 'grantor'}::{scholar.get('id') or ''}"
        direct_match_id = student_ids.get(normalize_lookup_value(scholar.get("studentId")))
        matched_student_id = direct_match_id or ""
        reason = "student ID" if direct_match_id else ""
        if not matched_student_id:
            for student in students:
                if matches_grantor_scholar_to_student(student, scholar):
                    matched_student_id = student.get("id") or student.get("studentnumber") or student.get("studentId") or ""
                    reason = "name and address"
                    break
        lookup[lookup_key] = matched_student_id
        if matched_student_id:
            details.append({
                "lookupKey": lookup_key,
                "studentId": matched_student_id,
                "scholarId": scholar.get("id") or "",
                "grantorId": scholar.get("grantorId") or "",
                "reason": reason,
            })
    return {"lookup": lookup, "matches": details, "algorithm": "Admin grantor-student ID/name/address matching"}
