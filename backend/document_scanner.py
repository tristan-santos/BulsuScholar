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
    cleaned = re.sub(r"[^A-Za-zÑñ,.' -]", " ", cleaned)
    cleaned = normalize_space(cleaned)
    return cleaned.strip(" ,.-")


def is_likely_name_candidate(value: str = "") -> bool:
    candidate = clean_name_candidate(value)
    parts = candidate.replace(",", " ").split()
    if len(parts) < 2 or len(parts) > 7:
        return False
    if NAME_BLOCKED_WORDS.search(candidate):
        return False
    return bool(re.fullmatch(r"[A-Za-zÃ‘Ã± ,.'-]+", candidate))


def collect_labeled_name(lines: list[str], index: int, remainder: str = "") -> str:
    chunks = [remainder] if remainder else []
    for next_line in lines[index + 1 : index + 4]:
        if re.search(r"\b(?:STUDENT\s*(?:NO|ID|NUMBER)|PROGRAM|COURSE|CURRICULUM|YEAR|SECTION|SEMESTER|SUBJECT|FINAL|REMARKS|UNITS)\b", next_line, re.IGNORECASE):
            break
        cleaned_line = clean_name_candidate(next_line)
        if not cleaned_line:
            continue
        if is_likely_name_candidate(" ".join(chunks + [cleaned_line])) or re.fullmatch(r"[A-Za-zÃ‘Ã±]\.?", cleaned_line):
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
            r"(?:Student\s*Name|Name\s+of\s+Student|Full\s*Name|Fullname|Name)\s*[:\-]?\s*([A-ZÑ][A-ZÑ ,.'-]{5,80})",
            line,
            re.IGNORECASE,
        )
        if labeled:
            candidates.append(clean_name_candidate(labeled.group(1)))
            continue
        comma_name = re.search(r"\b([A-ZÑ][A-ZÑ.' -]{1,35}),\s*([A-ZÑ][A-ZÑ.' -]{2,60})\b", line)
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
            if 2 <= len(parts) <= 6 and re.fullmatch(r"[A-Za-zÑñ .,'-]+", candidate):
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
    academic_year = find_first(
        [
            r"(20\d{2}\s*[-/]\s*20\d{2})",
            r"(?:Academic\s*Year|A\.Y\.)\s*[:\-]?\s*(20\d{2}\s*[-/]\s*20\d{2})",
        ],
        text,
    ).replace(" ", "").replace("/", "-")
    semester = find_first(
        [
            r"(?:Semester|Sem)\s*[:\-]?\s*(1st|2nd|First|Second)",
            r"\b(1st|2nd|First|Second)\s+Semester\b",
        ],
        text,
    )
    return {"academicYear": academic_year, "semester": semester}


def extract_flags(text: str) -> dict[str, Any]:
    gwa_debug = extract_gwa_result(text)
    return {
        "hasAcademicConcern": False,
        "academicConcernTerms": [],
        "gradeDebug": {
            "grades": [],
            "computedAverage": "",
            "concernMatches": [],
            "extractionMethod": "GWA-only extraction",
            "explanation": (
                "COG scanning does not read all subject grades. "
                "It extracts only an explicitly printed GWA or average label."
            ),
        },
        "gwaDebug": gwa_debug,
    }


def parse_document(text: str, document_type: str) -> dict[str, Any]:
    student_id = find_first(
        [
            r"(?:Student\s*(?:No\.?|Number|ID)|ID\s*No\.?)\s*[:\-]?\s*([0-9\-]{6,20})",
            r"\b(20\d{8,12}|10\d{7,12})\b",
        ],
        text,
    )
    name = extract_name(text)
    semester = extract_semester(text)

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
        **extract_flags(text),
        "rawTextPreview": normalize_space(text)[:1200],
    }
