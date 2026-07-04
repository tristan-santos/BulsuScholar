import io
import os
import re
from typing import Any

import pdfplumber
import pytesseract
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageOps

try:
    from pdf2image import convert_from_bytes
except Exception:  # pragma: no cover - optional runtime dependency
    convert_from_bytes = None


app = FastAPI(title="BulsuScholar Document Scanner")

allowed_origins = [
    item.strip()
    for item in os.getenv("DOCUMENT_SCAN_ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if item.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


def normalize_space(value: str = "") -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def to_title_name(value: str = "") -> str:
    particles = {"DE", "DEL", "DELA", "DA", "VAN", "VON"}
    parts = []
    for part in normalize_space(value).replace(".", ". ").split():
        upper = part.upper().strip()
        if upper in particles:
            parts.append(upper.title())
        elif len(upper) == 1:
            parts.append(upper)
        else:
            parts.append(upper.title())
    return normalize_space(" ".join(parts))


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

    images = convert_from_bytes(file_bytes, dpi=220)
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


def format_grade(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def normalize_grade_token(value: str = "") -> str:
    cleaned = value.replace(",", ".").strip()
    try:
        return format_grade(float(cleaned))
    except ValueError:
        return cleaned.upper()


def academic_concern_grade_label(value: str = "") -> str:
    try:
        numeric = float(str(value).replace(",", "."))
    except ValueError:
        return value.upper()
    if numeric == 4:
        return "4.0"
    if numeric == 5:
        return "5.0"
    return format_grade(numeric)


def is_grade_number(value: str = "") -> bool:
    try:
        numeric = float(value.replace(",", "."))
    except ValueError:
        return False
    return 1 <= numeric <= 5


def extract_final_column_rows(lines: list[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    header_index = next(
        (
            index
            for index, line in enumerate(lines)
            if re.search(r"\bfinal\b", line, re.IGNORECASE)
            and re.search(r"\b(?:re[\s-]*exam|credit\s+units?|remarks?)\b", line, re.IGNORECASE)
        ),
        -1,
    )

    if header_index >= 0:
        for index, line in enumerate(lines[header_index + 1 :], start=header_index + 2):
            if re.search(r"\b(?:general\s+weighted\s+average|weighted\s+average|gwa|prepared\s+by|certified\s+by)\b", line, re.IGNORECASE):
                break
            if re.search(r"\b(?:subject|course\s+code|description|final|credit\s+units?)\b", line, re.IGNORECASE):
                continue

            tokens = re.findall(r"\b([1-5](?:[\.,]\d{1,2})?)\b|(--|INC|UD|OD|Passed|Failed)", line, re.IGNORECASE)
            flat_tokens = [number or word for number, word in tokens]
            numeric_tokens = [token for token in flat_tokens if is_grade_number(token)]
            if not numeric_tokens:
                continue

            final_grade = numeric_tokens[0]
            remark_match = re.search(r"\b(passed|failed|inc|ud|od)\b", line, re.IGNORECASE)
            rows.append({
                "lineNumber": index,
                "source": "header-anchored final column",
                "grade": normalize_grade_token(final_grade),
                "remark": remark_match.group(1).upper() if remark_match else "",
                "text": line,
            })

    return rows


def add_unique_grade_row(rows: list[dict[str, Any]], row: dict[str, Any]) -> None:
    row_key = (
        str(row.get("lineNumber", "")),
        str(row.get("grade", "")),
        str(row.get("remark", "")),
        str(row.get("text", "")),
    )
    existing_keys = {
        (
            str(item.get("lineNumber", "")),
            str(item.get("grade", "")),
            str(item.get("remark", "")),
            str(item.get("text", "")),
        )
        for item in rows
    }
    if row_key not in existing_keys:
        rows.append(row)


def build_grade_debug(text: str) -> dict[str, Any]:
    lines = [normalize_space(line) for line in text.splitlines() if normalize_space(line)]
    grade_rows: list[dict[str, Any]] = []
    concern_matches: list[dict[str, str]] = []

    for row in extract_final_column_rows(lines):
        add_unique_grade_row(grade_rows, row)

    for index, line in enumerate(lines, start=1):
        if re.search(r"\b(?:passed|failed|inc|ud|od)\b", line, re.IGNORECASE):
            if any(item.get("lineNumber") == index for item in grade_rows):
                continue
            grade_match = re.search(r"\b([1-5](?:[\.,]\d{1,2})?)\s*(?:--|passed|failed|inc|ud|od)\b", line, re.IGNORECASE)
            if not grade_match:
                grade_match = re.search(r"\b([1-5](?:[\.,]\d{1,2})?)\b", line)
            remark_match = re.search(r"\b(passed|failed|inc|ud|od)\b", line, re.IGNORECASE)
            grade_value = normalize_grade_token(grade_match.group(1)) if grade_match else ""
            remark_value = remark_match.group(1).upper() if remark_match else ""
            row = {
                "lineNumber": index,
                "source": "grade row with remarks",
                "grade": grade_value,
                "remark": remark_value,
                "text": line,
            }
            add_unique_grade_row(grade_rows, row)

    if re.search(r"\bfinal\b", text, re.IGNORECASE) and re.search(r"\bremarks\b", text, re.IGNORECASE):
        final_block = re.split(r"\bfinal\b", text, maxsplit=1, flags=re.IGNORECASE)[-1]
        final_block = re.split(r"\bremarks\b", final_block, maxsplit=1, flags=re.IGNORECASE)[0]
        for index, line in enumerate([normalize_space(item) for item in final_block.splitlines() if normalize_space(item)], start=1):
            if re.search(r"\b(?:re[\s-]*exam|credit\s+units?|final)\b", line, re.IGNORECASE):
                continue
            column_grades = re.findall(r"\b([1-5][\.,](?:00|0|25|50|5|75))\b", line)
            if column_grades:
                normalized = normalize_grade_token(column_grades[0])
                add_unique_grade_row(grade_rows, {
                    "lineNumber": "",
                    "source": "final-to-remarks row fallback",
                    "grade": normalized,
                    "remark": "",
                    "text": line,
                })

    for row in grade_rows:
        grade_value = str(row.get("grade", ""))
        remark_value = str(row.get("remark", "")).upper()
        line = str(row.get("text", ""))
        if grade_value in {"4", "4.0", "5", "5.0"}:
            concern_matches.append({
                "term": academic_concern_grade_label(grade_value),
                "reason": "Final grade is 4.0 or 5.0 in the extracted Final column.",
                "line": line,
            })
        if remark_value in {"INC", "UD", "OD"}:
            concern_matches.append({
                "term": remark_value,
                "reason": "Remark is INC, UD, or OD in a grade row.",
                "line": line,
            })

    average = ""
    numeric_grades = []
    for row in grade_rows:
        try:
            numeric_grades.append(float(str(row["grade"]).replace(",", ".")))
        except ValueError:
            pass
    if numeric_grades:
        average = format_grade(sum(numeric_grades) / len(numeric_grades))

    return {
        "grades": grade_rows,
        "computedAverage": average,
        "concernMatches": concern_matches,
        "extractionMethod": "Header-based table extraction with Final-column anchoring",
        "explanation": (
            "Academic concerns are detected from the Final column, not Credit Units. "
            "The parser anchors on the table header and takes the first numeric value in each grade row as Final."
        ),
    }


def extract_gwa(text: str) -> str:
    patterns = [
        r"(?:GWA|G\.?W\.?A\.?)\s*[:\-]?\s*([1-5](?:[\.,]\d{1,2})?)",
        r"(?:General\s+Weighted\s+Average|Weighted\s+Average)\s*[:\-]?\s*([1-5](?:[\.,]\d{1,2})?)",
        r"(?:General\s+Average|Average\s+Grade|Final\s+Average|Overall\s+Average)\s*[:\-]?\s*([1-5](?:[\.,]\d{1,2})?)",
        r"(?:Average|Ave\.?)\s*[:\-]?\s*([1-5](?:[\.,]\d{1,2})?)",
        r"\b([1-5](?:[\.,]\d{1,2})?)\s*(?:GWA|General\s+Weighted\s+Average|Weighted\s+Average)\b",
    ]
    value = find_first(patterns, text).replace(",", ".")
    if value:
        return value

    lines = [normalize_space(line) for line in text.splitlines() if normalize_space(line)]
    average_lines = [
        line
        for line in lines
        if re.search(r"\b(?:gwa|general\s+weighted\s+average|weighted\s+average|general\s+average|average\s+grade|final\s+average|overall\s+average)\b", line, re.IGNORECASE)
    ]
    for line in average_lines:
        numbers = re.findall(r"\b[1-5](?:[\.,]\d{1,2})?\b", line)
        if numbers:
            return numbers[-1].replace(",", ".")

    grade_debug = build_grade_debug(text)
    if grade_debug["computedAverage"]:
        return grade_debug["computedAverage"]

    return ""


def extract_name(text: str) -> dict[str, str]:
    lines = [normalize_space(line) for line in text.splitlines() if normalize_space(line)]
    candidates = []

    for line in lines:
        if re.search(r"\b(?:CERTIFICATE|REGISTRATION|GRADES|REMARKS|FINAL|PROGRAM|COURSE)\b", line, re.IGNORECASE):
            continue
        labeled = re.search(
            r"(?:Student\s*Name|Name\s+of\s+Student|Name)\s*[:\-]?\s*([A-ZÑ][A-ZÑ ,.'-]{5,80})",
            line,
            re.IGNORECASE,
        )
        if labeled:
            candidates.append(clean_name_candidate(labeled.group(1)))
            continue
        comma_name = re.search(r"\b([A-ZÑ][A-ZÑ.' -]{1,35}),\s*([A-ZÑ][A-ZÑ.' -]{2,60})\b", line)
        if comma_name:
            candidates.append(clean_name_candidate(f"{comma_name.group(1)}, {comma_name.group(2)}"))

    if not candidates:
        value = find_first(
            [
                r"(?:This\s+is\s+to\s+certify\s+that)\s+([A-Z][A-Za-z ,.'-]{5,80})",
            ],
            text,
        )
        candidates.append(clean_name_candidate(value))

    full_name = next((item for item in candidates if len(item.split()) >= 2), "")
    if "," in full_name:
        last_part, rest = [normalize_space(part) for part in full_name.split(",", 1)]
        rest_parts = [part for part in rest.split(" ") if part]
        return {
            "fullName": to_title_name(f"{rest} {last_part}"),
            "firstName": to_title_name(rest_parts[0] if rest_parts else ""),
            "middleName": to_title_name(" ".join(rest_parts[1:])),
            "lastName": to_title_name(last_part),
        }

    cleaned = to_title_name(full_name)
    parts = [part for part in cleaned.split(" ") if part]
    if len(parts) < 2:
        return {"fullName": cleaned, "firstName": "", "middleName": "", "lastName": ""}
    return {
        "fullName": cleaned,
        "firstName": parts[0],
        "middleName": " ".join(parts[1:-1]),
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
    grade_debug = build_grade_debug(text)
    problem_terms = sorted(set(match["term"] for match in grade_debug["concernMatches"]))
    return {
        "hasAcademicConcern": bool(problem_terms),
        "academicConcernTerms": problem_terms,
        "gradeDebug": grade_debug,
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
        "section": extract_section(text),
        "gwa": extract_gwa(text),
        **semester,
        **extract_flags(text),
        "rawTextPreview": normalize_space(text)[:1200],
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/scan-document")
async def scan_document(
    document_type: str = "cor",
    file: UploadFile = File(...),
) -> dict[str, Any]:
    file_bytes = await file.read()
    content_type = (file.content_type or "").lower()
    filename = (file.filename or "").lower()

    if content_type == "application/pdf" or filename.endswith(".pdf"):
        text = extract_pdf_text(file_bytes)
    else:
        text = extract_image_text(file_bytes)

    extracted = parse_document(text, document_type)
    return {
        "ok": True,
        "filename": file.filename,
        "contentType": file.content_type,
        "extracted": extracted,
    }
