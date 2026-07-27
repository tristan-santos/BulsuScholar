import io
import re
from typing import Any

import pdfplumber
import pytesseract
from PIL import Image, ImageOps

try:
    from .backend_utils import normalize_space, to_title_name
except ImportError:  # pragma: no cover - supports `uvicorn main:app` from backend/
    from backend_utils import normalize_space, to_title_name

try:
    from pdf2image import convert_from_bytes
except Exception:  # pragma: no cover - optional runtime dependency
    convert_from_bytes = None


COURSE_PATTERNS = [
    "Bachelor of Elementary Education",
    "Bachelor of Early Childhood Education",
    "Bachelor of Secondary Education",
    "Bachelor of Technology and Livelihood Education - Home Economics",
    "Bachelor of Physical Education",
    "Bachelor of Science in Business Administration",
    "Bachelor of Science in Entrepreneurship",
    "Bachelor of Science in Information Technology",
    "Bachelor of Science in Computer Engineering",
    "Bachelor of Science in Industrial Engineering",
    "Bachelor in Industrial Technology",
]

ACCEPTED_COR_TITLES = ["Advising Slip", "Certificate of Registration"]
ACCEPTED_COG_TITLES = ["Report of Grades"]

NAME_LABEL_PATTERN = r"(?:Student\s*Name|Name\s+of\s+Student|Full\s*Name|Fullname|Name)"
NAME_BLOCKED_WORDS = re.compile(
    r"\b(?:REPUBLIC|PHILIPPINES|BULACAN|UNIVERSITY|CITY|COLLEGE|CERTIFICATE|REGISTRATION|ADVISING|SLIP|GRADE|REMARK|FINAL|AVERAGE|PROGRAM|COURSE|CURRICULUM|STUDENT|NUMBER|SECTION|SEMESTER|SUBJECT|UNITS|CREDIT|MAJOR|AGE)\b",
    re.IGNORECASE,
)


def clean_name_candidate(value: str = "") -> str:
    cleaned = normalize_space(value)
    cleaned = re.split(
        r"\b(?:PROGRAM|PROG|COURSE|CURRICULUM|REGISTRATION|CERTIFICATE|STUDENT\s*NO|STUDENT\s*ID|YEAR|SECTION|SEMESTER|A\.?Y\.?)\b",
        cleaned,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0]
    cleaned = re.sub(r"[^A-Za-zÃ‘Ã±,.' -]", " ", cleaned)
    cleaned = normalize_space(cleaned)
    return cleaned.strip(" ,.-")


def is_likely_name_candidate(value: str = "") -> bool:
    candidate = clean_name_candidate(value)
    parts = candidate.replace(",", " ").split()
    if len(parts) < 2 or len(parts) > 7:
        return False
    if NAME_BLOCKED_WORDS.search(candidate):
        return False
    return bool(re.fullmatch(r"[A-Za-zÃƒâ€˜ÃƒÂ± ,.'-]+", candidate))


def collect_labeled_name(lines: list[str], index: int, remainder: str = "") -> str:
    chunks = [remainder] if remainder else []
    for next_line in lines[index + 1 : index + 4]:
        if re.search(r"\b(?:STUDENT\s*(?:NO|ID|NUMBER)|PROGRAM|COURSE|CURRICULUM|YEAR|SECTION|SEMESTER|SUBJECT|FINAL|REMARKS|UNITS)\b", next_line, re.IGNORECASE):
            break
        cleaned_line = clean_name_candidate(next_line)
        if not cleaned_line:
            continue
        if is_likely_name_candidate(" ".join(chunks + [cleaned_line])) or re.fullmatch(r"[A-Za-zÃƒâ€˜ÃƒÂ±]\.?", cleaned_line):
            chunks.append(cleaned_line)
            continue
        break
    return clean_name_candidate(" ".join(chunks))


def ocr_image(image: Image.Image) -> str:
    prepared = ImageOps.grayscale(image)
    prepared = ImageOps.autocontrast(prepared)
    return pytesseract.image_to_string(prepared)


def extract_pdf_text(file_bytes: bytes) -> str:
	chunks: list[str] = []
	with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
		for page in pdf.pages:
			chunks.append(page.extract_text() or "")

	text = "\n".join(chunks).strip()
	if text or convert_from_bytes is None:
		return text

	try:
		images = convert_from_bytes(file_bytes, dpi=220)
	except Exception:
		return ""
	return "\n".join(ocr_image(image) for image in images)


def extract_image_text(file_bytes: bytes) -> str:
    with Image.open(io.BytesIO(file_bytes)) as image:
        return ocr_image(image)


def find_first(patterns: list[str], text: str, flags: int = re.IGNORECASE) -> str:
    for pattern in patterns:
        match = re.search(pattern, text, flags)
        if match:
            return normalize_space(match.group(1))
    return ""


def detect_cor_document_title(text: str) -> dict[str, Any]:
    normalized = normalize_space(text)
    title_patterns = [
        ("Advising Slip", r"\bAdvising\s*Slip\b"),
        ("Certificate of Registration", r"\bCertificate\s*of\s*Registration\b"),
    ]
    for title, pattern in title_patterns:
        if re.search(pattern, normalized, re.IGNORECASE):
            return {
                "isValidCorDocument": True,
                "documentTitle": title,
                "acceptedCorTitles": ACCEPTED_COR_TITLES,
                "documentTitleRule": "COR must contain Advising Slip or Certificate of Registration in the document title.",
            }

    title_candidates = []
    for line in text.splitlines()[:20]:
        cleaned = normalize_space(line)
        if cleaned:
            title_candidates.append(cleaned)

    return {
        "isValidCorDocument": False,
        "documentTitle": "",
        "acceptedCorTitles": ACCEPTED_COR_TITLES,
        "documentTitleCandidates": title_candidates[:8],
        "documentTitleRule": "COR must contain Advising Slip or Certificate of Registration in the document title.",
    }


def detect_cog_document_title(text: str) -> dict[str, Any]:
    normalized = normalize_space(text)
    if re.search(r"\bReport\s*of\s*Grades\b", normalized, re.IGNORECASE):
        return {
            "isValidCogDocument": True,
            "documentTitle": "Report of Grades",
            "acceptedCogTitles": ACCEPTED_COG_TITLES,
            "documentTitleRule": "ROG must contain Report of Grades in the document title.",
        }

    title_candidates = []
    for line in text.splitlines()[:20]:
        cleaned = normalize_space(line)
        if cleaned:
            title_candidates.append(cleaned)

    return {
        "isValidCogDocument": False,
        "documentTitle": "",
        "acceptedCogTitles": ACCEPTED_COG_TITLES,
        "documentTitleCandidates": title_candidates[:8],
        "documentTitleRule": "ROG must contain Report of Grades in the document title.",
    }


def extract_course(text: str) -> str:
    lowered = text.lower()
    for course in COURSE_PATTERNS:
        if course.lower() in lowered:
            return course
    abbreviations = {
        "BSIT": "Bachelor of Science in Information Technology",
        "BS INFO TECH": "Bachelor of Science in Information Technology",
        "BSBA": "Bachelor of Science in Business Administration",
        "BSE": "Bachelor of Secondary Education",
        "BEED": "Bachelor of Elementary Education",
        "BSCPE": "Bachelor of Science in Computer Engineering",
        "BSIE": "Bachelor of Science in Industrial Engineering",
        "BTVLED": "Bachelor of Technology and Livelihood Education - Home Economics",
        "BTLED": "Bachelor of Technology and Livelihood Education - Home Economics",
        "BPE": "Bachelor of Physical Education",
    }
    upper_text = text.upper()
    for key, course in abbreviations.items():
        if re.search(rf"\b{re.escape(key)}\b", upper_text):
            return course
    match = re.search(
        r"(Bachelor\s+(?:of|in)\s+[A-Za-z\s&.-]{8,90}?)(?:\s{2,}|Year|Section|Student|$)",
        text,
        re.IGNORECASE,
    )
    return normalize_space(match.group(1)) if match else ""


def extract_year(text: str) -> str:
    value = find_first(
        [
            r"(?:Year\s*(?:Level)?\s*/\s*Section|Yr\s*/\s*Sec)\s*[:\-]?\s*([1-6])\s*[- ]?[A-Z]",
            r"(?:Year\s*Level|Year)\s*[:\-]?\s*([1-6])",
            r"\b([1-6])(?:st|nd|rd|th)\s*Year\b",
            r"\b([1-6])\s*[-]\s*[A-Z]\b",
        ],
        text,
    )
    return value[:1] if value else ""


def extract_section(text: str) -> str:
    value = find_first(
        [
            r"(?:Year\s*(?:Level)?\s*/\s*Section|Yr\s*/\s*Sec)\s*[:\-]?\s*[1-6]\s*[- ]?([A-Z])\b",
            r"(?:Section|Block)\s*[:\-]?\s*([A-Z](?:\s*[-]\s*[A-Z0-9])?|[A-Z0-9]{1,8})\b",
            r"\b([1-6]\s*-\s*[A-Z])\b",
        ],
        text,
    )
    if "-" in value:
        return normalize_space(value.split("-")[-1]).upper()
    return value.upper()


def extract_gwa_result(text: str) -> dict[str, Any]:
    grade_value_pattern = r"(?<!\d)([1-5](?:[\.,]\d{1,2})?)(?!\d)"
    gwa_label_pattern = r"(?:GWA|G\.?W\.?A\.?|General\s+Weighted\s+Average|Weighted\s+Average|General\s+Average|Average\s+Grade|Final\s+Average|Overall\s+Average)"
    debug: dict[str, Any] = {
        "value": "",
        "matchedRule": "",
        "matchedText": "",
        "nearbyText": "",
        "attemptedRules": [
            "label and value on same text segment",
            "value before label",
            "value within 160 characters after GWA label",
            "split label across nearby lines",
            "value near average label lines",
        ],
    }

    def finish(value: str, rule: str, matched_text: str = "", nearby_text: str = "") -> dict[str, Any]:
        return {
            **debug,
            "value": value.replace(",", "."),
            "matchedRule": rule,
            "matchedText": normalize_space(matched_text),
            "nearbyText": normalize_space(nearby_text)[:300],
        }

    patterns = [
        rf"{gwa_label_pattern}\s*[:\-]?\s*{grade_value_pattern}",
        rf"(?:Average|Ave\.?)\s*[:\-]?\s*{grade_value_pattern}",
        rf"\b{grade_value_pattern}\s*{gwa_label_pattern}\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return finish(match.group(1), "label/value direct regex", match.group(0), match.group(0))

    label_match = re.search(gwa_label_pattern, text, re.IGNORECASE)
    if label_match:
        nearby_text = text[label_match.end() : label_match.end() + 160]
        nearby_value = re.search(grade_value_pattern, nearby_text)
        if nearby_value:
            return finish(nearby_value.group(1), "value near GWA label", nearby_value.group(0), nearby_text)

    lines = [normalize_space(line) for line in text.splitlines() if normalize_space(line)]
    for index, _line in enumerate(lines):
        window_lines = lines[max(0, index - 2) : index + 5]
        window_text = " ".join(window_lines)
        has_full_label = re.search(gwa_label_pattern, window_text, re.IGNORECASE)
        has_split_label = (
            re.search(r"\bgeneral\s+weighted\b|\bweighted\b|\bg\.?w\.?a\.?\b", window_text, re.IGNORECASE)
            and re.search(r"\baverage\b", window_text, re.IGNORECASE)
        )
        if not has_full_label and not has_split_label:
            continue
        after_text = " ".join(lines[index : index + 5])
        numbers = re.findall(grade_value_pattern, after_text)
        if numbers:
            return finish(numbers[-1], "split/nearby GWA label lines", numbers[-1], after_text)

        before_numbers = re.findall(grade_value_pattern, " ".join(lines[max(0, index - 3) : index]))
        if before_numbers:
            return finish(before_numbers[-1], "GWA value before label lines", before_numbers[-1], window_text)

    return debug


def extract_gwa(text: str) -> str:
    return extract_gwa_result(text)["value"]


FINAL_GRADE_CONCERN_VALUES = {"4", "4.0", "4.00", "5", "5.0", "5.00", "INC", "UD", "OD"}


def normalize_grade_token(value: str = "") -> str:
    cleaned = normalize_space(value).upper().replace(",", ".")
    if cleaned in {"INC", "UD", "OD"}:
        return cleaned
    numeric = re.fullmatch(r"([1-5])(?:\.([0-9]{1,2}))?", cleaned)
    if not numeric:
        return cleaned
    whole = numeric.group(1)
    decimals = numeric.group(2)
    if decimals is None:
        return whole
    return f"{whole}.{decimals.ljust(1, '0')[:2]}".rstrip("0").rstrip(".") if whole in {"4", "5"} else f"{whole}.{decimals}"


def is_grade_token(value: str = "") -> bool:
    return bool(re.fullmatch(r"(?:[1-5](?:[\.,](?:00|0|25|50|5|75))?|INC|UD|OD)", normalize_space(value), re.IGNORECASE))


def grade_debug_from_grades(
    grades: list[str],
    row_debug: list[dict[str, str]],
    extraction_method: str,
    explanation: str,
    extra_concern_matches: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    normalized_grades = [normalize_grade_token(grade) for grade in grades if normalize_grade_token(grade)]
    concern_matches = [
        {"grade": grade, "reason": "Final Grade column contains 5.0, 4.0, INC, UD, or OD"}
        for grade in normalized_grades
        if normalize_grade_token(grade) in FINAL_GRADE_CONCERN_VALUES
    ]
    concern_matches.extend(extra_concern_matches or [])
    return {
        "grades": normalized_grades,
        "concernMatches": concern_matches,
        "rowDebug": row_debug[:120],
        "extractionMethod": extraction_method,
        "explanation": explanation,
    }


def extract_final_grades_from_pdf_tables(file_bytes: bytes) -> dict[str, Any]:
    final_grades: list[str] = []
    row_debug: list[dict[str, str]] = []
    remarks_concerns: list[dict[str, str]] = []

    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page_index, page in enumerate(pdf.pages, start=1):
                tables = page.extract_tables() or []
                for table_index, table in enumerate(tables, start=1):
                    if not table:
                        continue
                    header_index = -1
                    final_col = -1
                    remarks_col = -1
                    for row_index, row in enumerate(table):
                        cells = [normalize_space(cell or "") for cell in row]
                        for cell_index, cell in enumerate(cells):
                            if re.search(r"\bFinal\b", cell, re.IGNORECASE):
                                header_index = row_index
                                final_col = cell_index
                            if re.search(r"\bRemarks?\b", cell, re.IGNORECASE):
                                remarks_col = cell_index
                        if final_col >= 0:
                            break

                    if final_col < 0:
                        continue

                    for row in table[header_index + 1 :]:
                        cells = [normalize_space(cell or "") for cell in row]
                        if final_col >= len(cells):
                            continue
                        row_text = " | ".join(cells)
                        if re.search(r"\b(?:General\s+Weighted\s+Average|G\.?W\.?A\.?|Weighted\s+Average)\b", row_text, re.IGNORECASE):
                            continue
                        remarks_cell = cells[remarks_col] if 0 <= remarks_col < len(cells) else ""
                        has_failed_remark = bool(re.search(r"\bFailed\b", remarks_cell, re.IGNORECASE))
                        grade_cell = cells[final_col]
                        if not is_grade_token(grade_cell) and not has_failed_remark:
                            continue
                        grade = normalize_grade_token(grade_cell) if is_grade_token(grade_cell) else ""
                        if grade:
                            final_grades.append(grade)
                        if has_failed_remark:
                            remarks_concerns.append({
                                "grade": grade or "Failed",
                                "reason": "Remarks column contains Failed",
                            })
                        row_debug.append({
                            "page": str(page_index),
                            "table": str(table_index),
                            "finalColumnIndex": str(final_col),
                            "remarksColumnIndex": str(remarks_col),
                            "selectedFinalGrade": grade,
                            "selectedRemarks": remarks_cell,
                            "hasFailedRemark": str(has_failed_remark),
                            "row": row_text[:260],
                        })
    except Exception as exc:
        return grade_debug_from_grades(
            [],
            [{"error": str(exc)}],
            "pdfplumber table Final column extraction failed",
            "The scanner attempted table-cell extraction but pdfplumber could not read the table structure.",
        )

    return grade_debug_from_grades(
        final_grades,
        row_debug,
        "pdfplumber table Final column extraction",
        "ROG scanning reads the PDF table cells and collects values under the exact Final column. It also checks the Remarks column for Failed.",
        remarks_concerns,
    )


def extract_final_grades_from_pdf_words(file_bytes: bytes) -> dict[str, Any]:
    final_grades: list[str] = []
    row_debug: list[dict[str, str]] = []
    remarks_concerns: list[dict[str, str]] = []

    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page_index, page in enumerate(pdf.pages, start=1):
                words = page.extract_words(
                    x_tolerance=2,
                    y_tolerance=3,
                    keep_blank_chars=False,
                    use_text_flow=False,
                ) or []
                if not words:
                    continue

                header_words = [
                    word for word in words
                    if re.fullmatch(r"Final", normalize_space(word.get("text", "")), re.IGNORECASE)
                ]
                remarks_words = [
                    word for word in words
                    if re.fullmatch(r"Remarks?", normalize_space(word.get("text", "")), re.IGNORECASE)
                ]
                if not header_words:
                    continue

                final_header = min(header_words, key=lambda word: float(word.get("top", 0)))
                final_x0 = float(final_header.get("x0", 0))
                final_x1 = float(final_header.get("x1", final_x0 + 36))
                header_top = float(final_header.get("top", 0))
                header_bottom = float(final_header.get("bottom", header_top + 12))

                right_header_words = [
                    word for word in words
                    if header_top - 16 <= float(word.get("top", 0)) <= header_bottom + 16
                    and float(word.get("x0", 0)) > final_x1 + 4
                    and re.search(r"^(?:Re-?Exam|Credit|Units?|Remarks?)$", normalize_space(word.get("text", "")), re.IGNORECASE)
                ]
                next_col_x = min(
                    [float(word.get("x0", 0)) for word in right_header_words],
                    default=final_x1 + 72,
                )

                remarks_header = min(
                    remarks_words,
                    key=lambda word: abs(float(word.get("top", 0)) - header_top),
                    default=None,
                )
                remarks_x0 = float(remarks_header.get("x0", 0)) if remarks_header else None
                remarks_x1 = float(remarks_header.get("x1", remarks_x0 + 80)) if remarks_header else None

                data_words = [
                    word for word in words
                    if float(word.get("top", 0)) > header_bottom + 2
                ]
                rows: list[list[dict[str, Any]]] = []
                for word in sorted(data_words, key=lambda item: (float(item.get("top", 0)), float(item.get("x0", 0)))):
                    top = float(word.get("top", 0))
                    if not rows or abs(top - float(rows[-1][0].get("top", 0))) > 4:
                        rows.append([word])
                    else:
                        rows[-1].append(word)

                for row in rows:
                    sorted_row = sorted(row, key=lambda item: float(item.get("x0", 0)))
                    row_text = normalize_space(" ".join(word.get("text", "") for word in sorted_row))
                    if not row_text:
                        continue
                    if re.search(r"\b(?:General\s+Weighted\s+Average|G\.?W\.?A\.?|Weighted\s+Average)\b", row_text, re.IGNORECASE):
                        break
                    if re.search(r"\b(?:https?://|blob:|Report|Page\s+\d+|\d+/\d+/\d+)\b", row_text, re.IGNORECASE):
                        continue

                    final_tokens = [
                        normalize_grade_token(word.get("text", ""))
                        for word in sorted_row
                        if final_x0 - 10 <= float(word.get("x0", 0)) <= next_col_x - 4
                        and is_grade_token(word.get("text", ""))
                    ]
                    remarks_text = ""
                    if remarks_x0 is not None and remarks_x1 is not None:
                        remarks_text = normalize_space(" ".join(
                            word.get("text", "")
                            for word in sorted_row
                            if remarks_x0 - 18 <= float(word.get("x0", 0)) <= remarks_x1 + 96
                        ))
                    has_failed_remark = bool(re.search(r"\bFailed\b", remarks_text or row_text, re.IGNORECASE))

                    if not final_tokens and not has_failed_remark:
                        continue

                    grade = final_tokens[0] if final_tokens else ""
                    if grade:
                        final_grades.append(grade)
                    if has_failed_remark:
                        remarks_concerns.append({
                            "grade": grade or "Failed",
                            "reason": "Remarks column contains Failed",
                        })
                    row_debug.append({
                        "page": str(page_index),
                        "finalColumnX": f"{final_x0:.1f}-{next_col_x:.1f}",
                        "remarksColumnX": f"{remarks_x0:.1f}" if remarks_x0 is not None else "",
                        "selectedFinalGrade": grade,
                        "selectedRemarks": remarks_text,
                        "hasFailedRemark": str(has_failed_remark),
                        "line": row_text[:260],
                    })
    except Exception as exc:
        return grade_debug_from_grades(
            [],
            [{"error": str(exc)}],
            "pdf word-position Final column extraction failed",
            "The scanner attempted coordinate-based PDF word extraction but could not read the PDF text positions.",
        )

    return grade_debug_from_grades(
        final_grades,
        row_debug,
        "pdf word-position Final and Remarks column extraction",
        "ROG scanning locates the Final and Remarks headers by PDF word coordinates, then reads only values below those columns. Footer/page URL numbers are ignored.",
        remarks_concerns,
    )


def extract_final_grades_from_text(text: str) -> dict[str, Any]:
    grade_token_pattern = re.compile(r"\b(?:[1-5](?:[\.,](?:00|0|25|50|5|75))?|INC|UD|OD)\b", re.IGNORECASE)
    raw_lines = [line.rstrip() for line in text.splitlines() if normalize_space(line)]
    header_index = -1

    for index, line in enumerate(raw_lines):
        normalized = normalize_space(line)
        if re.search(r"\bFinal\b", normalized, re.IGNORECASE) and re.search(
            r"\b(?:Re-?Exam|Credit\s+Units?|Units?|Remarks?)\b",
            normalized,
            re.IGNORECASE,
        ):
            header_index = index
            break

    candidate_lines = raw_lines[header_index + 1 :] if header_index >= 0 else raw_lines
    final_grades: list[str] = []
    row_debug: list[dict[str, str]] = []
    remarks_concerns: list[dict[str, str]] = []
    rows_after_first_grade = 0

    for raw_line in candidate_lines:
        line = normalize_space(raw_line)
        if not line:
            continue
        if re.search(r"\b(?:General\s+Weighted\s+Average|G\.?W\.?A\.?|Weighted\s+Average)\b", line, re.IGNORECASE):
            break
        if re.search(r"\b(?:https?://|blob:|Report|Page\s+\d+|\d+/\d+/\d+)\b", line, re.IGNORECASE):
            continue
        if re.search(r"\b(?:Final|Re-?Exam|Credit\s+Units?|Remarks?|Subject|Course\s+No)\b", line, re.IGNORECASE):
            continue

        has_failed_remark = bool(re.search(r"\bFailed\b", line, re.IGNORECASE))
        tokens = list(grade_token_pattern.finditer(line))
        if not tokens and not has_failed_remark:
            if final_grades:
                rows_after_first_grade += 1
                if rows_after_first_grade > 8:
                    break
            continue

        before_re_exam = re.split(r"\s(?:--|-|—)\s", line, maxsplit=1)[0]
        before_tokens = list(grade_token_pattern.finditer(before_re_exam))
        selected = before_tokens[-1].group(0) if before_tokens else tokens[0].group(0) if tokens else ""
        normalized_grade = normalize_grade_token(selected) if selected else ""
        if normalized_grade:
            final_grades.append(normalized_grade)
        if has_failed_remark:
            remarks_concerns.append({
                "grade": normalized_grade or "Failed",
                "reason": "Remarks column/text contains Failed",
            })
        row_debug.append({
            "line": line[:220],
            "selectedFinalGrade": normalized_grade,
            "hasFailedRemark": str(has_failed_remark),
        })
        rows_after_first_grade = 0

    explanation = (
        "ROG scanning checks identity fields, extracts printed GWA, and reads only values "
        "from the subject Final Grade column. It also checks the Remarks column/text for Failed. "
        "Credit Units are ignored by selecting the grade before the Re-Exam/Credit Units area when present."
    )
    return grade_debug_from_grades(
        final_grades,
        row_debug,
        "header-anchored Final Grade column extraction",
        explanation,
        remarks_concerns,
    )

def extract_name(text: str) -> dict[str, str]:
    lines = [normalize_space(line) for line in text.splitlines() if normalize_space(line)]
    candidates = []

    for index, line in enumerate(lines):
        label_match = re.search(rf"^\s*{NAME_LABEL_PATTERN}\s*[:\-]?\s*(.*)$", line, re.IGNORECASE)
        if label_match:
            candidate = collect_labeled_name(lines, index, label_match.group(1))
            if is_likely_name_candidate(candidate):
                candidates.append(candidate)
                continue
        if re.search(r"\b(?:CERTIFICATE|REGISTRATION|GRADES|REMARKS|FINAL|PROGRAM|COURSE|ADVISING|SLIP)\b", line, re.IGNORECASE):
            continue
        labeled = re.search(
            r"(?:Student\s*Name|Name\s+of\s+Student|Full\s*Name|Fullname|Name)\s*[:\-]?\s*([A-ZÃ‘][A-ZÃ‘ ,.'-]{5,80})",
            line,
            re.IGNORECASE,
        )
        if labeled:
            candidates.append(clean_name_candidate(labeled.group(1)))
            continue
        comma_name = re.search(r"\b([A-ZÃ‘][A-ZÃ‘.' -]{1,35}),\s*([A-ZÃ‘][A-ZÃ‘.' -]{2,60})\b", line)
        if comma_name:
            candidates.append(clean_name_candidate(f"{comma_name.group(1)}, {comma_name.group(2)}"))

    for index, line in enumerate(lines):
        if not re.fullmatch(rf"{NAME_LABEL_PATTERN}\s*:?", line, re.IGNORECASE):
            continue
        candidate = collect_labeled_name(lines, index)
        if is_likely_name_candidate(candidate):
            candidates.append(candidate)
            continue
        for next_line in lines[index + 1 : index + 4]:
            if re.search(r"\b(?:STUDENT\s*NO|STUDENT\s*ID|PROGRAM|COURSE|YEAR|SECTION)\b", next_line, re.IGNORECASE):
                break
            next_candidate = clean_name_candidate(next_line)
            if len(next_candidate.split()) >= 2:
                candidates.append(next_candidate)
                break

    if not candidates:
        value = find_first(
            [
                r"(?:This\s+is\s+to\s+certify\s+that)\s+([A-Z][A-Za-z ,.'-]{5,80})",
            ],
            text,
        )
        candidates.append(clean_name_candidate(value))

    if not candidates or not next((item for item in candidates if len(item.split()) >= 2), ""):
        blocked_words = re.compile(
            r"\b(?:REPUBLIC|PHILIPPINES|BULACAN|UNIVERSITY|CERTIFICATE|REGISTRATION|GRADE|REMARK|FINAL|AVERAGE|PROGRAM|COURSE|STUDENT|NUMBER|SECTION|SEMESTER)\b",
            re.IGNORECASE,
        )
        for line in lines:
            if blocked_words.search(line):
                continue
            candidate = clean_name_candidate(line)
            parts = candidate.split()
            if 2 <= len(parts) <= 6 and re.fullmatch(r"[A-Za-zÃ‘Ã± .,'-]+", candidate):
                candidates.append(candidate)
                break

    full_name = next((item for item in candidates if len(item.split()) >= 2), "")
    if "," in full_name:
        last_part, rest = [normalize_space(part) for part in full_name.split(",", 1)]
        rest_parts = [part for part in rest.split(" ") if part]
        return {
            "fullName": to_title_name(f"{rest} {last_part}"),
            "firstName": to_title_name(rest_parts[0] if rest_parts else ""),
            "middleName": "",
            "lastName": to_title_name(last_part),
        }

    cleaned = to_title_name(full_name)
    parts = [part for part in cleaned.split(" ") if part]
    if len(parts) < 2:
        return {"fullName": cleaned, "firstName": "", "middleName": "", "lastName": ""}
    return {
        "fullName": cleaned,
        "firstName": parts[0],
        "middleName": "",
        "lastName": parts[-1],
    }


def extract_semester(text: str) -> dict[str, str]:
    normalized_text = normalize_space(text)
    lines = [normalize_space(line) for line in text.splitlines() if normalize_space(line)]
    academic_year = find_first(
        [
            r"(?:Academic\s*Year\s*(?:&|and)\s*Term|Academic\s*Year\s*/\s*Term)\s*[:\-]?\s*(20\d{2}\s*[-/]\s*20\d{2})",
            r"(?:Academic\s*Year\s*(?:&|and)\s*Term|Academic\s*Year\s*/\s*Term)\s*[:\-]?\s*(?:\S+\s+){0,8}?(20\d{2}\s*[-/]\s*20\d{2})",
            r"(20\d{2}\s*[-/]\s*20\d{2})",
            r"(?:Academic\s*Year|A\.Y\.)\s*[:\-]?\s*(20\d{2}\s*[-/]\s*20\d{2})",
        ],
        text,
    ).replace(" ", "").replace("/", "-")
    semester = find_first(
        [
            r"(?:Academic\s*Year\s*(?:&|and)\s*Term|Academic\s*Year\s*/\s*Term)\s*[:\-]?\s*(?:20\d{2}\s*[-/]\s*20\d{2})?\s*(1st|2nd|First|Second)\s*Semester",
            r"(?:Academic\s*Year\s*(?:&|and)\s*Term|Academic\s*Year\s*/\s*Term)\s*[:\-]?\s*(?:\S+\s+){0,8}?(1st|2nd|First|Second)\s*Semester",
            r"(?:Semester|Sem)\s*[:\-]?\s*(1st|2nd|First|Second)",
            r"\b(1st|2nd|First|Second)\s+Semester\b",
        ],
        text,
    )
    if (not academic_year or not semester) and re.search(r"Academic\s*Year\s*(?:&|and)\s*Term|Academic\s*Year\s*/\s*Term", normalized_text, re.IGNORECASE):
        combined_match = re.search(
            r"Academic\s*Year\s*(?:&|and)\s*Term\s*(?:[:\-])?\s*(?:\S+\s+){0,10}?(20\d{2}\s*[-/]\s*20\d{2})\s*(1st|2nd|First|Second)\s*Semester",
            normalized_text,
            re.IGNORECASE,
        )
        if combined_match:
            academic_year = academic_year or normalize_space(combined_match.group(1)).replace(" ", "").replace("/", "-")
            semester = semester or normalize_space(combined_match.group(2))
    if not semester:
        for index, line in enumerate(lines):
            if not re.search(r"Academic\s*Year\s*(?:&|and)?\s*$|^Term\b|Academic\s*Year\s*(?:&|and)\s*Term|Academic\s*Year\s*/\s*Term", line, re.IGNORECASE):
                continue
            window = normalize_space(" ".join(lines[index : index + 5]))
            window_match = re.search(
                r"(20\d{2}\s*[-/]\s*20\d{2})\s*(1st|2nd|First|Second)\s*(?:Semester)?",
                window,
                re.IGNORECASE,
            )
            if window_match:
                academic_year = academic_year or normalize_space(window_match.group(1)).replace(" ", "").replace("/", "-")
                semester = normalize_space(window_match.group(2))
                break
    if not semester and academic_year:
        year_parts = academic_year.split("-", 1)
        compact_year = rf"{re.escape(year_parts[0])}\s*[-/]\s*{re.escape(year_parts[1])}" if len(year_parts) == 2 else re.escape(academic_year)
        nearby_match = re.search(
            rf"{compact_year}\s*(1st|2nd|First|Second)\s*(?:Semester)?",
            normalized_text,
            re.IGNORECASE,
        )
        if nearby_match:
            semester = normalize_space(nearby_match.group(1))
    return {"academicYear": academic_year, "semester": semester}


def extract_flags(text: str, final_grade_debug: dict[str, Any] | None = None) -> dict[str, Any]:
    gwa_debug = extract_gwa_result(text)
    final_grade_debug = final_grade_debug or extract_final_grades_from_text(text)
    return {
        "hasAcademicConcern": len(final_grade_debug["concernMatches"]) > 0,
        "academicConcernTerms": [
            "Failed remark" if "Failed" in match.get("reason", "") else match["grade"]
            for match in final_grade_debug["concernMatches"]
        ],
        "gradeDebug": {
            "grades": final_grade_debug["grades"],
            "computedAverage": "",
            "concernMatches": final_grade_debug["concernMatches"],
            "rowDebug": final_grade_debug["rowDebug"],
            "extractionMethod": final_grade_debug["extractionMethod"],
            "explanation": final_grade_debug["explanation"],
        },
        "gwaDebug": gwa_debug,
    }


def parse_document(text: str, document_type: str, final_grade_debug: dict[str, Any] | None = None) -> dict[str, Any]:
    student_id = find_first(
        [
            r"(?:Student\s*(?:No\.?|Number|ID)|ID\s*No\.?)\s*[:\-]?\s*([0-9\-]{6,20})",
            r"\b(20\d{8,12}|10\d{7,12})\b",
        ],
        text,
    )
    name = extract_name(text)
    semester = extract_semester(text)
    flags = extract_flags(text, final_grade_debug) if document_type.lower() == "cog" else {
        "hasAcademicConcern": False,
        "academicConcernTerms": [],
        "gradeDebug": {
            "grades": [],
            "computedAverage": "",
            "concernMatches": [],
            "rowDebug": [],
            "extractionMethod": "not applied",
            "explanation": "Final Grade concern detection is applied only to ROG documents.",
        },
        "gwaDebug": extract_gwa_result(text),
    }
    normalized_document_type = document_type.lower()
    title_check = {}
    if normalized_document_type == "cor":
        title_check = detect_cor_document_title(text)
    elif normalized_document_type == "cog":
        title_check = detect_cog_document_title(text)

    return {
        "documentType": document_type,
        "studentId": student_id.replace("-", ""),
        "firstName": name["firstName"],
        "middleName": name["middleName"],
        "lastName": name["lastName"],
        "fullName": name["fullName"],
        "course": extract_course(text),
        "year": extract_year(text),
        "section": "",
        "gwa": extract_gwa(text),
        **semester,
        **flags,
        **title_check,
        "rawTextPreview": normalize_space(text)[:1200],
    }


def parse_pdf_document(file_bytes: bytes, document_type: str) -> dict[str, Any]:
    text = extract_pdf_text(file_bytes)
    final_grade_debug = None
    if document_type.lower() == "cog":
        table_grade_debug = extract_final_grades_from_pdf_tables(file_bytes)
        if table_grade_debug.get("grades"):
            final_grade_debug = table_grade_debug
        else:
            word_grade_debug = extract_final_grades_from_pdf_words(file_bytes)
            if word_grade_debug.get("grades") or word_grade_debug.get("concernMatches"):
                final_grade_debug = {
                    **word_grade_debug,
                    "rowDebug": [
                        *table_grade_debug.get("rowDebug", []),
                        *word_grade_debug.get("rowDebug", []),
                    ][:120],
                    "extractionMethod": "pdf table extraction fallback to word-position Final column extraction",
                    "explanation": (
                        "The scanner first tried exact PDF table cells. Because no cells were found, "
                        "it located the Final and Remarks columns by PDF word coordinates and ignored footer/page URL numbers."
                    ),
                }
            else:
                fallback_debug = extract_final_grades_from_text(text)
                final_grade_debug = {
                    **fallback_debug,
                    "rowDebug": [
                        *table_grade_debug.get("rowDebug", []),
                        *word_grade_debug.get("rowDebug", []),
                        *fallback_debug.get("rowDebug", []),
                    ][:120],
                    "extractionMethod": "pdf table and word-position extraction fallback to text Final Grade extraction",
                    "explanation": (
                        "The scanner first tried exact PDF table cells and word coordinates. "
                        "Because no Final column values were found, it used the text fallback with footer/page URL lines ignored."
                    ),
                }
    return parse_document(text, document_type, final_grade_debug)
