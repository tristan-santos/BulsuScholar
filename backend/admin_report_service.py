import csv
import io
import json
import re
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, Request

try:
    from .admin_report_datasets import build_section_dataset, REPORT_DATASETS
    from .report_service import MAX_REPORT_ROWS, build_report_pdf_bytes
    from .root_service import build_root_report
    from .supabase_ops import supabase_rest_insert, supabase_select
except ImportError:  # pragma: no cover
    from admin_report_datasets import build_section_dataset, REPORT_DATASETS
    from report_service import MAX_REPORT_ROWS, build_report_pdf_bytes
    from root_service import build_root_report
    from supabase_ops import supabase_rest_insert, supabase_select


ADMIN_REPORT_TYPES = {
    "students",
    "grantors",
    "scholarships",
    "requirements",
    "compliance",
    "top_students",
}
ALLOWED_FILTERS = {
    "search", "status", "grantor", "course", "year", "material",
    "signing", "risk", "scholarship", "dateFrom", "dateTo", "providerType", "academicCycle",
}
REPORT_TITLES = {
    "students": ("Student Management Report", "Student Records"),
    "grantors": ("Grantor Management Report", "Grantor Accounts"),
    "scholarships": ("Scholarship Offerings Report", "Scholarship Offerings"),
    "requirements": ("Requirements Report", "Material Requests"),
    "compliance": ("Compliance Monitoring Report", "Compliance Monitoring"),
    "top_students": ("Top Students per Grantor Report", "Eligible Students by Scholarship Offering"),
}


def _text(value: Any, fallback: str = "") -> str:
    rendered = str(value if value is not None else "").strip()
    return rendered or fallback


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_date(value: Any) -> datetime | None:
    rendered = _text(value)
    if not rendered or rendered == "-":
        return None
    try:
        return datetime.fromisoformat(rendered.replace("Z", "+00:00"))
    except ValueError:
        try:
            return datetime.strptime(rendered[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            return None


def _normalize_filters(raw: Any) -> dict[str, str]:
    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        raise HTTPException(status_code=422, detail="invalid_report_filters")
    unknown = set(raw) - ALLOWED_FILTERS
    if unknown:
        raise HTTPException(status_code=422, detail="unsupported_report_filter")
    filters = {key: _text(raw.get(key), "All" if key not in {"search", "dateFrom", "dateTo"} else "") for key in ALLOWED_FILTERS}
    if filters["dateFrom"] and filters["dateTo"] and filters["dateFrom"] > filters["dateTo"]:
        raise HTTPException(status_code=422, detail="invalid_report_date_range")
    for key in ("dateFrom", "dateTo"):
        if filters[key] and _parse_date(filters[key]) is None:
            raise HTTPException(status_code=422, detail="invalid_report_date")
    return filters


def _positive_int(value: Any, default: int, maximum: int | None = None) -> int:
    try:
        parsed = int(value if value is not None else default)
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=422, detail="invalid_report_pagination") from error
    if parsed < 1:
        raise HTTPException(status_code=422, detail="invalid_report_pagination")
    return min(parsed, maximum) if maximum else parsed


def _contains(record: dict[str, Any], search: str) -> bool:
    if not search:
        return True
    haystack = json.dumps(record, ensure_ascii=False, default=str).lower()
    return search.lower() in haystack


def _equals_filter(value: Any, selected: str) -> bool:
    return selected == "All" or _text(value).lower() == selected.lower()


def _within_dates(record: dict[str, Any], filters: dict[str, str]) -> bool:
    if not filters["dateFrom"] and not filters["dateTo"]:
        return True
    value = _parse_date(record.get("reportDate") or record.get("createdAt") or record.get("requestedAt") or record.get("lastReview"))
    if value is None:
        return False
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    if filters["dateFrom"]:
        start = datetime.fromisoformat(filters["dateFrom"]).replace(tzinfo=timezone.utc)
        if value < start:
            return False
    if filters["dateTo"]:
        end = datetime.fromisoformat(filters["dateTo"]).replace(hour=23, minute=59, second=59, microsecond=999999, tzinfo=timezone.utc)
        if value > end:
            return False
    return True


def _matches(report_type: str, record: dict[str, Any], filters: dict[str, str]) -> bool:
    if not _contains(record, filters["search"]) or not _within_dates(record, filters):
        return False
    if filters["academicCycle"] != "All" and record.get("cycle") and record["cycle"] != filters["academicCycle"]:
        return False
    if filters["grantor"] != "All":
        ids = record.get("grantorIds") or [record.get("grantorId")]
        if filters["grantor"] not in {_text(item) for item in ids if item}:
            return False
    if filters["scholarship"] != "All" and report_type != "top_students":
        def normalize(value):
            return re.sub(r"[^a-z0-9]+", " ", _text(value).lower()).strip()
        selected = normalize(filters["scholarship"])
        values = [record.get(key) for key in ("scholarshipId", "scholarship", "title", "programName")]
        values.extend(record.get("scholarshipTitles") or [])
        if selected not in {normalize(value) for value in values if value}:
            return False
    if report_type == "students":
        return (
            _equals_filter(record.get("recordStatus"), filters["status"])
            and _equals_filter(record.get("course"), filters["course"])
            and _equals_filter(record.get("yearLevel"), filters["year"])
        )
    if report_type == "grantors":
        return _equals_filter(record.get("accountStatus"), filters["status"])
    if report_type == "scholarships":
        return _equals_filter(record.get("status"), filters["status"])
    if report_type == "requirements":
        material_ok = (filters["material"] == "All" or filters["material"] in (record.get("materialKeys") or [])
                       or filters["material"].lower() in _text(record.get("materials")).lower())
        signing_ok = _equals_filter(record.get("signingState"), filters["signing"])
        return (_equals_filter(record.get("reviewState"), filters["status"]) and material_ok and signing_ok
                and _equals_filter(record.get("providerType"), filters["providerType"]))
    if report_type == "compliance":
        violations = record.get("violationCount")
        if violations is None:
            raw = record.get("violations")
            violations = len(raw) if isinstance(raw, list) else (0 if _text(raw) in {"", "-", "[]"} else 1)
        risk = "High Risk" if int(violations or 0) >= 2 else "Monitoring"
        return _equals_filter(record.get("status"), filters["status"]) and _equals_filter(risk, filters["risk"])
    return filters["scholarship"] == "All" or filters["scholarship"] == _text(record.get("scholarshipId"))


def _filter_label(filters: dict[str, str]) -> str:
    parts = []
    for key in ("search", "status", "grantor", "course", "year", "material", "signing", "risk", "scholarship", "dateFrom", "dateTo", "providerType", "academicCycle"):
        value = filters[key]
        if value and value != "All":
            parts.append(f"{key}: {value}")
    return " | ".join(parts) if parts else "All records"


def _stats(report_type: str, records: list[dict[str, Any]], dataset: str = "all") -> list[dict[str, Any]]:
    stats = [{"label": "Matching Records", "value": len(records)}]
    if report_type == "scholarships" and dataset not in {"all", "scholarships"}:
        if dataset == "overview":
            stats.append({"label": "Active Recipients", "value": sum(int(row.get("activeRecipients") or 0) for row in records)})
        else:
            stats.extend([
                {"label": "Students", "value": len({row.get("studentId") for row in records})},
                {"label": "Grantors", "value": len({value for row in records for value in (row.get("grantorIds") or [row.get("grantorId")]) if value})},
            ])
        return stats
    if report_type == "students":
        stats.extend([
            {"label": "Active", "value": sum(_text(row.get("recordStatus")).lower() == "active" for row in records)},
            {"label": "Archived", "value": sum(_text(row.get("recordStatus")).lower() == "archived" for row in records)},
        ])
    elif report_type == "scholarships":
        def numeric(value):
            try:
                return int(value or 0)
            except (TypeError, ValueError):
                return 0
        stats.extend([
            {"label": "Total Slots", "value": sum(numeric(row.get("totalSlots")) for row in records)},
            {"label": "Applications", "value": sum(numeric(row.get("applications")) for row in records)},
        ])
    elif report_type == "requirements":
        stats.extend([
            {"label": "Pending", "value": sum("pending" in _text(row.get("reviewState")).lower() for row in records)},
            {"label": "Signed", "value": sum(_text(row.get("signingState")).lower() == "signed" for row in records)},
        ])
    elif report_type == "compliance":
        stats.append({"label": "Blocked", "value": sum(_text(row.get("blocked")).lower() == "yes" for row in records)})
    elif report_type == "top_students":
        stats.append({"label": "Offerings", "value": len({_text(row.get("scholarshipId") or row.get("scholarship")) for row in records})})
    return stats


def build_admin_report(payload: dict[str, Any], *, paginate: bool = True) -> dict[str, Any]:
    report_type = _text(payload.get("reportType"))
    if report_type not in ADMIN_REPORT_TYPES:
        raise HTTPException(status_code=422, detail="invalid_report_type")
    filters = _normalize_filters(payload.get("filters"))
    dataset = _text(payload.get("dataset"), "all")
    if dataset not in REPORT_DATASETS[report_type]:
        raise HTTPException(status_code=422, detail="invalid_report_dataset")
    source = build_section_dataset(report_type, dataset) if dataset != "all" else build_root_report(report_type)
    records = [record for record in source.get("records") or [] if _matches(report_type, record, filters)]
    if len(records) > 10_000:
        raise HTTPException(status_code=422, detail="report_result_too_large")
    page = _positive_int(payload.get("page"), 1)
    page_size = _positive_int(payload.get("pageSize"), 25, 250)
    visible = records[(page - 1) * page_size:page * page_size] if paginate else records
    columns = source.get("columns") or []
    rows = [[_text(record.get(column["key"]), "-") for column in columns] for record in visible]
    title, dataset_title = REPORT_TITLES[report_type]
    dataset_title = source.get("datasetTitle") or dataset_title
    if dataset != "all":
        title = {"students": "Student Management Report", "grantors": "Grantor Management Report",
                 "scholarships": "Scholarship Programs Report", "requirements": "Requirements Report"}[report_type]
    return {
        "ok": True,
        "reportType": report_type,
        "key": report_type,
        "dataset": dataset,
        "title": title,
        "datasetTitle": dataset_title,
        "description": "Review the selected records before exporting.",
        "columns": columns,
        "rows": rows,
        "csvRows": rows,
        "stats": _stats(report_type, records, dataset),
        "filters": filters,
        "filterLabel": f"Dataset: {dataset_title} | {_filter_label(filters)}",
        "page": page,
        "pageSize": page_size,
        "total": len(records),
        "totalPages": max(1, (len(records) + page_size - 1) // page_size),
        "generatedAt": _now_iso(),
        "filename": f"bulsuscholar-{report_type}-{dataset}-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
    }


def _report_pdf_payload(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": report["title"],
        "subtitle": report["datasetTitle"],
        "columns": report["columns"],
        "rows": report["rows"],
        "stats": report["stats"],
        "filterLabel": report["filterLabel"],
    }


def _safe_csv_cell(value: Any) -> str:
    rendered = _text(value, "-")
    return f"'{rendered}" if rendered.lstrip().startswith(("=", "+", "-", "@")) else rendered


def build_admin_report_export(payload: dict[str, Any]) -> tuple[bytes, str, str, dict[str, Any]]:
    export_format = _text(payload.get("format"), "pdf").lower()
    if export_format not in {"pdf", "csv"}:
        raise HTTPException(status_code=422, detail="invalid_report_format")
    report = build_admin_report(payload, paginate=False)
    if len(report["rows"]) > min(10_000, MAX_REPORT_ROWS):
        raise HTTPException(status_code=422, detail="report_result_too_large")
    if export_format == "pdf":
        content = build_report_pdf_bytes(_report_pdf_payload(report))
        return content, "application/pdf", f"{report['filename']}.pdf", report
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow([column["label"] for column in report["columns"]])
    writer.writerows([[_safe_csv_cell(value) for value in row] for row in report["rows"]])
    return ("\ufeff" + output.getvalue()).encode("utf-8"), "text/csv; charset=utf-8", f"{report['filename']}.csv", report


def record_admin_report_export(request: Request, report: dict[str, Any], export_format: str) -> str:
    audit_id = f"admin_report_{uuid4().hex}"
    actor_id = _text(request.headers.get("x-portal-actor-id"))
    result = supabase_rest_insert("portal_report_audit_events", {
        "id": audit_id,
        "data": {
            "actorType": "admin",
            "actorId": actor_id,
            "reportType": report["reportType"],
            "dataset": report.get("dataset", "all"),
            "filters": report["filters"],
            "format": export_format,
            "rowCount": report["total"],
            "generatedAt": report["generatedAt"],
            "createdAt": _now_iso(),
        },
    })
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail="report_audit_failed")
    return audit_id


def list_admin_report_history() -> dict[str, Any]:
    result = supabase_select("portal_report_audit_events", {}, limit=250)
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail="report_history_unavailable")
    rows = []
    for row in result.get("rows") or []:
        data = row.get("data") or {}
        if data.get("actorType") != "admin":
            continue
        rows.append({"id": row.get("id"), **data, "createdAt": data.get("createdAt") or row.get("created_at")})
    rows.sort(key=lambda item: _text(item.get("createdAt")), reverse=True)
    return {"ok": True, "history": rows[:50]}
