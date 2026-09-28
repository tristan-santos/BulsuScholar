import unittest
from unittest.mock import AsyncMock, Mock, patch

from fastapi import HTTPException

from backend import security_history_service as service


class SignedSoeTests(unittest.IsolatedAsyncioTestCase):
    async def test_signed_soe_rejects_unsupported_file_before_storage(self):
        request = Mock()
        file = Mock(content_type="text/plain", filename="soe.txt")
        file.read = AsyncMock(return_value=b"text")
        with patch.object(service, "enforce_portal_scope", side_effect=lambda request, payload, roles: payload.update({"actorId": "2026-1", "actorType": "student"})), \
                patch.object(service, "_store_bytes") as store:
            with self.assertRaises(HTTPException) as raised:
                await service.upload_signed_soe(request, "app-1", file)
        self.assertEqual(raised.exception.status_code, 415)
        store.assert_not_called()

    async def test_signed_soe_rejects_another_students_application(self):
        request = Mock()
        file = Mock(content_type="application/pdf", filename="soe.pdf")
        file.read = AsyncMock(return_value=b"%PDF-test")
        with patch.object(service, "enforce_portal_scope", side_effect=lambda request, payload, roles: payload.update({"actorId": "2026-1", "actorType": "student"})), \
                patch.object(service, "supabase_document_get", return_value={"row": {"id": "app-1"}, "data": {"studentId": "2026-2"}}), \
                patch.object(service, "_store_bytes") as store:
            with self.assertRaises(HTTPException) as raised:
                await service.upload_signed_soe(request, "app-1", file)
        self.assertEqual(raised.exception.status_code, 404)
        store.assert_not_called()


class PublicRecoveryTests(unittest.TestCase):
    def test_unknown_user_still_receives_private_ticket_capability(self):
        inserted = []
        with patch.object(service, "_find_account", return_value=None), \
                patch.object(service, "_rest", side_effect=lambda table, **kwargs: inserted.append((table, kwargs)) or []), \
                patch.dict(service.os.environ, {"FRONTEND_URL": "https://portal.example"}):
            result = service.create_public_recovery_ticket({"userId": "unknown", "reason": "Lost access"})
        self.assertTrue(result["ok"])
        self.assertIn("secret=", result["accessUrl"])
        ticket_payload = inserted[0][1]["payload"]
        self.assertIsNone(ticket_payload["auth_user_id"])
        self.assertNotIn("secret", str(ticket_payload))

    def test_root_cannot_approve_unresolved_account(self):
        ticket = {"id": "ticket-1", "status": "open", "auth_user_id": None}
        with patch.object(service, "_rest", return_value=[ticket]):
            with self.assertRaises(HTTPException) as raised:
                service.root_review_recovery("ticket-1", {"action": "approve", "proposedEmail": "new@example.com"}, "root")
        self.assertEqual(raised.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
