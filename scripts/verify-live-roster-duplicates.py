"""Read live records and test the local preview. Suppress every preview write."""
import json
import sys
from pathlib import Path
from unittest.mock import patch

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")
load_dotenv(ROOT / "backend" / ".env")

from backend import roster_workflow_service as service  # noqa: E402


def main():
    rosters = service._row_data_rows("grantor_portal_scholars")
    sources = [row for row in rosters if row.get("parentId") == "grantor_san" and service._is_active_roster(row)]
    candidates = [row for row in rosters if row.get("parentId") == "grantor_johnvher"
                  and any(service._same_roster_identity(row, source) for source in sources)]
    if len(candidates) != 5:
        raise AssertionError(f"Expected five reported duplicate records, found {len(candidates)}")
    rows = [{"fullName": row["fullName"], "course": row["course"], "yearLevel": row["yearLevel"],
             "scholarshipTitle": row["scholarshipTitle"]} for row in candidates]
    manual_rows = []
    for row in rows:
        surname, given = row["fullName"].split(",", 1)
        names = given.strip().split()
        first, middle = " ".join(names[:-1]), names[-1]
        manual_rows.append({**row, "fname": first, "mname": middle, "lname": surname,
                            "fullName": f"{first} {middle} {surname}", "studentId": "",
                            "course": {"BIT": "Bachelor in Industrial Technology", "BSBA": "Bachelor of Science in Business Administration",
                                       "BSED": "Bachelor of Secondary Education"}.get(row["course"], row["course"])})
    with patch.object(service, "enforce_portal_scope"), \
            patch.object(service, "_preview_response", return_value=None), \
            patch.object(service, "supabase_document_upsert", return_value={"ok": True}):
        result = service.preview_roster_import(None, {
            "actorType": "grantor", "actorId": "grantor_johnvher", "grantorId": "grantor_johnvher",
            "rows": rows, "sourceFileName": "Read-only live duplicate verification",
        })
        for manual in manual_rows:
            manual_result = service.preview_roster_import(None, {
                "actorType": "grantor", "actorId": "grantor_johnvher", "grantorId": "grantor_johnvher",
                "rows": [manual], "sourceFileName": "Manual grantor entry",
            })
            assert manual_result["status"] == "blocked", manual_result["counts"]
            assert manual_result["counts"] == {"conflicting_active_roster": 1}, manual_result["counts"]
    assert result["status"] == "blocked", result["counts"]
    assert result["counts"] == {"conflicting_active_roster": 5}, result["counts"]
    assert all(row["blocking"] for row in result["rows"])
    print(json.dumps({"liveRecordsChecked": 5, "excelPreviewBlocked": 5, "manualPreviewsBlocked": 5, "previewWrites": 0, "status": "passed"}))


if __name__ == "__main__":
    main()
