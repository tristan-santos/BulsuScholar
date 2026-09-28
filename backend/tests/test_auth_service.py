import unittest
import base64
import json
from unittest.mock import Mock, patch

from fastapi import HTTPException

from backend import auth_service as service


ACCOUNT = {
    "type": "student",
    "table": "students",
    "id": "2026-0001",
    "data": {"authUserId": "11111111-1111-1111-1111-111111111111", "email": "student@example.com"},
}


def access_token(session_id="22222222-2222-2222-2222-222222222222"):
    encode = lambda value: base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")
    return f"{encode({'alg': 'none'})}.{encode({'session_id': session_id})}.signature"


class PortalLoginTests(unittest.TestCase):
    def test_pending_student_cannot_login_or_bootstrap(self):
        pending = {**ACCOUNT, "table": "pending_students", "data": {**ACCOUNT["data"], "isPending": True}}
        with patch.object(service, "_find_account", return_value=pending), \
                patch.object(service, "_security_state") as security, \
                patch.object(service, "_request_json") as auth_request:
            with self.assertRaises(HTTPException) as raised:
                service.login({"userId": pending["id"], "password": "correct"})
        self.assertEqual(raised.exception.status_code, 403)
        security.assert_not_called()
        auth_request.assert_not_called()

        request = Mock()
        request.headers = {"x-portal-actor-id": pending["id"], "x-portal-actor-type": "student"}
        with patch.object(service, "require_supabase_user", return_value={"id": pending["data"]["authUserId"]}), \
                patch.object(service, "_find_account", return_value=pending):
            with self.assertRaises(HTTPException) as bootstrap_error:
                service.validate_portal_session(request)
        self.assertEqual(bootstrap_error.exception.status_code, 403)

    def test_failed_login_records_attempt_and_returns_remaining_count(self):
        with patch.object(service, "_find_account", return_value=ACCOUNT), \
                patch.object(service, "_security_state", return_value={}), \
                patch.object(service, "_config", return_value=("https://project.supabase.co", "service-key")), \
                patch.object(service, "_request_json", return_value=({"error": "invalid_credentials"}, 400)), \
                patch.object(service, "_record_attempt", return_value={"blocked": False, "remainingAttempts": 2}):
            with self.assertRaises(HTTPException) as raised:
                service.login({"userId": ACCOUNT["id"], "password": "wrong"})
        self.assertEqual(raised.exception.status_code, 401)
        self.assertEqual(raised.exception.detail["remainingAttempts"], 2)

    def test_threshold_failure_locks_non_admin_account(self):
        with patch.object(service, "_find_account", return_value=ACCOUNT), \
                patch.object(service, "_security_state", return_value={}), \
                patch.object(service, "_config", return_value=("https://project.supabase.co", "service-key")), \
                patch.object(service, "_request_json", return_value=({}, 400)), \
                patch.object(service, "_record_attempt", return_value={"blocked": True, "remainingAttempts": 0}):
            with self.assertRaises(HTTPException) as raised:
                service.login({"userId": ACCOUNT["id"], "password": "wrong"})
        self.assertEqual(raised.exception.status_code, 423)
        self.assertEqual(raised.exception.detail, "account_locked_reset_required")

    def test_blocked_account_is_rejected_before_authentication(self):
        with patch.object(service, "_find_account", return_value=ACCOUNT), \
                patch.object(service, "_security_state", return_value={"blocked_at": "2026-09-18T00:00:00Z"}), \
                patch.object(service, "_request_json") as auth_request:
            with self.assertRaises(HTTPException) as raised:
                service.login({"userId": ACCOUNT["id"], "password": "correct"})
        self.assertEqual(raised.exception.status_code, 423)
        auth_request.assert_not_called()

    def test_successful_login_resets_failures_and_returns_safe_identity(self):
        auth_response = {
            "access_token": access_token(),
            "refresh_token": "refresh",
            "user": {"id": ACCOUNT["data"]["authUserId"]},
        }
        with patch.object(service, "_find_account", return_value=ACCOUNT), \
                patch.object(service, "_security_state", return_value={"failed_attempts": 2}), \
                patch.object(service, "_config", return_value=("https://project.supabase.co", "service-key")), \
                patch.object(service, "_request_json", return_value=(auth_response, 200)), \
                patch.object(service, "_record_attempt", return_value={"blocked": False}) as record, \
                patch.object(service, "supabase_rpc", return_value={"ok": True, "data": {"verified": True}}) as rpc:
            result = service.login({"userId": ACCOUNT["id"], "password": "correct"})
        self.assertTrue(result["ok"])
        self.assertEqual(result["account"], {
            "id": ACCOUNT["id"], "type": "student", "table": "students",
            "isPending": False, "mustChangePassword": False,
        })
        record.assert_called_once_with(ACCOUNT, True)
        self.assertEqual(rpc.call_args.args[0], "complete_portal_verified_session")

    def test_inactive_student_gets_email_challenge_without_tokens(self):
        auth_response = {"access_token": access_token(), "refresh_token": "refresh", "user": {"id": ACCOUNT["data"]["authUserId"]}}
        old_activity = "2026-07-01T00:00:00+00:00"
        with patch.object(service, "_find_account", return_value=ACCOUNT), \
                patch.object(service, "_security_state", return_value={"last_meaningful_activity_at": old_activity}), \
                patch.object(service, "_authenticate_password", return_value=(auth_response, 200)), \
                patch.object(service, "_record_attempt", return_value={"blocked": False}), \
                patch.object(service, "supabase_rpc", return_value={"ok": True}), \
                patch.object(service, "_send_email_code", return_value={"required": True, "challengeId": "challenge"}):
            result = service.login({"userId": ACCOUNT["id"], "password": "correct"})
        self.assertNotIn("session", result)
        self.assertTrue(result["emailVerification"]["required"])

    def test_successful_password_check_cannot_override_concurrent_lock(self):
        auth_response = {
            "access_token": "access", "refresh_token": "refresh",
            "user": {"id": ACCOUNT["data"]["authUserId"]},
        }
        with patch.object(service, "_find_account", return_value=ACCOUNT), \
                patch.object(service, "_security_state", return_value={}), \
                patch.object(service, "_config", return_value=("https://project.supabase.co", "service-key")), \
                patch.object(service, "_request_json", return_value=(auth_response, 200)), \
                patch.object(service, "_record_attempt", return_value={"blocked": True}):
            with self.assertRaises(HTTPException) as raised:
                service.login({"userId": ACCOUNT["id"], "password": "correct"})
        self.assertEqual(raised.exception.status_code, 423)

    def test_auth_outage_does_not_increment_failed_attempts(self):
        with patch.object(service, "_find_account", return_value=ACCOUNT), \
                patch.object(service, "_security_state", return_value={}), \
                patch.object(service, "_config", return_value=("https://project.supabase.co", "service-key")), \
                patch.object(service, "_request_json", return_value=({}, 503)), \
                patch.object(service, "_record_attempt") as record:
            with self.assertRaises(HTTPException) as raised:
                service.login({"userId": ACCOUNT["id"], "password": "correct"})
        self.assertEqual(raised.exception.status_code, 503)
        record.assert_not_called()

    def test_recovery_request_issues_challenge_without_exposing_email(self):
        with patch.object(service, "_find_account", return_value=ACCOUNT), \
                patch.object(service, "supabase_rpc", return_value={"ok": True}) as rpc, \
                patch.object(service, "_config", return_value=("https://project.supabase.co", "service-key")), \
                patch.object(service, "_request_json", return_value=({}, 200)) as send:
            result = service.request_password_recovery({"userId": ACCOUNT["id"]})
        self.assertTrue(result["ok"])
        self.assertNotIn(ACCOUNT["data"]["email"], str(result))
        self.assertEqual(rpc.call_args.args[0], "issue_portal_recovery_challenge")
        self.assertIn("challenge%3D", send.call_args.args[0])

    def test_recovery_completion_requires_challenge(self):
        request = Mock()
        with patch.object(service, "require_supabase_user", return_value={"id": ACCOUNT["data"]["authUserId"]}), \
                patch.object(service, "supabase_rpc") as rpc:
            with self.assertRaises(HTTPException) as raised:
                service.complete_password_recovery(request, {"challenge": "short"})
        self.assertEqual(raised.exception.status_code, 403)
        rpc.assert_not_called()

    def test_session_bootstrap_requires_matching_auth_identity(self):
        request = Mock()
        request.headers = {"x-portal-actor-id": ACCOUNT["id"], "x-portal-actor-type": "student"}
        with patch.object(service, "require_supabase_user", return_value={"id": ACCOUNT["data"]["authUserId"]}), \
                patch.object(service, "_find_account", return_value=ACCOUNT):
            result = service.validate_portal_session(request)
        self.assertTrue(result["ok"])

    def test_session_bootstrap_rejects_actor_auth_mismatch(self):
        request = Mock()
        request.headers = {"x-portal-actor-id": ACCOUNT["id"], "x-portal-actor-type": "student"}
        with patch.object(service, "require_supabase_user", return_value={"id": "different-auth-user"}), \
                patch.object(service, "_find_account", return_value=ACCOUNT):
            with self.assertRaises(HTTPException) as raised:
                service.validate_portal_session(request)
        self.assertEqual(raised.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
