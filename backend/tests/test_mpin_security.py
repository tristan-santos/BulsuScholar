import hashlib
import io
import os
import time
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from pypdf import PdfReader
from starlette.requests import Request

from backend import mpin_service as mpin
from backend import download_protection as protection
from backend.tests.pdf_fixtures import valid_pdf


def request(role="student", path="/student/profile/documents/doc/download", token=""):
    result = Request({"type": "http", "method": "POST", "path": path, "headers": [(b"x-mpin-authorization", token.encode())]})
    result.state.mpin_identity = {"id": "user", "type": role, "principal": role + ":user", "session": "session", "email": "fixture@example.test"}
    return result


class MpinTests(unittest.TestCase):
    def setUp(self):
        self.state = {"version": 0, "enabled": False}
        self.tickets = {}
        self.events = []
        self.env = patch.dict(os.environ, {"PORTAL_EMAIL_CODE_SECRET": "fixture-secret-only-" * 3})
        self.env.start()
        self.rpc = patch.object(mpin, "supabase_rpc", side_effect=self.rpc_call)
        self.rpc.start()
        self.get_document = patch.object(mpin, "supabase_document_get", return_value={"ok": True, "data": {}})
        self.get_document.start()

    def tearDown(self):
        self.rpc.stop()
        self.get_document.stop()
        self.env.stop()

    def rpc_call(self, name, payload):
        self.assertEqual(name, "mpin_transaction")
        operation, values = payload["p_operation"], payload["p_values"]
        if operation == "read":
            return {"ok": True, "data": dict(self.state)}
        if operation == "commit":
            if values["version"] != self.state["version"]:
                return {"ok": True, "data": {"committed": False}}
            self.state = {**values["state"], "version": self.state["version"] + 1}
            self.events.append(values["event"])
            if values.get("ticket"):
                self.tickets[values["ticket"]["token"]] = values["ticket"]
            return {"ok": True, "data": {"committed": True}}
        ticket = self.tickets.get(values.get("token"))
        consumed = bool(ticket and all(ticket[k] == values[k] for k in ("session", "path", "digest")) and ticket["generation"] == self.state.get("generation", 0))
        if consumed:
            del self.tickets[values["token"]]
        return {"ok": True, "data": {"consumed": consumed}}

    def enable(self):
        salt = "ab" * 16
        self.state.update(enabled=True, generation=1, salt=salt, pin_hash=mpin.hash_pin("012345", salt))

    def rejected(self, code, run):
        with self.assertRaises(HTTPException) as caught:
            run()
        self.assertEqual(code, caught.exception.detail["code"])

    def test_disabled_by_default(self):
        self.assertFalse(mpin.status(request())["enabled"])
        mpin.enforce_action(request(), {})

    def test_student_download_requires_mpin_when_enabled(self):
        self.enable()
        self.rejected("mpin_required", lambda: mpin.enforce_action(request(), {}))

    def test_one_use_ticket_bound_to_action_and_payload(self):
        self.enable()
        req = request(path="/workflows/scholarship/apply")
        payload = {"studentId": "user", "scholarshipId": "s1"}
        token = mpin.verify(req, {"pin": "012345", "path": req.url.path, "payload": payload})["token"]
        authorized = request(path=req.url.path, token=token)
        self.rejected("mpin_authorization_expired_or_used", lambda: mpin.enforce_action(authorized, {**payload, "scholarshipId": "other"}))
        mpin.enforce_action(authorized, payload)
        self.rejected("mpin_authorization_expired_or_used", lambda: mpin.enforce_action(authorized, payload))

    def test_ticket_bound_to_session(self):
        self.enable()
        req = request()
        token = mpin.verify(req, {"pin": "012345", "path": req.url.path, "payload": {}})["token"]
        req = request(token=token)
        req.state.mpin_identity["session"] = "other-session"
        self.rejected("mpin_authorization_expired_or_used", lambda: mpin.enforce_action(req, {}))

    def test_lock_after_five_attempts(self):
        self.enable()
        for attempt in range(5):
            self.rejected("incorrect_mpin" if attempt < 4 else "mpin_locked_try_after_15_minutes", lambda: mpin.verify(request(), {"pin": "999999", "path": request().url.path, "payload": {}}))
        self.rejected("mpin_locked_try_after_15_minutes", lambda: mpin.verify(request(), {"pin": "012345", "path": request().url.path, "payload": {}}))

    def test_valid_pin_resets_failed_attempts(self):
        self.enable()
        self.state["failures"] = 3
        mpin.verify(request(), {"pin": "012345", "path": request().url.path, "payload": {}})
        self.assertEqual(0, self.state["failures"])

    def test_disable_requires_current_pin_and_invalidates_tickets(self):
        self.enable()
        self.rejected("incorrect_mpin", lambda: mpin.settings(request(), {"operation": "disable", "pin": "999999"}))
        result = mpin.settings(request(), {"operation": "disable", "pin": "012345"})
        self.assertFalse(result["enabled"])
        self.assertEqual(2, self.state["generation"])

    def test_setup_requires_email(self):
        self.rejected("mpin_email_code_invalid_or_expired", lambda: mpin.settings(request(), {"operation": "enable", "newPin": "012345", "code": "000000"}))

    def test_verified_setup_hashes_pin_and_consumes_code(self):
        self.state.update(email_hash=mpin.digest("student:user" + "000001"), email_session="session", email_expires=int(time.time()) + 600)
        mpin.settings(request(), {"operation": "enable", "newPin": "012345", "code": "000001"})
        self.assertTrue(self.state["enabled"])
        self.assertNotIn("email_hash", self.state)
        self.assertNotIn("012345", str(self.state))

    def test_email_code_expiry(self):
        self.state.update(email_hash=mpin.digest("student:user" + "000001"), email_session="session", email_expires=1)
        self.rejected("mpin_email_code_invalid_or_expired", lambda: mpin.settings(request(), {"operation": "enable", "newPin": "012345", "code": "000001"}))

    def test_email_delivery_and_resend_limit(self):
        with patch.object(mpin, "send_email_notification", return_value={"sent": True}) as send:
            mpin.send_code(request(), {})
            self.assertEqual("fixture@example.test", send.call_args.args[0]["to"])
            self.rejected("mpin_code_resend_limited", lambda: mpin.send_code(request(), {}))

    def test_staff_document_exemption_and_report_rule(self):
        self.enable()
        for role in ("admin", "grantor", "root"):
            self.assertFalse(mpin.policy(request(role), request().url.path, {})[2]["required"])
            self.assertTrue(mpin.policy(request(role), "/admin/reports/export", {})[2]["required"])
            self.assertFalse(mpin.policy(request(role), "/admin/reports/export", {})[2]["encrypt"])

    def test_grantor_announcements_and_approval(self):
        self.enable()
        for path in ("/workflows/grantor/announcements/create", "/workflows/grantor/announcements/republish", "/workflows/grantor/applications/confirm-admin-decision"):
            self.assertTrue(mpin.policy(request("grantor"), path, {})[2]["required"])
        self.assertEqual("approval", mpin.action_kind("grantor", "/workflows/admin/review", {"updates": [{"table": "scholarship_applications", "data": {"status": "Approved"}}]}))
        self.assertEqual("", mpin.action_kind("grantor", "/workflows/admin/review", {"updates": [{"table": "scholarship_applications", "data": {"status": "Rejected", "tracking": {"completedStepIds": ["application_review"]}}}]}))

    def test_student_apply_and_withdraw(self):
        self.enable()
        for path in ("/workflows/scholarship/apply", "/workflows/scholarship/withdraw"):
            self.assertTrue(mpin.policy(request(), path, {})[2]["required"])
        self.assertEqual("application", mpin.action_kind("student", "/workflows/waitlist/offer", {"action": "accept"}))
        self.assertEqual("", mpin.action_kind("student", "/workflows/waitlist/offer", {"action": "decline"}))

    def test_http_gate_blocks_before_application_side_effects(self):
        try:
            from fastapi.testclient import TestClient
        except ImportError:
            self.skipTest("Install httpx for ASGI integration checks")
        from backend import main
        self.enable()
        actor = request().state.mpin_identity
        with patch.object(mpin, "identity", return_value=actor), patch.object(main, "is_maintenance_enabled", return_value=False), patch.object(main, "metric_finished"), patch.object(main, "enforce_portal_scope"), patch.object(main, "apply_scholarship", return_value={"ok": True}) as apply:
            with TestClient(main.app) as client:
                path, payload = "/workflows/scholarship/apply", {"studentId": "user", "scholarshipId": "fixture"}
                denied = client.post(path, json=payload)
                self.assertEqual(428, denied.status_code)
                apply.assert_not_called()
                proof = client.post("/security/mpin/verify", json={"path": path, "payload": payload, "pin": "012345"}).json()["token"]
                response = client.post(path, json=payload, headers={"X-MPIN-Authorization": proof})
                self.assertEqual(200, response.status_code)
                self.assertEqual(1, apply.call_count)
                self.assertEqual(403, client.post(path, json=payload, headers={"X-MPIN-Authorization": proof}).status_code)
                self.assertEqual(1, apply.call_count)

    def test_email_failure_is_explicit(self):
        with patch.object(mpin, "send_email_notification", return_value={"sent": False}):
            self.rejected("mpin_email_delivery_failed", lambda: mpin.send_code(request(), {}))

    def test_setup_email_code_limited_to_five_tries(self):
        self.state.update(email_hash=mpin.digest("student:user000001"), email_session="session", email_expires=int(time.time()) + 600)
        for _ in range(5):
            self.rejected("mpin_email_code_invalid_or_expired", lambda: mpin.settings(request(), {"operation": "enable", "newPin": "012345", "code": "999999"}))
        self.rejected("mpin_email_code_invalid_or_expired", lambda: mpin.settings(request(), {"operation": "enable", "newPin": "012345", "code": "000001"}))

    def test_root_uses_fresh_code_without_new_login_session(self):
        from backend import root_service
        with patch.object(root_service, "verify_root_code", return_value={"ok": True}) as fresh, patch.object(mpin, "send_email_notification") as email:
            response = mpin.send_code(request("root"), {"rootCode": "fixture-code"})
            self.assertTrue(response["verifiedRoot"])
            self.assertEqual(6, len(response["code"]))
            self.assertFalse(fresh.call_args.kwargs["issue_session"])
            email.assert_not_called()

    def test_24_character_file_password(self):
        self.assertEqual("a" * 24, protection.protection_password({"downloadProtection": {"password": "a" * 24}}))
        with self.assertRaises(HTTPException):
            protection.protection_password({"downloadProtection": {"password": "a" * 32}})

    def test_student_encryption_and_staff_original(self):
        original = valid_pdf()
        with patch.object(protection, "audit_download"):
            student = protection.protected_response(request(), {"downloadProtection": {"password": "a" * 24}}, original, "application/pdf", "document")
            self.assertTrue(PdfReader(io.BytesIO(student.body), password="a" * 24).is_encrypted)
            for role in ("admin", "grantor", "root"):
                response = protection.protected_response(request(role), {}, original, "application/pdf", "document")
                self.assertEqual(original, response.body)
                self.assertEqual("private, no-store", response.headers["cache-control"])

    def test_stale_settings_write_rejected(self):
        old = dict(self.state)
        self.state["version"] = 1
        self.rejected("mpin_settings_changed_try_again", lambda: mpin.commit(request().state.mpin_identity, old, {**old, "enabled": True}, "enable"))

    def test_service_failure_fails_closed(self):
        with patch.object(mpin, "supabase_rpc", return_value={"ok": False}):
            self.rejected("mpin_service_unavailable", lambda: mpin.enforce_action(request(), {}))


if __name__ == "__main__":
    unittest.main()
