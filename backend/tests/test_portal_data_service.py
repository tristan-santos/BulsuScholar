import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException

from backend import portal_data_service as service


class PortalDataScopeTests(unittest.TestCase):
    def test_student_only_receives_own_student_record(self):
        rows = [
            {"id": "student-1", "data": {"email": "one@example.test"}},
            {"id": "student-2", "data": {"email": "two@example.test"}},
        ]
        result = service._scope_rows(Mock(), "student", "student-1", "students", rows)
        self.assertEqual([row["id"] for row in result], ["student-1"])

    def test_student_roster_summary_hides_roster_identity(self):
        row = {
            "id": "roster-1",
            "parent_id": "grantor-1",
            "data": {"studentId": "student-2", "fullName": "Private Student", "grantorId": "grantor-1"},
        }
        summary = service._student_roster_summary(row)
        self.assertNotIn("studentId", summary["data"])
        self.assertNotIn("fullName", summary["data"])
        self.assertEqual(summary["data"]["grantorId"], "grantor-1")

    def test_grantor_cannot_read_unrelated_student(self):
        rows = [{"id": "student-1", "data": {}}, {"id": "student-2", "data": {}}]
        with patch.object(service, "_grantor_student_ids", return_value={"student-1"}):
            result = service._scope_rows(Mock(), "grantor", "grantor-1", "students", rows)
        self.assertEqual([row["id"] for row in result], ["student-1"])

    def test_grantor_mutation_only_allows_own_password_completion_fields(self):
        request = Mock()
        payload = {"table": "providers", "id": "grantor-1", "data": {"name": "changed"}}
        with patch.object(service, "enforce_portal_scope", side_effect=lambda request, identity, roles: identity.update({"actorType": "grantor", "actorId": "grantor-1"})):
            with self.assertRaises(HTTPException) as raised:
                service.mutate_portal_data(request, payload)
        self.assertEqual(raised.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
