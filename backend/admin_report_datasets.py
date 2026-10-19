"""Server-owned datasets used by reports opened from management sections."""

from datetime import datetime, timezone
from fastapi import HTTPException

try:
    from .root_service import build_root_report
    from .supabase_ops import supabase_select
except ImportError:  # pragma: no cover
    from root_service import build_root_report
    from supabase_ops import supabase_select


REPORT_DATASETS = {
    "students": {"all", "students", "archived"},
    "grantors": {"all", "grantors", "archived"},
    "scholarships": {"all", "scholarships", "overview", "scholars", "warning", "tracking", "serviced", "archived"},
    "requirements": {"all", "requesting", "approved", "rejected", "signing"},
    "compliance": {"all"},
    "top_students": {"all"},
}


def _all(table):
    result = supabase_select(table, limit=0)
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail=f"{table}_unavailable")
    return [{**row, **(row.get("data") or {}), "id": row["id"]} for row in result.get("rows") or []]


def _text(value, default="-"):
    return str(value if value is not None else "").strip() or default


def _name(row):
    return _text(row.get("fullName") or row.get("name") or " ".join(
        str(row.get(key) or "") for key in ("fname", "mname", "lname")))


def _program(row):
    return _text(row.get("scholarshipTitle") or row.get("scholarshipName") or row.get("programName") or row.get("name"), "")


def _closed(row):
    return row.get("archived") is True or str(row.get("status") or "").lower() in {
        "archived", "rejected", "denied", "declined", "withdrawn", "cancelled", "canceled", "closed", "expired", "superseded",
    }


def _columns(pairs):
    return [{"key": key, "label": label, "weight": 1.7 if key in {"fullName", "scholarship", "grantor", "currentStep"} else 1}
            for key, label in pairs]


def _roster_rows():
    providers = {row["id"]: row for row in _all("providers")}
    students = {row["id"]: row for row in _all("students")}
    records = []
    for row in _all("grantor_portal_scholars"):
        if not _program(row):
            continue
        student_id = _text(row.get("studentId") or row.get("studentnumber") or row.get("studentNumber"), "")
        student = students.get(student_id, {})
        grantor_id = _text(row.get("grantorId") or row.get("parent_id"), "")
        provider = providers.get(grantor_id, {})
        records.append({**row, "studentId": student_id or row["id"],
            "fullName": _name(row) if _name(row) != "-" else _name(student),
            "scholarship": _program(row), "grantorId": grantor_id,
            "grantor": _text(row.get("grantorName") or provider.get("providerName") or provider.get("name")),
            "yearLevel": _text(row.get("yearLevel") or row.get("year") or student.get("yearLevel") or student.get("year")),
            "updatedAt": _text(row.get("updatedAt") or row.get("createdAt") or row.get("updated_at")),
            "archivedAt": _text(row.get("archivedAt") or row.get("updatedAt") or row.get("updated_at")),
            "status": _text(row.get("status"), "Archived" if row.get("archived") else "Active"),
        })
    return records


def _group_roster(records):
    grouped = {}
    for row in sorted(records, key=lambda item: item["updatedAt"], reverse=True):
        key = (row["studentId"].casefold(), row["fullName"].casefold())
        if key not in grouped:
            grouped[key] = {**row, "scholarshipTitles": [], "grantorIds": [], "grantorNames": []}
        group = grouped[key]
        for field, value in (("scholarshipTitles", row["scholarship"]), ("grantorIds", row["grantorId"]), ("grantorNames", row["grantor"])):
            if value and value not in group[field]:
                group[field].append(value)
        group["scholarship"] = ", ".join(group["scholarshipTitles"])
        group["grantor"] = ", ".join(group["grantorNames"])
    return list(grouped.values())


def _application_rows():
    students = {row["id"]: row for row in _all("students")}
    providers = {row["id"]: row for row in _all("providers")}
    records = []
    for application in _all("scholarship_applications"):
        if _closed(application):
            continue
        student_id = _text(application.get("studentId") or application.get("student_id"), "")
        student = students.get(student_id, {})
        grantor_id = _text(application.get("grantorId") or application.get("providerId") or application.get("grantor_id"), "")
        provider = providers.get(grantor_id, {})
        tracking = application.get("tracking") or {}
        current_step = application.get("currentStage") or application.get("trackingStage") or tracking.get("currentStepLabel") or tracking.get("currentStep")
        if isinstance(current_step, dict):
            current_step = current_step.get("label") or current_step.get("id")
        if not current_step:
            completed = set(tracking.get("completedStepIds") or [])
            steps = [("document_uploading", "Uploading of Document"), ("application_form", "Student Application Profile"),
                     ("document_review", "Document Review")]
            if application.get("providerType") == "kuya_win":
                steps.extend([("admin_review", "Admin Review"), ("interview", "Interview"),
                              ("application_review", "Application Review"), ("final_screening", "Final Screening")])
            steps.extend([("request_materials", "Request Materials"), ("download_materials", "Downloading of Materials"),
                          ("signing_materials", "Signing of Materials"), ("signed_soe_upload", "Upload Signed SOE"), ("finish", "Finish")])
            current_step = next((label for key, label in steps if key not in completed), "Completed")
        records.append({**application, "studentId": student_id,
            "fullName": _name(student) if student else _name(application),
            "scholarship": _program(application) or _text(application.get("provider")),
            "scholarshipId": application.get("announcementId") or application.get("scholarshipId"),
            "grantorId": grantor_id, "grantor": _text(application.get("grantorName") or provider.get("providerName") or provider.get("name")),
            "currentStep": current_step,
            "yearLevel": _text(student.get("yearLevel") or student.get("year")),
        })
    return records


def _scholarship_dataset(dataset):
    if dataset == "scholarships":
        source = build_root_report("scholarships")
        announcements = {row["id"]: row for row in _all("grantor_portal_announcements")}
        providers = {row["id"]: row for row in _all("providers")}
        records = []
        for row in source["records"]:
            raw = announcements.get(row.get("scholarshipId"), {})
            grantor_id = raw.get("grantorId") or raw.get("providerId") or raw.get("parent_id")
            if not grantor_id or "admin" in str(raw.get("sourceType") or raw.get("source") or raw.get("authorRole") or raw.get("createdBy") or "").lower():
                continue
            flags = [raw.get(key) for key in ("openForApplications", "openForApplication", "isApplication", "isApplicationOpen", "applicationOpen", "applicationsOpen", "allowApplications", "acceptingApplications")]
            type_text = " ".join(str(raw.get(key) or "") for key in ("type", "announcementType", "category", "mode", "purpose")).lower()
            application_announcement = any(value is True for value in flags) or (
                not any(value is False for value in flags) and (
                    "application" in type_text or "scholarship" in type_text or any(raw.get(key) for key in
                        ("minimumGrade", "minimumGwa", "minGwa", "gwaRequirement", "requiredDocuments", "applicationStartDate", "applicationEndDate"))))
            if not application_announcement:
                continue
            provider = providers.get(grantor_id, {})
            is_archived = raw.get("archived") is True or str(raw.get("status") or "").lower() == "archived" or provider.get("archived") is True
            end = raw.get("endDate") or raw.get("applicationEndDate")
            expired = False
            if end:
                try:
                    parsed = datetime.fromisoformat(str(end).replace("Z", "+00:00"))
                    expired = parsed.replace(tzinfo=parsed.tzinfo or timezone.utc) < datetime.now(timezone.utc)
                except ValueError:
                    pass
            row.update({"grantorId": grantor_id,
                "grantor": _text(raw.get("grantorName") or raw.get("providerLabel") or provider.get("providerName") or provider.get("name")),
                "minimumGwa": _text(raw.get("minimumGrade") or raw.get("minimumGwa") or raw.get("minGwa") or raw.get("gwaRequirement")),
                "createdAt": _text(raw.get("createdAt") or raw.get("updatedAt") or raw.get("date")),
                "status": "Archived" if is_archived else "Closed" if expired or raw.get("applicationEnabled") is False
                    or str(raw.get("status") or "").lower() in {"closed", "ended", "inactive", "disabled"} else "Open"})
            records.append(row)
        source["records"] = records
        source["columns"] = [*source["columns"], {"key": "createdAt", "label": "Created", "weight": 1}]
        return {**source, "datasetTitle": "Scholarship Offerings"}
    if dataset in {"tracking", "serviced"}:
        records = _application_rows()
        if dataset == "serviced":
            records = [row for row in records if row.get("servicingOwner") == "admin" or row.get("grantorAccountArchived") is True]
            for row in records:
                row.update({"servicingOwnerLabel": "Administrator",
                    "restriction": "Locked while the individual roster record remains active",
                    "currentOwner": _text((row.get("tracking") or {}).get("currentStepOwnerLabel") or row.get("currentStepOwner"), "Scholarship Office")})
            return {"datasetTitle": "Scholarship Office Managed", "records": records, "columns": _columns([
                ("studentId", "Student ID"), ("fullName", "Student"), ("scholarship", "Scholarship"), ("grantor", "Grantor"),
                ("servicingOwnerLabel", "Servicing Owner"), ("restriction", "Restriction"), ("currentOwner", "Current Owner"),
                ("currentStep", "Current Step")])}
        else:
            records = [row for row in records if str(row.get("status") or "").lower() not in {"finished", "completed", "complete"}
                       and str(row["currentStep"]).lower() not in {"completed", "complete"}]
        return {"datasetTitle": "Scholarship Office Managed" if dataset == "serviced" else "Tracking Applications",
            "records": records, "columns": _columns([
                ("studentId", "Student ID"), ("fullName", "Full Name"), ("scholarship", "Scholarship"),
                ("grantor", "Grantor"), ("currentStep", "Current Step")])}
    roster = _roster_rows()
    records = _group_roster([row for row in roster if (row.get("archived") is True) == (dataset == "archived")])
    if dataset == "warning":
        records = [row for row in records if len(row["grantorIds"]) > 1 or any(
            candidate.get(flag) for candidate in roster if candidate["studentId"] == row["studentId"] and candidate.get("archived") is not True
            for flag in ("scholarshipConflictWarning", "duplicateScholarshipWarning", "duplicateScholarshipDetected"))]
        return {"datasetTitle": "Warning Students", "records": records,
                "columns": _columns([("studentId", "Student ID"), ("fullName", "Full Name")])}
    if dataset == "overview":
        programs = {}
        for row in roster:
            if row.get("archived") is True:
                continue
            provider_type = row.get("providerType") or "other"
            key = (provider_type, row["scholarship"].casefold())
            if key not in programs:
                programs[key] = {"programName": row["scholarship"], "providerType": provider_type,
                    "grantorId": row["grantorId"], "grantor": row["grantor"], "totalSlots": "-", "activeRecipients": 0, "status": "Active"}
            programs[key]["activeRecipients"] += 1
        return {"datasetTitle": "Scholarships", "records": sorted(programs.values(), key=lambda row: -row["activeRecipients"]), "columns": _columns([
            ("programName", "Program Name"), ("providerType", "Provider Type"), ("totalSlots", "Total Slots"),
            ("activeRecipients", "Active Recipients"), ("status", "Status")])}
    return {"datasetTitle": "Archived Scholars" if dataset == "archived" else "Scholars", "records": records,
            "columns": _columns([("studentId", "Student ID"), ("fullName", "Full Name"), ("scholarship", "Scholarship"),
                ("grantor", "Grantor"), ("yearLevel", "Year Level"),
                ("archivedAt", "Archived At") if dataset == "archived" else ("updatedAt", "Updated"), ("status", "Status")])}


def build_section_dataset(report_type, dataset):
    if report_type == "scholarships":
        return _scholarship_dataset(dataset)
    source = build_root_report(report_type)
    if report_type in {"students", "grantors"}:
        field = "recordStatus" if report_type == "students" else "accountStatus"
        if report_type == "grantors":
            archived_ids = {row["id"] for row in _all("providers") if row.get("archived") is True}
            for row in source["records"]:
                if row.get("grantorId") in archived_ids:
                    row[field] = "Archived"
        source["records"] = [row for row in source["records"] if
            (str(row.get(field) or "").lower() == "archived") == (dataset == "archived")]
        title = "Students" if report_type == "students" else "Grantors"
        return {**source, "datasetTitle": f"Archived {title}" if dataset == "archived" else title}
    if report_type == "requirements":
        raw_requests = _all("soe_requests")
        raw_by_number = {_text(row.get("requestNumber") or row.get("id")): row for row in raw_requests}
        for record in source["records"]:
            raw = raw_by_number.get(record["requestNumber"], {})
            materials = raw.get("materials") or {}
            entries = {key: value for key, value in materials.items() if isinstance(value, dict)
                       and (value.get("requested") is True or value.get("status") not in {None, "none", ""})}
            states = {str(value.get("status") or "pending").lower() for value in entries.values()}
            legacy = str(raw.get("reviewState") or raw.get("adminStatus") or raw.get("status") or "incoming").lower()
            if states:
                record["reviewState"] = "Pending Approval" if states & {"pending", "incoming", "requested"} else (
                    "Approved" if states & {"approved", "signed"} else "Rejected")
            else:
                record["reviewState"] = {"signed": "Approved", "approved": "Approved", "rejected": "Rejected",
                    "non_compliant": "Rejected", "non-compliant": "Rejected"}.get(legacy, "Pending Approval")
            record["materialKeys"] = list(entries) or ["soe"]
            record["materials"] = ", ".join({"soe": "SOE", "application_form": "Application Form"}.get(key, key) for key in record["materialKeys"])
            record["providerType"] = raw.get("providerType") or "other"
            record["cycle"] = raw.get("semesterTag") or raw.get("academicCycle") or "legacy"
            record["dedupeKey"] = (record.get("studentId"), raw.get("scholarshipId") or record.get("applicationNumber") or record["requestNumber"], record["cycle"])
        latest = {}
        for record in source["records"]:
            previous = latest.get(record["dedupeKey"])
            if previous is None or str(record.get("reviewedAt") or record.get("requestedAt")) > str(previous.get("reviewedAt") or previous.get("requestedAt")):
                latest[record["dedupeKey"]] = record
        source["records"] = list(latest.values())
        if dataset == "signing":
            downloads = _all("soe_downloads")
            # Signing is a download workflow, including releases awaiting review.
            by_request = {row["requestNumber"]: row for row in source["records"]}
            students = {row["id"]: row for row in _all("students")}
            records = []
            for download in downloads:
                related = by_request.get(_text(download.get("requestNumber")), {})
                student = students.get(download.get("studentId"), {})
                review = str(download.get("reviewState") or "incoming").lower()
                records.append({**related, "studentId": download.get("studentId"),
                    "student": _name(student) if student else _text((download.get("studentSnapshot") or {}).get("fullName")),
                    "requestNumber": _text(download.get("requestNumber") or download.get("id")),
                    "applicationNumber": _text(download.get("applicationNumber") or related.get("applicationNumber")),
                    "scholarship": _text(download.get("scholarshipName") or related.get("scholarship")),
                    "downloadState": "Downloaded", "downloadedAt": download.get("downloadedAt"),
                    "signingState": {"signed": "Signed", "non_compliant": "Rejected"}.get(review, "Pending Signature"),
                    "signedAt": download.get("signedAt"), "providerType": download.get("providerType"),
                    "reportDate": download.get("downloadedAt") or download.get("createdAt"),
                    "cycle": download.get("semesterTag") or download.get("academicCycle") or "",
                })
        else:
            expected = {"requesting": "Pending Approval", "approved": "Approved", "rejected": "Rejected"}[dataset]
            records = [row for row in source["records"] if row["reviewState"] == expected]
        return {**source, "records": records, "datasetTitle": {
            "requesting": "Pending Requests", "approved": "Approved Requests", "rejected": "Rejected Requests", "signing": "Signing Requests",
        }[dataset]}
    return source
