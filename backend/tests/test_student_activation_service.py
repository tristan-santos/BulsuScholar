import unittest
from unittest.mock import patch

from backend import student_activation_service as service


class StudentActivationServiceTests(unittest.TestCase):
    def test_first_year_signup_does_not_require_rog(self):
        documents = [
            {"id": "cor", "data": {"documentType": "cor", "status": "approved", "requirementsSnapshot": {"rogRequired": False}}},
            {"id": "identity", "data": {"documentType": "identity", "status": "approved"}},
        ]
        self.assertEqual(["cor", "identity"], service.required_signup_document_types(documents))
        self.assertTrue(service.signup_documents_ready(documents))

    def test_upper_year_signup_requires_approved_rog(self):
        documents = [
            {"id": "cor", "data": {"documentType": "cor", "status": "approved", "requirementsSnapshot": {"rogRequired": True}}},
            {"id": "identity", "data": {"documentType": "identity", "status": "approved"}},
        ]
        self.assertEqual(["cor", "rog", "identity"], service.required_signup_document_types(documents))
        self.assertFalse(service.signup_documents_ready(documents))
        documents.insert(1, {"id": "rog", "data": {"documentType": "rog", "status": "approved"}})
        self.assertTrue(service.signup_documents_ready(documents))

    @patch.dict("os.environ", {"FRONTEND_URL": "https://bulsuscholar.com/"}, clear=False)
    def test_welcome_email_escapes_student_values(self):
        markup = service.build_student_welcome_email("<20260001>", {
            "fname": "<script>alert(1)</script>",
            "lname": "Student",
        })
        self.assertNotIn("<script>alert(1)</script>", markup)
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", markup)
        self.assertIn("&lt;20260001&gt;", markup)
        self.assertIn('href="https://bulsuscholar.com"', markup)
        self.assertIn('data-bulsuscholar-email="welcome"', markup)
        self.assertIn("Complete your Student Application Profile", markup)

    @patch.object(service, "create_log", return_value={"ok": True})
    @patch.object(service, "supabase_document_update", return_value={"ok": True})
    @patch.object(service, "supabase_document_upsert", return_value={"ok": True})
    @patch.object(service, "send_email_notification", return_value={
        "sent": True, "provider": "brevo", "response": {"messageId": "message-1"},
    })
    def test_successful_welcome_delivery_is_recorded(self, send_email, upsert, update, log):
        result = service.send_student_welcome_email("20260001", {
            "email": "student@example.com", "fname": "Ana", "lname": "Student",
        }, "manual_admin_review")
        self.assertTrue(result["sent"])
        self.assertIn("Welcome to BulsuScholar", send_email.call_args.args[0]["subject"])
        event = upsert.call_args.args[2]
        self.assertEqual("delivered", event["status"])
        self.assertEqual("message-1", event["providerMessageId"])
        self.assertNotIn("html", event)
        self.assertNotIn("email", event)
        self.assertEqual("delivered", update.call_args.args[2]["welcomeEmailStatus"])
        self.assertEqual("student_welcome_email_sent", log.call_args.args[0]["action"])

    @patch.object(service, "create_log", return_value={"ok": True})
    @patch.object(service, "supabase_document_update", return_value={"ok": True})
    @patch.object(service, "supabase_document_upsert", return_value={"ok": True})
    @patch.object(service, "send_email_notification", return_value={
        "sent": False, "provider": "brevo", "reason": "email_provider_rejected",
    })
    def test_failed_welcome_delivery_does_not_hide_activation(self, _send_email, upsert, update, log):
        result = service.send_student_welcome_email("20260001", {
            "email": "student@example.com", "fname": "Ana",
        }, "automatic_document_review")
        self.assertFalse(result["sent"])
        self.assertEqual("email_provider_rejected", result["reason"])
        self.assertEqual("failed", upsert.call_args.args[2]["status"])
        self.assertIsNone(update.call_args.args[2]["welcomeEmailSentAt"])
        self.assertEqual("student_welcome_email_failed", log.call_args.args[0]["action"])

    @patch.object(service, "create_log", return_value={"ok": True})
    @patch.object(service, "supabase_document_update", return_value={"ok": True})
    @patch.object(service, "supabase_document_upsert", return_value={"ok": True})
    @patch.object(service, "send_email_notification", side_effect=RuntimeError("provider unavailable"))
    def test_unexpected_email_error_is_returned_without_undoing_activation(self, _send_email, upsert, _update, _log):
        result = service.send_student_welcome_email("20260001", {
            "email": "student@example.com", "fname": "Ana",
        }, "automatic_document_review")
        self.assertFalse(result["sent"])
        self.assertEqual("welcome_email_delivery_exception", result["reason"])
        self.assertEqual("failed", upsert.call_args.args[2]["status"])

    @patch.object(service, "send_student_welcome_email")
    @patch.object(service, "supabase_rpc", return_value={"ok": True, "data": {"approved": True, "alreadyActive": True}})
    def test_existing_active_student_does_not_receive_welcome_email(self, _rpc, send_welcome):
        result = service.activate_student_account("20260001", {
            "authUserId": "auth-1", "email": "student@example.com",
        }, "admin-1", "manual_admin_review")
        self.assertTrue(result["alreadyActive"])
        self.assertFalse(result["newlyApproved"])
        send_welcome.assert_not_called()

    @patch.object(service, "send_student_welcome_email", return_value={"sent": True, "reason": None})
    @patch.object(service, "supabase_rpc", return_value={"ok": True, "data": {"approved": True}})
    def test_newly_active_student_receives_one_welcome_email(self, _rpc, send_welcome):
        result = service.activate_student_account("20260001", {
            "authUserId": "auth-1", "email": "student@example.com",
        }, "system:auto_document_review", "automatic_document_review")
        self.assertTrue(result["newlyApproved"])
        self.assertTrue(result["welcomeEmailSent"])
        send_welcome.assert_called_once()


if __name__ == "__main__":
    unittest.main()
