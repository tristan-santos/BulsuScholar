"""Create isolated report fixtures for local browser verification."""
import base64
import json
from pathlib import Path
from unittest.mock import patch

from backend import admin_report_datasets, admin_report_service, root_service
from backend.tests.test_admin_report_datasets import AdminReportDatasetTests


def main():
    case = AdminReportDatasetTests()
    case.setUp()
    try:
        case.tables["admins"] = [{"id": "report-admin", "fname": "Report", "lname": "Admin", "role": "full_admin", "permissions": ["students", "grantors", "scholarships", "requirements", "reports", "announcements"], "status": "Active"}]
        case.tables["students"][0].update({"course": "BSIT", "gwa": "1.59", "status": "Active", "email": "student@example.invalid"})
        case.tables["students"].append({"id": "s2", "fname": "Archived", "lname": "Student", "course": "BSIT", "year": "3", "archived": True})
        fixtures = {"tables": case.tables, "reports": {}}
        with patch.object(root_service, "_all_data_rows", side_effect=lambda table: case.tables.get(table, [])):
            for report_type, datasets in admin_report_datasets.REPORT_DATASETS.items():
                for dataset in datasets:
                    if report_type == "top_students":
                        continue
                    payload = {"reportType": report_type, "dataset": dataset}
                    preview = admin_report_service.build_admin_report(payload)
                    pdf, _, _, _ = admin_report_service.build_admin_report_export({**payload, "format": "pdf"})
                    csv, _, _, _ = admin_report_service.build_admin_report_export({**payload, "format": "csv"})
                    fixtures["reports"][f"{report_type}:{dataset}"] = {"preview": preview,
                        "pdf": base64.b64encode(pdf).decode(), "csv": base64.b64encode(csv).decode()}
        output = Path("test-results/admin-report-fixtures.json")
        output.parent.mkdir(exist_ok=True)
        output.write_text(json.dumps(fixtures), encoding="utf-8")
        print(f"Created {len(fixtures['reports'])} server-built report fixtures")
    finally:
        case.doCleanups()


if __name__ == "__main__":
    main()
