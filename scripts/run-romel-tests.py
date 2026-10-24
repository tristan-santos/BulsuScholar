"""Persist status-only local test evidence; never serialize request bodies."""
import json
from pathlib import Path
import sys
import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


class EvidenceResult(unittest.TextTestResult):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.evidence = []

    def addSuccess(self, test):
        super().addSuccess(test)
        self.evidence.append({"test": test.id(), "status": "Pass"})

    def addFailure(self, test, err):
        super().addFailure(test, err)
        self.evidence.append({"test": test.id(), "status": "Fail"})

    def addError(self, test, err):
        super().addError(test, err)
        self.evidence.append({"test": test.id(), "status": "Error"})

    def addSkip(self, test, reason):
        super().addSkip(test, reason)
        self.evidence.append({"test": test.id(), "status": "Skipped"})


suite = unittest.defaultTestLoader.discover(str(ROOT / "backend/tests"))
result = unittest.TextTestRunner(verbosity=1, resultclass=EvidenceResult).run(suite)
output = ROOT / "test-results/romel-backend.json"
output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps({"at": datetime.now(ZoneInfo("Asia/Taipei")).isoformat(),
    "environment": "Local Python suite; service/network boundaries mocked where specified", "count": result.testsRun,
    "passed": result.wasSuccessful(), "results": result.evidence}, indent=2), encoding="utf-8")
sys.exit(0 if result.wasSuccessful() else 1)
