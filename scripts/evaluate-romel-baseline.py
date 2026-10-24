"""Reproduce narrow baseline export gaps with synthetic records, offline only."""
import ast
import csv
import io
import json
from pathlib import Path
import shutil
import subprocess
from typing import Any
from uuid import uuid4

from fastapi import Request, Response

ROOT = Path(__file__).resolve().parents[1]
git = shutil.which("git") or "C:/Program Files/Git/cmd/git.exe"
source = subprocess.run([git, "show", "HEAD:backend/scope_announcement_waitlist_service.py"], cwd=ROOT, check=True, capture_output=True, text=True).stdout
function = next(node for node in ast.parse(source).body if isinstance(node, ast.FunctionDef) and node.name == "build_applicant_export")
namespace = {"Any": Any, "Request": Request, "csv": csv, "io": io, "uuid4": uuid4,
    "list_filtered_applicants": lambda *_: {"rows": [{"studentName": "  =1+1"}], "total": 1, "filters": {}},
    "_text": lambda value: str(value or ""), "_iso": lambda: "synthetic-test-time",
    "supabase_rest_insert": lambda *_: {"ok": True}}
# Execute only this isolated function, with network/database operations stubbed.
exec(compile(ast.Module(body=[function], type_ignores=[]), "baseline-export", "exec"), namespace)
content, *_ = namespace["build_applicant_export"](None, {"format": "csv"})
cell = next(csv.DictReader(io.StringIO(content.decode("utf-8-sig"))))["studentName"]
assert cell == "  =1+1", "Baseline source differs; do not claim a reproduced formula-prefix gap."

main_source = subprocess.run([git, "show", "HEAD:backend/main.py"], cwd=ROOT, check=True, capture_output=True, text=True).stdout
handler = next(node for node in ast.parse(main_source).body if isinstance(node, ast.FunctionDef) and node.name == "export_admin_report_endpoint")
handler.decorator_list = []
namespace = {"Any": Any, "Request": Request, "Response": Response, "enforce_portal_scope": lambda *_: None,
    "public_config": lambda: {}, "build_admin_report_export": lambda *_: (b"synthetic-readable-csv", "text/csv", "report.csv", {}),
    "record_admin_report_export": lambda *_: "synthetic-audit", "Body": lambda *_: None}
exec(compile(ast.Module(body=[handler], type_ignores=[]), "baseline-handler", "exec"), namespace)
response = namespace["export_admin_report_endpoint"](None, {"format": "csv"})
assert response.body == b"synthetic-readable-csv", "Baseline source differs; do not claim plaintext export reproduction."
sha = subprocess.run([git, "rev-parse", "HEAD"], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip()
report = {"baselineCommit": sha, "environment": "Isolated baseline functions; synthetic data and stubbed authorization/database; no remote attack",
    "results": [
        {"id": "RM-BASE-1", "finding": "Official admin export returned readable bytes without download encryption", "status": "Reproduced locally", "retest": "AES-256/no-fallback tests in test_romel_download_protection.py"},
        {"id": "RM-BASE-2", "finding": "Applicant CSV retained a leading formula-prefix value", "status": "Reproduced locally", "retest": "test_applicant_csv_preserves_formula_injection_protection"}],
    "limits": "Not evidence of anonymous access, a successful Excel exploit, historical data theft or penetration-test certification."}
(ROOT / "test-results").mkdir(exist_ok=True)
(ROOT / "test-results/romel-baseline.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print("PASS: two narrow baseline export gaps reproduced offline; no live attack claimed")
